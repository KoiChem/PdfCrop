// Physical geometry shared by preview, PDF and JPG. Coordinates use top-left origins.
function getPagePointScale(page, sourcePaper = document.getElementById('source-paper-select').value) {
    const paper = SOURCE_PAPER_MM[sourcePaper];
    if (!paper) return { x: page.userUnit, y: page.userUnit };
    const viewport = page.getViewport({ scale: 1 });
    return { x: paper[0] * 72 / 25.4 / viewport.width, y: paper[1] * 72 / 25.4 / viewport.height };
}

function getA4TileLayout(width, height, orientation = 'portrait') {
    if (!(width > 0 && height > 0)) throw new Error('切り出し枠の大きさを確認してください。');
    const pageSize = orientation === 'landscape' ? [841.89, 595.28] : [595.28, 841.89];
    const margin = 20, gap = 10;
    const scale = Math.min(1, (pageSize[0]-margin*2)/width, (pageSize[1]-margin*2)/height);
    const cellWidth = width*scale, cellHeight = height*scale;
    const cols = Math.floor((pageSize[0]-margin*2+gap)/(cellWidth+gap)+1e-9);
    const rows = Math.floor((pageSize[1]-margin*2+gap)/(cellHeight+gap)+1e-9);
    return { pageSize, margin, gap, scale, cellWidth, cellHeight, cols, rows, countPerPage: cols*rows };
}

function captureOutputSettings() {
    const pageScale = state.pageScale;
    const frames = getTargetPageNumbers().flatMap(pageNum => {
        const b = state.cropBoxes[pageNum-1];
        return b && b.w>0 && b.h>0 ? [{ pageNum, box: { x:b.x/pageScale, y:b.y/pageScale, w:b.w/pageScale, h:b.h/pageScale } }] : [];
    });
    return { pdfDoc:state.pdfDoc, frames, sourcePaper:document.getElementById('source-paper-select').value,
        layout:document.getElementById('layout-select').value, scope:state.exportScope,
        sourcePage:state.pageNum, prefix:prefixInput.value || 'crop' };
}

async function buildOutputPlan(settings = captureOutputSettings()) {
    if (!settings.frames.length) throw new Error('対象ページに抽出枠が設定されていません。');
    const frames = [];
    for (const frame of settings.frames) {
        const page = await settings.pdfDoc.getPage(frame.pageNum);
        const s = getPagePointScale(page, settings.sourcePaper);
        frames.push({ ...frame, width:frame.box.w*s.x, height:frame.box.h*s.y });
    }
    const width = Math.max(...frames.map(f=>f.width)), height = Math.max(...frames.map(f=>f.height));
    const tile = settings.layout === 'single' ? null : getA4TileLayout(width,height,
        settings.layout === 'tile_a4_landscape' ? 'landscape' : 'portrait');
    const perPage = tile ? tile.countPerPage : 1;
    const scale = tile ? tile.scale : 1;
    for (let i=0;i<frames.length;i++) {
        const f=frames[i], index=i%perPage;
        f.drawWidth=f.width*scale; f.drawHeight=f.height*scale;
        f.x=tile ? tile.margin+(index%tile.cols)*(tile.cellWidth+tile.gap)+(tile.cellWidth-f.drawWidth)/2 : (width-f.width)/2;
        f.y=tile ? tile.margin+Math.floor(index/tile.cols)*(tile.cellHeight+tile.gap)+(tile.cellHeight-f.drawHeight)/2 : (height-f.height)/2;
    }
    return { ...settings, frames, pageSize:tile ? tile.pageSize : [width,height], scale,
        perPage, pageCount:Math.ceil(frames.length/perPage) };
}

function outputPageFrames(plan, pageIndex) {
    return plan.frames.slice(pageIndex*plan.perPage, (pageIndex+1)*plan.perPage);
}

// Render only the cropped surface, not a full source-page intermediate.
async function renderCropCanvas(pdfDoc, frame, pixelsPerPoint, onTask) {
    const page = await pdfDoc.getPage(frame.pageNum);
    const crop = document.createElement('canvas');
    crop.width=Math.max(1,Math.round(frame.width*pixelsPerPoint));
    crop.height=Math.max(1,Math.round(frame.height*pixelsPerPoint));
    const sx=crop.width/frame.box.w, sy=crop.height/frame.box.h;
    try {
        const task=page.render({ canvasContext:crop.getContext('2d'), viewport:page.getViewport({scale:1}),
            transform:[sx,0,0,sy,-frame.box.x*sx,-frame.box.y*sy] });
        if (onTask) onTask(task);
        await task.promise;
        return crop;
    } catch (error) {
        crop.width=0; crop.height=0;
        throw error;
    } finally {
        page.cleanup();
    }
}

async function extractPageImageData(frame, exportScale, pdfDoc) {
    const crop=await renderCropCanvas(pdfDoc,frame,exportScale);
    const dataUrl=crop.toDataURL('image/jpeg',JPEG_QUALITY);
    crop.width=0; crop.height=0;
    return { dataUrl, width:frame.width*exportScale, height:frame.height*exportScale };
}

