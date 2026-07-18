# src/furniture — catalog & rendering rules

Area rules for furniture. Full sub-dir map in `docs/ARCHITECTURE.md`.

- **CPU-heavy steps run in a pooled Worker, never the main thread.** Three instances today:
  `optimize/runOptimize.ts` (Draco/WebP re-encode — its own from-scratch pool, don't refactor it),
  `convert/runConvert.ts` (OBJ/FBX/STL/… → GLB via `convertModel`) and `glbEdit/csgWorkerPool.ts`
  (CSG v2 boolean folds via `glbEdit/csgEval.ts:foldCsg` + `csg.worker.ts`, Stage 1b) — the latter
  two are built on the generic `furniture/worker/workerPool.ts`; **any new pool builds on it too,
  never a fourth copy of the pattern.** All: spawn-on-contention
  (reuse an idle worker before growing the pool), a worker `error`/`messageerror` retires only
  that worker (its own queued calls fall back, the rest of the pool is unaffected), idle-teardown
  after 30s so a burst doesn't hold its peak size all session, and a graceful **per-file** fallback
  to a direct main-thread call — never the whole batch — when no Worker is available at all. A
  THIRD such pool should build on `workerPool.ts` rather than copy the pattern again. The one
  DOM gap a Worker has for model conversion (`ImageLoader`'s `document.createElementNS('img')`
  texture decode, used by every texture-bearing convert format) is bridged by
  `convert/imageLoaderWorkerPatch.ts` (decodes via `createImageBitmap` instead — `GLTFExporter`
  already accepts an `ImageBitmap` for `texture.image`) — don't reintroduce a DOM-only image path
  in a new convert-adjacent worker without checking that file first. `upload/bulkImport.ts`'s own
  `concurrency` knob (how many files' convert→optimize→persist pipeline run in parallel, ahead of
  the two pools above) is likewise hardware-aware by DEFAULT — `defaultImportConcurrency` reuses
  the same `computePoolMax` ceiling so a batch doesn't over-queue a low-end pool or under-use a
  many-core one; an explicit caller-supplied `concurrency` always wins over the default.
- **New parametric item** = `primitives/<Name>.tsx` (a fn taking `{ props }`) + register in
  `primitives/index.ts` + the `PrimitiveKind` union + a `ParametricDef` in the matching
  `defs/<category>.ts` (assembled into `BUILTIN_CATALOG` by `builtinCatalog.ts`).
  Set `verticalSpan`/`mounted`/`noClip` for non-floor items; `lightEmitters.ts` to emit light
  at night; add to `defaults/` to ship in the move-in flat (collision-checked by
  `defaultLayout.test.ts`).
- **Round/oval footprints (`footprintShapes.ts:ellipseFootprintParts`).** `footprintParts` is a
  UNION of OBBs — it can only add area, never carve a rectangle down to a disc — so a true
  circle/ellipse isn't representable exactly. `ellipseFootprintParts(width, depth, steps=4)`
  approximates one as a small "staircase" of axis-aligned boxes inscribed in the ellipse (each
  box's far corner sits exactly on the curve, so the whole union is a provable subset of the
  ellipse and therefore of the bbox); default `steps=4` yields 5 boxes. Wired into
  `defs/tables.ts`'s `footprintParts` for `dining-table-4` / `coffee-table` (round **and** oval
  both call it with the item's live `width`/`depth`, `[]` for `'rect'` → falls back to the single
  enclosing OBB, unchanged) and `side-table` (`'round'`/`'drum'` — the `diameter`×`diameter` bbox
  is already square, so the union is a true circle; `'square'` stays a single box). Pure geometry,
  render-agnostic, unit-tested in `footprintShapes.test.ts` (subset-of-ellipse + subset-of-bbox
  invariants, part count, degenerate/scale edge cases) with `canPlace`-level integration coverage
  in `collision/roundOvalFootprint.test.ts` (corner freed vs centre still blocked, scale/rotation).
