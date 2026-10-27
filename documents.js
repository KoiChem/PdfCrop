// Retain each original PDF; continuous pages only map to their source document.
function getSourcePageInfo(doc, pageNum) {
    if (doc.sources) {
        const source = doc.sources.find(s => pageNum >= s.start && pageNum <= s.end);
        return { ...source, localPageNum:pageNum-source.start+1 };
    }
    return { name:'', index:0, start:1, end:doc.numPages, localPageNum:pageNum };
}

function syncSourceFileControl() {
    const control=document.getElementById('source-file-control'), select=document.getElementById('source-file-select');
    const sources=state.pdfDoc?.sources || [];
    control.hidden=!sources.length;
    if (!sources.length) return;
    const source=getSourcePageInfo(state.pdfDoc,state.pageNum);
    select.value=String(source.index);
    select.title=`${source.name} · ${source.localPageNum} / ${source.doc.numPages}ページ`;
}

document.getElementById('source-file-select').addEventListener('change',e=>{
    const source=state.pdfDoc?.sources?.[Number(e.target.value)];
    if (!source || loading.style.display==='flex') return;
    state.pageNum=source.start;
    void renderAndUI();
});

document.getElementById('btn-open').addEventListener('click',()=>fileInput.click());

let documentLoadInProgress=false;
async function processFiles(fileList) {
    const files=Array.from(fileList);
    if (!files.length || documentLoadInProgress || loading.style.display==='flex') return false;
    if (files.length>10) { alert('一度に開けるPDFは10ファイルまでです。'); return false; }
    if (files.some(f=>f.type!=='application/pdf' && !/\.pdf$/i.test(f.name))) {
        alert('PDFファイルを選択してください。'); return false;
    }
    files.sort((a,b)=>a.name.localeCompare(b.name,'ja',{numeric:true,sensitivity:'base'}));
    documentLoadInProgress=true;
    const sources=[], pageInfo=[];
    let currentName='', pendingTask=null, firstCanvas=null, committed=false;
    setAppBusy(true);
    document.getElementById('progress-container').style.display='block';
    const progress=document.getElementById('export-progress');progress.max=files.length;progress.value=0;
    document.getElementById('export-progress-text').textContent=`0 / ${files.length} ファイル`;
    const previewDialog=document.getElementById('output-preview-dialog');
    if (previewDialog.open) previewDialog.close();
    try {
        for (const file of files) {
            currentName=file.name;
            document.querySelector('.loading-text').textContent=`PDF 読み込み中… ${sources.length+1} / ${files.length}`;
            pendingTask=pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())});
            const doc=await pendingTask.promise;
            pendingTask=null;
            const source={name:file.name,doc,index:sources.length,start:pageInfo.length+1,end:pageInfo.length+doc.numPages};
            sources.push(source);
            if (source.end>100) throw new Error('合計100ページまで開けます。');
            for (let n=1;n<=doc.numPages;n++) {
                const page=await doc.getPage(n), viewport=page.getViewport({scale:1});
                pageInfo.push({width:viewport.width,height:viewport.height,userUnit:page.userUnit});
            }
            progress.value=sources.length;
            document.getElementById('export-progress-text').textContent=`${sources.length} / ${files.length} ファイル`;
        }
        const batch={sources,pageInfo,numPages:pageInfo.length,
            getPage(pageNum) {
                const s=getSourcePageInfo(this,pageNum);
                return s.doc.getPage(s.localPageNum);
            },
            async destroy() { await Promise.all(sources.map(s=>s.doc.destroy())); }
        };
        // Render off screen first: a failed replacement never clears the old workspace.
        const page=await batch.getPage(1), viewport=page.getViewport({scale:1});
        firstCanvas=document.createElement('canvas');firstCanvas.width=viewport.width;firstCanvas.height=viewport.height;
        await page.render({canvasContext:firstCanvas.getContext('2d'),viewport}).promise;
        await stopEditorRender();
        const previous=state.pdfDoc;
        state.pdfDoc=batch;state.numPages=batch.numPages;state.pageNum=1;state.pageScale=1;
        state.cropBoxes=new Array(batch.numPages).fill(null);
        state.isDrawing=state.isDragging=state.isResizing=state.isNudging=state.isPanning=false;
        historyStack=[];historyIndex=-1;saveHistory();
        pageTotal.textContent=batch.numPages;pageInput.value=1;pageInput.max=batch.numPages;
        btnZoomReset.textContent='100%';
        canvas.width=firstCanvas.width;canvas.height=firstCanvas.height;ctx.drawImage(firstCanvas,0,0);
        workspace.style.width=viewport.width+'px';workspace.style.height=viewport.height+'px';
        const select=document.getElementById('source-file-select');select.replaceChildren();
        for (const s of sources) {
            const option=document.createElement('option');option.value=String(s.index);
            option.textContent=`${s.name}（${s.start}–${s.end}）`;select.append(option);
        }
        drawCropBox(1);updateUI();updatePinStyle();
        committed=true;
        if (previous) await previous.destroy().catch(error=>console.warn('Previous PDF cleanup failed',error));
        return true;
    } catch (error) {
        const detail=/100ページ/.test(error.message) ? error.message
            : error.name==='PasswordException' ? 'パスワード付きPDFには対応していません。'
            : 'PDFを読み込めませんでした。';
        alert(`${currentName}\n${detail}\n開いていた文書はそのままです。`);
        return false;
    } finally {
        if (pendingTask) await pendingTask.destroy().catch(()=>{});
        if (!committed) await Promise.all(sources.map(s=>s.doc.destroy().catch(()=>{})));
        if (firstCanvas) { firstCanvas.width=0;firstCanvas.height=0; }
        setAppBusy(false);documentLoadInProgress=false;
    }
}

