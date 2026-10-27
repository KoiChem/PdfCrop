# Fixed output orientation and lightweight preview

**Approved specification:** Replace layout choices with 1枠1枚, A4タイル・縦, A4タイル・横. A4 portrait is the standard A4 choice. Respect the selected orientation; retain 100% size when it fits and otherwise reduce proportionally, never enlarge. Preserve source-paper calibration.

**UI:** One preview button beside PDF/JPG opens a keyboard-accessible dialog. Show one output sheet, previous/next sheet navigation, layout choice, crop/page counts and actual scale. Layout changes also update the toolbar choice. Save PDF/JPG directly from the dialog using its exact output plan; close preview before the existing export progress screen. Escape/close restores focus.

**Architecture:** `buildOutputPlan()` snapshots the source PDF, valid crops, source-paper choice, source page, scope and layout. It returns physical frame sizes, top-left placements, page size/count and scale. All three consumers use this plan. `renderCropCanvas()` renders into a crop-sized canvas, without a full-page intermediate or JPEG round trip for preview. `preview.js` owns dialog rendering/cancellation and a bounded low-resolution crop cache. Preview has no dependency on export DPI. Single-page JPG uses the same white padding/centering as PDF so the preview is truthful for mixed crop sizes.

**Files:** Modify `index.html` and existing browser regressions; create `output.js` (shared geometry/render/export), `preview.js`, `tests/output-preview.browser.js` and this plan.

**Steps (execute inline, then requesting-code-review):**
1. Add RED tests for forced orientation and preview availability.
2. Build the shared physical output plan and crop renderer; route PDF/JPG through the same placements.
3. Add compact dialog, lazy raster rendering, rapid-switch cancellation and bounded caching. Prevent editor shortcuts while preview is open.
4. Update regressions for intentional fixed orientations/single-JPG parity. Verify the complete browser suite, actual UI saves, 35-page lazy rendering/cache counts, pixel parity, 320/390/768/1280 layouts, keyboard focus and errors.
5. Review, commit/push, confirm Pages success, verify relevant deployed flows and served assets.

**Success conditions:** Selected orientation is preserved. Every frame remains inside output margins, with preview/PDF/JPG matching page count/placement/scale. First preview renders only its sheet's frames; changing DPI does not redraw it; changing orientation reuses cached crops. Closing/changing layouts cancels obsolete raster work; no stale result appears. Original/crop data are not mutated. Actual student source PDF remains unavailable; use anonymous equivalent fixtures.
