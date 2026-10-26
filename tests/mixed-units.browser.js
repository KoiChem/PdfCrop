// Run in the app page with Playwright browser_evaluate.
// Intercept only download/folder destinations, while exercising real exporters.
async () => {
    document.getElementById('source-paper-select').value = 'pdf';
    const saved = { saveAs: window.saveAs, picker: window.showDirectoryPicker, alert: window.alert };
    let pdfBlob;
    const files = [];
    const failures = [];
    function check(label, actual, expected, tolerance = 0.01) {
        if (Math.abs(actual - expected) > tolerance) failures.push(`${label}: ${actual} != ${expected}`);
    }
    window.saveAs = blob => { pdfBlob = blob; };
    window.showDirectoryPicker = async () => ({
        getFileHandle: async name => ({ createWritable: async () => ({
            write: async blob => { files.push({ name, blob }); }, close: async () => {}
        }) })
    });
    window.alert = message => {
        if (message !== 'フォルダへの保存が完了しました。') failures.push(message);
    };
    async function exportPdf(layout) {
        document.getElementById('layout-select').value = layout;
        pdfBlob = null;
        await exportPDF();
        if (!pdfBlob) throw new Error('No PDF produced');
        return PDFLib.PDFDocument.load(await pdfBlob.arrayBuffer());
    }
    async function readImage(blob) {
        const bitmap = await createImageBitmap(blob);
        const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height;
        const ctx = c.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
        const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
        const bands = [];
        let band = null;
        for (let y = 0; y < c.height; y++) {
            let minX = c.width, maxX = -1;
            for (let x = 0; x < c.width; x++) {
                const i = (y * c.width + x) * 4;
                if (pixels[i] < 80 && pixels[i + 1] < 80 && pixels[i + 2] < 80) {
                    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                }
            }
            if (maxX >= 0) {
                if (!band) { band = { minX, maxX, top: y, bottom: y }; bands.push(band); }
                band.minX = Math.min(band.minX, minX); band.maxX = Math.max(band.maxX, maxX); band.bottom = y;
            } else band = null;
        }
        return { width: c.width, height: c.height,
            marks: bands.map(b => [b.maxX - b.minX + 1, b.bottom - b.top + 1]) };
    }
    try {
        const source = await PDFLib.PDFDocument.create();
        for (const unit of [0.75, 2, 1]) {
            const p = source.addPage([300, 300]);
            p.node.set(PDFLib.PDFName.of('UserUnit'), PDFLib.PDFNumber.of(unit));
            p.drawRectangle({ x: 40, y: 180, width: 72, height: 72, color: PDFLib.rgb(0, 0, 0) });
        }
        state.pdfDoc = await pdfjsLib.getDocument({ data: await source.save() }).promise;
        state.numPages = 3; state.pageNum = 1; state.pageScale = 1; state.exportScope = 'all';
        state.cropBoxes = [{ x: 20, y: 20, w: 180, h: 144 }, { x: 20, y: 20, w: 180, h: 144 }, null];
        document.getElementById('dpi-select').value = '144';
        const single = await exportPdf('single');
        check('single page count (skip unset crop)', single.getPageCount(), 2);
        for (const p of single.getPages()) { check('max width', p.getWidth(), 360); check('max height', p.getHeight(), 288); }
        const tile = await exportPdf('tile_a4');
        check('mixed tile page count', tile.getPageCount(), 1);
        check('mixed tile width', tile.getPage(0).getWidth(), 595.28);
        const content = tile.context.lookup(tile.getPage(0).node.Contents()).asArray()
            .map(ref => new TextDecoder().decode(PDFLib.decodePDFRawStream(tile.context.lookup(ref)).decode())).join('');
        for (const matrix of ['135 0 0 108 0 0 cm', '360 0 0 288 0 0 cm']) {
            if (!content.includes(matrix)) failures.push(`Missing physical image placement: ${matrix}`);
        }

        state.exportScope = 'current';
        const current = await exportPdf('single');
        check('current page count', current.getPageCount(), 1);
        check('current physical width', current.getPage(0).getWidth(), 135);
        check('current physical height', current.getPage(0).getHeight(), 108);
        state.exportScope = 'all';

        for (const layout of ['single', 'tile_a4']) {
            files.length = 0;
            document.getElementById('layout-select').value = layout;
            await exportJPGs();
            check(`${layout} JPG file count`, files.length, layout === 'single' ? 2 : 1);
            if (layout === 'single') {
                for (const [i, want] of [[0, [270, 216]], [1, [720, 576]]]) {
                    const im = await readImage(files[i].blob);
                    check('JPG crop width', im.width, want[0]); check('JPG crop height', im.height, want[1]);
                }
            } else {
                const im = await readImage(files[0].blob);
                check('A4 JPG width', im.width, 1190); check('A4 JPG height', im.height, 1683);
                check('A4 JPG mark count', im.marks.length, 2);
                for (const [i, want] of [[0, 108], [1, 288]]) {
                    check('A4 JPG mark width', im.marks[i][0], want, 1);
                    check('A4 JPG mark height', im.marks[i][1], want, 1);
                }
            }
        }
    } finally {
        window.saveAs = saved.saveAs; window.showDirectoryPicker = saved.picker; window.alert = saved.alert;
    }
    if (failures.length) throw new Error(failures.join('\n'));
    return { passed: 5, checks: ['mixed single PDF', 'mixed A4 PDF', 'current page PDF', 'single JPG', 'A4 JPG'] };
}