async function copyBoxToFollowing(oddEven) {
    const doc=state.pdfDoc, currentPage=state.pageNum, currentBox=state.cropBoxes[currentPage-1];
    if (!currentBox) return alert('現在のページに枠がありません。');
    if (documentLoadInProgress || loading.style.display==='flex') return;
    const zoom=state.pageScale, paper=document.getElementById('source-paper-select').value;
    startOutputProgress('枠をコピー中…',state.numPages-currentPage);
    try {
        const sourcePage=await doc.getPage(currentPage), scale=getPagePointScale(sourcePage,paper);
        const physical={x:currentBox.x/zoom*scale.x,y:currentBox.y/zoom*scale.y,
            w:currentBox.w/zoom*scale.x,h:currentBox.h/zoom*scale.y};
        const parity=getSourcePageInfo(doc,currentPage).localPageNum%2;
        const updates=[],skipped=[];
        for(let n=currentPage+1;n<=state.numPages;n++) {
            if(oddEven && getSourcePageInfo(doc,n).localPageNum%2!==parity)continue;
            const page=await doc.getPage(n), s=getPagePointScale(page,paper), viewport=page.getViewport({scale:1});
            const box={x:physical.x/s.x,y:physical.y/s.y,w:physical.w/s.x,h:physical.h/s.y};
            if(box.x<-.001||box.y<-.001||box.x+box.w>viewport.width+.001||box.y+box.h>viewport.height+.001)skipped.push(n);
            else updates.push([n,{x:box.x*zoom,y:box.y*zoom,w:box.w*zoom,h:box.h*zoom}]);
        }
        for(const [n,box] of updates)state.cropBoxes[n-1]=box;
        if(updates.length)saveHistory();
        const result=`${updates.length}ページに枠をコピーしました。`;
        alert(skipped.length ? `${result}\n枠が用紙に収まらないため変更しなかったページ: ${skipped.join(', ')}` : result);
    } catch(error) {
        console.error(error);alert('枠をコピーできませんでした。');
    } finally { setAppBusy(false); }
}
