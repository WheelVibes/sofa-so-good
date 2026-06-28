# src/furniture — catalog & rendering rules

Area rules for furniture. Full sub-dir map in `docs/ARCHITECTURE.md`.

- **New parametric item** = `primitives/<Name>.tsx` (a fn taking `{ props }`) + register in
  `primitives/index.ts` + the `PrimitiveKind` union + a `ParametricDef` in the matching
  `defs/<category>.ts` (assembled into `BUILTIN_CATALOG` by `builtinCatalog.ts`).
  Set `verticalSpan`/`mounted`/`noClip` for non-floor items; `lightEmitters.ts` to emit light
  at night; add to `defaults/` to ship in the move-in flat (collision-checked by
  `defaultLayout.test.ts`).
- **Window-bound fixtures (`def.windowBound`, WINDOW-FIXTURE)** — curtains, roller blinds, and any
  other fixture that lives ON a window — place ONLY on windows and are static once placed. Setting
  `windowBound: true` does three things: the inspector hides the Transform section + Rotate/Flip
  actions, the scene drag is blocked (`Furniture.tsx`), and at placement time the fixture **snaps to
  the nearest window opening** via the pure `placement/windowSnap.ts:snapToNearestWindow(walls,
  openings, dropPos)` — both the commit (`ui/catalog/usePlacementController.ts`, bypassing the floor
  `canPlace` gate; an info toast + no-add when the plan has no window) and the `scene/PlacementGhost`
  preview (snaps the ghost, keeps the raw drop point in `ghostWorld` so the commit re-derives the same
  snap incl. facing). Window grilles stay an opening `style` (`grille`/`louvre`), not a fixture.
- **Categories**: 15 `FurnitureCategory` values. A new one must update the union,
  `FURNITURE_CATEGORIES`, **every** exhaustive `Record<FurnitureCategory,…>` consumer the
  type-checker flags, and `ui/catalog/CategoryTabs`/`CategoryIcon`. Category is auto-detected
  for imports, **never** typed by hand.
