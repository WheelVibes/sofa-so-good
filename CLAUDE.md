# HDB 3D Interior-Design Sandbox — architecture guide

A browser 3D sandbox of an accurate Singapore HDB 4-room flat for interior
design: furnish it, finish surfaces, light it across the day, and walk
through it. React + TypeScript + Three.js via @react-three/fiber, Zustand
state, Vite build, Vitest tests.

## Commands
- `npm run dev` — Vite dev server (localhost:5173).
- `npm test` — Vitest (run once). `npm run test:watch` to watch.
- `npm run build` — `tsc` typecheck + Vite production build.
- `node scripts/shot.mjs <out.png> [waitMs] [evalFile] [actionsJson]` —
  Puppeteer screenshot harness (software WebGL). Actions support
  drag/rdrag/wheel/click/type/key/wait. In dev the store is exposed on
  `window.__store` for scripting. `scripts/crop.mjs` crops at full res;
  `scripts/perf.mjs` reports heap/fps under load.
- `npm run optimize:glb` — offline GLB LOD pass
  (`python/scripts/optimize_glb_lod.mjs`): generates `-low`/`-medium` tier
  variants of every GLB under the IKEA model dir (see **GLB LOD pipeline**).
- `npm run scraper-server` — local Node sidecar (`scripts/scraper-server.mjs`)
  that drives the IKEA scraper for the one-click **IKEA Singapore (live scrape)**
  pack: spawns `ikea_model_scraper.py --out public/assets/ikea --progress-ndjson`,
  runs `optimize_glb_lod.mjs` on each finish GLB the moment it lands (bounded
  parallel pool), and streams per-product progress to the browser over SSE.
  Local/dev-only (default port 5174; `SCRAPER_PORT` overrides). See **IKEA models**.
- `python/scripts/` — offline IKEA SG scraper + asset tooling (Python +
  Node). Not part of the app build; see **IKEA scraper (offline)** below.

## REQUIRED: keep CLAUDE.md + README.md current
Both files have drifted from the code before. After **any** change that adds,
removes, or reshapes a system, command, layout area, or user-facing feature,
update **both** this architecture guide and `README.md` in the same change so
they never lag the repo. (`TODO.md` tracks deferred work per the Process rule;
these two track the *current* state.)

## REQUIRED: visual verification after any app change
For **any** change to the app (not docs/tests-only), you MUST, before
considering the work done: (1) run the app, (2) exercise the functionality you
added or changed — driving the store via `window.__store` and the `scripts/shot.mjs`
actions where UI interaction is needed, (3) capture screenshot(s) of the result,
and (4) **visually review** the screenshots yourself for UI/UX bugs, rendering
artifacts, or regressions. `npm test` + `tsc` passing is NOT sufficient — a green
suite never proves the rendered result looks right. Report what you saw in the
screenshots, not just that you took them.

**Before driving the app, read
[docs/visual-verification-playbook.md](docs/visual-verification-playbook.md)** —
it captures the harness rules, the known interaction gotchas (location-prompt
modal, camera framing, on-screen-to-mount, exposing module functions, render-
populated cache races, dev-server restarts, Draco decoding) and their fixes, plus
a known-good evalFile template. **Whenever you solve a new interaction or
screenshot problem, add the fix to that playbook** so the next agent doesn't
rediscover it.

## Layout of the code
- `src/state/` — Zustand store split into slices (`slices/*`): items,
  selection, finishes, doors, time, location, camera, ui (incl. quality +
  snap grid), placement, clipboard, history, remote catalog, installed packs,
  measurements, orientation, notifications, reset, **userAssets**
  (user-uploaded GLBs + imported `IkeaGltfDef`s — see **IKEA models**), and
  **floorPlan** (editable apartment shell + editor state + saved-plan library).
  Persistence + migrations under `storage/` (layout autosave; `qualityPrefs.ts`
  graphics prefs; `editorPrefs.ts` snap/grid; `floorPlanStore.ts` plan library
  + active custom plan; `hydrate.ts`/`hydrateAssets.ts` re-resolve user/IKEA
  defs + their IDB blobs on boot). `schema.ts` is the save/load serializer
  (round-trips parametric items, user GLBs, and IKEA defs).
