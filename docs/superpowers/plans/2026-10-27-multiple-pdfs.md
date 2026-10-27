# Multiple PDFs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Open 10 PDFs / 100 pages as a continuous crop workspace and publish verified output.

**Architecture:** Add documents.js for transactional loading, source-page mapping and physically calibrated frame copies. Existing state.pdfDoc becomes a document facade exposing getPage/numPages/destroy with source/page metadata. Keep shared output geometry and preview consumers intact.

**Tech Stack:** Static JavaScript, PDF.js 3.11.174, pdf-lib 1.17.1, Playwright MCP.

**Spec:** docs/superpowers/specs/2026-10-27-multiple-pdfs-design.md

## Global Constraints
- Maximum 10 files / 100 pages; natural filename order; one common source paper.
- Preserve previous work until the entire replacement and first render succeed.
- Preserve physical crop sizes, current/all output, native directory-picker gesture and lightweight preview.
- Clear button gaps at wrapped/narrow widths; no new dependencies.

## Review Focus
- Odd source lengths must restart odd/even per file, not global parity.
- Same paper with different raw PDF dimensions must preserve copied physical frame positions/sizes.
- Invalid/password-protected/too-large batches must leave old document and Undo history usable.
- Rapid page changes must cancel obsolete renders; document replacement must release tasks/resources.
- Duplicate source names must not collide in output names or preview cache.

### Task 1: Batch workflow and physical copies
**Files:** create documents.js, tests/multiple-files.browser.js; modify index.html.
**Interfaces:** processFiles(File[]) -> Promise<boolean>; getSourcePageInfo(doc,continuousPage) -> source/local metadata; state.pdfDoc facade -> getPage/numPages/destroy. Copy handlers remain existing entry points and become async.
- [x] Write browser regression with real generated File PDFs: natural sorting, multi-file page order, 10/100 acceptance, 11/101 rejection, invalid/password failure preservation, resolution-calibrated copies, file-relative parity, Undo, duplicate names and source selector.
- [x] Run against old app and observe failure from absent multi-file workflow.
- [x] Implement transactional loading, single-file compatibility, facade, selector, cancel-safe editor rendering and physical copy with out-of-bounds reporting.
- [x] Run new browser tests; expected no failures. Run complete existing browser suite; expected 70 existing checks pass.

### Task 2: Real workflow, review and publication
**Files:** update browser regression only if new concerns arise; verify app files.
**Interfaces:** same shared output plan/exporter as existing app.
- [x] Verify actual picker/drop, 10 scanned PDFs / 100 pages, crop via pointer, copy all, preview/PDF/JPG all/current, 320/390/768/1280 layout, errors/network and timing.
- [x] Fresh whole-branch review under requesting-code-review; resolve important findings with failing regression then fix.
- [ ] Syntax checks and git diff --check; commit, integrate authorized release, push main, verify Pages success and public flows/assets.