- **Per-part finish** of any GLB: a placed item's `props['finish:<materialOrMeshName>']` re-skins that
  named group — value is either a hex `#colour` (retints the part's own material, keeping its maps) OR a
  material token (`wood`/`marble`/`stone`/`metal`/`rattan`/`concrete`/`painted`/`gloss`/`mat:<id>`,
  resolved via `getSurfaceMaterial` and swapped in). `selectGltfRender` collects these for **every** GLB
  kind (IKEA, builtin, upload, remote), merging over any def-level `finishOverrides` (item wins) and
  dropping blanks. `GltfModel`'s apply pass captures each touched part's **original** material once
  (`userData.__finishOrig`) and restores it each run, so clearing one finish among several reverts that
  part cleanly. The inspector (`GltfBody`) lists a model's parts from `getCachedFinishTargets(url)` —
  `GltfModel` runs `listFinishTargets` once on load, caches by base url, and fires
  `subscribeFinishTargets` so the panel shows the per-part colour/material pickers as soon as the model
  is ready. (LOD note: material/mesh names can differ between tier variants, so the cached targets
  reflect whichever variant rendered.)
- **All GLB items** (bundled CC0 / user uploads / IKEA) render through `GltfModel`/`gltfRender.ts`
  — set the same collision flags; run `npm run optimize:glb` for `-low`/`-medium` LOD variants
  (uploads generate theirs in-browser via `optimize/lodVariants.ts`, routed by the `gltf/lod.ts`
  variant registry).
- **Pre-render footprint seed for GLB defs.** A GLB's true footprint is only learned after
  `GltfModel` renders + caches its bbox (`FOOTPRINT_CACHE`), so anything placed/sized/collided
  *before* first render needs a real seed, not a 1×1×1 guess. Two pure helpers do this from glTF
  POSITION accessor `min`/`max` (no render): `catalog/packs/footprint.ts:glbFootprint` (GLB *bytes*,
  used by the pack/upload path) and `catalog/remote/gltfBounds.ts:gltfJsonFootprint` (parsed glTF
  *JSON*, used by `catalog/remote/resolver.ts:bundleToFurnitureDef` for remote/Poly Haven defs).
  Both union multi-mesh bounds, clamp axes ≥0.05 m, reject absurd non-metre scales, and fall back
  to the caller's 1×1×1 placeholder when bounds are unavailable. The render-time cache stays
  authoritative — these only make the pre-render value honest.
- **GLTF cache eviction on removal (PERF-001/008).** When a GLB asset is removed/replaced/
  uninstalled, call `evictGltfAsset(url)` (`GltfModel.tsx`) so its parsed GPU geometry/textures
  leave the drei `useGLTF` cache and are disposed, and its `FOOTPRINT_CACHE`/`SUPPORT_PLANE_*`
  entries are pruned — otherwise GPU memory ratchets toward context loss over a session. It evicts
  the base url **and** every tier-variant url (`lodUrlsForBase` in `gltf/lod.ts`); GPU disposal is
  deferred one frame so the asset's instances unmount first. It is wired into `freeResource`
  (`state/slices/userAssetsSlice.ts`) and `markPackUninstalled` (`installedPacksSlice.ts`). **Only
  evict an asset no live item still references** (pack uninstall guards on placed `items`; user/IKEA
  removal drops the def + its items together). Any NEW asset removal/replace path must call it too.
- **Pure geometry stays render-agnostic + unit-tested** (e.g. `cabinet/cabinetModel.ts`
  `buildCabinet`, `parametric/buildParts.ts` `buildParametric`); the primitive/renderer only
  maps parts → meshes/materials. The parametric generator (`parametric/`) saves through the
  GLB-designer path (`exportGlb` → `persistUserGlb`) so its output is a regular user def —
  don't invent a parallel persistence channel for generated geometry.
- **Parametric types** (`parametric/spec.ts` `ParametricType`): `bookshelf` / `wardrobe` /
  `sideboard` / `desk` / `kitchen-run`. Adding a new type: extend the union + `PARAMETRIC_TYPES`
  + `PARAMETRIC_TYPE_LABEL` + `PARAMETRIC_LIMITS` + `DEFAULT_SPECS` + `clampSpec` handling;
  add a `build<Type>` function in `buildParts.ts`; add a controls branch in
  `ui/parametric/ParametricControls.tsx`; add a feature flag if the type needs its own gate;
  add unit tests in `parametric/__tests__/<type>.test.ts`; add a scenario ladder
  (`scripts/scenarios/parametric-<type>-simple.json` + journey). Kitchen-run specifics:
  `kitchenCabinets` flag (tier: `simple`), `TYPE_CATEGORY` maps to `'kitchen'`.
- **Array helpers** — pure geometry, render-agnostic, unit-tested, no store imports:
  - `arrayPlacement.ts` — linear/grid array:
    - `arrayOffsets(src, count, spacing, axis)` — N evenly-spaced positions along the item's
      local `'right'` (+X), `'left'` (−X), `'forward'` (+Z), or `'back'` (−Z), honoring
      Y-rotation. Count capped at `ARRAY_MAX_COUNT` (200).
    - `gridArrayPlacements(src, opts)` — 2D `cols × rows` grid of positions with independent
      `colSpacing`/`rowSpacing` and `colAxis`/`rowAxis` (defaults: right/forward). Source cell
      (0,0) excluded from output. Spacing clamped to ≥ 0.001 m; total capped at `ARRAY_MAX_COUNT`.
    - Both functions return only positions; the UI in `InspectorPanel.tsx` does collision-checking,
      batches commits via `setItems`/`pushHistory`, and surfaces a dropped-count toast.
  - `radialArray.ts` — radial/polar array: N positions around a circle with optional
    `faceCenter` yaw. Facing convention: `atan2(-cos angle, -sin angle)` so the item's
    Three.js local +Z points toward the center. A sweep `>= 2π − RADIAL_SEAM_EPS` (~1e-3 rad —
    incl. a dragged "almost full circle") is treated as **full-circle** (exclusive seam,
    `step = 2π/n`), so a near-2π drag can't double-up at the seam (BUG-RADIAL-FULLCIRCLE);
    smaller sweeps use the inclusive-both-ends partial formula `sweep/(n−1)`. Gated by the
    `radialArray` Pro flag (and `proMode`) in `InspectorPanel.tsx`; committed via `setItems` in
    a single undo step.
  - `pathArray.ts` — path/polyline array (PARITY-DUP-PATH): `pathArrayPlacements(points, opts)`
    samples N copies along an ordered polyline by **arc-length** (evenly along the path, not
    chord-spaced), with optional tangent-facing yaw (`align`, facing `atan2(dx, dz)` so +Z
    follows the travel direction) and `mode: 'count' | 'spacing'`. Handles <2 points, zero-length
    segments, closed-vs-open loops, and spacing > path length; capped at `PATH_ARRAY_MAX_COUNT`
    (200). The path source is any **plan polyline** (`floorPlan.polylines`, PARITY-POLYLINE). Gated
    by the `pathArray` Pro flag (+ `proMode`); the UI lives in a sibling
    `ui/inspector/PathArraySection.tsx` (not InspectorPanel) which collision-checks each copy
    (skip-and-report blocked slots, like radial) and commits via `setItems` in a single undo step.
- **In-canvas catalog consumers** use `catalog.ts` `useCatalogGetter` (non-rendering
  subscription) so catalog churn never re-renders the R3F tree. Bulk/IKEA imports **batch
  store writes** (`runImport.ts`) — never commit per-item (O(n²) catalog rebuilds → WebGL loss).
- **Universal parametric resize (CUSTOMIZE-PARAM-SIZE)**: any parametric item scales via
  `props.scale` (+ optional per-axis `scaleX`/`scaleY`/`scaleZ`). `Furniture` wraps the primitive in a
  `<group scale=…>` (about its floor-anchored, footprint-centred origin; no wrapper at 1×), and
  `collision/placement.ts:itemFootprint` already multiplies the same props into the footprint — so
  render + collision stay consistent. The inspector's `ParametricBody` Size section sets them (uniform
  / per-axis / exact metres, mirroring `GltfBody`). Primitives stay pure geometry — don't read scale
  inside a primitive; let the group handle it. (Decor auto-styling still reads `def.defaultFootprint`
  unscaled — a minor density/height imperfection for a *scaled* decor host, not a crash.)