- `src/apartment/` — the default flat. `constants.ts` is the source of truth
  for walls/doors/windows/rooms (derived from the floor-plan SVG). `walls/`,
  `floor/`, `Window.tsx`, `Door.tsx`, `Ceiling.tsx`, plus a grounding slab in
  `Apartment.tsx`. `PlanShell.tsx` renders a user-authored plan instead (walls
  extruded with openings + `floor/PlanRoomFloor.tsx` per-room finishes) when a
  non-default plan is active.
- `src/floorplan/` — the editable floor-plan model: `types.ts` (FloorPlan =
  walls/openings/rooms + area/bounds helpers), `defaultPlan.ts` (seeds the
  plan from `apartment/constants`), `planGeometry.ts` (plan → renderable wall
  boxes + door-aware collision walls; `isDefaultPlan`), `templates.ts` (starter
  apartments). The 2D editor is `ui/floorplan/` (FloorPlanEditor + PlanInspector).
- `src/furniture/` — catalog + rendering. `builtinCatalog.ts` lists every
  parametric item; `catalog.ts` merges built-ins, installed packs, and user/
  IKEA defs (footprints resolved). Parametric items map to a component in
  `primitives/` (registered in `primitives/index.ts`); GLB items (bundled CC0,
  user uploads, IKEA) render through `GltfModel.tsx` (`gltfRender.ts` picks the
  url/scale/tint/finish-overrides per item). `defaults/` is the move-in-ready
  layout; `lightEmitters.ts` registers which items emit light at night.
  - `gltf/` — GLB plumbing shared by every GLB item: `decoders.ts` (Draco at
    boot, meshopt/KTX2 auto-wired), `lod.ts` (tier budgets + `-low`/`-medium`
    url helpers + sync probe cache + prewarm), `textureBudget.ts` (runtime
    texture downscale fallback), `finishTargets.ts` (named meshes for
    per-component recolour).
  - `ikea/` — consumes IKEA scraper output: `metadata.ts` (zod parse +
    `looksLikeIkeaMetadata`), `translate.ts` (scraper category/placement → app
    category + collision flags + `frontClearance`), `importGroup.ts` (metadata +
    GLB files → one `IkeaGltfDef`, writes blobs to IDB, seeds footprints),
    `compatibility.ts` (category-rule "accepts" resolver), `detectGroup.ts`
    (`findMetadataFile` — auto-detects a `metadata.json` group folder among
    picked files, used by the Upload dialog). Wired end-to-end (see **IKEA
    models**).
  - `upload/` — user-GLB import: `validate.ts`, `bulkImport.ts`, `persist.ts`
    (drive `ui/upload/UploadModelDialog.tsx`).
- `src/materials/` — finishes. `builtinCatalog.ts` (floors/walls), runtime
  `procedural/` PBR generators (wood/tile/marble/carpet/concrete/terrazzo/
  plaster), `furnitureMaterials.ts` (tintable fabric + wood-grain + stone/marble
  for furniture, plus `getSolidMaterial` for metal/plastic and the `mat:<id>`
  DLC-finish resolver), `worldUv.ts` (metre-space UVs so finishes tile
  consistently).
- `src/scene/` — the R3F `<Canvas>` and systems: `lighting/` (sun astronomy,
  hemisphere fill, `SceneEnvironment` IBL probe, `FurnitureLights`, `Sky`),
  `Effects.tsx` (bloom+SMAA), `quality.ts` + `QualityController` (tiers +
  adaptive 30fps), `ScreenshotController` (PNG export), cameras, selection.
- `src/ui/` — DOM overlays: Toolbar, CatalogDrawer, InspectorPanel,
  FinishPicker, GraphicsSettings, measurement/credits/help, `upload/`
  (GLB/material import dialogs), `floorplan/` (2D editor), `inspector/`,
  `catalog/`.