- **Window-bound fixtures (`def.windowBound`, WINDOW-FIXTURE)** — curtains, roller blinds, and any
  other fixture that lives ON a window — place ONLY on windows and are static once placed. Setting
  `windowBound: true` does three things: the inspector hides the Transform section + Rotate/Flip
  actions, the scene drag is blocked (`Furniture.tsx`), and at placement time the fixture **snaps to
  the nearest window opening**. The **2D plan editor mirrors the same gating** (`PlanFurnitureInspector`
  hides X/Z/angle + shows a "fixed to its window" hint but keeps the size fields; `FurnitureRotateHandle`
  renders nothing; `FurnitureLayer`'s footprint keeps the fixture selectable but never starts a move
  drag) — a fixture can't be detached from its window on either surface. Placement **snaps to
  the nearest window opening** via the pure `placement/windowSnap.ts:snapToNearestWindow(walls,
  openings, dropPos)` — both the commit (`ui/catalog/usePlacementController.ts`, bypassing the floor
  `canPlace` gate; an info toast + no-add when the plan has no window) and the `scene/PlacementGhost`
  preview (snaps the ghost, keeps the raw drop point in `ghostWorld` so the commit re-derives the same
  snap incl. facing). The **2D plan editor** places them the same way (PLAN-FURNISH Phase 3):
  `ui/floorplan/editor/planFurnishPlacement.ts:buildPlanWindowGhostItem` wraps the same
  `snapToNearestWindow` + `windowFixtureProps` pair scoped to the EDITED level's walls/openings
  (`levelAsPlan`), ghost and commit both snapped; no-window levels toast + disarm on arming.
  Window grilles stay an opening `style` (`grille`/`louvre`), not a fixture.
  Placement also **sizes** the fixture to its window via the pure `windowFixtureProps(defId, window,
  ceilingHeight)` — curtains wider than the glass + floor-to-ceiling, blinds slightly wider with a
  covering drop. The `Curtain` primitive is a **double-sided wavy draped sheet** (two gathering panels,
  `drawAmount` 0 = open/clear, 1 = drawn) and `RollerBlind` **raises/lowers** (`lower` 0 = up, 1 =
  down); both ease in demand mode (hold `registerAnimatedSource` only while moving). The closed amount
  (curtain `drawAmount` / blind `lower`) feeds `windowLightModifiers.curtainDrawAmount` for graduated
  daylight attenuation. Both are customizable as **fabric surfaces** (CURTAIN-FABRIC): a `material`
  weave (cotton/linen/velvet — **fabric only**, no wood/stone) + a `pattern` (the shared tone-on-tone
  set, now on blinds too) + `color`, mapped via `materials/furnitureMaterials.ts:getDraperyMaterial`.
  A separate **opacity / light-blocking** axis `lightBlock` (sheer → light-filtering → room-darkening
  → blackout, CURTAIN-OPACITY / `materials/draperyOpacity.ts`) drives BOTH the rendered transparency
  (passed as `getDraperyMaterial`'s `opacity`) AND the daylight blocked (`windowLightModifiers`
  `curtainTransmission` — blackout blocks nearly all). Legacy `material: 'sheer'` maps to the sheer
  opacity. **Walk-mode toggle (WINDOW-FIXTURE-INTERACT)**: click/tap or press E on a placed
  curtain/blind to flip its `drawAmount`/`lower` between 0 and 1 (a discrete step, like a door's
  fixed swing — not a partial drag), gated behind the `walkWindowFixtures` flag (simple tier) and
  `isInteractableWindowFixture(def)` (`furniture/windowFixtureInteract.ts` — true only for a
  `windowBound` def whose primitive is `Curtain`/`RollerBlind`). Unlike doors (a fixed
  `DoorSpec`/`PlanOpening` table + a separate `doors` store slice), a fixture's open/closed value
  already lives on the placed item's own `props`, so the toggle (`toggleWindowFixture`,
  `state/slices/windowFixtureSlice.ts`) just patches `items` — no new schema field, it round-trips
  via the existing `items` persistence. `FirstPersonCamera`'s E-key aim reuses the door aim's exact
  ray/segment math (`collision/aimRay.ts:nearestAimedSegment`) against per-item segments built by
  `windowFixtureAimSegments` (recomputed from live `items`, unlike doors' precomputed table, since a
  fixture can be placed/moved). Every interact entry point (this click, the door click, the E-key
  handler in `App.tsx`) is gated through the single `state/editing.ts:dispatchWalkInteract` — orbit
  mode never toggles a door/fixture, only walk mode does (VIEW-EDIT-SPLIT). Venetian-blind slats
  render through **one rotation-capable `InstancedBoxes` draw call** (the earlier instancing pass
  had to skip them because the slats tilt): `bakeInstanceMatrix` now bakes an optional per-instance
  Euler rotation as `T·R·S` (size innermost), so a tilted instance is exactly equivalent to a
  `<mesh position rotation>` box — verified byte-identical (AE=0) across the raise/lower range. The
  slat layout is pure geometry in `primitives/slatLayout.ts` (`venetianSlatInstances`/
  `venetianSlatCount`, unit-tested); the raise/lower toggle stays a Y-scale on the parent group.
  The **drying rack** does the same for its rods via the sibling `InstancedCylinders`
  (unit-cylinder scaled `[radius, length, radius]` + rotation; `dryingRackCylinders` in the same
  module) — all 11 legs/rails/bars collapse to one draw call (bars unified to the leg tessellation).
