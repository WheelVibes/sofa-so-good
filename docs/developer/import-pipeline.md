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

## Multi-tier LOD generation for uploads

In-browser parity with the offline `optimize:glb` script — uploads get
`-low`/`-medium` siblings so Performance/Medium asset tiers load a decimated copy.

- `furniture/optimize/lodVariants.ts` generates both tiers **from the optimized
  GLB** in the same worker pass (`runOptimize(..., { lodTiers: true })`): per
  tier, WebP textures downscaled to the `TIER_BUDGETS` cap (512 / 1024 px),
  weld → meshopt `simplify` (ratio 0.5 / 0.75, error 0.01) → dedup/prune →
  Draco. Budgets come from `furniture/gltf/lod.ts` `TIER_BUDGETS` — the single
  source of truth shared with the offline script.
- **Best-effort at every level**: a simplify failure degrades that tier to
  textures-only; a whole-tier failure (or a variant that doesn't shrink) just
  omits the tier — LOD generation can never block an upload.
- **Storage**: tiers are sibling IDB records under derived keys —
  `lodAssetId(assetId, tier)` = `<assetId>:lod-<tier>` — with
  `meta: { role: 'lod', tier, baseAssetId }`. `hydrateAssets` skips
  `role === 'lod'` records as defs and re-resolves each base asset's tiers on
  boot; `userAssetsSlice` deletes them with the base asset.
- **Runtime selection**: built-in GLBs resolve `-low.glb` URL siblings via a
  HEAD probe (`gltf/lod.ts`); uploads are blob URLs with no probeable sibling,
  so persist/hydration **register** their tier blob URLs in the same module's
  variant registry (`registerLodVariants`) and `resolveLodUrlSync` serves them
  through the identical `effectiveAssetTier` path in `GltfModel` (Performance
  render tier → `low` asset tier on Auto).
- **Opt-out**: the upload dialog's "Generate low-detail versions for slower
  devices" checkbox (default on) — the extra tiers roughly double the optimize
  time per model.
- KTX2-encoded textures pass through untouched in tier variants (no in-browser
  decode path yet — same TODO as the encoder stub).

## IKEA import (`furniture/ikea/`)

Consumes the offline scraper's output (`metadata.json` + `<finish>.glb` +
images). `detectGroups.ts` auto-detects IKEA group folders; `importGroup.ts`
turns each into one `IkeaGltfDef` (variants + per-component palette, blobs in
IDB), with category/placement/clearance/price/compatibility from `translate.ts`
+ `compatibility.ts`. See the IKEA specs under `docs/superpowers/specs/`.

## Texture normalization

`materials/convert/` — see [Materials & finishes](./materials-and-finishes.md).