- `python/scripts/` — **offline** asset tooling, not part of the app build:
  `ikea_model_scraper.py` (IKEA SG → per-variant-group `metadata.json` +
  `<finish>.glb`), `glb_analysis.py` (stdlib GLB parser → footprint + material
  palette + segments), `categorize.py` (breadcrumb/type → functional category
  + placement semantics), `compatibility.py` (local "complete with" resolver),
  and `optimize_glb_lod.mjs` (the `npm run optimize:glb` LOD pass). See
  **IKEA scraper (offline)** and **GLB LOD pipeline**.

## Key systems
- **Procedural materials**: `materials/procedural/generators.ts` paints one
  tiling tile (albedo+normal+roughness) per finish from seeded noise; plaster
  wall paints share one normal map (tinted by colour) to save memory.
  Surfaces use world-space UVs so a finish tiles at a fixed physical scale.
  Furniture (`furnitureMaterials.ts`) has its own tintable grain generators:
  wood (warped latewood lines + lengthwise pores + roughness map), stone/marble
  (turbulent veins), fabric/leather/velvet, plus `getSolidMaterial` for
  metal/plastic parts — always pass a real `Material` instance to a `material=`
  prop, never a plain props object (three.js ignores those).
- **DLC materials on furniture**: a furniture finish value of `mat:<materialId>`
  applies any catalog finish — including a downloaded CC0 PBR set from the
  ambientCG/Poly Haven remote catalog — to the piece. `FurnitureMaterialLoader`
  (mounted in the scene) watches items, builds the referenced material into the
  shared cache (procedural synchronously; textured via `<Suspense>`+`useTexture`)
  under a furniture-scoped id, and bumps `materialEpoch` so memoised furniture
  re-render. `getSurfaceMaterial` returns the built material, falling back to
  procedural wood until it's ready. The inspector's wood/surface `finish`
  dropdown lists these (labelled “CC0 DLC”).
- **Lighting / time of day**: SunCalc drives sun altitude → `altitudeCurve.ts`
  → directional sun + hemisphere fill + IBL intensity + sky. Light fixtures
  emit capped, day-gated point lights at night and their shades glow via the
  shared `fixtureGlow` signal.
- **Quality tiers** (`quality.ts`): low/medium/high gate shadow-map size, IBL,
  bloom+SMAA, fixture-light cap, and DPR. `QualityController` auto-detects the
  tier and steps it down if FPS sustains < 30; every setting is overridable in
  the Graphics panel (persisted). Baseline (low/medium) targets integrated/CPU
  hardware; high adds GPU-intensive effects. **Asset quality** is a separate
  control (`assetTier`, `effectiveAssetTier`): GLB mesh/texture detail follows
  the render tier by default (`null` = Auto) but can be pinned to Low/Medium/
  Original independently — so "Original" loads full-resolution assets without
  the GPU-heavy render effects, and is immune to the FPS auto-downgrade (which
  only moves the render tier). Persisted alongside the tier in `qualityPrefs`.
- **GLB models + LOD** (`furniture/gltf/`, `GltfModel.tsx`): bundled CC0 GLBs,
  user uploads, and IKEA imports all render through one loader. `decoders.ts`
  registers Draco at boot (meshopt/KTX2 auto-wired by drei). The offline
  `npm run optimize:glb` pass writes `-low`/`-medium` variants (≤512/≤1024px
  WebP textures + ~50/75% triangles, Draco) beside each `.glb`; at runtime
  `lod.ts` picks the variant for the effective **asset** tier (the Graphics
  panel's Asset quality control, decoupled from render effects — sync probe
  cache + `prewarmLod`), and `textureBudget.ts` downscales any oversized
  texture as a last-resort fallback (also gated on the asset tier). `finishTargets.ts` enumerates named meshes so a GLB can
  be recoloured per component. KTX2 encoding in the offline pass is deferred
  (WebP only today — see `TODO.md`).
