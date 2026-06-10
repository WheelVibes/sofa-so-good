# src/materials — finishes rules

Area rules for materials/finishes. Details in `docs/ARCHITECTURE.md`.

- **New finish** = an entry in `builtinCatalog.ts` (`procedural` with a pattern, or
  `solid`); new patterns go in `procedural/generators.ts` (paint one tiling tile:
  albedo+normal+roughness from seeded noise).
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
  WebP, full res; `decodeImage.ts` handles TGA/TIFF/EXR/HDR). KTX2/DDS standalone decode is
  deferred (needs a WebGL readback).
- `finishDrop.ts` is the pure drag-to-apply core (payload + `resolveFinishDrop`) — reuse it
  for any new drop surface rather than re-implementing the routing.
