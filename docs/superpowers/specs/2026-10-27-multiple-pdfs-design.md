# Multiple PDFs

Approved by the user: implement and publish the recommended multi-file workflow, with one common source-paper size for the entire batch; mixed paper sizes need no separate UI.

Goal: open up to 10 PDFs / 100 total pages as one continuous workspace, naturally sorted by filename, preserving within-file order. File picker and drop share validation. A compact file selector jumps to each source; continuous page navigation keeps it synchronized. Whole/current-page output retains existing layout, DPI, preview and names with unique continuous JPG numbering.

Keep original PDF.js documents and map continuous page numbers to source/local page numbers. Do not serialize a merged intermediate. Read and validate the complete batch before replacing the current document/crops/history. Show loading progress; failure, password protection, invalid files and exceeded limits preserve the old work and release staged resources. Release old documents after successful replacement. Ignore new requests during loading/export.

Copy frames across files by physical top-left position and size using the common source-paper calibration, rather than raw PDF coordinates. Odd/even restarts within each file. Skip out-of-bounds targets without overwriting them and report affected continuous pages; keep Undo/Redo. One source-paper control applies to every file (A4 portrait default, existing alternatives retained).

Alternative: eagerly merge PDFs with pdf-lib; rejected because it duplicates document data/processing and introduces a needless metadata conversion. Separate file workspaces require more repeated operation for the requested batch workflow.

Success: real 10-file/100-page scanned fixtures, boundaries/order/parity, resolution differences/UserUnit/rotation, atomic load errors/limits, lazy preview, actual PDF/JPG image order and geometry, existing 70 checks, narrow layout/button gaps, public deployment verification. Page count alone is not a performance guarantee for arbitrarily huge files.