- **Screen wallpaper cycle (WALK-SCREEN-INTERACT)**: click/tap or press E on a placed screen to
  advance `props.screenContent` to the next option, wrapping around. "Screen" is a **capability**,
  not a def-id list: `isInteractableScreen(def)` (`furniture/screenInteract.ts`) is true for any
  *parametric* def whose `paramSchema` carries a `screenContent` enum field — today that's
  `monitor`/`flatscreen-tv`/`tv-wall`, which all share the `Monitor`/`FlatscreenTV` primitives and
  the same 3-option enum (`landscape`/`sunset`/`abstract`, rendered by
  `primitives/screenContent.ts:getScreenContent`) — so a future screen def that reuses the same
  field is automatically covered with no eligibility-list edit. Gated by the `walkScreens` flag
  (simple tier); state in `state/slices/screenInteractSlice.ts` (`nearbyScreenId` +
  `cycleScreenContent`, no new schema field — `screenContent` already round-trips via `items`).
  Prompt copy is fixed ("Change wallpaper") since every screen def shares the same cycle
  semantics; a future screen kind with genuinely different content can branch in
  `screenInteract.ts:screenLabel` the way `windowFixtureLabel` branches on Curtain/RollerBlind.
- **Light on/off toggle (WALK-LIGHT-INTERACT)**: click/tap or press E on a light-capable item to
  flip it on/off — a registered `lightEmitters.ts` fixture (table/floor lamp, wall sconce,
  ceiling light/fan, cove light, vanity, aquarium) OR any item already flagged via the
  `itemAsLight` inspector override, keyed on `isInteractableLight(defId, props)`
  (`furniture/lightInteract.ts`), not a hardcoded list. The toggle is a discrete flip of
  `props.lightOn` between on (`'yes'`/absent) and off (`'no'`) — mirroring curtains/blinds'
  binary `drawAmount`/`lower` flip, not a dimmer. See `lightEmitters.ts` for how this composes
  with the scene-wide `lightsMode` brightness multiplier (per-item toggle always wins — a
  switched-off item is excluded from the active-lights set in every `lightsMode`, not merely
  dimmed). Gated by the `walkLights` flag (simple tier); state in
  `state/slices/lightInteractSlice.ts` (`nearbyLightId` + `toggleLightPower`, no new schema
  field). Prompt copy is "Turn on/off {def.name, lowercased}" — generic across every registered
  fixture, no per-primitive noun table needed. Screens and lights are the first pair of
  walk-mode interactables to use genuine **nearest-wins** disambiguation instead of the fixed
  door>fixture priority order: `FirstPersonCamera` merges their aim segments into a single
  `nearestAimedSegment` call (id-prefixed `screen:`/`light:`) so whichever is physically closer
  claims the "nearby" slot.
