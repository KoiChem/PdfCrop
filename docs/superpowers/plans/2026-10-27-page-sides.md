# Page Sides Implementation Plan

> Execute inline with superpowers:executing-plans. User authorized implementation and publication.

**Goal:** Copy frames to all pages, automatically respecting duplex sides.
**Architecture:** Existing shared copy function reads a batch-wide selector. Preserve physical geometry and atomic updates.
**Tech Stack:** HTML, JavaScript, PDF.js, pdf-lib, Playwright MCP.
**Spec:** docs/superpowers/specs/2026-10-27-page-sides-design.md

## Global Constraints
All pages includes earlier pages. Default 片面1ページ; 両面 uses per-file parity. No changes on mode switching. Preserve existing frames on errors and skipped pages. Keep button gaps.

## Review Focus
Earlier pages and last-page source; per-file parity after odd-length files; opposite-side preservation; geometry/Undo; narrow toolbar wrapping and publication freshness.

### Task 1: Page configuration and whole-document copy
Files: index.html, documents.js, tests/page-sides.browser.js, tests/multiple-files.browser.js.
Interface: copyBoxToAll() asynchronously copies using page-sides-select (simplex/duplex).
- [x] Add real-PDF regressions: last-page simplex changes earlier pages; duplex front/back cross file boundaries and retain opposite frames; switching mode does not alter frames; Undo restores all changes.
- [x] Run new test on current code and confirm earlier-page failure.
- [x] Add selector, remove both odd/even UI actions, replace forward loop with all-page loop excluding source, read mode once before awaiting work.
- [x] Update existing multi-file parity test to use duplex selector, restoring simplex afterward.
- [x] Run all six browser suites on fresh pages, inspect desktop/narrow UI and console/network.
- [x] Review, commit/push authorized main release; verify Pages deployment and run all suites against public assets.

Local validation: all six browser suites passed (88 grouped checks); fresh page per suite. Actual drawing plus toolbar/frame copy clicks passed. Desktop 1280px and narrow 390px inspected; toolbar fits and buttons do not touch. No console errors in interaction check. Independent review found no issues. Publication verification follows the authorized push.
