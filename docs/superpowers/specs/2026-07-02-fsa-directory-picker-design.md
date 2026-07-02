# File System Access directory picker (Chromium) with native fallback — design

**Date:** 2026-07-02
**Status:** Approved (approach A — capability-detected swap, no new flag)

## Problem

The model-upload dialog's "Choose folder…" button uses a native `<input type="file"
webkitdirectory>`. On Chromium this triggers a browser-controlled **"Upload N files?"** confirm and
a multi-second enumeration window during which no app JS runs — so we cannot show progress or
suppress the prompt (confirmed: our sibling app `datature/Vi-develop` uses the same native input and
hits the same wall; neither uses the File System Access API).

The **File System Access API** (`window.showDirectoryPicker()`) enumerates a directory with our own
code — no native confirm, and we can report progress from the first file. It is Chromium-only, so
other browsers must keep the native picker.

## Goal

On browsers that support it, pick folders via `showDirectoryPicker()` — no native prompt, live
"Scanning folder… N files" progress from file #1. On all other browsers, transparently fall back to
today's native `<input webkitdirectory>`. Same button, same downstream flow.

## Non-goals

- No `showOpenFilePicker` for loose multi-file selection — loose-file picking never triggers the
  native prompt (that is folder-only); drag-drop + the native input already cover it (YAGNI).
- No new feature flag. This is a transparent capability upgrade *inside* the already-flagged
  `modelUpload` feature (tier `simple`, default on) — not a new user-facing surface. Runtime
  capability detection gives graceful degradation on its own.
- No change to the drag-drop path (`readDrop.ts` already uses `webkitGetAsEntry`, works everywhere).

## Design (approach A)

### New module `src/furniture/upload/pickDirectory.ts` (pure, render-agnostic, unit-testable)

- `DIR_READ_CONCURRENCY = 24` — max concurrent `handle.getFile()` reads in flight (mirrors
  `readDrop.ts`'s `READ_CONCURRENCY`; the FSA walk is async-I/O-bound per entry).
- `supportsDirectoryPicker(): boolean` — `typeof window !== 'undefined' && 'showDirectoryPicker' in
  window`.
- `pickDirectoryFiles(onProgress?: (count: number) => void): Promise<File[] | null>`:
  1. `const root = await window.showDirectoryPicker()`. If it throws `AbortError` (user cancelled),
     return `null`. Any other throw propagates to the caller.
  2. Recursively walk `root` with a bounded worker pool: for each entry from
     `dirHandle.entries()` (async iterator of `[name, handle]`), a **file** handle →
     `await handle.getFile()`, stamp `webkitRelativePath` = accumulated path (`<parent>/<name>`,
     no leading slash, matching `readDrop`'s convention), push to output, `onProgress(out.length)`;
     a **directory** handle → enqueue its children with the extended path prefix.
  3. Resolve with the collected `File[]`. Collection order is not significant (consumers key off
     `webkitRelativePath`, same as `readDrop`).

  The pool shape (queue + `active`/`READ_CONCURRENCY` workers + a `done` promise) mirrors
  `readDrop.ts` so the two walkers stay recognisably the same.

### Dialog wiring (`src/ui/upload/UploadModelDialog.tsx`)

The "Choose folder…" `onClick` becomes `chooseFolder()`:

- If `supportsDirectoryPicker()`: set `scanCount` to 0, run `pickDirectoryFiles` under the existing
  **coalesced** scan flow (`coalesceProgress` → `setScanCount`; spinner + "Scanning folder… N
  files"), then on a non-null result `ingest(picked)`; `finally` clears `scanCount`. This reuses the
  exact scan UI the drag path already shows.
- Else: `folderInput.current?.click()` — the existing native `<input webkitdirectory>` path,
  unchanged.

The native `<input webkitdirectory>` element stays mounted as the non-Chromium fallback.

### Error handling

- User cancel (`AbortError`) → `pickDirectoryFiles` returns `null`; dialog resets scan state, no
  error shown.
- `SecurityError` / picker unavailable at call time (e.g. non-secure context, permission denied) →
  caught in `chooseFolder`, fall back to `folderInput.current?.click()` so folder pick still works.
- Any other error → surfaced via the existing `setError(...)`.

## Testing

- **Unit** (`pickDirectory.test.ts`): fake `FileSystemDirectoryHandle` whose `entries()` async-yields
  nested file/dir handles; assert (a) recursion collects every file, (b) `webkitRelativePath` is the
  correct nested path, (c) `onProgress` fires once per file ending at the total, (d) `AbortError` →
  `null`, (e) bounded concurrency never exceeds the cap, (f) `supportsDirectoryPicker` true/false by
  presence of `window.showDirectoryPicker`.
- **Both-mode:** not required — no flag/tier behaviour changes (the feature stays inside
  `modelUpload`, already tested in both modes elsewhere).
- **Visual:** direct-mount the dialog (playbook method for the lazy modal) with a temp hook that
  injects a fake directory handle, confirm the "Scanning folder… N files" UI drives and groups
  detect. (Headless cannot open the real OS picker.)

## Docs to update in the same change

- `CHANGELOG.md` + version bump (`v0.9.0.67`, `src/version.ts`; `package.json` stays `0.9.0`).
- `docs/ARCHITECTURE.md` upload section (note the FSA picker + native fallback).
- Visual-verification playbook if a new gotcha surfaces (e.g. faking a directory handle).
