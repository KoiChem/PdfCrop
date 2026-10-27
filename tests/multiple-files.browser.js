// Real PDF files exercise ordering, transactional replacement, physical copies and exports.
async () => {
    const failures=[], checks=[];
    const eq=(name,got,want,tolerance=.01)=>{
        if(typeof want==='number' ? !Number.isFinite(got)||Math.abs(got-want)>tolerance : got!==want)
            failures.push(`${name}: ${got} != ${want}`);
    };
    eq('multiple file workflow exists',typeof processFiles,'function');
    eq('picker accepts multiple files',document.getElementById('file-input').multiple,true);
    if(failures.length)throw new Error(failures.join('\n'));
    const original={alert:window.alert,saveAs:window.saveAs,picker:window.showDirectoryPicker};
    const notices=[],jpgs=[];let saved;
    window.alert=m=>notices.push(m);window.saveAs=b=>{saved=b;};
    window.showDirectoryPicker=async()=>({getFileHandle:async name=>({createWritable:async()=>({
        write:async blob=>jpgs.push({name,blob}),close:async()=>{}
    })})});
    const pdfFile=async(name,count=1,size=[600,840],color=[1,0,0],unit=1)=>{
        const doc=await PDFLib.PDFDocument.create();
        for(let i=0;i<count;i++){
            const p=doc.addPage(size);
            p.node.set(PDFLib.PDFName.of('UserUnit'),PDFLib.PDFNumber.of(unit));
            p.drawRectangle({x:size[0]*.1,y:size[1]*.8,width:size[0]*.2,height:size[1]*.1,color:PDFLib.rgb(...color)});
        }
        return new File([await doc.save()],name,{type:'application/pdf'});
    };
    const pixel=async(doc,num)=>{
        const p=await doc.getPage(num),v=p.getViewport({scale:.25}),c=document.createElement('canvas');
        c.width=v.width;c.height=v.height;await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;
        const rgb=[...c.getContext('2d').getImageData(Math.floor(c.width*.2),Math.floor(c.height*.15),1,1).data].slice(0,3);
        c.width=0;c.height=0;return rgb.join(',');
    };
    try {
        document.getElementById('source-paper-select').value='a4_portrait';
        const a=await pdfFile('1.pdf',1,[600,840],[1,0,0]);
        const b=await pdfFile('2.pdf',3,[1200,1680],[0,1,0],2);
        const c=await pdfFile('10.pdf',2,[600,840],[0,0,1]);
        eq('batch loaded',await processFiles([c,b,a]),true);
        eq('continuous count',state.numPages,6);
        eq('first source',getSourcePageInfo(state.pdfDoc,1).name,'1.pdf');
        eq('natural middle',getSourcePageInfo(state.pdfDoc,2).name,'2.pdf');
        eq('natural last',getSourcePageInfo(state.pdfDoc,5).name,'10.pdf');
        eq('local page mapping',getSourcePageInfo(state.pdfDoc,4).localPageNum,3);
        eq('first file raster',await pixel(state.pdfDoc,1),'255,0,0');
        eq('second file raster',await pixel(state.pdfDoc,2),'0,255,0');
        eq('third file raster',await pixel(state.pdfDoc,6),'0,0,255');
        checks.push('natural file order and mapped page pixels');
        state.cropBoxes[0]={x:30,y:42,w:300,h:84};saveHistory();
        await copyBoxToAll();
        eq('copy x resolution correction',state.cropBoxes[1].x,60);
        eq('copy width resolution correction',state.cropBoxes[1].w,600);
        eq('copy height resolution correction',state.cropBoxes[1].h,168);
        eq('copy across source boundary',state.cropBoxes[4].w,300);
        const plan=await buildOutputPlan();
        for(const f of plan.frames){eq('physical width preserved',f.width,297.637795);eq('physical height preserved',f.height,84.188976);}
        undo();eq('undo bulk copy',state.cropBoxes[1],null);redo();eq('redo bulk copy',state.cropBoxes[1].w,600);
        const busyCopy=copyBoxToAll();
        document.getElementById('btn-export-pdf').focus();
        eq('copy prevents keyboard export focus',document.activeElement.id==='btn-export-pdf',false);
        await busyCopy;
        checks.push('physical frame copy and Undo Redo');
        state.cropBoxes=[{x:30,y:42,w:300,h:84},null,null,null,null,null];
        state.pageNum=1;await copyBoxToOddEven();
        eq('first page of second file remains odd',state.cropBoxes[1]?.w,600);
        eq('second page of second file skipped',state.cropBoxes[2],null);
        eq('third page of second file odd',state.cropBoxes[3]?.w,600);
        eq('third file local odd',state.cropBoxes[4]?.w,300);
        eq('third file local even',state.cropBoxes[5],null);
        checks.push('file-relative odd even');
        const selector=document.getElementById('source-file-select');
        selector.value='1';selector.dispatchEvent(new Event('change'));
        await new Promise(r=>setTimeout(r,100));
        eq('file selector jumps to source first page',state.pageNum,2);
        state.pageNum=5;await renderAndUI();eq('page navigation syncs source selector',selector.value,'2');
        checks.push('source navigation');
        const protectedFile=new File([Uint8Array.from(atob('JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUHJvZHVjZXIgPDBiZWM0YTNkNGI+Cj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9UeXBlIC9QYWdlcwovQ291bnQgMQovS2lkcyBbIDQgMCBSIF0KPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9SZXNvdXJjZXMgPDwKPj4KL01lZGlhQm94IFsgMC4wIDAuMCA2MDAgODQwIF0KL1BhcmVudCAyIDAgUgo+PgplbmRvYmoKNSAwIG9iago8PAovViAyCi9SIDMKL0xlbmd0aCAxMjgKL1AgNDI5NDk2NzI5MgovRmlsdGVyIC9TdGFuZGFyZAovTyA8MDdjOTBjZDExMTdmODU0NmIzZGM0MWM3YTc5OTA0MWRhOGE0ZWI4ODViMmY1YmQ1NDY3NGJmYmUxYzNkOTRjOT4KL1UgPDI0MjNjZjU3OWJjNWI5YzBlNzZiNGNiYzU3OWQxNTkxMjhiZjRlNWU0ZTc1OGE0MTY0MDA0ZTU2ZmZmYTAxMDg+Cj4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA1OSAwMDAwMCBuIAowMDAwMDAwMTE4IDAwMDAwIG4gCjAwMDAwMDAxNjcgMDAwMDAgbiAKMDAwMDAwMDI2MSAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDYKL1Jvb3QgMyAwIFIKL0luZm8gMSAwIFIKL0lEIFsgPDM5MzczNDY1NjE2NDM1MzI2MTYxMzAzNzYxMzE2NTMzNjQzNTM4NjQzNTM2MzgzMTM2NjUzMTYzNjQzNzMyNjQ+IDwzOTM3MzQ2NTYxNjQzNTMyNjE2MTMwMzc2MTMxNjUzMzY0MzUzODY0MzUzNjM4MzEzNjY1MzE2MzY0MzczMjY0PiBdCi9FbmNyeXB0IDUgMCBSCj4+CnN0YXJ0eHJlZgo0NzYKJSVFT0YK'),c=>c.charCodeAt(0))],'protected.pdf',{type:'application/pdf'});
        const old=state.pdfDoc,oldBoxes=JSON.stringify(state.cropBoxes),oldHistory=historyIndex;
        for(const [label,files] of [
            ['11 files',Array(11).fill(a)],
            ['101 pages',[await pdfFile('too-many.pdf',101)]],
            ['invalid PDF',[a,new File(['broken'],'broken.pdf',{type:'application/pdf'})]],
            ['non-PDF',[a,new File(['text'],'notes.txt',{type:'text/plain'})]],
            ['password PDF',[a,protectedFile]]
        ]){
            eq(`${label} rejected`,await processFiles(files),false);
            eq(`${label} preserves document`,state.pdfDoc===old,true);
            eq(`${label} preserves frames`,JSON.stringify(state.cropBoxes),oldBoxes);
            eq(`${label} preserves history`,historyIndex,oldHistory);
        }
        checks.push('limits and failed replacement preserve work');
        // A smaller physical target must not overwrite a valid existing frame.
        document.getElementById('source-paper-select').value='pdf';
        eq('load native size batch',await processFiles([await pdfFile('a.pdf',1,[600,840]),await pdfFile('b.pdf',1,[120,168])]),true);
        state.cropBoxes=[{x:30,y:42,w:300,h:84},{x:1,y:1,w:10,h:10}];
        await copyBoxToAll();eq('out of bounds target preserved',state.cropBoxes[1].w,10);
        if(!notices.some(m=>/2/.test(m)&&/収ま|はみ出/.test(m)))failures.push('out of bounds report missing');
        checks.push('out of bounds preserves target');
        document.getElementById('source-paper-select').value='a4_portrait';
        const ten=[];for(let i=10;i>=1;i--)ten.push(await pdfFile(`${i}.pdf`,10));
        const begin=performance.now();eq('10 files 100 pages accepted',await processFiles(ten),true);
        const loadMs=Math.round(performance.now()-begin);
        eq('100 continuous pages',state.numPages,100);eq('last source number',getSourcePageInfo(state.pdfDoc,100).localPageNum,10);
        state.cropBoxes[0]={x:30,y:42,w:300,h:84};await copyBoxToAll();
        state.exportScope='all';document.getElementById('layout-select').value='tile_a4';document.getElementById('dpi-select').value='144';
        await openOutputPreview();eq('preview includes all 100 frames',outputPreview.plan.frames.length,100);
        eq('portrait output count',outputPreview.plan.pageCount,13);
        const exportPlan=outputPreview.plan;outputPreview.dialog.close();
        await exportPDF(exportPlan);eq('saved 100 frame PDF pages',(await PDFLib.PDFDocument.load(await saved.arrayBuffer())).getPageCount(),13);
        state.exportScope='current';state.pageNum=100;document.getElementById('layout-select').value='single';
        await exportJPGs();eq('continuous JPG filename',jpgs.at(-1).name,'crop_100.jpg');
        checks.push('100 page preview PDF and current JPG');
        eq('same names accepted',await processFiles([a,a]),true);
        eq('same names retain both pages',state.numPages,2);
        checks.push('duplicate source names');
        await processFiles([a]);
        eq('single source remains identifiable',document.getElementById('source-file-control').hidden,false);
        eq('single source name visible',document.getElementById('source-file-select').selectedOptions[0].textContent.includes('1.pdf'),true);
        checks.push('single source identity');
        let release;const delayed=new File([await a.arrayBuffer()],'delayed.pdf',{type:'application/pdf'});
        delayed.arrayBuffer=()=>new Promise(r=>{release=r;});
        document.getElementById('btn-export-pdf').focus();
        const replacement=processFiles([delayed]);
        eq('load clears previously focused export',document.activeElement.id==='btn-export-pdf',false);
        document.getElementById('btn-export-pdf').focus();
        eq('load prevents keyboard export focus',document.activeElement.id==='btn-export-pdf',false);
        eq('second load while busy rejected',await processFiles([a]),false);
        release(await a.arrayBuffer());await replacement;
        eq('controls restored after load',document.getElementById('toolbar').inert,false);
        checks.push('busy operation isolation');
        const first=renderPage(1), second=renderPage(1);await Promise.all([first,second]);
        eq('latest editor render complete',editorRenderTask,null);
        checks.push('cancel safe source renders');
        if(failures.length)throw new Error(failures.join('\n'));
        return {passed:checks.length,checks,loadMs};
    } finally {
        document.getElementById('output-preview-dialog').close();
        window.alert=original.alert;window.saveAs=original.saveAs;window.showDirectoryPicker=original.picker;
    }
}