- **Cabinet open/close (CABINET-OPEN)**: cabinet-family primitives with visible fronts —
  `CabinetBase`/`CabinetWall`/`CabinetTall` (kitchen), `Wardrobe` (hinged doors), `Sideboard`,
  `Dresser` — swing their doors + slide their drawers open with an eased ~0.4 s motion, mirroring
  the room-door swing + curtain/blind draw. Like curtains, the open/closed value lives on the
  placed item's own `props.open` (`'yes'`/`'no'`, default absent = closed), so it round-trips via
  the existing `items` persistence with **no new schema field or slice** — the inspector toggle
  just calls `updateItemProps`. Capability is keyed on the primitive kind
  (`cabinetOpen.ts:OPENABLE_CABINET_PRIMITIVES` / `supportsCabinetOpen(def)`); the pure hinge/ease
  math (`easeInOut`, `advanceOpen`, `doorHingePivot`) is unit-tested and render-agnostic. The
  animation runs in the shared `primitives/openable.tsx` `HingedDoor`/`SlideDrawer` wrappers, which
  ease toward the target each frame and hold the demand render-loop + frozen shadow map open only
  while moving (`registerAnimatedSource` + `pulseShadowRefreshForMotion`, exactly like
  `Curtain`/`RollerBlind`). `cabinet/cabinetModel.ts` tags each front `CabinetPart` with its
  `column` (+ door `hinge` side) so `CabinetModule` can group a column's parts into one animated
  unit. Gated by the `cabinetOpen` flag (simple tier — a furnish/view delight, not an analytical
  tool). The inspector control lives in `ui/inspector/ParametricBody.tsx`, shown only when the flag
  is on AND `supportsCabinetOpen(def)`.
- **Categories**: 16 `FurnitureCategory` values. A new one must update the union,
  `FURNITURE_CATEGORIES`, **every** exhaustive `Record<FurnitureCategory,…>` consumer the
  type-checker flags, and `ui/catalog/CategoryTabs`/`CategoryIcon`. Category is auto-detected
  for imports, **never** typed by hand. The `pets` category (Pet program) is gated behind the
  `petFittings` flag: `useUnifiedCatalog(includeRemote, includeShared, includePets)` zeroes the
  pets block when off so the tab hides + its cards never surface (browse/search/favourites).
- **Door-bound fixtures (`def.doorBound`, DOOR-FIXTURE)** — pet gates, pet-door inserts, and any
  fixture that spans a doorway — are the door analog of `windowBound` (above): placed ONLY on a
  door opening, static once placed (inspector hides Transform, scene drag blocked, 2D plan
  gating mirrored), and at placement **snap to the nearest door** via the pure
  `placement/doorSnap.ts:snapToNearestDoor(walls, openings, dropPos)` (a clone of `windowSnap`
  filtering `kind==='door'`, spanning `op.width`, floor-anchored at the opening). Threaded through
  the SAME three call sites windowBound uses — `usePlacementController` commit (`commitDoorBound`),
  `scene/PlacementGhost` preview, and the plan editor (`planFurnishPlacement.ts:buildPlanDoorGhostItem`
  + `planHasDoor`, wired in `FloorPlanEditor`). `doorFixtureProps(defId, door)` spans the fixture
  to the doorway. Every `windowBound` gate that means "static fixture" (`Furniture.tsx` drag,
  `ItemActionButtons`/`InspectorPanel`/`PlanFurnitureInspector` Transform, `FurnitureLayer`/
  `FurnitureRotateHandle`) now also checks `|| def.doorBound`.
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
- **Pre-placement finish/variant resolution (CATALOG-VARIANT) was removed.** The pure
  `placement/catalogVariants.ts` module + its `CatalogVariantPopover` card popover are gone (the
  card finish-picker was mobile-broken and redundant with the inspector). The generic
  `placementSlice.armWithVariant`/`armedVariantProps` plumbing — merged over `defaultItemProps(def)`
  at commit by `usePlacementController.ts` — remains (tested, UI-unused) for a future variant-arming
  entry point. Post-placement finish selection is the inspector's `IkeaBody`/`ikeaBodyProps.ts` +
  FinishPicker/QuickFinishes.
