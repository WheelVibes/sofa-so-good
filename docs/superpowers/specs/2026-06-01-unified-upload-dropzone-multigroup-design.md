# Unified upload drop-zone + multi-group IKEA import

## Problem

The Upload-models dialog has three issues:

1. **Two separate file inputs.** Picking loose files and picking a folder are
   distinct `<input>` rows. There is no drag-and-drop.
2. **Only one IKEA group per folder is imported.** `findMetadataFile` returns
   the *first* `metadata.json` it sees and `importGroup` is called once with
   *all* model files. A folder containing several IKEA groups imports only one,
   and GLB association by global basename can leak files across groups.
3. **The modal is clipped inside the catalog drawer.** `UploadModelDialog`
   renders `<div className="absolute inset-0 …">` as a child of the 320 px-wide
   catalog `<aside>`, so `inset-0` is relative to the drawer, not the viewport.
   The "modal" is stuck inside, off-centre and narrow.

## Goals

- One drag-and-drop **upload area** that also accepts loose files *and* folders,
  with picker buttons as the fallback.
- Folder drops recurse (preserving relative paths) so IKEA group detection works.
- A folder of **multiple IKEA groups** imports **every** group; loose GLBs in the
  same drop import via the bulk path ("Import everything").
- GLB/image files are scoped to each group **by folder path**, never by global
  basename — no cross-group leakage.
- The dialog is a **large, viewport-centred modal** (portaled to `document.body`).

## Design

### 1. Full-screen centred modal (`UploadModelDialog.tsx`)

- Render the overlay through `createPortal(…, document.body)` so positioning is
  viewport-relative and never clipped by the catalog `<aside>`.
- Overlay uses `fixed inset-0` (was `absolute`). Panel widens to
  `w-[560px] max-w-[90vw]` with a scrollable body (`max-h-[85vh]`).

### 2. Single drag-and-drop upload area

- Replace the two `<input>` rows with one dashed-border **dropzone** showing a
  drag-over highlight and two small buttons — "Choose files" and "Choose folder"
  — that trigger hidden inputs (`multiple`, and `webkitdirectory` respectively).
- New `src/furniture/upload/readDrop.ts`:
  `readDroppedItems(items: DataTransferItemList): Promise<File[]>`. Recurses each
  entry via `webkitGetAsEntry()` / `DirectoryReader.readEntries()`, returning
  `File`s whose `webkitRelativePath` is set to the entry's full path so folder
  structure survives for group detection. Loose dropped files pass through with
  their bare name. (Entry recursion is not exercisable in jsdom; kept thin and
  verified via the screenshot harness.)

### 3. Multi-group detection + path-scoped files

- New `src/furniture/ikea/detectGroups.ts`:
  - `detectGroups(files: File[]): Promise<DetectedGroup[]>` where
    `DetectedGroup = { dir: string; meta: Record<string, unknown> }`. Scans
    **all** files, parses every `metadata.json` that `looksLikeIkeaMetadata`,
    and records `dir` = the path prefix up to and including the metadata's
    folder (`''` for a top-level metadata.json).
  - `filesUnder(files: File[], dir: string): File[]` — files whose
    `webkitRelativePath` (or name) starts with `dir`. Used to hand each group
    only its own GLBs/images.
  - `looseModelFiles(files, groups)` — model files not under **any** group dir,
    for the bulk path.
- `detectGroup.ts` `findMetadataFile` is kept (still used elsewhere? — verify;
  if only the dialog used it, fold it into `detectGroups` and remove). Its test
  is superseded by `detectGroups.test.ts`.

### 4. Dialog submit flow ("Import everything")

State: replace single `ikeaMeta` with `ikeaGroups: DetectedGroup[]`.

On submit:
1. For each group → `parseMetadata(meta)`; on ok call
   `importGroup(parsed, filesUnder(files, dir))`. Collect per-group results.
2. Loose model files (none-under-a-group) → `importGlbFiles(loose, opts)`
   (or the single-file/`persistUserGlb` path when exactly one loose file and no
   groups).
3. Combined summary: e.g. *"Imported 3 IKEA groups, 5 loose models, skipped 1."*
   List any failed groups by name with their reason.

`IkeaPanel` preview generalises to summarise **all** detected groups (count +
product names + total finishes-with-GLB), replacing the single-group panel.

## Testing

- `detectGroups.test.ts`: multi-group fixture (two metadata.json in sibling
  folders → two groups), `filesUnder` scoping (white.glb in each folder stays
  with its own group), loose-files-only (no groups), mixed (groups + loose).
- Existing `importGroup`/`bulkImport` tests unchanged.
- Visual verification: centred modal renders over the canvas (not inside the
  drawer); dropzone shows drag-over state; multi-group import summary.

## Out of scope

- Per-group category override UI (groups auto-detect category as today).
- Progress streaming per group (single combined progress is enough).
