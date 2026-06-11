# src/furniture — catalog & rendering rules

Area rules for furniture. Full sub-dir map in `docs/ARCHITECTURE.md`.

- **New parametric item** = `primitives/<Name>.tsx` (a fn taking `{ props }`) + register in
  `primitives/index.ts` + the `PrimitiveKind` union + a `ParametricDef` in `builtinCatalog.ts`.
  Set `verticalSpan`/`mounted`/`noClip` for non-floor items; `lightEmitters.ts` to emit light
  at night; add to `defaults/` to ship in the move-in flat (collision-checked by
  `defaultLayout.test.ts`).
- **Categories**: 15 `FurnitureCategory` values. A new one must update the union,
  `FURNITURE_CATEGORIES`, **every** exhaustive `Record<FurnitureCategory,…>` consumer the
  type-checker flags, and `ui/catalog/CategoryTabs`/`CategoryIcon`. Category is auto-detected
  for imports, **never** typed by hand.
- **All GLB items** (bundled CC0 / user uploads / IKEA) render through `GltfModel`/`gltfRender.ts`
  — set the same collision flags; run `npm run optimize:glb` for `-low`/`-medium` LOD variants
  (uploads generate theirs in-browser via `optimize/lodVariants.ts`, routed by the `gltf/lod.ts`
  variant registry).
- **Pure geometry stays render-agnostic + unit-tested** (e.g. `cabinet/cabinetModel.ts`
  `buildCabinet`); the primitive only maps parts → meshes/materials.
- **In-canvas catalog consumers** use `catalog.ts` `useCatalogGetter` (non-rendering
  subscription) so catalog churn never re-renders the R3F tree. Bulk/IKEA imports **batch
  store writes** (`runImport.ts`) — never commit per-item (O(n²) catalog rebuilds → WebGL loss).
- Match the surrounding primitive style: real-world metres, real three `Material` instances.
