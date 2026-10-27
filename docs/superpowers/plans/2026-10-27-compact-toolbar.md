# Compact toolbar implementation plan

**Goal:** Make the approved file, frame editing and output controls easy to use on portrait and landscape displays, without losing existing functions.
**Architecture:** Arrange existing controls into responsive groups. Keep source paper visible, give the pin a reserved position, and put the existing DPI/name inputs in an accessible output-settings popover. Update copy labels using local page parity. Observe toolbar height for the pinned spacer; retain unscaled crop geometry.
**Spec:** The approved proposal and user approval in this conversation.

## Review focus
- Current-file parity after odd-length source file, page changes, batch load and mode switching.
- DPI and name are the same for direct and preview-based PDF/JPG saves.
- Pin, spacer and controls remain accessible after wrapping, zoom and settings opening.
- Adjacent buttons have clear gaps; source filename and canvas edges remain reachable.
- Crop geometry, paper calibration, navigation, history, preview and output remain intact.

### Implementation and verification
- [x] Add real-document browser tests for dynamic labels, settings, navigation and output paths; confirm failure before implementation.
- [x] Rearrange controls with labeled, responsive groups and an accessible settings popover; preserve DOM input identifiers.
- [x] Refresh labels on mode/page/file changes; keep panel dismissible by Escape and the close button; keep toolbar spacer synchronized.
- [x] Run browser regressions and real user interactions at portrait, landscape and narrow widths, including opened settings, navigation and overflow.
- Review diff, publish, verify Pages deployment and rerun browser checks against deployed files.

Local validation: all seven browser suites pass, 93 grouped checks. Widths 320–1440px, button spacing, spacer, canvas scrolling and PDF drop with settings open were checked in Chromium. Independent reviews completed.
