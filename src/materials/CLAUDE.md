# src/materials — finishes rules

Area rules for materials/finishes. Details in `docs/ARCHITECTURE.md`.

- **New finish** = an entry in `builtinCatalog.ts` (`procedural` with a pattern, or
  `solid`); new pattern painters go in `procedural/patterns/<family>.ts` (paint one tiling tile:
  albedo+normal+roughness from seeded noise over the shared `procedural/fieldKit.ts` buffers),
  wired into the `PATTERN_FN` dispatch in `procedural/generators.ts` AND add an entry to
  `PATTERN_SIZE_CAP` (256 for smooth/noise-based, 512 for high-frequency geometric patterns).
- **World-space UVs** (`worldUv.ts`): surfaces tile at a fixed physical scale — don't bake
  per-mesh UVs or assume a unit cube.
- **Texture anisotropy** (`anisotropy.ts`, RD-401): never hardcode `texture.anisotropy`.
  Route every CanvasTexture creation (and every per-repeat `.clone()`) through
  `applyAnisotropy(tex)` — it stamps the shared cap and tracks the texture. The cap defaults
  to 8 until the first render publishes the real device max via `setMaxAnisotropy(gl.capabilities
  .getMaxAnisotropy())` (from `scene/AnisotropyController`, mounted in both Canvases), which
  clamps to `max(1, deviceMax)` and re-applies to all already-created textures. Anisotropy needs
  mipmaps — CanvasTextures have them by default; if you build a texture without mipmaps it's a
  no-op.
- **Furniture materials** come from `furnitureMaterials.ts` helpers (real three `Material`
  instances: tintable wood/stone/fabric, `getSolidMaterial`, the `mat:<id>` DLC resolver).
  Don't invent bespoke texture art — apply a CC0 DLC material over the procedural fallback.
  The procedural micro-textures (256² shared singletons, tinted via `material.color`) get their
  higher-fidelity variants — plank wood, woven fabric, painted micro-normal — behind the
  `pbrSurfaces` flag (default on, Simple tier); keep normal maps on **all** tiers (they're cheap
  and the default Performance tier still needs them to not read flat).
- **Upholstery weave (RZ6)**: the fabric normal's height field is built by the pure
  `procedural/upholsterySeams.ts` `buildUpholsteryHeight(size, seed, SeamParams)` — woven
  micro-texture + a soft fabric wrinkle + a faint panel-seam channel & topstitch. Keep it
  **subtle** (tasteful default `DEFAULT_SEAM_PARAMS`; `seam`/`wrinkle` are 0..1 intensities, `0`
  disables a channel) — the goal is "reads as cloth", not quilted leather. It's deterministic +
  unit-tested (dims/determinism/seam-recess), baked once into the shared fabric normal singleton
  behind `pbrSurfaces` (off → legacy clean weave). Albedo stays sRGB, the normal stays linear.
- **Tile/ceramic glaze (MAT-002)**: the glossy-ceramic painters (`procedural/patterns/tile.ts`
  `tileFields`/`hexagonFields`/`subwayFields`) get their micro-detail from the pure
  `procedural/tileSurface.ts`: `makeGlazePeel(seed, glaze)` adds a fine signed orange-peel height
  delta on the **tile face only** (catches grazing light), and `glazeRoughness(isGrout, grout,
  micro)` resolves a **glossy-glaze (≈0.16) ↔ matte-grout (≈0.92) roughness contrast** with the
  painter's existing per-texel break-up folded in. The painter owns the grid and only asks the
  helper per-texel, so normal+roughness **align with the visible grout** automatically (square /
  hex / subway). Keep it **subtle** (`DEFAULT_TILE_SURFACE_PARAMS`; `glaze`/`grout` are 0..1, `0`
  disables that channel). Path-A micro-detail (no flag, all tiers — like RZ4 grout aging); albedo
  sRGB, normal/roughness linear. checker/brick are not ceramic — untouched.
- **Stone/marble micro-detail (MAT-001)**: the pure `procedural/stoneSurface.ts` adds the two
  cues polished stone needs. `veinHeight(veinMask, veinRelief)` turns the painter's OWN vein mask
  into a shallow tunable height lift, so the baked normal relief **aligns with the visible albedo
  veins** for free (any marble colour / vein pattern); `makeRoughDrift(seed, roughDrift)` is a
  broad low-freq signed roughness delta (polished/honed patches) so the slab isn't a dead-uniform
  mirror. Wired into **Path A** (`procedural/patterns/stone.ts:marbleFields` — vein height routed
  through the helper, no flag, all tiers like RZ4) and **Path B** (`furnitureMaterials.ts:
  getMarbleMaps`/`getStoneMaterial` — the shared marble singleton gains a roughness-drift map
  **gated behind `pbrSurfaces`**, same gate as the PR6 cloud; off → legacy uniform polish, no rough
  map). The Path-B drift map is a multiplier clamped ≤ 1 → only glossier, never matter (no
  regression). Keep it **subtle** (`DEFAULT_STONE_SURFACE_PARAMS`; `veinRelief`/`roughDrift` 0..1,
  `0` disables). Albedo sRGB, normal/roughness linear. concrete/terrazzo are untouched.
- **Uploaded-material persistence (`upload/persist.ts`)**: each channel blob is one IDB record;
  the material's full identity/appearance (`name`, `category`, `swatch`, `uvScaleX`/`uvScaleY`
  — `uvScale` is stored as two scalars since IDB `meta` values can't be arrays) is stamped on
  **every** channel's `meta` so it round-trips through `state/storage/hydrateAssets.ts` (BUG-003).
  When you add a new identity/appearance field to `TexturedMaterialDef` for user materials,
  persist it in the channel meta here AND restore it (with a back-compat default for legacy
  records) in `hydrateAssets`, or it resets to a default on reload.
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
  When adding a new pattern, add its painter to `procedural/patterns/<family>.ts` and wire it
  into the shared `PATTERN_FN` dispatch inside `generators.ts` (not a separate worker-only file).
  The `RenderPump` subscribes to `subscribeProceduralSwap` — do not add more subscribers
  elsewhere; the signal is intentionally not a store slice (avoids re-render overhead).
