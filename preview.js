const outputPreview = {
    dialog:document.getElementById('output-preview-dialog'),
    canvas:document.getElementById('preview-canvas'),
    stage:document.getElementById('preview-stage'),
    status:document.getElementById('preview-status'),
    select:document.getElementById('preview-layout-select'),
    plan:null, pageIndex:0, revision:0, task:null, error:false, cache:new Map()
};

function stopOutputPreviewRender() {
    outputPreview.revision++;
    if (outputPreview.task) outputPreview.task.cancel();
    outputPreview.task=null;
}

function clearOutputPreviewCache() {
    for (const canvas of outputPreview.cache.values()) { canvas.width=0; canvas.height=0; }
    outputPreview.cache.clear();
}

function updateOutputPreviewControls() {
    const p=outputPreview, plan=p.plan;
    document.getElementById('preview-prev').disabled=!plan || p.pageIndex===0;
    document.getElementById('preview-next').disabled=!plan || p.pageIndex>=plan.pageCount-1;
    document.getElementById('preview-pagination').textContent=plan ? `${p.pageIndex+1} / ${plan.pageCount}` : '0 / 0';
    document.getElementById('preview-save-pdf').disabled=!plan || p.error;
    document.getElementById('preview-save-jpg').disabled=!plan || p.error || !window.showDirectoryPicker;
}

async function openOutputPreview() {
    if (!captureOutputSettings().frames.length) return alert('対象ページに抽出枠が設定されていません。');
    const p=outputPreview;
    stopOutputPreviewRender(); clearOutputPreviewCache();
    p.plan=null; p.pageIndex=0; p.error=false;
    p.select.value=document.getElementById('layout-select').value;
    p.dialog.showModal();
    return refreshOutputPreview();
}

async function refreshOutputPreview() {
    const p=outputPreview;
    stopOutputPreviewRender();
    const revision=p.revision;
    p.error=false; p.stage.setAttribute('aria-busy','true'); p.status.textContent='配置を計算中…';
    p.plan=null; updateOutputPreviewControls();
    try {
        const plan=await buildOutputPlan();
        if (revision!==p.revision || !p.dialog.open) return;
        p.plan=plan; p.pageIndex=Math.min(p.pageIndex,plan.pageCount-1);
        const scale=plan.scale===1 ? '原寸100%' : `縮小${(plan.scale*100).toFixed(1)}%`;
        document.getElementById('preview-summary').textContent=`全${plan.frames.length}枠 → ${plan.pageCount}ページ · ${scale}`;
        await showOutputPreviewPage(p.pageIndex);
    } catch (error) {
        if (revision!==p.revision || !p.dialog.open) return;
        failOutputPreview(error);
    }
}

function failOutputPreview(error) {
    console.error(error);
    const p=outputPreview;
    p.error=true; p.stage.setAttribute('aria-busy','false');
    p.status.textContent='プレビューを表示できません。閉じて開き直してください。';
    updateOutputPreviewControls();
}

async function showOutputPreviewPage(index) {
    const p=outputPreview, plan=p.plan;
    if (!plan || !p.dialog.open) return;
    stopOutputPreviewRender();
    const revision=p.revision;
    const current=()=>revision===p.revision && p.dialog.open;
    p.pageIndex=Math.max(0,Math.min(index,plan.pageCount-1));
    p.error=false; updateOutputPreviewControls();
    const scale=800/Math.max(...plan.pageSize);
    p.canvas.width=Math.max(1,Math.round(plan.pageSize[0]*scale));
    p.canvas.height=Math.max(1,Math.round(plan.pageSize[1]*scale));
    const context=p.canvas.getContext('2d'), sx=p.canvas.width/plan.pageSize[0], sy=p.canvas.height/plan.pageSize[1];
    context.fillStyle='#fff'; context.fillRect(0,0,p.canvas.width,p.canvas.height);
    const frames=outputPageFrames(plan,p.pageIndex);
    context.strokeStyle='#d1d5db';
    for (const f of frames) context.strokeRect(f.x*sx+.5,f.y*sy+.5,f.drawWidth*sx-1,f.drawHeight*sy-1);
    p.stage.setAttribute('aria-busy','true'); p.status.textContent='画像を表示中…';
    // Paint page geometry before starting raster work, so controls stay responsive.
    await new Promise(requestAnimationFrame);
    try {
        for (const frame of frames) {
            if (!current()) return;
            const key=JSON.stringify([frame.pageNum,frame.box,frame.width,frame.height]);
            let image=p.cache.get(key);
            if (!image) {
                let task;
                image=await renderCropCanvas(plan.pdfDoc,frame,Math.min(1,800/Math.max(frame.width,frame.height)),t=>{
                    task=t;
                    if (current()) p.task=t; else t.cancel();
                });
                if (p.task===task) p.task=null;
                if (!current()) { image.width=0; image.height=0; return; }
                p.cache.set(key,image);
                if (p.cache.size>32) {
                    const first=p.cache.keys().next().value, old=p.cache.get(first);
                    old.width=0; old.height=0; p.cache.delete(first);
                }
            }
            context.drawImage(image,frame.x*sx,frame.y*sy,frame.drawWidth*sx,frame.drawHeight*sy);
        }
        if (current()) {
            p.stage.setAttribute('aria-busy','false'); p.status.textContent='';
            updateOutputPreviewControls();
        }
    } catch (error) {
        if (current() && error.name!=='RenderingCancelledException') failOutputPreview(error);
    }
}

document.getElementById('btn-preview').addEventListener('click',()=>{ void openOutputPreview(); });
document.getElementById('preview-close').addEventListener('click',()=>outputPreview.dialog.close());
document.getElementById('preview-prev').addEventListener('click',()=>{ void showOutputPreviewPage(outputPreview.pageIndex-1); });
document.getElementById('preview-next').addEventListener('click',()=>{ void showOutputPreviewPage(outputPreview.pageIndex+1); });
outputPreview.select.addEventListener('change',()=>{
    document.getElementById('layout-select').value=outputPreview.select.value;
    void refreshOutputPreview();
});
outputPreview.dialog.addEventListener('close',()=>{
    stopOutputPreviewRender(); clearOutputPreviewCache();
    outputPreview.plan=null; outputPreview.canvas.width=0; outputPreview.canvas.height=0;
    document.getElementById('btn-preview').focus();
});
for (const [id,save] of [['preview-save-pdf',exportPDF],['preview-save-jpg',exportJPGs]]) {
    document.getElementById(id).addEventListener('click',()=>{
        const plan=outputPreview.plan;
        if (!plan || outputPreview.error) return;
        outputPreview.dialog.close();
        void save(plan);
    });
}
