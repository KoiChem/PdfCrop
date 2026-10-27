// Real PDFs catch forward-only copying and global (rather than per-file) side selection.
async () => {
    const failures=[],checks=[];
    const eq=(name,got,want)=>{if(JSON.stringify(got)!==JSON.stringify(want))failures.push(`${name}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`);};
    const originalAlert=window.alert, notices=[];window.alert=m=>notices.push(m);
    const frame={x:30,y:42,w:150,h:84}, other={x:10,y:20,w:40,h:50};
    const pdf=async(name,count)=>{const d=await PDFLib.PDFDocument.create();for(let i=0;i<count;i++)d.addPage([600,840]);return new File([await d.save()],name,{type:'application/pdf'});};
    try {
        await processFiles([await pdf('a.pdf',3),await pdf('b.pdf',4)]);
        const mode=document.getElementById('page-sides-select');
        eq('simplex default',mode?.value,'simplex');
        state.pageNum=7;state.cropBoxes=Array.from({length:7},()=>({...other}));state.cropBoxes[6]={...frame};saveHistory();
        await copyBoxToAll();
        eq('last-page simplex updates every earlier page',state.cropBoxes,Array.from({length:7},()=>({...frame})));
        undo();eq('whole copy undo restores earlier frames',state.cropBoxes[0],other);eq('undo retains source',state.cropBoxes[6],frame);
        redo();eq('whole copy redo restores first frame',state.cropBoxes[0],frame);
        checks.push('all-page simplex from last page and Undo Redo');
        if(!mode)throw new Error(failures.join('\n'));
        const before=JSON.stringify(state.cropBoxes);mode.value='duplex';mode.dispatchEvent(new Event('change'));
        eq('mode switch preserves frames',JSON.stringify(state.cropBoxes),before);
        checks.push('configuration has no eager frame mutation');
        state.pageNum=6;state.cropBoxes=Array.from({length:7},()=>({...other}));state.cropBoxes[5]={...frame};saveHistory();
        await copyBoxToAll();
        eq('front sides use local parity across odd-length boundary',state.cropBoxes,[frame,other,frame,frame,other,frame,other]);
        undo();eq('duplex undo restores prior front frame',state.cropBoxes[0],other);redo();
        checks.push('front copy includes earlier pages with per-file parity');
        state.pageNum=7;state.cropBoxes[6]={x:60,y:80,w:100,h:120};const back={...state.cropBoxes[6]};saveHistory();
        await copyBoxToAll();
        eq('back sides preserve front frames',state.cropBoxes,[frame,back,frame,frame,back,frame,back]);
        checks.push('back copy includes earlier pages and preserves front');
        eq('odd even toolbar action removed',!!document.getElementById('btn-copy-odd-even'),false);
        eq('odd even frame action removed',!!document.getElementById('btn-box-copy-odd-even'),false);
        checks.push('single copy action at both surfaces');
        await processFiles([await pdf('single.pdf',1)]);
        eq('new batch retains chosen configuration',mode.value,'duplex');
        state.cropBoxes[0]={...frame};saveHistory();const h=historyIndex;
        await copyBoxToAll();eq('single-page source unchanged',state.cropBoxes[0],frame);eq('no targets no extra undo step',historyIndex,h);
        checks.push('single page and configuration retention');
        state.cropBoxes[0]=null;await copyBoxToAll();eq('missing source frame preserved',state.cropBoxes[0],null);
        checks.push('no source frame');
        if(failures.length)throw new Error(failures.join('\n'));
        return {passed:checks.length,checks};
    } finally {window.alert=originalAlert;}
}