- **All GLB items** (bundled CC0 / user uploads / IKEA) render through `GltfModel`/`gltfRender.ts`
  — set the same collision flags; run `npm run optimize:glb` for `-low`/`-medium` LOD variants
  (uploads generate theirs in-browser via `optimize/lodVariants.ts`, routed by the `gltf/lod.ts`
  variant registry).
- **Every GLB loader — convert or render — must block foreign fetches (SEC-1).** A model's own
  embedded `buffer[].uri`/`image[].uri` can be an absolute URL; without a guard, three.js fetches
  it verbatim at parse/render time — a crafted/shared model could beacon out to an attacker host
  just by being opened. `gltf/loaderSecurity.ts` is the **one** shared allow/block policy: allow
  `data:`/`blob:` (every user/IKEA/remote asset is pre-fetched to a `blob:` `runtimeUrl` before it
  ever reaches a loader) and same-origin absolute URLs (the app's own bundled/served GLBs +
  sibling `.bin`/texture files); block everything else, resolving to a blank fallback rather than
  throwing. `secureGltfLoader` is drei `useGLTF`'s `extendLoader` injection point — pass it as the
  4th arg (`useGLTF(url, true, true, secureGltfLoader)`, keeping `true, true` so DRACO/meshopt
  defaults aren't dropped) on every runtime `useGLTF` call site (`GltfModel.tsx`,
  `ui/catalog/thumbnails.tsx`, `ui/glbEditor/DesignerViewport.tsx`); it mutates only the single
  `GLTFLoader` instance drei memoizes for `useGLTF` (never `THREE.DefaultLoadingManager`), so
  material/HDRI loaders elsewhere are untouched. A raw `GLTFLoader` (not via `useGLTF`) —
  `catalog/packs/thumbnail.ts`'s `ThumbnailRenderer` — takes `getSecureGltfManager()` straight into
  its constructor. `convert/loadToObject.ts`'s drag-drop-conversion manager is stricter (a closed
  sibling-file allowlist, since local drops have no real "origin") but shares the same
  `isEmbeddedOrBlobUrl`/`BLOCKED_RESOURCE_FALLBACK` primitives — don't fork a second copy of the
  policy; any new GLB loader (convert or render) must route through this module.
