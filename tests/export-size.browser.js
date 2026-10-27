// Run this async function in the app page with Playwright browser_evaluate.
// Uses real PDF export and rendering; intercepts only the download destination.
async () => {
    document.getElementById('source-paper-select').value = 'pdf';
    const originalSaveAs = window.saveAs;
    const failures = [];
    const results = [];
    let output;
    window.saveAs = blob => { output = blob; };

    async function exportDocument(layout) {
        document.getElementById('layout-select').value = layout;
        output = null;
        await exportPDF();
        if (!output) throw new Error('PDF export produced no file');
        return pdfjsLib.getDocument({ data: new Uint8Array(await output.arrayBuffer()) }).promise;
    }

    async function measure(doc, pageNum = 1) {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport }).promise;
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let minX = canvas.width, maxX = -1, minY = canvas.height, maxY = -1;
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const i = (y * canvas.width + x) * 4;
                if (pixels[i] < 80 && pixels[i + 1] < 80 && pixels[i + 2] < 80) {
                    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                }
            }
        }
        return { width: viewport.width, height: viewport.height,
            markWidth: maxX - minX + 1, markHeight: maxY - minY + 1 };
    }

    function check(label, actual, expected, tolerance = 0.01) {
        if (Math.abs(actual - expected) > tolerance) {
            failures.push(`${label}: expected ${expected}, received ${actual}`);
        }
    }

    try {
        // Literal physical sizes: a 72-unit mark is 54/72/144 points respectively.
        for (const fixture of [
            { unit: 0.75, width: 135, height: 108, mark: 54, a4: [595.28, 841.89] },
            { unit: 1, width: 180, height: 144, mark: 72, a4: [595.28, 841.89] },
            { unit: 2, width: 360, height: 288, mark: 144, a4: [595.28, 841.89] }
        ]) {
            const source = await PDFLib.PDFDocument.create();
            const sourcePage = source.addPage([300, 300]);
            sourcePage.node.set(PDFLib.PDFName.of('UserUnit'), PDFLib.PDFNumber.of(fixture.unit));
            sourcePage.drawRectangle({
                x: 40, y: 180, width: 72, height: 72, color: PDFLib.rgb(0, 0, 0)
            });
            const bytes = await source.save();
            for (const dpi of ['300']) {
                for (const zoom of [0.5, 2]) {
                    state.pdfDoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
                    state.numPages = 1; state.pageNum = 1; state.exportScope = 'all';
                    state.pageScale = zoom;
                    state.cropBoxes = [{ x: 20 * zoom, y: 20 * zoom, w: 180 * zoom, h: 144 * zoom }];
                    const label = `UserUnit ${fixture.unit} / ${dpi} DPI / zoom ${zoom}`;

                    const raster = await extractPageImageData((await buildOutputPlan()).frames[0], Number(dpi) / 72, state.pdfDoc);
                    check(`${label} raster width`, raster.width, fixture.width * Number(dpi) / 72);
                    check(`${label} raster height`, raster.height, fixture.height * Number(dpi) / 72);

                    const direct = await measure(await exportDocument('tile_a4'));
                    check(`${label} direct A4 width`, direct.width, fixture.a4[0]);
                    check(`${label} direct A4 height`, direct.height, fixture.a4[1]);
                    check(`${label} direct mark width`, direct.markWidth, fixture.mark, 1);
                    check(`${label} direct mark height`, direct.markHeight, fixture.mark, 1);

                    const singleDoc = await exportDocument('single');
                    const single = await measure(singleDoc);
                    check(`${label} crop width`, single.width, fixture.width);
                    check(`${label} crop height`, single.height, fixture.height);
                    check(`${label} crop mark width`, single.markWidth, fixture.mark, 1);
                    check(`${label} crop mark height`, single.markHeight, fixture.mark, 1);

                    // Reopen the exported crop and place its whole page on an A4 tile.
                    state.pdfDoc = singleDoc;
                    state.pageScale = 1;
                    state.cropBoxes = [{ x: 0, y: 0, w: single.width, h: single.height }];
                    const tiled = await measure(await exportDocument('tile_a4'));
                    check(`${label} reopened mark width`, tiled.markWidth, fixture.mark, 1);
                    check(`${label} reopened mark height`, tiled.markHeight, fixture.mark, 1);
                    results.push({ unit: fixture.unit, dpi, zoom, direct, single, tiled });
                }
            }
        }
    } finally {
        window.saveAs = originalSaveAs;
    }
    if (failures.length) throw new Error(failures.join('\n'));
    return { passed: results.length * 3, results };
}
