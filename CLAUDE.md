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

## Layout of the code
- `src/state/` — Zustand store split into slices (`slices/*`): items,
  selection, finishes, doors, time, location, camera, ui (incl. quality +
  snap grid), placement, clipboard, history, remote catalog, installed packs,
  **floorPlan** (editable apartment shell + editor state + saved-plan library).
  Persistence + migrations under `storage/` (layout autosave; `qualityPrefs.ts`
  graphics prefs; `editorPrefs.ts` snap/grid; `floorPlanStore.ts` plan library
  + active custom plan). `schema.ts` is the save/load serializer.
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
  item; parametric items map to a component in `primitives/` (registered in
  `primitives/index.ts`). `defaults/` is the move-in-ready layout.
  `lightEmitters.ts` registers which items emit light at night.
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
  FinishPicker, GraphicsSettings, measurement/credits/help.

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
  hardware; high adds GPU-intensive effects.
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
  (`furnitureSets.ts`); **Tools ▾** groups the Budget panel
  (`furniturePrices.ts`), **Checks** (door-swing clearance, `layout/clearance.ts`
  + `ClearanceOverlay`), **Sun study** (time-lapse), **Walkthrough** (auto camera
  tour + record, in `OrbitCamera`), and **Report** (`ui/report.ts`, printable).
  Multi-select shows an align/distribute panel; items can be **locked**;
  double-click focuses the camera; saved layouts get thumbnails (`slotThumbs`).
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
- **Finish**: add an entry to `materials/builtinCatalog.ts` (`procedural` with
  a pattern, or `solid`). New patterns go in `procedural/generators.ts`.

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
