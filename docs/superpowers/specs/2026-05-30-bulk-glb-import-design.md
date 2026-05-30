# Bulk GLB/glTF import — design

**Date:** 2026-05-30
**Status:** Approved (pending spec review)

## Goal

Let a user import many license-clean GLB/glTF models at once — via a
multi-file selection *or* a folder selection — reusing the existing
single-file upload machinery. Each valid file becomes a `UserGltfDef`
exactly as a single upload does today. All downstream systems (catalog
merge, hydration, rendering, collision, persistence) are unchanged.

This is the legitimate, license-clean import path: users bring models they
have the right to use (their own work, CC0 sources such as Poly Haven /
Kenney that the project already credits, or assets they have licensed).
The feature performs **no** crawling, scraping, or network fetching — it
only ingests files the user explicitly selects from their own machine.

## Non-goals

- No web crawling, scraping, or bulk downloading from any third-party site.
- No per-file category assignment (a single category applies to the batch,
  matching the current single-upload model). Per-file categorisation is a
  possible future feature.
- No new validation rules. The existing `validateGlbFile` contract holds:
  self-contained `.glb` (magic-byte check) and self-contained `.gltf`
  (all URIs must be `data:`), max 25 MB. External-resource `.gltf` is
  rejected, as today.
- No changes to `persist.ts`, `validate.ts`, `IdbAssetStore`, the catalog
  hooks, `GltfModel`, collision, or the save schema.

## Architecture

One new pure orchestration module plus UI wiring on the existing dialog.

```
UploadModelDialog.tsx  ──(File[] + category)──▶  importGlbFiles()
                                                      │
                                  filter .glb/.gltf   │  (skip others)
                                  dedupe display names │
                                  concurrency pool (4) │
                                                      ▼
                                              persistUserGlb(file, opts)   ← existing
                                                      │
                              (validate → blob → IdbAssetStore.put →
                               UserGltfDef → addUserFurniture)
                                                      ▼
                                       BulkImportResult ──▶ summary UI
```

### 1. `src/furniture/upload/bulkImport.ts` (new — the testable core)

Pure orchestration over the existing `persistUserGlb`. No React, no DOM
beyond the `File` type, so it is unit-testable with `fake-indexeddb`.

```ts
export interface BulkImportOptions {
  category: FurnitureCategory;
  concurrency?: number;            // default 4
}

export interface SkippedFile {
  name: string;
  reason: string;                  // 'not-a-model' | validation reason | persist error
}

export interface BulkImportResult {
  total: number;                   // count of files considered (after non-model filter? see below)
  imported: number;
  skipped: SkippedFile[];
}

export function importGlbFiles(
  files: File[],
  opts: BulkImportOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkImportResult>;
```

Behaviour:

1. **Filter to models.** Keep files whose name (basename of
   `webkitRelativePath` if present, else `file.name`) ends in `.glb` or
   `.gltf` (case-insensitive). Non-model files are recorded as
   `skipped` with reason `not-a-model`. `total` counts every input file so
   the summary is honest about what was dropped.
2. **Derive + dedupe display names.** Strip the `.glb`/`.gltf` extension for
   the name. If a name collides with an existing `userFurniture` name *or*
   an earlier file in this batch, suffix ` (2)`, ` (3)`, … Names are
   cosmetic (the unique keys are `assetId` / `id`); this only avoids
   confusing duplicate labels in the catalog.
3. **Concurrency pool.** Process the filtered list through a fixed-size
   worker pool (default 4 concurrent) that each call
   `persistUserGlb(file, { name, category })`. This bounds simultaneous
   `arrayBuffer()` reads and IndexedDB writes so a large folder does not
   freeze the tab. No hard count cap.
4. **Per-file outcome.** `persistUserGlb` returns a `PersistResult`
   (`{ ok: true; def }` or `{ ok: false; reason }`). A non-ok result — bad
   magic bytes, external-resource gltf, oversize, IDB failure — becomes a
   `skipped` entry with its reason. One bad file never aborts the batch
   (the "import all valid, report rejects" policy).
5. **Progress.** After each file settles (ok or skipped), call
   `onProgress(done, total)` where `done` counts every settled input file
   including non-model skips, so the bar reaches `total`.
6. **Return** the aggregated `BulkImportResult`.

Reads the current `userFurniture` names once at the start (via
`useStore.getState().userFurniture`) to seed dedupe; new names added during
the batch are tracked in a local set.

### 2. `src/ui/upload/UploadModelDialog.tsx` (extend, do not replace)

- Add `multiple` to the existing file input. Add a second input with
  `webkitdirectory` (a "Choose folder…" button) for folder selection.
- The single-file flow is preserved: selecting exactly one file via the
  multi-input still works and shows the same name field. When more than one
  model file is selected (or a folder is chosen), the dialog switches to
  **batch mode**: the per-file name field is hidden (names are auto-derived)
  and only the shared `category` select remains.
- **During import:** a progress line ("Importing 12 / 40…") driven by
  `onProgress`; all inputs and buttons disabled.
- **On completion:** a result summary — "Imported 37, skipped 3" — with an
  expandable list of skipped file names + reasons. The dialog stays open so
  the user can read the summary, then dismiss it.
- Single-file path keeps calling `persistUserGlb` directly (no behaviour
  change), or is routed through `importGlbFiles([file], …)` for one code
  path — implementation detail decided in the plan; either keeps current UX.

## Data flow

No new persisted state. Each imported file produces a `UserGltfDef` and an
`AssetRecord` blob in IndexedDB through the unchanged `persistUserGlb`.
Catalog hooks (`useCatalog`, `useCatalogByCategory`) merge `userFurniture`
reactively, so imported items appear immediately. On reload,
`hydrateUserAssets` rebuilds blob URLs from IndexedDB exactly as for
single uploads. Footprints remain the lazy `GltfModel` bbox computation
(placeholder `1×1×1` until first render).

## Error handling

- Per-file failures are isolated and reported; the batch always completes.
- The whole operation is wrapped so an unexpected throw inside the pool
  surfaces as a dialog error rather than an unhandled rejection.
- Folder picks that contain zero model files yield
  `{ total: N, imported: 0, skipped: [...all not-a-model] }` and a clear
  "No .glb/.gltf files found" summary.

## Testing

`src/furniture/upload/bulkImport.test.ts` (Vitest + `fake-indexeddb/auto`,
following `hydratePacks.test.ts` patterns; stub `URL.createObjectURL`):

- Imports multiple valid GLBs → all `imported`, all present in
  `userFurniture`, blobs in `IdbAssetStore`.
- Mixed batch (valid GLB + bad-magic GLB + external-resource gltf +
  oversize + a `.txt`) → valid ones imported; each invalid recorded as
  `skipped` with the right reason; `total` counts every input.
- Duplicate names within a batch and against existing furniture →
  suffixed ` (2)`, ` (3)`; all imported.
- `webkitRelativePath` basenames used for naming.
- `onProgress` called `total` times and reaches `(total, total)`.
- Concurrency: a batch larger than the pool size still imports every valid
  file (correctness; not timing-sensitive).

UI is covered by the existing manual flow; no new DOM test framework is
introduced for the dialog.

## Out of scope / future

Per-file category assignment, client-side thumbnails for user GLBs,
drag-and-drop dropzone, multi-file `.gltf` + `.bin` bundling.
