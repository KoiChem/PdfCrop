// Evaluate in a fresh app page. Exercise real preview raster and PDF/JPG exporters.
async () => {
    const errors = [];
    const check = (name, actual, expected, tolerance = .01) => {
        if (!Number.isFinite(actual) || Math.abs(actual-expected)>tolerance) errors.push(`${name}: ${actual} != ${expected}`);
    };
    const portrait = getA4TileLayout(798,139,'portrait');
    check('forced portrait width',portrait.pageSize[0],595.28);
    check('forced portrait fit',portrait.scale,555.28/798);
    const landscape = getA4TileLayout(100,700,'landscape');
    check('forced landscape width',landscape.pageSize[0],841.89);
    check('forced landscape fit',landscape.scale,555.28/700);
    if (!document.getElementById('btn-preview') || typeof openOutputPreview!=='function') errors.push('Output preview is unavailable');
    if (errors.length) throw new Error(errors.join('\n'));

    const original = {saveAs:window.saveAs,picker:window.showDirectoryPicker,alert:window.alert};
    let saved;
    const jpgs=[];
    window.saveAs=blob=>{saved=blob;};
    window.showDirectoryPicker=async()=>({getFileHandle:async()=>({createWritable:async()=>({
        write:async blob=>jpgs.push(blob),close:async()=>{}
    })})});
    window.alert=message=>{if(message!=='フォルダへの保存が完了しました。')errors.push(message);};
    function marks(canvas,blue=false) {
        const {width,height}=canvas, data=canvas.getContext('2d').getImageData(0,0,width,height).data;
        let bands=0,inBand=false;
        for(let y=0;y<height;y++) {
            let found=false;
            for(let x=0;x<width;x++) {
                const i=(y*width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
                if(blue?b>180&&r<80&&g<80:r>180&&g<80&&b<80){found=true;break;}
            }
            if(found&&!inBand)bands++;
            inBand=found;
        }
        return bands;
    }
    try {
        const doc=await PDFLib.PDFDocument.create();
        for(let i=0;i<35;i++) {
            const p=doc.addPage([600,300]);
            p.drawRectangle({x:30,y:250,width:20,height:20,color:PDFLib.rgb(1,0,0)});
            p.drawRectangle({x:340,y:250,width:20,height:20,color:PDFLib.rgb(0,0,1)});
        }
        state.pdfDoc=await pdfjsLib.getDocument({data:await doc.save()}).promise;
        state.numPages=35;state.pageNum=1;state.pageScale=1;state.exportScope='all';
        state.cropBoxes=Array.from({length:35},()=>({x:20,y:20,w:350,h:90}));
        updateUI();
        document.getElementById('source-paper-select').value='pdf';
        document.getElementById('layout-select').value='tile_a4';
        document.getElementById('dpi-select').value='144';
        let renders=0,maxPixels=0;
        for(let i=1;i<=35;i++) {
            const p=await state.pdfDoc.getPage(i), render=p.render.bind(p);
            p.render=options=>{renders++;maxPixels=Math.max(maxPixels,options.canvasContext.canvas.width*options.canvasContext.canvas.height);return render(options);};
        }
        await openOutputPreview();
        const dialog=document.getElementById('output-preview-dialog'),canvas=document.getElementById('preview-canvas');
        check('dialog open',Number(dialog.open),1);
        check('first preview renders only visible sheet',renders,8);
        check('portrait preview page count',outputPreview.plan.pageCount,5);
        check('red marks in preview',marks(canvas),8);
        check('blue marks in preview',marks(canvas,true),8);
        if(maxPixels>800*800)errors.push(`Preview raster too large: ${maxPixels}`);
        document.getElementById('preview-layout-select').value='tile_a4_landscape';
        document.getElementById('layout-select').value='tile_a4_landscape';
        await refreshOutputPreview();
        check('orientation reuses first eight crops',renders,10);
        check('landscape page count',outputPreview.plan.pageCount,4);
        check('landscape preview red rows',marks(canvas),5);
        check('landscape preview blue rows',marks(canvas,true),5);
        // Back-to-back requests must never restore an obsolete orientation.
        document.getElementById('layout-select').value='tile_a4';
        const obsolete=refreshOutputPreview();
        document.getElementById('layout-select').value='tile_a4_landscape';
        await Promise.all([obsolete,refreshOutputPreview()]);
        check('latest orientation wins',Number(outputPreview.plan.layout==='tile_a4_landscape'),1);
        check('latest canvas is landscape',Number(canvas.width>canvas.height),1);
        const originalBoxes=JSON.stringify(state.cropBoxes);
        window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}));
        window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true}));
        if(JSON.stringify(state.cropBoxes)!==originalBoxes)errors.push('Preview shortcut changed original crop');
        // Closing during an in-flight page request releases the cache and surface.
        const closing=new Promise(resolve=>dialog.addEventListener('close',resolve,{once:true}));
        const pending=showOutputPreviewPage(1);dialog.close();
        await Promise.all([closing,pending]);
        check('closed cache released',outputPreview.cache.size,0);check('closed canvas released',canvas.width,0);
        check('focus restored',Number(document.activeElement.id==='btn-preview'),1);
        await openOutputPreview();
        const plan=outputPreview.plan;
        await exportPDF(plan);
        const out=await PDFLib.PDFDocument.load(await saved.arrayBuffer());
        check('saved PDF page count matches preview',out.getPageCount(),4);
        for(const p of out.getPages())check('saved PDF fixed landscape',p.getWidth(),841.89);
        await exportJPGs(plan);
        check('saved JPG page count matches preview',jpgs.length,4);
        const bitmap=await createImageBitmap(jpgs[0]);
        check('saved JPG landscape width',bitmap.width,1684);check('saved JPG landscape height',bitmap.height,1191);bitmap.close();
        const before=renders;
        document.getElementById('dpi-select').value='300';
        await showOutputPreviewPage(0);
        check('DPI change reuses low resolution crops',renders,before);
        await showOutputPreviewPage(3);
        check('last sheet item count',outputPreview.plan.frames.slice(30).length,5);
        check('last sheet preview rows',marks(canvas),3);
        // Mixed-size single pages must have truthful common padding in both formats.
        dialog.close();
        state.numPages=2;state.cropBoxes=[{x:20,y:20,w:350,h:90},{x:20,y:20,w:100,h:50}];
        document.getElementById('layout-select').value='single';
        document.getElementById('dpi-select').value='144';
        const single=await buildOutputPlan();
        await exportPDF(single);const singlePdf=await PDFLib.PDFDocument.load(await saved.arrayBuffer());
        check('single PDF padding width',singlePdf.getPage(1).getWidth(),350);
        jpgs.length=0;await exportJPGs(single);
        const small=await createImageBitmap(jpgs[1]);check('single JPG padding width',small.width,700);check('single JPG padding height',small.height,180);small.close();
    } finally {
        document.getElementById('output-preview-dialog').close();
        window.saveAs=original.saveAs;window.showDirectoryPicker=original.picker;window.alert=original.alert;
    }
    if(errors.length)throw new Error(errors.join('\n'));
    return {passed:13,checks:'fixed directions, preview pixels, lazy/cached raster, rapid switches, close/focus, shortcut isolation, output parity, DPI independence, last page, mixed single padding'};
}