// The visual overlay must also block native keyboard activation of toolbar controls.
function setAppBusy(busy) {
    // Inert can leave the previously focused button active until the next paint.
    const active=document.activeElement;
    if (busy && (toolbar.contains(active) || workspace.contains(active))) active.blur();
    toolbar.inert=busy;
    workspace.inert=busy;
    loading.style.display=busy ? 'flex' : 'none';
}

function startOutputProgress(label, total) {
    setAppBusy(true);
    document.querySelector('.loading-text').textContent=label;
    document.getElementById('progress-container').style.display='block';
    document.getElementById('export-progress').max=total;
    updateOutputProgress(0,total);
}

function updateOutputProgress(done,total) {
    document.getElementById('export-progress').value=done;
    document.getElementById('export-progress-text').textContent=`${done} / ${total} ページ`;
    if (done && done%7===0) triggerDinoJump();
}

async function exportPDF(planOrEvent) {
    const provided=planOrEvent && Array.isArray(planOrEvent.frames) ? planOrEvent : null;
    const settings=provided || captureOutputSettings();
    if (!settings.frames.length) return alert('対象ページに抽出枠が設定されていません。');
    const exportScale=Number(document.getElementById('dpi-select').value)/72;
    startOutputProgress('PDF 書き出し中...',settings.frames.length);
    try {
        const plan=provided || await buildOutputPlan(settings);
        const pdfDoc=await PDFLib.PDFDocument.create();
        let done=0;
        for (let i=0;i<plan.pageCount;i++) {
            const page=pdfDoc.addPage(plan.pageSize);
            for (const frame of outputPageFrames(plan,i)) {
                const image=await extractPageImageData(frame,exportScale,plan.pdfDoc);
                const jpg=await pdfDoc.embedJpg(image.dataUrl);
                page.drawImage(jpg,{ x:frame.x, y:plan.pageSize[1]-frame.y-frame.drawHeight,
                    width:frame.drawWidth, height:frame.drawHeight });
                updateOutputProgress(++done,plan.frames.length);
            }
        }
        const bytes=await pdfDoc.save();
        const suffix=plan.scope==='current' ? `_p${plan.sourcePage}` : '';
        saveAs(new Blob([bytes],{type:'application/pdf'}),`${plan.prefix}${suffix}.pdf`);
    } catch (error) {
        console.error(error); alert('PDF生成中にエラーが発生しました。');
    } finally {
        setAppBusy(false);
    }
}

async function exportJPGs(planOrEvent) {
    const provided=planOrEvent && Array.isArray(planOrEvent.frames) ? planOrEvent : null;
    const settings=provided || captureOutputSettings();
    if (!settings.frames.length) return alert('対象ページに抽出枠が設定されていません。');
    if (!window.showDirectoryPicker) return alert('お使いのブラウザは直接保存(File System Access API)に対応していません。ChromeまたはEdgeをご利用ください。');
    const exportScale=Number(document.getElementById('dpi-select').value)/72;
    let dir;
    try { dir=await window.showDirectoryPicker({mode:'readwrite'}); }
    catch (error) { if(error.name!=='AbortError')console.error(error); return; }
    startOutputProgress('JPG 書き出し中...',settings.frames.length);
    try {
        const plan=provided || await buildOutputPlan(settings);
        let done=0;
        for (let i=0;i<plan.pageCount;i++) {
            const sheet=document.createElement('canvas');
            sheet.width=Math.max(1,Math.round(plan.pageSize[0]*exportScale));
            sheet.height=Math.max(1,Math.round(plan.pageSize[1]*exportScale));
            const context=sheet.getContext('2d'), sx=sheet.width/plan.pageSize[0], sy=sheet.height/plan.pageSize[1];
            context.fillStyle='#fff'; context.fillRect(0,0,sheet.width,sheet.height);
            for (const frame of outputPageFrames(plan,i)) {
                const crop=await renderCropCanvas(plan.pdfDoc,frame,exportScale);
                context.drawImage(crop,frame.x*sx,frame.y*sy,frame.drawWidth*sx,frame.drawHeight*sy);
                crop.width=0; crop.height=0;
                updateOutputProgress(++done,plan.frames.length);
            }
            const blob=await new Promise((resolve,reject)=>sheet.toBlob(b=>b?resolve(b):reject(new Error('JPG生成に失敗しました。')),'image/jpeg',JPEG_QUALITY));
            const name=plan.layout==='single'
                ? `${plan.prefix}_${String(outputPageFrames(plan,i)[0].pageNum).padStart(3,'0')}.jpg`
                : `${plan.prefix}_A4_${String(i+1).padStart(3,'0')}.jpg`;
            const file=await dir.getFileHandle(name,{create:true}), writable=await file.createWritable();
            await writable.write(blob); await writable.close();
            sheet.width=0; sheet.height=0;
        }
        alert('フォルダへの保存が完了しました。');
    } catch (error) {
        console.error(error); alert('JPG保存中にエラーが発生しました。');
    } finally {
        setAppBusy(false);
    }
}
