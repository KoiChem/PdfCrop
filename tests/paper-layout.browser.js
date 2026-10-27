// Evaluate this function in the app page. Only file destinations are intercepted.
async () => {
    const paper = document.getElementById('source-paper-select');
    const original = { saveAs: window.saveAs, picker: window.showDirectoryPicker, alert: window.alert };
    const failures = [];
    let output;
    const files = [];
    let passed = 0;
    const check = (name, actual, want, tolerance = 0.01) => {
        if (!Number.isFinite(actual) || Math.abs(actual - want) > tolerance) failures.push(`${name}: ${actual} != ${want}`);
    };
    if (!paper) failures.push('Missing source paper selector');
    else if (paper.value !== 'a4_portrait') failures.push('Default source paper must be A4 portrait');
    window.saveAs = blob => { output = blob; };
    window.showDirectoryPicker = async () => ({ getFileHandle: async name => ({
        createWritable: async () => ({ write: async blob => files.push({ name, blob }), close: async () => {} })
    }) });
    window.alert = message => { if (message !== 'フォルダへの保存が完了しました。') failures.push(message); };

    async function source(size, box, count = 1, unit = 1, rotation = 0, cropOffset = false) {
        const doc = await PDFLib.PDFDocument.create();
        for (let i = 0; i < count; i++) {
            const p = doc.addPage(size);
            p.node.set(PDFLib.PDFName.of('UserUnit'), PDFLib.PDFNumber.of(unit));
            p.setRotation(PDFLib.degrees(rotation));
            if (cropOffset) {
                p.setCropBox(30, 30, 1200, 1600);
                p.drawRectangle({ x: 330, y: 430, width: 600, height: 800,
                    borderColor: PDFLib.rgb(0, 0, 0), borderWidth: 4 });
                // After 90-degree rotation, blue mark occupies relative crop bounds
                // x=.2..5, y=.2..4. Asymmetry catches swapped axes/offsets.
                p.drawRectangle({ x: 450, y: 590, width: 120, height: 240, color: PDFLib.rgb(0, 0, 1) });
            } else {
                p.drawRectangle({ x: box.x + 2, y: size[1] - box.y - box.h + 2,
                    width: box.w - 4, height: box.h - 4, borderColor: PDFLib.rgb(0, 0, 0), borderWidth: 2 });
            }
        }
        state.pdfDoc = await pdfjsLib.getDocument({ data: await doc.save() }).promise;
        state.numPages = count; state.pageNum = 1; state.exportScope = 'all'; state.pageScale = 1;
        state.cropBoxes = Array.from({ length: count }, () => ({ ...box }));
    }
    async function pdf(layout) {
        document.getElementById('layout-select').value = layout;
        output = null; await exportPDF();
        if (!output) throw new Error('No exported PDF');
        return PDFLib.PDFDocument.load(await output.arrayBuffer());
    }
    async function pixels(bitmap, blue = false) {
        const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height;
        const ctx = c.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        let left = c.width, top = c.height, right = -1, bottom = -1;
        for (let y=0; y<c.height; y++) for (let x=0; x<c.width; x++) {
            const i = (y*c.width+x)*4;
            if (blue ? data[i]<100 && data[i+1]<100 && data[i+2]>150 : data[i]<80 && data[i+1]<80 && data[i+2]<80) {
                left=Math.min(left,x); right=Math.max(right,x); top=Math.min(top,y); bottom=Math.max(bottom,y);
            }
        }
        return { left, top, right, bottom, width: right-left+1, height: bottom-top+1 };
    }
    // Read actual image placement matrices from the generated PDF content streams.
    function rectangles(doc, p) {
        const text = doc.context.lookup(p.node.Contents()).asArray().map(ref =>
            new TextDecoder().decode(PDFLib.decodePDFRawStream(doc.context.lookup(ref)).decode())).join('\n');
        const tokens = text.match(/\/[\w-]+ Do|[-+\d.e]+ [-+\d.e]+ [-+\d.e]+ [-+\d.e]+ [-+\d.e]+ [-+\d.e]+ cm|\b[qQ]\b/g) || [];
        let m = [1, 0, 0, 1, 0, 0]; const stack = [], rects = [];
        for (const t of tokens) {
            if (t === 'q') stack.push(m.slice());
            else if (t === 'Q') m = stack.pop();
            else if (t.endsWith(' cm')) {
                const n = t.split(' ').slice(0, 6).map(Number), a = m;
                m = [a[0]*n[0]+a[2]*n[1], a[1]*n[0]+a[3]*n[1], a[0]*n[2]+a[2]*n[3],
                    a[1]*n[2]+a[3]*n[3], a[0]*n[4]+a[2]*n[5]+a[4], a[1]*n[4]+a[3]*n[5]+a[5]];
            } else rects.push({ x: m[4], y: m[5], width: m[0], height: m[3] });
        }
        return rects;
    }
    try {
        if (paper) {
            for (const f of [
                { value: 'a4_portrait', width: 297.637795, height: 420.944882 },
                { value: 'a3_landscape', width: 595.275591, height: 420.944882 },
                { value: 'b4_landscape', width: 515.905512, height: 364.251969 }
            ]) {
                for (const dpi of ['144', '300']) for (const zoom of [0.5, 2]) {
                    await source([1260, 1660], {}, 1, 2, 90, true);
                    state.pageScale = zoom;
                    // Rotated visible page is 1600 x 1200; select its central half.
                    state.cropBoxes = [{ x: 400*zoom, y: 300*zoom, w: 800*zoom, h: 600*zoom }];
                    paper.value = f.value; document.getElementById('dpi-select').value = dpi;
                    const out = await pdf('single');
                    check(`${f.value} width`, out.getPage(0).getWidth(), f.width);
                    check(`${f.value} height`, out.getPage(0).getHeight(), f.height);
                    const image = rectangles(out, out.getPage(0))[0];
                    check('image width', image.width, f.width); check('image height', image.height, f.height);
                    check('frame stays unchanged', state.cropBoxes[0].w, 800*zoom);
                    if (dpi === '144' && zoom === 0.5) {
                        files.length = 0; await exportJPGs();
                        const bitmap = await createImageBitmap(files[0].blob);
                        check('JPG normalized width', bitmap.width, f.width*2, 1);
                        check('JPG normalized height', bitmap.height, f.height*2, 1);
                        const frame = await pixels(bitmap), mark = await pixels(bitmap, true);
                        check('frame left', frame.left, 0, 1); check('frame top', frame.top, 0, 1);
                        check('frame right', frame.right, bitmap.width-1, 1); check('frame bottom', frame.bottom, bitmap.height-1, 1);
                        check('blue mark x', mark.left, bitmap.width*.2, 2); check('blue mark y', mark.top, bitmap.height*.2, 2);
                        check('blue mark width', mark.width, bitmap.width*.3, 2); check('blue mark height', mark.height, bitmap.height*.2, 2);
                        bitmap.close();
                    }
                    passed++;
                }
            }
        }
        if (paper) paper.value = 'pdf';
        document.getElementById('dpi-select').value = '144';
        for (const f of [
            { paper: 'a4_portrait', size: [1190.5511811023623, 1683.7795275590552], box: { x: 20, y: 20, w: 798, h: 139 }, count: 35, pages: 4, landscape: false, shrink: false, width: 399, height: 69.5 },
            { size: [850, 200], box: { x: 20, y: 20, w: 798, h: 139 }, count: 35, pages: 12, landscape: true, shrink: false },
            { size: [200, 800], box: { x: 20, y: 20, w: 100, h: 700 }, count: 2, pages: 1, landscape: false, shrink: false },
            { size: [1000, 1000], box: { x: 20, y: 20, w: 900, h: 900 }, count: 2, pages: 2, landscape: false, shrink: true }
        ]) {
            if (paper) paper.value = f.paper || 'pdf';
            await source(f.size, f.box, f.count);
            const out = await pdf(f.landscape ? 'tile_a4_landscape' : 'tile_a4');
            check('tile page count', out.getPageCount(), f.pages);
            let images = 0;
            for (const p of out.getPages()) {
                check('tile orientation', Number(p.getWidth() > p.getHeight()), Number(f.landscape));
                for (const r of rectangles(out, p)) {
                    images++;
                    if (r.x < 19.99 || r.y < 19.99 || r.x+r.width > p.getWidth()-19.99 || r.y+r.height > p.getHeight()-19.99) {
                        failures.push(`Image outside margins: ${JSON.stringify(r)}`);
                    }
                    if (!f.shrink) { check('no enlargement width', r.width, f.width || f.box.w); check('no enlargement height', r.height, f.height || f.box.h); }
                    else {
                        if (r.width >= f.box.w || r.height >= f.box.h) failures.push('Oversize crop was not reduced');
                        check('aspect ratio', r.width/r.height, f.box.w/f.box.h);
                    }
                }
            }
            check('all crops retained', images, f.count);
            files.length = 0; await exportJPGs();
            check('JPG tile page count', files.length, f.pages);
            for (const file of files) {
                const bitmap = await createImageBitmap(file.blob), bounds = await pixels(bitmap);
                if (bounds.right < 0) failures.push('JPG tile lost crop content');
                if (bounds.left < 39 || bounds.top < 39 || bounds.right >= bitmap.width-39 || bounds.bottom >= bitmap.height-39) {
                    failures.push(`JPG content outside margins: ${JSON.stringify(bounds)}`);
                }
                bitmap.close();
            }
            passed++;
        }
    } finally {
        window.saveAs = original.saveAs; window.showDirectoryPicker = original.picker; window.alert = original.alert;
    }
    if (failures.length) throw new Error(failures.slice(0, 12).join('\n') + `\nTotal failures: ${failures.length}`);
    return { passed, checks: 'paper normalization, PDF/JPG, rotation/UserUnit/zoom/DPI, 35 wide crops, tall crops, oversize fit' };
}
