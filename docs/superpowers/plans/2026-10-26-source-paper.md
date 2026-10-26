# Source paper and bounded A4 tiles

**Approved design:** Add one compact 元用紙 selector: A4縦 (default), A3横, B4横, PDFの設定どおり. Fixed choices map the visible page's whole width/height to the selected physical dimensions; PDF mode preserves UserUnit. Keep preview/crop coordinates unchanged. B4 is JIS 364 x 257 mm in landscape.

**Layout:** Preserve original crop sizes when either A4 orientation fits. Exclude orientations with zero fitting columns or rows. If neither fits, choose the orientation needing the least reduction, never enlarge, then pack using scaled dimensions. Use the same layout for PDF and JPG. Retain existing 20 pt margins and 10 pt gaps.

**UI:** Keep two wrapping toolbar rows, place source paper near file input, keep control labels together and explicit button gaps. No persistent student data or new dependencies. Selected paper applies to the entire loaded document and remains selected when another file is opened.

**Implementation plan (writing-plans / executing-plans):**

1. Extend browser tests before production changes: source-paper dimensions, default choice, zoom/DPI, 798 x 139 pt crops across 35 pages, tall crops and oversize reduction. Verify RED.
2. Add `getPagePointScale(page)` and normalize extraction/max crop sizes consistently. Add shared `getA4TileLayout(width,height)` and use its scale, cells and page size in both exporters.
3. Add the selector and compact toolbar grouping; preserve frames on setting changes. Keep old UserUnit tests in explicit PDF mode.
4. Run all browser tests, real UI file/dropdown/crop/download flows, output geometry and rendered-page inspection. Inspect toolbar at 320/390/768/1280 px.
5. Review, commit/push, confirm Pages success and rerun tests and UI checks on the deployed page.

**Review focus:** mixed pages/rotation/CropBox, UserUnit applied once, source x/y scaling, DPI only affecting pixels, every image inside page margins, no tile enlargement, JPG/PDF agreement and wrapped button gaps.

**Evidence boundary:** The user's original PDF is unavailable. Use anonymous fixtures with the measured crop dimensions; never commit the attached student work to this public repository.