- **Pre-render footprint seed for GLB defs.** A GLB's true footprint is only learned after
  `GltfModel` renders + caches its bbox (`FOOTPRINT_CACHE`), so anything placed/sized/collided
  *before* first render needs a real seed, not a 1×1×1 guess. Two pure helpers do this from glTF
  POSITION accessor `min`/`max` (no render): `catalog/packs/footprint.ts:glbFootprint` (GLB *bytes*,
  used by the pack/upload path) and `catalog/remote/gltfBounds.ts:gltfJsonFootprint` (parsed glTF
  *JSON*, used by `catalog/remote/resolver.ts:bundleToFurnitureDef` for remote furniture defs).
  Both union multi-mesh bounds, clamp axes ≥0.05 m, reject absurd non-metre scales, and fall back
  to the caller's 1×1×1 placeholder when bounds are unavailable. The render-time cache stays
  authoritative — these only make the pre-render value honest. The same `def.defaultFootprint`
  this seeds is also the input to the catalog's "fits this room" size cue
  (`catalog/roomFit.ts:itemFitsRoom`, CATALOG-FITS, see `src/ui/CLAUDE.md`) — one more reason a
  placeholder 1×1×1 must never be reported as confidently "fits"/"won't fit" (the predicate treats
  a degenerate footprint as `'unknown'`, not a guess).
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
  `kitchenCabinets` flag (tier: `simple`), `TYPE_CATEGORY` maps to `'kitchen'`. Every
  generated piece's `ParametricSpec` round-trips onto its saved def as
  `UserGltfDef.parametricSpec` (JSON string, set by `saveParametricAsset` → `persistUserGlb` →
  `hydrateAssets.ts`/`schema.ts`, the same pattern as `slotSpec`/`assetSpec`) — this is what
  lets `carpentryElevation.ts` (below) rebuild a placed piece's exact geometry for its drawing-
  set sheet without a parallel model; adding a new `build<Type>` here is what a new type's
  carpentry cut/dims are derived from, so no extra wiring is needed there beyond
  `pickSectionCut`'s per-type branch.
