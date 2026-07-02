# Granular upload folder-detection progress — design

**Date:** 2026-07-02
**Status:** Approved (approach B)

## Problem

Dragging (or picking) a large folder into the model upload dialog feels unresponsive:

- No instant acknowledgement that work has started.
- A native browser **"Upload 10,000 files?"** confirm appears after a delay (picker path).
- After confirming, another multi-second pause before "detecting model groups" shows.

The user wants **granular progress while detecting files in a folder, and while processing**.

## Findings (current behaviour)

The dialog has two folder-entry paths and three work phases:

- **Drag-drop** (`onDrop` → `readDroppedItems`, `src/furniture/upload/readDrop.ts`): already
  walks the tree with a bounded worker pool and fires `onProgress(count)` **per file**, driving a
  live "Scanning folder… N files" UI.
- **Picker** (`<input webkitdirectory>` → `onPick`, `src/ui/upload/UploadModelDialog.tsx`): Chrome
  enumerates the whole tree itself and shows the "Upload N files?" confirm **before any of our JS
  runs**. That window is uninstrumentable — we cannot show progress inside it or suppress it.
- **Detection** (`detectGroups`, `src/furniture/ikea/detectGroups.ts`): reads each `metadata.json`
  **sequentially** (`await f.text()` in a `for` loop), firing `onProgress(parsed, total)` per file.
- **Import / "processing"** (`startBackgroundImport`, `src/furniture/upload/runImport.ts`): already
  rAF-coalesces per-item progress and shows a live `done / total` widget. **No change needed.**

### Root causes of the perceived hang

1. **Un-coalesced progress setState.** `readDroppedItems`' per-file `setScanCount` and
   `detectGroups`' per-metadata `setDetectProgress` fire thousands of raw React state updates in a
   tight async loop. Unlike the import path, they are **not** coalesced to one update per animation
   frame, so React thrashes and paint is starved — the counter freezes then jumps.
2. **Serial metadata reads.** `detectGroups`' sequential `await f.text()` loop is the actual
   multi-second stall once detection starts on a folder with many groups.
3. **No post-confirm acknowledgement (picker).** After the native prompt we hold the full file
   count immediately but show nothing until detection computes.
4. **Native prompt window (picker) is unfixable** — but users can avoid it entirely by dragging.

## Design (approach B)

### 1. Reusable rAF progress coalescer

Extract the inline rAF-coalescing pattern from `runImport.ts` into a small reusable helper (e.g.
`src/furniture/upload/coalesceProgress.ts` — pure, unit-testable, `requestAnimationFrame` with a
`setTimeout(16)` fallback for non-DOM/test environments). `runImport` is refactored to use it (no
behaviour change); the dialog uses it to wrap:

- the `scanCount` updates from `readDroppedItems`' `onProgress` (drop path), and
- the `detectProgress` updates from `detectGroups`' `onProgress` (both paths).

This makes the counters climb smoothly and guarantees repaints, without dropping the final value
(the coalescer always flushes the latest value).

### 2. Instant file-count acknowledgement (picker path)

The moment the picker's `onChange` fires, set an immediate "Reading N files…" state from
`FileList.length` **before** running detection, so the user sees acknowledgement right after the
native prompt instead of a blank pause. Transitions into the existing "Detecting model groups…"
state when `detectGroups` starts.

### 3. Parallelize `detectGroups` metadata reads

Replace the sequential `for` loop with a **bounded-concurrency worker pool** mirroring
`readDrop.ts`'s `READ_CONCURRENCY` pattern (a shared `DETECT_CONCURRENCY` constant). Each worker
reads + parses one `metadata.json`; progress is reported per **completed** file.

- **Output order stays deterministic** (results written by original index, not completion order) so
  the group-panel display and existing tests are unaffected.
- Progress denominator (`total`) is still pre-counted before the pool starts.
- Update `detectGroups`' unit tests for the pooled path (order preserved, progress monotonic,
  unparseable metadata still skipped).

### 4. Drag-preference hint

A single concise line near the "Choose folder…" button noting that dragging a folder shows live
progress and skips the browser's bulk-file prompt — steering users toward the path we fully control.
Uses the existing token class vocabulary (no hardcoded colour).

## Out of scope

- Web-Worker detection (approach C) — real complexity, not warranted.
- Any change to the background import progress — already granular.
- Suppressing/replacing the native "Upload N files?" prompt — browser-controlled, impossible.

## Testing & verification

- Unit tests: new `coalesceProgress` helper (flush-latest, fallback timer); updated `detectGroups`
  tests (pooled, order-deterministic, progress). `runImport` behaviour unchanged (existing tests
  green).
- Feature-flag / Simple↔Pro: upload dialog visibility is unchanged by this work; confirm no new
  mode-dependent behaviour is introduced (no new both-mode tests required, but verified).
- Visual verification per `docs/visual-verification-playbook.md`: exercise a large synthetic folder
  drop via the scenario harness, screenshot the scanning + detecting states, confirm the counters
  animate smoothly and instant feedback appears.
- `npm test` + `tsc` + `biome` before commit.

## Docs to update in the same change

- `CHANGELOG.md` (+ version bump per rules).
- `docs/visual-verification-playbook.md` if a new gotcha surfaces.
- User docs only if user-facing labels change (the hint line is new copy — verify against source).
