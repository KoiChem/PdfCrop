# Page sides and whole-document frame copy

Approved: implement and publish. All pages includes pages before and after the current page.

Page configuration is a single batch-wide selector: 片面1ページ (default), 両面. Replace both odd/even buttons with a single 全ページに枠コピー action at both toolbar and frame. Simplex copies to every other page. Duplex copies only to the same local-page parity across all files; each source PDF starts with its front at page 1. Keep the source and opposite-side frames untouched. Switching configuration changes no existing frames; retain the selection while opening another batch, just as source-paper settings are retained. No persistent storage is added.

Keep physical frame dimensions, out-of-bounds preservation/reporting, transactional updates, busy isolation and one-step Undo/Redo. New PDF batches still start with empty frames. Output page scope is independent and unchanged.

Use the existing copy implementation and derive parity filtering from the selector instead of exposing odd/even commands. No new document abstraction or dependencies.
