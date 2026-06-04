# Multi-format 3D model & texture import (convert-to-GLB + in-browser optimize)

**Date:** 2026-06-04
**Status:** Approved (brainstorming)

## Problem

The upload pipeline accepts only `.glb`/`.gltf` models and PNG/JPEG/WebP
material textures. Users have assets in many other formats (OBJ, FBX, STL, PLY,
USDZ, DAE, 3MF; textures in TGA, TIFF, BMP, EXR, HDR, KTX2, DDS). We want to
ingest those reliably.

Separately, **user uploads today get no real optimization** — only the runtime
texture-budget downscale in `GltfModel`. The offline `optimize:glb` /
`compress:glb-textures` scripts target bundled/scraper assets, not uploads. We
want imported assets (converted *and* plain GLB uploads) to be optimized for
performance while preserving original visual quality.

## Goals

1. Accept the model formats: **OBJ(+MTL), FBX, STL, PLY, USDZ, DAE, 3MF** in
   addition to GLB/glTF.
2. Accept the texture formats: **TGA, TIFF, BMP, EXR, HDR, KTX2, DDS** in
   addition to PNG/JPEG/WebP.
3. Convert every non-GLB model to GLB **entirely in the browser** (works in a
   production GitHub Pages build — no server/sidecar).
4. Run an **in-browser optimize pass** on every imported GLB (converted and
   plain GLB uploads): geometry weld/dedup/prune + Draco; textures re-encoded.
5. **Texture/material optimization:** maximize performance while preserving
   original quality — **codec compression, not resolution reduction**. Default
   to near-lossless WebP; offer an opt-in **KTX2/UASTC** path (GPU-compressed,
   VRAM-resident) that loads its encoder wasm on demand. Same policy for
   embedded model textures and standalone material textures.

## Non-goals (YAGNI)

- No conversion sidecar / Node server (explicitly rejected; in-browser only).
- No multi-tier `-low`/`-medium` LOD generation for uploads in this pass (the
  single optimized GLB already exceeds today's user-upload baseline; multi-tier
  remains a documented follow-up).
- No new model formats beyond the seven listed; no animation-retargeting work.

## Architecture: convert at the front door

The entire downstream system — rendering (`GltfModel`), finish targets, footprint
& support-plane detection, LOD probing, IDB persistence, the save schema — is
**GLB-centric**. So every imported model **becomes a GLB at import time**, and
nothing downstream changes. This is the load-bearing decision.

**Rejected — runtime multi-loader** (render OBJ/FBX/etc. directly in
`GltfModel`): would force replicating footprint detection, finish-target
recolouring, tinting, LOD and texture-budget logic per loader. Permanent
maintenance tax. Front-door conversion inherits all of it for free.

**Rejected — conversion sidecar** (assimp/Blender): best fidelity but dev-only;
never runs for end users on the deployed site. Out of scope per user decision.

### Pipeline

```
drop / pick files
  → group sibling files (readDrop relative paths)          [reuse existing]
  → detect format (extension + magic bytes)                [new: formats.ts]

  models:
    [non-GLB model]  convertModel():
        three.js loader (+ sibling MTL/textures via a LoadingManager
        blob-URL URLModifier) → THREE.Object3D → GLTFExporter → GLB bytes
    [any model GLB]  optimizeGlb():  (Worker)
        gltf-transform: weld → dedup → prune → draco
        + texture re-encode: WebP near-lossless | KTX2 UASTC (opt-in)
    → existing validateGlbFile → persist (IDB) → catalog    [UNCHANGED]

  material textures:
    [non-standard image]  decodeImage(): loader → ImageBitmap/canvas
    → reencode(): WebP near-lossless | KTX2 UASTC (opt-in)
    → existing material validate → persist                  [UNCHANGED]
```

## New modules

Each unit has one purpose, a narrow interface, and is independently testable.

### `src/furniture/convert/`
- **`formats.ts`** — `detectModelFormat(file): ModelFormat` (extension +
  magic-byte sniff: GLB `glTF`, FBX `Kaydara`, PLY `ply`, STL solid/binary
  heuristic, OBJ/DAE/3MF/USDZ by extension + light content check). Per-format
  size caps (text formats like OBJ can be large; raise from the 25 MB GLB cap
  per format). `isConvertibleModel(name)` / widened `isModelFile` regex.
- **`loadToObject.ts`** — a **loader registry** mapping format → a function that
  returns a `Promise<THREE.Object3D>`. Multi-file formats (OBJ→MTL→textures,
  DAE/3MF/USDZ with external refs) get a `THREE.LoadingManager` whose
  `setURLModifier` resolves referenced filenames to **blob URLs** built from the
  sibling files in the same dropped folder. No network fetches.
- **`toGlb.ts`** — wraps `GLTFExporter` (`{ binary: true }`) → `ArrayBuffer`;
  returns a `File` with `model/gltf-binary` mime. Normalizes the scene
  (Y-up, units in metres where the source declares them; otherwise leave as-is
  and rely on the existing footprint/scale UI).
- **`convertModel.ts`** — orchestrator: detect → load → export → return GLB
  `File`. Throws a typed `ConvertError` with a user-facing message on failure
  (surfaced per-file by the existing batch import error handling).

### `src/furniture/optimize/`
- **`optimizeGlb.ts`** — pure pipeline over GLB bytes using `@gltf-transform`
  core + functions: `weld`, `dedup`, `prune`, `draco` (encoder from
  `draco3dgltf`). Textures: re-encode each image via the texture codec module
  (below). Returns optimized GLB bytes + a small report (before/after bytes).
  **Quality-first:** no geometry simplification by default (preserve shape);
  no resolution downscale (preserve pixels) — existing dimension cap is only a
  ceiling. Compression is codec-only.
