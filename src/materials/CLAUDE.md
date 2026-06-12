# src/materials — finishes rules

Area rules for materials/finishes. Details in `docs/ARCHITECTURE.md`.

- **New finish** = an entry in `builtinCatalog.ts` (`procedural` with a pattern, or
  `solid`); new patterns go in `procedural/generators.ts` (paint one tiling tile:
  albedo+normal+roughness from seeded noise) AND add an entry to `PATTERN_SIZE_CAP`
  (256 for smooth/noise-based, 512 for high-frequency geometric patterns with fine detail).
- **World-space UVs** (`worldUv.ts`): surfaces tile at a fixed physical scale — don't bake
  per-mesh UVs or assume a unit cube.
- **Furniture materials** come from `furnitureMaterials.ts` helpers (real three `Material`
  instances: tintable wood/stone/fabric, `getSolidMaterial`, the `mat:<id>` DLC resolver).
  Don't invent bespoke texture art — apply a CC0 DLC material over the procedural fallback.
  The procedural micro-textures (256² shared singletons, tinted via `material.color`) get their
  higher-fidelity variants — plank wood, woven fabric, painted micro-normal — behind the
  `pbrSurfaces` flag (default on, Simple tier); keep normal maps on **all** tiers (they're cheap
  and the default Performance tier still needs them to not read flat).
- **Uploaded textures** normalize through `convert/` (`normalizeTextureFile` → near-lossless
  WebP, full res; `decodeImage.ts` handles TGA/TIFF/EXR/HDR/KTX2/DDS).
  KTX2 and DDS are handled by `decodeGpuTexture.ts`: uncompressed formats via pure-JS paths
  (no WebGL), Basis-compressed KTX2 via `KTX2Loader` + GPU readback (same Basis transcoder
  singleton at `/basis/` as the GLB path), compressed DDS via `DDSLoader` + GPU readback.
  Graceful error on missing `OffscreenCanvas`/WebGL → error toast, never a crash.
- `finishDrop.ts` is the pure drag-to-apply core (payload + `resolveFinishDrop`) — reuse it
  for any new drop surface rather than re-implementing the routing, and commit through
  `state/finishDropApply.ts` (shared store dispatch: one undo step + recents + toast).
  Existing surfaces (Layers rows, 3D canvas via `scene/FinishDropSurface.tsx` +
  `scene/finishDropTarget.ts`) gate on the `finishDnd` flag — gate new ones the same way.
- **OffscreenCanvas worker generation** (`procedural/procedural.worker.ts` +
  `procedural/runProceduralWorker.ts` + `proceduralSwapSignal.ts`): `buildMaterial` for
  procedural kinds generates a sync fallback texture immediately (no first-paint block),
  then fires a worker request off-thread that hot-swaps the maps and calls
  `notifyProceduralSwap()` to kick a render frame. Graceful degradation: if
  `OffscreenCanvas`/`Worker` are unavailable or the worker errors, the sync texture stays.
  When adding a new pattern, add its `generateProceduralRaw` path to the shared
  `PATTERN_FN` dispatch inside `generators.ts` (not a separate worker-only file).
  The `RenderPump` subscribes to `subscribeProceduralSwap` — do not add more subscribers
  elsewhere; the signal is intentionally not a store slice (avoids re-render overhead).