- **IKEA model import** (`furniture/ikea/`, `state/userAssetsSlice.ts`): the
  Python scraper (below) emits per-variant-group `metadata.json` + `<finish>.glb`.
  The Upload dialog auto-detects an IKEA group folder (`detectGroup.ts`
  `findMetadataFile`) and `importGroup.ts` turns it into **one** `IkeaGltfDef`
  per group — `variants[]` (each with footprint + per-component GLB palette,
  blobs in IDB), with category/placement/`frontClearance`/price/compatibility
  all derived from the scraped `metadata.json` (`translate.ts`,
  `compatibility.ts`). One catalog card per group; the per-instance active
  finish lives in `props.variant` (loads the sibling GLB). Renders via
  `gltfRender.ts` (active variant + per-component `finish:<target>`/global tint
  overrides — inspector `ui/inspector/IkeaBody.tsx`); read-only product info in
  a panel. The **catalog-card thumbnail** is the scraped product photo: import
  downscales each finish's `main_image` once to a ~256 px blob (`thumbnail.ts`
  `downscaleImageFile`) stored in IDB (`kind:'texture'`, `role:'ikea-image'`,
  keyed on the variant's `imageAssetId`), and `ui/catalog/thumbnails.tsx` shows
  the active variant's photo (falling back to the category icon when absent).
  License is non-CC0 `IKEA` (attribution shown, assets not
  redistributed). `IkeaGltfDef`s live in `userAssets`, round-trip through
  `schema.ts` (incl. `imageAssetId`), and re-resolve their GLB + thumbnail blob
  URLs on boot (`storage/hydrate*`).
  Plan: [docs/ikea-import-app-support.md](docs/ikea-import-app-support.md).
- **Combining compatible models** (`furniture/ikea/stacking.ts`,
  `placementSemantics.ts`, `supportPlane.ts`): a compatible model combines with a
  base per a **placement kind** classified from the matched "Complete with"
  category (`placementKind`: vertical / around / modular / null→gated off):
  - **vertical** (mattress→bed frame, cushion→sofa): rests the item's BOTTOM on
    the base's true support surface. That Y is detected **geometrically** from
    the base GLB — `supportPlane.ts` `detectSupportPlaneY` histograms near-
    horizontal triangle area by Y over the footprint interior and picks the
    highest substantial band below the head/footboard region (the slat plane,
    ~0.24 m for MALM), computed + cached by URL in `GltfModel` (`SUPPORT_PLANE_
    CACHE`, its own effect so the footprint short-circuit can't skip it; computed
    from any LOD tier, original-geometry marked authoritative). IKEA publishes no
    slat height, so geometry — not the old footboard-minus-thickness estimate —
    is the source of truth. Fallback `STACK.bedSlatDefault` in `designRules.ts`.
  - **around** (chairs/stools/benches→table): places the seating on the FLOOR at
    the base's front edge, facing it (no Y lift).
  - **modular** (sofa sections→sections): snaps a section to the base's first
    mating edge (from the scraped `IkeaModular` block — role + mating edges),
    flush on the floor, same rotation — extend-a-sofa / L-shape.
  `combineOnto` builds the item(s) with `props.surfaceHeight` (vertical only),
  inherited rotation, and a shared `groupId`. GLB items lift by `surfaceHeight`
  in `Furniture.tsx` (gated `kind !== 'parametric'`; the ContactShadow counter-
  translates by `-liftY` to stay grounded). Two triggers: inspector
  **"Complete with → Place on this"** (`ui/inspector/IkeaBody.tsx`) and
  **drag-snap** (`scene/DragController.tsx` — `itemFootprint` containment +
  `resolveCompatible`, routed through `combineOnto`). Group-mates skip mutual
  collision (`collision/placement.ts`). `surfaceHeight`/`groupId`/`modular`
  round-trip with no schema change. The scraper grows a `--phrase-index` mode
  (harvest accepts-category phrases, no GLBs) and a name-inferred `modular` block
  for sofa sections (`ikea_model_scraper.py`).
- **IKEA live-scrape pack** (`catalog/packs/ikeaLive.ts`, `scripts/scraper-server.mjs`):
  the **IKEA Singapore (live scrape)** pack (a `kind:'ikea-live'` entry in
  `catalog/packs/registry.ts`) downloads the catalogue on demand instead of a
  hosted zip. Its button calls the local sidecar (`npm run scraper-server`),
  which scrapes products one-by-one (parallelized), LOD-optimizes each finish
  GLB the instant it lands (bounded pool), and writes to Vite-served
  `public/assets/ikea/<group>/` (HTTP paths → the pre-baked LOD siblings apply).
  Progress streams per-product over SSE (`PacksTab.tsx` shows a bar + phase
  list); each finished group is fetched over HTTP and registered through the
  existing `importGroup()` → full `IkeaGltfDef`. Sidecar is local/dev-only;
  served IKEA assets are gitignored (non-CC0).
- **IKEA scraper (offline)** (`python/scripts/`): `ikea_model_scraper.py`
  (Playwright) harvests IKEA SG products → `<group>/metadata.json` +
  `<finish>.glb` + `<finish>-main`/`<finish>-context` product images
  (original resolution, recorded as `variants[].main_image`/`context_image`;
  the app downscales the main image for the catalog thumbnail) (`--out <dir>`
  redirects the output root; `--progress-ndjson` emits per-product phase events
  on stdout — both used by the live-scrape sidecar), grouping colour/finish
  variants and detecting multi-piece
  **sets** (writes `sets/<set_key>.json` recipes from the "What's included"
  list). `glb_analysis.py` (pure stdlib) extracts footprint + per-component
  material palette + segment map; `categorize.py` assigns functional category +
  placement semantics; `compatibility.py` resolves "complete with" suggestions
  locally. This is offline tooling — its output is what `furniture/ikea/`
  consumes.
- **Height-aware collision** (`collision/placement.ts`): items carry a vertical
  span plus `mounted` (skip wall checks) / `noClip` (rugs) flags so pendants
  hang over tables, wall units mount above furniture, rugs slide under.
- **Wall reveal** (`apartment/walls/`): exterior walls between the orbit
  camera and the interior fade out; windows/doors fade with them via the
  `wallReveal` registry.
- **Floor plan editor** (`ui/floorplan/`, `floorplan/`): a 2D top-down editor
  (toolbar "Floor plan") edits the store `floorPlan` — walls (interior/
  exterior), rectangular rooms (auto area + total), doors/windows, grid +
  corner snapping, drag-move, per-room floor finishes. A non-default plan
  renders via `PlanShell` and furniture/walk collision follow it (optional
  `walls` on `canPlace`, `planCollisionWalls`); the default flat keeps the
  curated `<Apartment/>`. Saved plans persist (`floorPlanStore.ts`).
- **Snap grid** (`scene/snap.ts`, `GridOverlay.tsx`, ui `snapEnabled`/
  `gridSize`): drag + initial placement quantise to a customizable grid
  (10/25/50 cm, 1 m); the floor overlay shows it. Persisted via `editorPrefs`.
- **Drag aids**: `DragController` snaps a single drag to other items' centres/
  edges (magenta `AlignmentGuides`) and shows the nearest-wall gap (`DragHud`
  via `collision/clearanceGap.ts`). Hover highlight (`HoverHighlight`).
- **Design tools** (toolbar): a **Sets** menu drops pre-arranged vignettes
  (`furnitureSets.ts`) plus any imported **IKEA set recipes** (`ikeaSets.ts`:
  `parseSetRecipe`/`buildSetGroup`/`arrangeSet` expand a scraped `sets/<key>.json`
  into a footprint-arranged group); **Tools ▾** groups the Budget panel
  (`furniturePrices.ts`), **Checks** (door-swing clearance, `layout/clearance.ts`
  + `ClearanceOverlay`), **Sun study** (time-lapse), **Walkthrough** (auto camera
  tour + record, in `OrbitCamera`), and **Report** (`ui/report.ts`, printable).
  Multi-select shows an align/distribute panel; items can be **locked**;
  double-click focuses the camera; saved layouts get thumbnails (`slotThumbs`).
- **Furniture groups** (`state/slices/groupsSlice.ts`): items sharing an optional
  `FurnitureItem.groupId` are an emergent group (no separate entity). First click
  selects the whole group (`selectItemGrouped` + transient `activeGroupId`); a
  second/Alt click drills into one member. Group drag is the existing multi-drag;
  rotate is rigid about the centroid (`groupRotate`). Group/Ungroup +
  "Add to group" live in the inspector; deleting a member auto-dissolves a group
  that drops below 2. Dropping a Set stamps one shared `groupId`. Persisted via
  save schema **v2** (`groupId` optional; v1→v2 migration is a no-op on items).
- **Visual**: per-item **contact shadows** (`ContactShadow`, quality-gated) +
  **skirting/crown** wall trim (`apartment/Skirting.tsx`, `PlanShell`).
  Procedural finishes include **wallpapers** (stripe/grasscloth) + **checker**.

## Adding content
- **Furniture**: add a `primitives/<Name>.tsx` (a function taking
  `{ props }`), register it in `primitives/index.ts` + the `PrimitiveKind`
  union, and add a `ParametricDef` to `furniture/builtinCatalog.ts`. Set
  `verticalSpan`/`mounted`/`noClip` for non-floor items. To emit light, add to
  `lightEmitters.ts`. To ship in the default flat, add to `furniture/defaults/`
  (every entry is collision-checked by `defaultLayout.test.ts`).
  The catalog spans 15 categories (`FurnitureCategory` in
  `furniture/types.ts`), mirroring IKEA's top-level departments: beds, seating,
  tables, storage, kitchen, bathroom, appliances, lighting, decor, textiles,
  outdoor, **electronics**, **kids**, **laundry**, and **others** (the
  auto-detect catch-all, always sorted last). A new category must be added to
  that union, `FURNITURE_CATEGORIES`, and the exhaustive
  `Record<FurnitureCategory,…>` consumers the type-checker flags
  (`furniturePrices.ts`, `BudgetPanel.tsx`, `report.ts`, `UploadModelDialog.tsx`,
  catalog grouping) plus the catalog UI (`ui/catalog/CategoryTabs.tsx` +
  `CategoryIcon.tsx`). Category is auto-detected for imports, never entered by
  hand (`ikea/translate.ts` + `python/scripts/categorize.py`; unmatched →
  `others`).
- **Finish**: add an entry to `materials/builtinCatalog.ts` (`procedural` with
  a pattern, or `solid`). New patterns go in `procedural/generators.ts`.
- **GLB models**: bundled CC0 GLBs and user uploads go through the generic
  `GltfModel` loader; set the same `verticalSpan`/`mounted`/`noClip` flags. Run
  `npm run optimize:glb` to generate the `-low`/`-medium` LOD variants. IKEA
  imports come from the offline scraper as `IkeaGltfDef`s (see **IKEA models**).

## Conventions
- Furniture primitives are floor-anchored, centred on the footprint, facing
  +Z; geometry is built at real-world metres.
- **Structural soundness**: parts must connect (no floating members), supports
  reach floor→underside, legs sit inside the top/seat footprint, and seats
  cover the span their legs bound. `material=` props need a real three `Material`
  (use the `furnitureMaterials.ts` helpers), not a plain `{color,roughness}`
  object. Don't invent bespoke texture art — for photoreal surfaces apply a CC0
  DLC material (`mat:<id>`) over the procedural fallback.
- **Placement follows the interior-design rules in
  [docs/interior-design-guidelines.md](docs/interior-design-guidelines.md)**:
  storage/appliances/beds flush to walls, TVs on windowless walls, seating
  faces the TV, walkways + door/window clearances preserved. Clearance values
  live in `src/layout/designRules.ts` (`CLEARANCE`) and drive the per-room
  auto-arranger in `src/layout/autoArrange.ts` (`arrangeRoom`, exposed in-app
  as the Finish-picker "Tidy up room" button). Author default layouts/presets
  to these rules and reuse the constants.
- Keep `TODO.md` current when deferring work (see superpowers specs/plans
  under `docs/`).
- All bundled assets are procedurally generated (CC0-equivalent); downloadable
  Poly Haven/ambientCG/Kenney assets are credited on their catalog cards.
