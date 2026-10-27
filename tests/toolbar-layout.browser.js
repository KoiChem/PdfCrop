// Run on a fresh app page. Exercise side labels and real exports through the UI.
async () => {
    const failures=[], checks=[];
    const eq=(label,actual,expected)=>{
        if (JSON.stringify(actual)!==JSON.stringify(expected))
            failures.push(`${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
    };
    const waitFor=async (label,condition)=>{
        const until=Date.now()+12000;
        while (!condition()) {
            if(Date.now()>until) throw new Error(`Timed out: ${label}`);
            await new Promise(r=>setTimeout(r,20));
        }
    };
    const pdfFile=async(name,count)=>{
        const pdf=await PDFLib.PDFDocument.create();
        for(let i=0;i<count;i++)pdf.addPage([600,840]);
        return new File([await pdf.save()],name,{type:'application/pdf'});
    };
    const byId=id=>document.getElementById(id);
    const labels=()=>[byId('btn-copy-all').textContent.trim(),byId('btn-box-copy-all').textContent.trim()];
    const saved={alert:window.alert,saveAs:window.saveAs,picker:window.showDirectoryPicker};
    const notices=[],pdfs=[],jpgs=[];
    window.alert=msg=>notices.push(msg);
    window.saveAs=(blob,name)=>pdfs.push({blob,name});
    window.showDirectoryPicker=async()=>({getFileHandle:async name=>({createWritable:async()=>({
        write:async blob=>jpgs.push({name,blob}),close:async()=>{}
    })})});
    try {
        eq('PDF files loaded',await processFiles([await pdfFile('a.pdf',3),await pdfFile('b.pdf',2)]),true);
        const side=byId('page-sides-select');
        eq('default mode',side.value,'simplex');
        eq('both simplex actions identify all pages',labels(),['全ページに枠コピー','全ページに枠コピー']);
        eq('default filename',byId('prefix-input').value,'crop');
        eq('filename is on toolbar',byId('toolbar').contains(byId('prefix-input')),true);
        eq('settings dialog removed',!!byId('output-settings'),false);
        eq('DPI control removed',!!byId('dpi-select'),false);
        checks.push('default filename on toolbar');
        state.cropBoxes[0]={x:30,y:42,w:100,h:84};
        saveHistory();
        const before=JSON.stringify(state.cropBoxes);
        side.value='duplex';side.dispatchEvent(new Event('change',{bubbles:true}));
        eq('front labels on first page',labels(),['表面に枠コピー','表面に枠コピー']);
        eq('mode switch does not change frames',JSON.stringify(state.cropBoxes),before);
        byId('btn-next').click();
        await waitFor('page 2 render',()=>state.pageNum===2 && byId('page-input').value==='2' && !editorRenderTask);
        eq('back labels on second page',labels(),['裏面に枠コピー','裏面に枠コピー']);
        byId('source-file-select').value='1';
        byId('source-file-select').dispatchEvent(new Event('change',{bubbles:true}));
        await waitFor('second file first page render',()=>state.pageNum===4 && byId('page-input').value==='4' && !editorRenderTask);
        eq('new file first page is front',labels(),['表面に枠コピー','表面に枠コピー']);
        byId('btn-next').click();
        await waitFor('second file second page render',()=>state.pageNum===5 && byId('page-input').value==='5' && !editorRenderTask);
        eq('new file second page is back',labels(),['裏面に枠コピー','裏面に枠コピー']);
        eq('navigation does not change frames',JSON.stringify(state.cropBoxes),before);
        side.value='simplex';side.dispatchEvent(new Event('change',{bubbles:true}));
        eq('return to simplex labels',labels(),['全ページに枠コピー','全ページに枠コピー']);
        checks.push('side labels follow mode, page navigation, and local file numbering');
        byId('prefix-input').value='lesson';byId('prefix-input').dispatchEvent(new Event('input',{bubbles:true}));
        eq('toolbar filename updated',byId('prefix-input').value,'lesson');
        const beforeUndo=JSON.stringify(state.cropBoxes);
        const event=new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true});
        byId('prefix-input').dispatchEvent(event);
        eq('filename editing keeps native undo',event.defaultPrevented,false);
        eq('filename undo does not change crop',JSON.stringify(state.cropBoxes),beforeUndo);
        state.pageNum=1;await renderAndUI();
        byId('source-paper-select').value='pdf';
        byId('btn-scope-current').click();
        byId('layout-select').value='single';
        byId('btn-export-pdf').click();
        await waitFor('direct PDF saved',()=>pdfs.length===1 && loading.style.display!=='flex');
        eq('direct PDF uses configured filename',pdfs[0].name,'lesson_p1.pdf');
        const directPdf=await PDFLib.PDFDocument.load(await pdfs[0].blob.arrayBuffer());
        eq('direct PDF contains one page',directPdf.getPageCount(),1);
        const xobjects=directPdf.getPage(0).node.Resources().lookup(PDFLib.PDFName.of('XObject'),PDFLib.PDFDict);
        const image=directPdf.context.lookup(xobjects.get(xobjects.keys()[0]));
        eq('PDF embeds 300 DPI raster',[image.dict.lookup(PDFLib.PDFName.of('Width')).asNumber(),image.dict.lookup(PDFLib.PDFName.of('Height')).asNumber()],[417,350]);
        byId('btn-export-jpg').click();
        await waitFor('direct JPG saved',()=>jpgs.length===1 && loading.style.display!=='flex');
        eq('direct JPG uses configured filename',jpgs[0].name,'lesson_001.jpg');
        let bitmap=await createImageBitmap(jpgs[0].blob);
        eq('direct JPG uses fixed 300 DPI',[bitmap.width,bitmap.height],[417,350]);bitmap.close();
        checks.push('direct PDF and JPG use 300 DPI and toolbar filename');
        byId('btn-preview').click();
        await waitFor('preview ready',()=>outputPreview.dialog.open && !!outputPreview.plan && !byId('preview-save-pdf').disabled);
        byId('preview-save-pdf').click();
        await waitFor('preview PDF saved',()=>pdfs.length===2 && loading.style.display!=='flex');
        eq('preview PDF uses configured filename',pdfs[1].name,'lesson_p1.pdf');
        const previewPdf=await PDFLib.PDFDocument.load(await pdfs[1].blob.arrayBuffer());
        const previewObjects=previewPdf.getPage(0).node.Resources().lookup(PDFLib.PDFName.of('XObject'),PDFLib.PDFDict);
        const previewImage=previewPdf.context.lookup(previewObjects.get(previewObjects.keys()[0]));
        eq('preview PDF embeds 300 DPI raster',[previewImage.dict.lookup(PDFLib.PDFName.of('Width')).asNumber(),previewImage.dict.lookup(PDFLib.PDFName.of('Height')).asNumber()],[417,350]);
        byId('btn-preview').click();
        await waitFor('second preview ready',()=>outputPreview.dialog.open && !!outputPreview.plan && !byId('preview-save-jpg').disabled);
        byId('preview-save-jpg').click();
        await waitFor('preview JPG saved',()=>jpgs.length===2 && loading.style.display!=='flex');
        eq('preview JPG uses configured filename',jpgs[1].name,'lesson_001.jpg');
        bitmap=await createImageBitmap(jpgs[1].blob);
        eq('preview JPG uses fixed 300 DPI',[bitmap.width,bitmap.height],[417,350]);bitmap.close();
        checks.push('preview PDF and JPG use 300 DPI and toolbar filename');
        if(notices.some(n=>/エラー|できません|失敗/.test(n)))failures.push(`Unexpected alerts: ${notices.join(', ')}`);
        if(failures.length)throw new Error(failures.join('\n'));
        return {passed:checks.length,checks};
    } finally {
        if(outputPreview.dialog.open)outputPreview.dialog.close();
        window.alert=saved.alert;window.saveAs=saved.saveAs;window.showDirectoryPicker=saved.picker;
    }
}