- **Carpentry/joinery elevations + sections (TODO G8, `carpentrySheets` flag, pro).**
  `carpentryElevation.ts:buildCarpentryPiece(spec)` is the pure geometry step for the drawing
  set's per-piece "Carpentry — `<name>`" sheet (see `docs/ARCHITECTURE.md` for the full design):
  it reuses `buildParametric`'s part list unchanged, projects it to a front elevation (drop Z)
  + one representative section (a per-type cut X reconstructed from the parts' own bay-boundary
  positions, never a second bay-math formula), and reads every dimension (overall W/H/D, bay
  widths, panel/plinth/worktop thickness, shelf/rail/drawer-front heights AFF) straight off the
  cut parts — never inventing a number the spec/parts don't already encode. `ui/carpentrySheets.ts`
  resolves + dedupes placed instances via each def's persisted `parametricSpec` (see the bullet
  above); `ui/carpentrySheetSvg.ts` renders the dimensioned SVG (mm-only labels, dashed hidden
  lines, a `declutterLabelY` collision pass for closely-stacked AFF heights). **Buildability
  callouts (TODO H2):** `buildCarpentryPiece` also returns `sectionTitle` ("SECTION A-A") +
  `elevationCutX` (drawn by `carpentrySheetSvg.ts`'s `cutX` opt as a dash-dot cut-line + "A"
  bubbles on the elevation only) and `materialNotes`/`hardwareCallouts` (both exported, pure,
  unit-tested) — an honest finish/board/edge-banding note (hedged "confirm … with fabricator",
  never an invented laminate code; `"TBC by fabricator"` when a thickness can't be read off the
  parts) and a hardware note whose counts are read straight off the piece's real
  `door`/`handle`/`drawer-front`/`drawer-handle` parts — never estimated from the spec alone.
  `role:'door'` doesn't distinguish a wardrobe's sliding vs hinged front, so `hardwareCallouts`
  is the one place that reads `spec.wardrobeFront` (sliding → track+rollers; hinged → a hinge
  count via the standard 2-per-door-≤1200mm/3-above rule); every other type/bay is generic over
  the shared role vocabulary. Zero doors + zero drawers → "shelf supports as required by
  fabricator" (the spec has no fixed-vs-adjustable field to report). Scoped to the 5
  `ParametricType`s only — a standalone kitchen-cabinet catalog item (`cabinet/cabinetModel.ts`
  `buildCabinet`, placed via `primitives/CabinetModule.tsx`) keeps its spec live on the item's own
  `props` (no GLB-export/spec-loss step to begin with) rather than a persisted `parametricSpec`
  JSON string, so it doesn't share this exact resolution path yet — a future extension would add
  a `CabinetSpec`-based sheet builder alongside this one, not fold it into
  `collectCarpentrySheets`.
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
- **Selection axis-mirror (FEAT-2)** — `mirrorSelection.ts`: pure, unit-tested, no store
  imports. `mirrorSelection(items, axis)` reflects a whole selection as a **rigid group** about
  its own centroid line (`selectionCentroid`) on a room axis — `'x'` reflects X (left↔right,
  keeps Z), `'z'` reflects Z (front↔back, keeps X) — preserving the spacing between pieces. Per
  item: `mirrorPosition` flips the perpendicular coordinate; `mirrorRotation` flips the Y-yaw
  heading consistent with `layout/faceWall.ts`'s `(sin θ, cos θ)` forward convention (`-rotation`
  for axis `'x'`, `π - rotation` for axis `'z'`); `mirrorItem` also toggles the matching
  `flipX`/`flipZ` in-place mirror flag so an asymmetric piece (an L-sofa, a chaise) reads as its
  true mirror image. `layout/selectionActions.ts:mirrorSelectionAxis(catalog, axis)` wires it to
  the store — collision-checks every mirrored placement and commits **all-or-nothing** (a piece
  that would clip a wall on the far side never leaves the layout half-mirrored), one undo step via
  `moveItem`/`rotateItem`/`flipItem` (never per-item pushes). The pre-existing left↔right-only
  `mirrorSelectionX` (used by the command palette + 2D plan editor, both ungated) is now a thin
  `mirrorSelectionAxis(catalog, 'x')` wrapper — unchanged behavior/call sites. The **Z-axis**
  option (+ the explicit "Mirror X"/"Mirror Z" pair of buttons replacing the single ungated
  "Mirror" label) is gated by the `mirrorSelection` Pro flag in `MultiSelectPanel.tsx` (3D room
  editor, shared desktop/mobile) and the `sel-mirror-z` ⌘K command (`sel-mirror` stays ungated).
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
- **Appliance bodies (MAT-004b — single representation)**: the 8 steel-bodied appliance primitives
  (`Refrigerator`/`Oven`/`Stove`/`RangeHood`/`Dishwasher`/`Microwave`/`WashingMachine`/`WineCooler`)
  render their carcass through `primitives/shared.tsx:applianceBodyMaterial(color, finish)`, which
  returns **ONE `Material` instance for EVERY finish**, always set on the body mesh's `material=`
  prop: steel → the shared brushed-metal material (`materials/furnitureMaterials.ts:getMetalMaterial`);
  matte/gloss/unknown → a shared painted material (`getSolidMaterial(color, roughness, metalness)`
  with the exact `applianceFinish` preset — byte-identical to the old inline `<meshStandardMaterial>`).
  Both branches are cached (one instance reused across every body part + appliance — no per-instance
  material). A body mesh is always `<BeveledBox material={body} …/>` (or
  `<mesh material={body}>…geometry…</mesh>`) — **never** a `<meshStandardMaterial>` child.
  **Why one representation:** the old split (steel on the mesh PROP, non-steel as a
  `<meshStandardMaterial>` CHILD) did not reconcile when the user swapped steel↔matte in the
  inspector — R3F left a stale (white) body. Routing both finishes through the `material=` prop makes
  a swap a plain material-instance change on one mesh, which reconciles reliably. Don't put the body
  material on the door glass / control panels / handles — those keep their own inline finishes.
  (`shared.tsx`, `.tsx` for JSX-adjacent primitive helpers.)
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
  `coffee-table`/`ottoman` and a secondary option on `console-table`/`sideboard`). **Wall pass
  (RD408-008):** a separate loop hangs one `wall-art` piece on the wall BEHIND each wall-flushed host
  (`WALL_ART_HOSTS` — sofas/beds/sideboard/console; L-shapes excluded) at the host's back edge, facing
  the room, sized `widthFrac`×host width and self-lifting via the def's `mountHeight` (the def is
  `mounted`+`noClip`). Artifact-safe: the host already occupies a clear wall span, so the art never
  overlaps a door/window. Deterministic seeded art tint; excluded from the surface-prop budget/cap.