- **`optimize.worker.ts`** — runs `optimizeGlb` off the main thread (like the
  existing background import job) so the render loop / modal never stalls.
  Worker-safe loaders (STL/PLY/OBJ) may also convert in-worker; FBX/USDZ/DAE
  convert on the main thread with rAF yielding if the loader touches DOM
  (`document`/`Image`). Fallback path: if the Worker is unavailable or throws,
  run on the main thread.

### `src/materials/convert/` (textures)
- **`decodeImage.ts`** — format → `ImageBitmap`/canvas. PNG/JPEG/WebP/BMP via
  native `createImageBitmap`; TGA via three `TGALoader`; EXR via `EXRLoader`;
  HDR via `RGBELoader`; DDS via `DDSLoader`; KTX2 via the already-wired
  `KTX2Loader` (transcode → readable pixels); TIFF via `UTIF` (new small dep).
  HDR/EXR are tonemapped to 8-bit for the 8-bit PBR slots (albedo/normal/rough/
  AO) with a note; full-float maps are out of scope.
- **`reencode.ts`** — `ImageBitmap` → blob: near-lossless WebP
  (`OffscreenCanvas.convertToBlob({type:'image/webp', quality:0.95})`) by
  default; KTX2 UASTC via the opt-in encoder when enabled.

### `src/lib/ktx2encode.ts` (shared, lazy)
- Lazily `import()`s the basis-universal encoder wasm only when the KTX2 opt-in
  is on (keeps the ~2 MB encoder out of the default bundle/first paint).
  Consumed by both `optimizeGlb` (embedded textures) and `reencode` (standalone
  material textures). UASTC = visually lossless, GPU-compressed, VRAM-resident.

## Wiring (no downstream behavior change)

- **`furniture/upload/`**: widen `isModelFile` regex; insert
  `convertModel` + `optimizeGlb` as a stage in `runImport`/`bulkImport`
  **before** `validateGlbFile`. A plain GLB skips `convertModel` but still runs
  `optimizeGlb`. Conversion + optimization run **off the modal** as part of the
  existing tracked background job (one `notify` progress notification);
  per-file failures are reported and skipped, not fatal.
- **`materials/upload/`**: widen the MIME/extension whitelist; insert
  `decodeImage` + `reencode` before the existing material validate/persist.
- **UI**: `UploadModelDialog` drop zone + folder picker `accept` widened (and
  copy/hints updated). `UploadMaterialDialog` `accept` widened. Both dialogs get
  a **"Maximum compression (KTX2)"** opt-in checkbox (default off → WebP).
- **Persistence is unchanged**: the stored blob is always an optimized GLB or a
  re-encoded WebP/KTX2 image; the IDB schema, save schema, hydration, and
  content-hash dedup all work as-is (hash is computed on the final optimized
  bytes).

## Error handling

- `convertModel`/`decodeImage` throw typed errors with user-facing messages;
  the batch importer already isolates per-file failures (one bad OBJ doesn't
  abort the import) and surfaces a count + first error in the notification.
- Optimize failures fall back to the **un-optimized but valid GLB** (convert
  succeeded, optimize is best-effort) with a logged warning — an asset is never
  lost because optimization tripped.
- Loader-unsupported features (FBX animation, USDZ materials) degrade to
  geometry + best-effort materials; documented expectation, not an error.

## Testing

- **Unit (Vitest):** `detectModelFormat` magic-byte/extension matrix;
  `formats` size caps; `optimizeGlb` on a fixture GLB (asserts byte reduction +
  valid output via gltf-transform read-back, geometry preserved); `reencode`
  produces a valid WebP of expected dimensions; `decodeImage` for at least
  TGA + a synthetic TIFF (deterministic, no network).
- **Conversion smoke:** a tiny fixture per format (OBJ/STL/PLY at minimum;
  FBX/DAE/3MF/USDZ where a small CC0 fixture is feasible) → convert → assert the
  result reads back as a valid GLB with ≥1 mesh and a sane bbox.
- **Visual verification (required by CLAUDE.md):** import a converted asset and
  a re-encoded material via `window.__store` + `scripts/shot.mjs`, screenshot,
  and visually confirm the model renders and the material applies. Report what
  the screenshots show, per the visual-verification playbook.

## Risks & mitigations

1. **Workers + three.js loaders touching DOM** — partition worker-safe loaders
   from main-thread loaders; main-thread path yields via rAF; Worker failure
   falls back to main thread.
2. **TIFF decode** — add `UTIF` (small, MIT). BMP needs no dep (native decode).
3. **FBX/USDZ fidelity** — loader-dependent; set expectations, degrade
   gracefully, report per-file.
4. **Multi-file formats** (OBJ+MTL+textures, .gltf+.bin+textures) — reuse
   `readDrop` relative paths to group siblings; blob-URL `URLModifier` resolves
   refs. **Side win:** external-URI `.gltf` folders (currently rejected by
   `validate.ts`) can now be *packed* into a GLB and accepted.
5. **Bundle size** — the KTX2 encoder wasm is lazy-loaded only on opt-in; three
   example loaders are tree-shaken/imported per format.

## Docs to update on completion

`CLAUDE.md` (upload pipeline, `convert/`/`optimize/` modules, supported
formats, optimize policy), `README.md` (user-facing supported formats),
`TODO.md` (multi-tier LOD-for-uploads + always-on KTX2 as deferred follow-ups).
