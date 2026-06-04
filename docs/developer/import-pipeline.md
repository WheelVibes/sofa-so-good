# Import pipeline

How user content gets into the catalog. Everything runs **in the browser**.

## User GLB upload (`furniture/upload/`)

- `validate.ts`, `persist.ts`, `bulkImport.ts`, `hashFile.ts` (SHA-256 content
  hash → skip re-uploading identical bytes), `readDrop.ts` (recurse dropped
  folders → `File[]` via a bounded worker pool; entries captured synchronously
  before any await), and `runImport.ts` (`runImport`/`startBackgroundImport` —
  the engine: detected groups through a bounded pool + loose files through the
  bulk path, **off the modal** as a background job tracked by one `notify`
  progress notification).
- **Store writes are batched** (`addManyUserFurniture` every `COMMIT_BATCH`);
  committing per item re-ran `buildMergedCatalog` (O(n²)) and starved the render
  loop. Progress is rAF-coalesced. `scene/ContextLossGuard` is the safety net.
- Drives `ui/upload/UploadModelDialog.tsx` (a `<div>` drop zone — not a
  `<button>` — accepting loose files and whole folders).

## Multi-format conversion + optimize

- `furniture/convert/` converts non-GLB models (`.obj/.fbx/.stl/.ply/.dae/.3mf/
  .usdz`) to GLB in-browser.
- `furniture/optimize/` runs every import through weld/dedup/prune + Draco + WebP
  textures in a **Web Worker**, with an opt-in KTX2 path (`src/lib/ktx2encode.ts`
  is a stub today → falls back to WebP).
- Spec: `docs/superpowers/specs/2026-06-04-multi-format-import-conversion-design.md`.

## IKEA import (`furniture/ikea/`)

Consumes the offline scraper's output (`metadata.json` + `<finish>.glb` +
images). `detectGroups.ts` auto-detects IKEA group folders; `importGroup.ts`
turns each into one `IkeaGltfDef` (variants + per-component palette, blobs in
IDB), with category/placement/clearance/price/compatibility from `translate.ts`
+ `compatibility.ts`. See the IKEA specs under `docs/superpowers/specs/`.

## Texture normalization

`materials/convert/` — see [Materials & finishes](./materials-and-finishes.md).
