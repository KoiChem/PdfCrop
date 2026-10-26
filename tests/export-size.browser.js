// Run this async function in the app page with Playwright browser_evaluate.
// Uses real PDF export and rendering; intercepts only the download destination.
async () => {
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

    async function measure(doc) {
        const page = await doc.getPage(1);
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
        const source = await PDFLib.PDFDocument.create();
        source.addPage([300, 300]).drawRectangle({
            x: 40, y: 180, width: 72, height: 72, color: PDFLib.rgb(0, 0, 0)
        });
        const bytes = await source.save();
        for (const dpi of ['144', '300']) {
            for (const zoom of [0.5, 2]) {
                state.pdfDoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
                state.numPages = 1; state.pageNum = 1; state.exportScope = 'all';
                state.pageScale = zoom;
                state.cropBoxes = [{ x: 20 * zoom, y: 20 * zoom, w: 180 * zoom, h: 144 * zoom }];
                document.getElementById('dpi-select').value = dpi;
                const label = `${dpi} DPI / zoom ${zoom}`;

                const direct = await measure(await exportDocument('tile_a4'));
                check(`${label} direct A4 width`, direct.width, 841.89);
                check(`${label} direct A4 height`, direct.height, 595.28);
                check(`${label} direct mark width`, direct.markWidth, 72, 1);
                check(`${label} direct mark height`, direct.markHeight, 72, 1);

                const singleDoc = await exportDocument('single');
                const single = await measure(singleDoc);
                check(`${label} crop width`, single.width, 180);
                check(`${label} crop height`, single.height, 144);
                check(`${label} crop mark width`, single.markWidth, 72, 1);
                check(`${label} crop mark height`, single.markHeight, 72, 1);

                // Reopen the exported crop and place its whole page on an A4 tile.
                state.pdfDoc = singleDoc;
                state.pageScale = 1;
                state.cropBoxes = [{ x: 0, y: 0, w: single.width, h: single.height }];
                const tiled = await measure(await exportDocument('tile_a4'));
                check(`${label} reopened mark width`, tiled.markWidth, 72, 1);
                check(`${label} reopened mark height`, tiled.markHeight, 72, 1);
                results.push({ dpi, zoom, direct, single, tiled });
            }
        }
    } finally {
        window.saveAs = originalSaveAs;
    }
    if (failures.length) throw new Error(failures.join('\n'));
    return { passed: results.length * 3, results };
}