- Match the surrounding primitive style: real-world metres, real three `Material` instances.
- **Appliance bodies (MAT-004b)**: the 8 steel-bodied appliance primitives
  (`Refrigerator`/`Oven`/`Stove`/`RangeHood`/`Dishwasher`/`Microwave`/`WashingMachine`/`WineCooler`)
  render their carcass through `primitives/shared.tsx:applianceBody(color, finish)`. Steel → the
  shared brushed-metal material (`materials/furnitureMaterials.ts:getMetalMaterial`, one cached
  instance reused across every body part + appliance) set on the body `<mesh material={…}>` via
  `applianceBodyMeshProps(body)`; non-steel ('matte'/'gloss') keeps the legacy `applianceFinish`
  props on `<ApplianceBodyMaterial finish={body} />`. A body mesh is always
  `<mesh {...applianceBodyMeshProps(body)} …><geometry/><ApplianceBodyMaterial finish={body}/></mesh>`.
  Don't put the steel material on the door glass / control panels / handles — those keep their own
  finishes. (`shared.tsx`, not `.ts`, because it exports the JSX `ApplianceBodyMaterial` component.)
- **Metal legs / frames (METAL-LEGS)**: a primitive's structural metal members (legs, frames,
  rails, posts, gas-lifts, taps) route through `primitives/shared.tsx:metalLeg(color?, finish?, repeat?)`
  — a thin wrapper over `getMetalMaterial` that inherits its `pbrSurfaces` gate (brushed
  `MeshPhysicalMaterial` on / identical plain `MeshStandardMaterial` off, so Performance is
  unchanged). Set the returned shared instance on the `<mesh material={…}>` prop (don't spread a
  plain props object onto a `<meshStandardMaterial>` for metal parts). Pick a finish by colour
  intent: `stainless` (bright chrome), `satin` (soft brushed), `black-steel` (matte industrial);
  tint via `color`. Wired into `BarCart` (frame), `OfficeChair` (gas-lift), `BarStool` (legs/column/
  footrest), `Sideboard` (hairpin legs), `TowelLadder` (frame), `DryingRack` (A-frame), `Desk`
  (hairpin legs), `KitchenIsland` (faucet). Leave painted/plastic parts and small hardware (knobs,
  small drawer pulls) as-is; don't touch wood/fabric.
- **Auto-arrange decor styling** (`layout/decorStyling.ts`): `applyDecorStyling(arranged, defs, seed?)`
  places `noClip` decor props per host surface (sofa→cushions/blanket, coffee-table→bowl/magazines/
  candles, bed→cushions, nightstand→plant/candle, desk→plant/books, sideboard→frames/sculpture).
  **Per-surface budget (RD408-001)** scales with the host's footprint area + a per-type ceiling
  (`budget = clamp(round(area / AREA_PER_PROP), 1, HOST_MAX[type])`); a per-room `ROOM_DECOR_CAP`
  bounds total density (trimmed tail-first in `applyDecorStylingForPlan`). **Props are spread across
  the host's real footprint (RD408-002)** — rotation-aware (offsets rotated by the host yaw), inset
  from edges + clamped so nothing spills off, with a small seeded position jitter. **Each prop gets a
  small seeded yaw jitter around the host facing (RD408-003)** (soft goods tilt more than frames).
  `applyDecorStylingForPlan` wraps it per-room. Both stay pure + seedable + deterministic →
  unit-testable. Wired into `furnishPlanItems` (`withDecor=true` by default); skip with
  `withDecor=false`. No feature flag — enriches the existing auto-furnish surface. Decor ids are
  `decor-<hostId>-<propId>-<slot>`. **Prop colour variety (RD-408):** repeated soft goods
  (cushion/blanket `color`) + book stacks (`spineColor`) draw a seeded colour from a curated
  `VARIETY` palette (offset by slot) so they aren't identical clones. **Hero props (RD-408):**
  richer set-dressing primitives with real silhouettes — e.g. `trailing-plant` (a raised pot whose
  vines cascade over the edge, leading the prop list on open shelving `bookshelf`/`cube-shelf` and a
  secondary option on `console-table`/`sideboard`); `decor-tray` (a shallow styled tray holding a
  small index-seeded candle/bowl/books vignette, `style`/`fullness` controls — leading on
  `coffee-table`/`ottoman` and a secondary option on `console-table`/`sideboard`). (The wall pass is
  still a future RD-408 task.)
