# Architecture index

The full map of the codebase. Root `CLAUDE.md` holds the hard rules + conventions and
points here; area-specific rules live in path-scoped `CLAUDE.md` files (`src/state/`,
`src/furniture/`, `src/scene/`, `src/ui/`, `src/materials/`). Keep this current in the
same change that reshapes a system.

> **Keep this index ≤250 lines** — one dense line per system, not a manual. When you add
> a system, add a line and trim/merge elsewhere; push deep detail to the path-scoped files.

## Commands (full)
- `npm run dev` (localhost:5173; store on `window.__store`); `npm test`/`test:watch`;
  `npm run build` (= `tsc` + Vite prod build).
- `npm run check`/`check:fix` — **Biome** (format+lint; 2-space/100-col/single-quote/
  no-semicolons/trailing-commas). CI blocks on format+`tsc`+lint; **pre-commit hook**
  (`.githooks/`, auto-installed by `prepare`) runs `biome check --staged` (bypass
  `--no-verify`). `noExplicitAny`=warning (tests); `python/` excluded.
- Docs: **user guide** = VitePress `docs/user/` (`base:/sofa-so-good/docs/`);
  `docs:build`/`build:all` (= `build` then `docs:build` — order matters; `deploy.yml`);
  in-app via `src/ui/docsUrl.ts` (guide only in a built `dist/`, `docs:dev` port 5175).
  **Developer docs** = local-only `docs/developer/` (`docs:dev:developer` 5176).
- `node scripts/shot.mjs <out.png> [waitMs] [evalFile] [actionsJson]` — Puppeteer
  screenshot harness (actions drag/rdrag/wheel/click/type/key/wait; `SHOT_URL` env targets a
  non-default dev port); `crop.mjs`/`perf.mjs`.
- `npm run optimize:glb` (offline LOD pass); `compress:glb-textures <dir> [--etc1s]`
  (offline KTX2/UASTC re-encode; needs `toktx`+`@gltf-transform/cli`); `scraper-server`
  (5174, dev) IKEA scrape SSE; `price-server` (5175, dev) IKEA price lookup.
- `python/scripts/` — offline IKEA scraper + asset tooling (not in the app build).

## Layout of the code
- `src/state/` — Zustand store, `slices/*`: items, selection, finishes, doors, time,
  location, camera, ui (quality+snap+`backdrop`+`uiMode`), placement, clipboard, history,
  remoteCatalog, installedPacks, measurements (+`units`), orientation, notifications,
  **prompt** (`promptText`/`confirmAction`→themed modals), **project** (`designNote`),
  reset, **userAssets** (user GLBs + `IkeaGltfDef`s), **floorPlan**, **appearance**,
  **features** (cmdk/layers/context-menu/onboarding/tour/budgetTarget), **userStyles**.
  `storage/`: autosave + `qualityPrefs`/`editorPrefs`/`appearancePrefs`/`floorPlanStore`/
  `budgetPrefs`; `hydrate*.ts` re-resolve user/IKEA defs + IDB blobs. `schema.ts`=serializer.
- `src/apartment/` — default flat. `constants.ts` = source of truth for walls/doors/
  windows/rooms. `walls/`, `floor/`, `Window`/`Door`/`Ceiling`/`Skirting`. `PlanShell.tsx`
  renders a user-authored plan (extruded walls + per-room floor/ceiling) when active.
  `ceiling/` = per-room ceiling treatments: pure `ceilingModel.ts` `buildCeiling` (tray/coffered/
  dropped → planes + risers, rect-room only, flat fallback) + `RoomCeiling.tsx` (tier-gated:
  risers/cove on High+); both `Ceiling.tsx` (default flat) and `PlanRoomCeiling.tsx` delegate to it
  when a room's `ceiling` config is set (`ceilingDesign` flag).
- `src/floorplan/` — editable plan model: `types.ts` (FloorPlan + area/bounds/polygon
  helpers), `defaultPlan.ts`, `planGeometry.ts` (→ wall boxes + collision walls;
  `isDefaultPlan`), `templates.ts` (18 starter `PLAN_TEMPLATES`: HDB 2/3/4/5-room + Exec/3Gen/Jumbo,
  condo studio/1-bed/1+study/2/3/4-bed/penthouse, terrace — `docs/research/{hdb,condo}-floor-plans.md`),
  `roomDetect.ts`. 2D editor = `ui/floorplan/`.
- `src/furniture/` — catalog + rendering. `builtinCatalog.ts` (parametric defs),
  `catalog.ts` (merges built-ins+packs+user/IKEA; `useCatalogGetter` = stable
  non-rendering accessor), `primitives/` (components registered in `index.ts` +
  `PrimitiveKind`), `GltfModel.tsx`/`gltfRender.ts` (all GLB items), `defaults/`,
  `lightEmitters.ts`. Sub-dirs: `gltf/` (`decoders.ts` Draco@boot, `lod.ts`,
  `textureBudget.ts`, `finishTargets.ts`, `mirrorPlane.ts`); `convert/` (any-format→GLB:
  `formats.ts`/`loadToObject.ts`/`toGlb.ts`/`convertModel.ts`); `optimize/` (`optimizeGlb.ts`
  pure worker-safe weld/prune+Draco+WebP, never-throws; opt-in KTX2 `lib/ktx2encode.ts`);
  `ikea/` (`metadata`/`translate`/`importGroup`/`compatibility`/`detectGroups`/`stacking`/
  `supportPlane`/`thumbnail`/`ikeaSets`); `upload/` (`bulkImport.ts` `prepareModelFile`=
  convert+optimize+`persistUserGlb`, `hashFile.ts` dedupe, `readDrop.ts`, `runImport.ts`
  background job w/ **batched writes** to avoid O(n²) rebuilds); `cabinet/`.
- `src/materials/` — `builtinCatalog.ts` (floors/walls), `procedural/generators.ts`
  (wood/parquet/tile/marble/carpet/concrete/terrazzo/plaster/wallpaper/checker/brick…),
  `furnitureMaterials.ts` (tintable grain + `getSolidMaterial` + `mat:<id>` DLC +
  `getSurfaceMaterial`), `worldUv.ts`, `finishDrop.ts` (drag-to-apply), `convert/`
  (`decodeImage.ts` incl. TGA/TIFF/EXR/HDR, `reencode.ts`→WebP; 16MB cap, KTX2/DDS deferred).
- `src/scene/` — R3F `<Canvas>` + systems: `lighting/`, `Effects.tsx` (bloom+SMAA),
  `quality.ts`+`QualityController`, `ScreenshotController`, `PanoramaController`
  (+`panorama/equirect.ts` — six 90° screen-path renders → CPU equirect; viewer/export in
  `ui/PanoramaModal.tsx`, `panorama` flag), cameras, selection,
  `SceneBackdrop.tsx` dispatcher (City/Park/Hills/Studio); `CityBackdrop.tsx` (instanced two-ring HDB
  estate + rooftop tanks + night-lit windows), `ParkBackdrop.tsx`/`HillsBackdrop.tsx` (instanced trees /
  depth-banded hills), `StudioBackdrop.tsx` (seamless gradient-dome cyclorama) — all share `Ground.tsx`
  + `instancedBatch.tsx`. Main Canvas is **`frameloop="demand"`**:
  `RenderPump.tsx` invalidates only when wanted (`renderDecision.ts` pure tested logic;
  `renderPumpSignal.ts` gates FPS sampling). `InstancedBoxes.tsx` (pure tested
  `bakeInstanceMatrix`) collapses repeat geometry — bookshelf/crib + RoomDivider/CubeShelf/
  FeatureWall/ToyStorage (batten maths in pure `primitives/slatLayout.ts`);
  `ContextLossGuard.tsx` recovers WebGL context loss.
- `src/ui/` — DOM overlays. **CatalogDrawer** (`catalog/`, tab row Catalog/Layers/Packs):
  Catalog = unified grid (`useUnifiedCatalog.ts`) of built-ins/generated/user/IKEA/packs/
  CC0 + Poly Haven, one fuzzy search + browse Sort + favourites/recent (`recentSlice`).
  Layers (`LayersPanel.tsx`, `leftMode`) = Objects tree, select/hide/lock/delete + name
  filter + per-row finish drop target. Packs = downloadable content. Plus InspectorPanel
  (`inspector/`: `label` rename, minimize, price/total, Quick finishes, Apply-to-all,
  Straighten), FinishPicker, WallAccentPicker, GraphicsSettings, BudgetPanel, NavCluster,
  CommandPalette, ContextMenu, Onboarding, HelpModal, Modal, `upload/`/`floorplan/`/
  `toolbar/`/`tour/`/`wizard/`/`ai/`/`auth/`.
- `src/styles/` — design CSS (after Tailwind via `index.css`): `tokens.css` (10 OKLCH
  palettes) + `components`/`parts`/`features`/`flows`/`screens`/`responsive`/`app`.
  Components use the class vocabulary (`.panel`/`.btn`/`.toolbar`/…), never hardcoded colour.
- `python/scripts/` — offline: `ikea_model_scraper.py`, `glb_analysis.py`,
  `categorize.py`, `compatibility.py`, `optimize_glb_lod.mjs`.

## Key systems
- **View / edit split** (`state/editing.ts`): orbit-overview + walk are **view-only**.
  **All editing happens only in the per-room editor**;
  `canEditScene(s)=roomEditor.active && cameraMode==='orbit'` gates every handler. No
  select-vs-rotate tool; orbit freezes only during a drag/gizmo (`rotatingGizmo`+
  `draggingItemId`). Enter via toolbar "Edit a room" or a room-floor click (→ "Enter
  <room>?" confirm, `enterRoomConfirm.ts`).
- **Per-room editor** (`scene/RoomEditorScene.tsx`, `apartment/roomShell.ts`+
  `RoomShell.tsx`, `uiSlice.roomEditor`): the **sole editing surface**. Separate
  lightweight `<Canvas>` (flat light, DPR 1, no shadows/IBL/post), pinned to Performance
  + Original assets (restored on exit); reuses every controller on the **same live
  `store.items`**. `roomShell(roomId)` clips shared walls to the footprint; `<RoomShell>`
  hides walls on the camera's outward side. Toolbar = exit + room-switcher `<select>`,
  Esc exits. **Walk bounded to the room** (`buildRoomCollisionWalls`).
- **Design system & theming** (`appearanceSlice`, `appearancePrefs`): 5 themes
  (Clay/Kampong/Porcelain/Estate/Harbour) × light/dark = 10 OKLCH palettes via
  `[data-theme]`+`[data-mode]` (pre-paint inline script, `hdb_appearance`, Auto=OS).
  Toolbar **Appearance** popover = theme + Light/Dark/Auto + **Simple/Pro** `uiMode`
  (Simple hides advanced clusters + collapses inspector sections; floor-plan always
  available). `useIsMobile.ts` ≤640px hook; `body.mobile` → bottom-sheets + minimal bar.
- **GLB Asset Designer** (`furniture/glbEdit/`, `ui/glbEditor/GlbDesignerDialog.tsx`,
  `featuresSlice.glbDesignerOpen`): compose a custom asset from primitive shapes
  (box/cylinder/sphere/cone/pyramid/capsule/torus/wedge — pure tested `editSpec.ts` `SHAPE_KINDS`;
  geometry via `buildObject.ts` `partGeometry` + per-part PBR via `partMaterial` — both shared by
  the live preview so it can't drift; each part carries colour + roughness + metalness +
  emissive glow + opacity)
  and/or start from an uploaded GLB
  (uniformly scaled) to make a variant; live R3F preview (`buildEditedObject`), then
  `saveAsset.ts` exports via `exportGlb` (GLTFExporter) → `persistUserGlb` so it lands
  in the catalog like any upload — or, with **Update original** (when built from a user asset),
  re-homes the export under the source's id via `replaceUserFurniture` so placed copies update
  (`buildOverwriteDef`, pure-tested). Launched from ⌘K. TODO: per-component recolour/
  hide of a source GLB's meshes (v2).
- **Onboarding/tour/wizard**: **Onboarding** (`Onboarding.tsx`, `hdb_onboarded`),
  **Product tour** (`ui/tour/`, `tourOpen`/`tourStep` — interactive click-through
  spotlight; only "Skip tour"/Esc ends it; location prompt suppressed while open),
  **Smart Start** (`ui/wizard/`, one-click furnish+finish over presets `applyLayoutPreset`; on a
  **custom plan/template** it instead seeds a per-room kit + runs the plan arranger via pure
  `furniture/furnishPlan.ts` `furnishPlanItems`, so any template furnishes in one click).
- **Quality tiers** (`quality.ts`): **render** `RenderTier` = Performance/Medium/High/
  Maximum. **Performance is the default for everyone** (flat: no shadows/IBL/post, DPR 1);
  Medium=+sun shadows+IBL; High=+post (N8AO+Bloom+HueSat+Vignette+SMAA); Maximum=+cinematic
  (full-res AO + film grain + chromatic aberration, `EffectsImpl` props from `aoFullRes`/`cinematic`).
  `QualityController` only steps
  **down** for 30fps, off once pinned. **Asset quality** = separate `AssetTier`
  (low/medium/high=Original LOD), follows render (`null`=Auto) but pinnable + FPS-immune.
  **Tone-mapping look** (`look.ts` `ToneMappingMode` Filmic/AgX/Neutral → three constant via
  `toneMappingThree.ts`; `Lighting` sets `gl.toneMapping`+exposure per-frame): user-selectable
  view transform, all tiers, persisted in qualityPrefs. Filmic = default (historical ACES). A user
  **exposure** multiplier (`clampExposure`, Graphics slider) rides on top of the auto-exposure.
- **GLB models + LOD** (`furniture/gltf/`): bundled CC0 + user + IKEA via one loader.
  `optimize:glb` writes `-low`/`-medium` (≤512/1024px WebP + ~50/75% tris, Draco);
  `lod.ts` picks per asset tier; `textureBudget.ts` = last-resort downscale. `--ktx2`
  emits Basis-Universal (needs `toktx`, else WebP).
- **Procedural materials**: `procedural/generators.ts` paints one tiling tile per finish
  from seeded noise; world-space UVs tile at fixed physical scale. `furnitureMaterials.ts`
  = tintable wood/stone/fabric/concrete/rattan + `getSolidMaterial`.
- **Material realism** (`materials/materialRealism.ts`, pure): `sheenLayer`(velvet/satin/leather)
  + `clearcoatLayer`(gloss/ceramic/stone) drive `MeshPhysicalMaterial` upgrades in
  `furnitureMaterials.ts`; `getGlassMaterial(tier,…)`/`GlassMaterial.tsx` = **tier-gated** real
  transmission (High/Maximum) vs cheap transparency (Performance/Medium). `GLOSSY_ENV_INTENSITY`
  boosts IBL on glossy finishes (free on Performance — no IBL there).
- **DLC materials on furniture**: finish value `mat:<id>` applies any catalog finish
  (incl. CC0 PBR). `FurnitureMaterialLoader` builds into the shared cache + bumps
  `materialEpoch`; `getSurfaceMaterial` returns it. **Drag-apply** (`materials/finishDrop.ts`):
  draggable swatches → drop on Objects-list rows.
- **Lighting / time of day**: SunCalc → `altitudeCurve.ts` → directional sun +
  hemisphere + IBL + sky. Fixtures emit capped day-gated night point lights; shades glow
  via `fixtureGlow`.
- **Parametric cabinet engine** (`furniture/cabinet/`): mm-customisable modular cabinets.
  `cabinetModel.ts` = pure tested `buildCabinet(spec)` → flat `CabinetPart[]` (toe-kick/
  carcass/countertop/cornice + slab·shaker·drawers·glass·open fronts; structurally sound).
  `CabinetModule.tsx` renders via `CabinetBase`/`Wall`/`Tall`; `cabinetCatalog.ts` = 3
  defs spread into `BUILTIN_CATALOG`.
- **IKEA model import** (`furniture/ikea/`, `userAssetsSlice`): scraper emits per-group
  `metadata.json` + `<finish>.glb` + images; upload auto-detects groups; `importGroup.ts`
  → one `IkeaGltfDef` (`variants[]`, blobs in IDB, category/clearance/price from metadata).
  Active finish in `props.variant`; thumbnail = downscaled photo. Non-CC0 IKEA
  (attribution shown, not redistributed); round-trips via `schema.ts`.
- **Combining compatible models** (`ikea/stacking.ts`, `supportPlane.ts`): combine per a
  **placement kind** from the matched "Complete with" category — **vertical** (mattress→
  bed: bottom on geometric support plane, `detectSupportPlaneY` cached), **around**
  (chairs→table: floor, front edge, facing), **modular** (sofa: snap to mating edge).
  `combineOnto` sets `props.surfaceHeight`/`groupId`; triggers = inspector "Place on
  this" + drag-snap.
- **Downloadable content** (`catalog/packs/registry.ts`, `ui/catalog/PacksTab.tsx`):
  declarative `AVAILABLE_PACKS`; `visiblePacks(isDev)` hides `devOnly`. **Gating rule**:
  CORS/programmatic download → prod; needs proxy/sidecar/hand-download → `devOnly`. Kinds
  `'poly-pizza'` (prod), `'zip'` (Kenney dev), `'ikea-live'` (dev sidecar `scraper-server.mjs`
  → `public/assets/ikea/`, SSE), `'manual'`. **Remote material providers**
  (`catalog/remote/providers/`): Poly Haven (CORS, prod) + ambientCG (proxy, dev), gated
  by `activeProviderIds`/`PROD_PROVIDER_IDS`. Add a source: poly-pizza-style client
  reusing `buildEntry`/`commit`, a `RemoteProvider`, or a `'manual'` entry.
- **Wall elevations** (`elevation/projectElevation.ts` pure → `WallElevation` per plan wall, reusing
  the collision OBB helpers; `ui/elevation/elevationSvg.ts` renders to a palette-injected SVG string
  shared by the `ElevationPanel` (token colours) + the report). The vertical counterpart to the plan.
- **FF&E schedule** (`ffe/ffeSchedule.ts` pure → per-(room,def,variant) rows: source/SKU/real dims/
  qty/pricing, reusing `pointInRoom` + `itemPrice`). Rendered as the report's procurement table.
- **Drawing set** (`ui/drawingSet.ts` + `openDrawingSet.ts`): a paginated multi-sheet "plan set"
  (cover + plan + per-wall elevations + lighting + FF&E, title blocks, `@page` A4) reusing all the
  pure renderers — the formal counterpart to the one-page `report.ts`.
- **Shoppable buy-list** (`ui/shoplist.ts` pure `buildShopList`+`buildShopListHtml` →
  per-retailer-grouped buy-list HTML: qty/unit/line totals per (def,variant,room), grand + per-retailer
  totals, budget under/over; `openShoplist.ts` opens the window synchronously then dynamic-imports the
  builder). Flag `shopExport` (simple, prod); File menu + mobile File + ⌘K. IKEA product links/SKUs only
  with retailer defs; links dev-gated via `ikeaLive` (licensing) — generic export ships in prod.
- **Lighting plan** (`lighting2d/lightingPlan.ts` pure → fixtures from the `LIGHT_EMITTERS` registry
  with world pos/height/intensity/coverage + a schedule, honouring per-item `enabled()` gates;
  `ui/lighting2d/lightingPlanSvg.ts` draws walls + coverage circles + glyphs).
  `lighting2d/roomLux.ts` (pure) adds a per-room average-lux estimate (lumen method: candela → 4π
  lumens × calibration, utilisation factor 0.45, ÷ floor area) statused ok/low/high against
  recommended residential bands per room kind (`roomKindFromName`). Surfaced in the Drawings panel
  (badge list), the report and the drawing set (`roomLuxTableHtml`). Same pure-core →
  palette-injected-SVG pattern as elevations.
- **Design score** (`analysis/designScore.ts` pure → weighted 0–100 + A–F grade over 5 categories:
  clearance/furnishing/circulation/daylight/lighting, each with actionable issues). Reuses the
  overlap/wall-clip/door/walkway/daylight checks + 2 new heuristics (furnishing coverage, per-room
  emitter coverage). `ui/DesignScorePanel.tsx` (`.aux`: grade dial + bars + fixes); Tools + ⌘K; +
  a section in the printable `report.ts`. Guards a partial plan (missing walls/openings).
- **Renovation estimate** (`analysis/renovationCost.ts` pure → `estimateRenovation(floorAreas,wallAreas)`:
  indicative SG supply+install $/m² per finish category, `RENO_RATES` table). The report's Renovation
  estimate section (finishes subtotal + combined furniture+finishes total).
- **Accessibility check** (`analysis/accessibility.ts` pure → `buildAccessibilityReport(plan)`:
  door clear widths vs 0.85 m + 1.5 m wheelchair turning circle per habitable room; BCA-Code rule of
  thumb). `ui/AccessibilityPanel.tsx` (`.aux`, Tools + ⌘K) + the report's Accessibility section.
  Plan-only (reads for a bare shell).
- **Collision** (`collision/placement.ts`): `canPlace(item,def,{others,defs,doors,
  walls?})`; `findItemOverlaps(items,defs)` runs the same furniture-vs-furniture
  rule across the whole design and `findWallClips(items,defs,walls)` flags pieces
  embedded in a wall (both power the Clearance panel's checks); items
  carry a vertical span + `mounted`/`noClip`. `placementWalls.ts`
  centralizes wall selection (room editor → solid perimeter; upper storeys → own
  walls). All cross-item/wall scans are **storey-scoped** (F13/ML3): `itemsCollide`
  + `findNarrowGaps` gate pairs on `levelId`, `levelWallClips.ts
  findWallClipsByLevel` resolves each item's own level's walls (used by score /
  report / Clearance panel), and walk-mode `buildWalkBlockers` keeps only
  ground-floor items (walker can't climb yet — ML6). **Wall reveal**
  (`apartment/walls/`): exterior walls between camera and interior fade out.
- **Snap + drag aids + rotate** (`scene/snap.ts`, `GridOverlay.tsx`, `DragController`,
  `selection/RotateGizmo.tsx`+`rotateGizmoMath.ts`): grid 10/25/50cm/1m; align
  (`AlignmentGuides`), flush-to-wall (`wallSnap.ts`, off when grid-snap on), gap HUD
  (`clearanceGap.ts`); touch rotate ring (single 15°, multi rigid centroid, Shift=free,
  green/red validity, complements **R** 90°).
- **Floor plan editor** (`ui/floorplan/`, `floorplan/`): 2D editor of store `floorPlan`
  — walls, rectangular/L-shape (`extension`)/free-`polygon` rooms (Polygon + Auto-room),
  doors/windows, ceiling height (global + per-room), grid+corner snap, per-room floor
  finishes, length labels. Per-room **floor + wall finishes** resolve through
  `floorplan/roomFinishes.ts` (live `finishes` slice → `PlanRoom.floor`/`wall` → default);
  the finish setters write through to the active plan and plan activation prunes stale
  custom-room keys; `PlanRoomShell` paints plan walls via `apartment/walls/PlanWallFinishFace`. **Split** + draggable endpoint handles (`moveWallVertex`) for
  non-orthogonal shapes. Live furniture as `canPlace`-checked footprints. **`P` toggles
  2D⇄3D** — the binding lives in `controls/planEditorHotkey.ts` (always mounted via App,
  modal-guarded), NOT in the lazy-mounted editor, so it opens from the 3D view too.
  **Reference backdrop** (Scale → `mPerPx`, IDB) + **"AI walls"** (BYO-key).
  Undoable + persists (`floorPlanStore.ts`).
- **Toolbar** (`ui/toolbar/`): scrollable icon island (`IconButton` + `ToolbarMenu`).
  Menus: **View** (Orbit/Walk + top/reset/turntable + saved views `cameraViewsSlice`),
  **Scene** (time slider + Lighting + Backdrop + sun `CompassModal`), **Edit** (step into
  room / floor-plan), **Arrange** (Tidy + Sets/Presets/Styles pick→Apply `PickApply`),
  **Tools** (Budget/Checks/Sun study/Walkthrough/Report), **File**, **Graphics**. Three
  states: overview/room-editor/walk. Tooltips+menus via `Popover`; shortcut chips from
  `controls/keybindings.ts`. Mobile: minimal bar → bottom action-sheet accordion (`MobileToolbar.tsx`).
- **Keyboard shortcuts** (`controls/`): `keybindings.ts` (the key map) + `useKeyboard.ts`
  (global keydown hook; skips repeats + editable targets) + `modalGuard.ts` (module-level
  open-modal counter — the shared `Modal` primitive and the modal-style overlays register
  while open, and every global keydown handler early-returns via `isAnyModalOpen()`, so
  hotkeys can't fire behind a dialog; Escape stays per-modal, ⌘K/undo are suppressed).
- **Walk-mode** (`scene/cameras/FirstPersonCamera.tsx`, `walkInput.ts`, `ui/walk/`): fine
  = Pointer Lock (WASD+mouse, Esc; native banner unstyleable), coarse = `WalkJoystick` +
  drag-look; `WalkHud`, `Crosshair`. **Mobile viewport** (`index.html`, `responsive.css`,
  `MobileLongPress.tsx`): `viewport-fit=cover`+`100dvh` full-bleed canvas (controls in
  `env(safe-area-inset-*)`); `body.mobile` kills text-select/callout/double-tap-zoom;
  long-press → `contextmenu`. **FPS** (`FpsCounter.tsx`): DOM pill, rAF, `showFps`.
- **Design tools** (Arrange/Tools): **Sets** (`furnitureSets.ts` + IKEA `ikeaSets.ts`),
  **Checks** (`layout/clearance.ts`), **Sun study**, **Walkthrough** (tour+record),
  **Measure** (`TapeMeasure.tsx`, Distance/Area, 📌 Pin → persistent `annotations`),
  **Report** (`ui/report.ts`). Multi-select align (centre + footprint-aware edge) /
  even-gap distribute (`layout/alignDistribute.ts`) / bulk rotate ±90° / face-into-room /
  snap-to-wall (`layout/faceWall.ts`) / arrange-as-run (`layout/arrangeRun.ts`, butt a kitchen
  run flush along a wall) / mirror (`layout/mirrorRoom.ts` `mirrorItemX`). The wall/orient/
  mirror actions live in `layout/selectionActions.ts`, shared by the inspector + ⌘K. Lock;
  double-click focus.
- **Measurement units** (`utils/measurement.ts`, `measurementsSlice.units`): metric/
  imperial display toggle (`editorPrefs`); metric canonical, `formatLength`/`formatArea`/…
  the single source. **Groups** (`groupsSlice.ts`): shared `groupId` = emergent group
  (first click→group, second/Alt drills in; rigid centroid rotate; auto-dissolves below
  2; save schema **v2**).
- **Production feature panels** (mutually-exclusive `.aux` slot): **Swap** (`SwapModal`),
  **Clearance** (`ClearancePanel`), **Versions** (`VersionsPanel` — save/restore/Compare
  `versionDiff.ts` + Export/Import `.sofa.json` `designFile.ts`), **History** (`HistoryPanel`
  — `jumpHistory`, `historyTimeline.ts`), **Shopping + Collections** (`BudgetPanel` + heart
  `fav-btn`; budget target → over/under + Spend by room/category; `ui/BudgetHud`; pure
  `itemsCost`/`spendByRoom`/`shoppingGroups`/`shoppingCsv`), **Share** (`ShareModal` —
  `sofa:export` PNG + photoreal/link), **360° panorama** (`scene/PanoramaController` six-face
  capture → pure `scene/panorama/equirect.ts` CPU assembly → `ui/PanoramaModal` drag-to-look
  viewer + PNG, `panorama` flag, pro).
- **Mirror reflections** (`primitives/MirrorMaterial.tsx`): real planar reflection on
  High/Maximum (`mirrorReflectorConfig(tier)`), fake-shiny pane below. Uploaded GLB
  mirrors via inspector "Reflective surface" (`props.reflective`, `gltf/mirrorPlane.ts`).
- **Live pricing/AI/sharing**: dev-only "Live IKEA SG prices" (`livePrice.ts`/`price-server.mjs`,
  fails soft to `furniturePrices.ts`); **AI photoreal** (`ui/ai/`, BYO-key i2i in Share);
  **Plan sharing** (`planShare.ts`, backend-less `#/plans/<code>`); **3D design link**
  (`designShare.ts`, `#/design/<code>` — same codec, session noise + non-portable
  upload defs stripped, ~16 KB code budget with a `.sofa.json` fallback message,
  tighter bomb guard; unknown-defId items dropped with a count on open).
- **Feature flags** (`features/featureFlags.ts`, `featureFlagsSlice`, `ui/FlagsPanel.tsx`):
  `FEATURE_FLAGS` = single source of what ships; pure `resolveFlags(isDev, overrides,
  isAdmin)` — prod locked, dev/admin unlocks `devOnly`+overrides. **Auth** (`authSlice`,
  `LocalAdminProvider`, `VITE_ADMIN_PASSWORD`) unlocks dev-only features — **NOT a security
  boundary**.
- **Loading + fast boot** (`ui/loading/`, `storage/bootstrap.ts`, `bootPhase`/`loading`):
  `main.tsx` registers decoders then renders immediately; async `runBootstrap()` (IDB +
  autosave restore + default seed *after* hydration) flips `bootPhase`→`'ready'`.
  `LoadingOverlay` covers boot + orbit↔walk + room enter/exit.

## Adding content
- **Furniture**: add `primitives/<Name>.tsx` (`{props}`), register in `index.ts` +
  `PrimitiveKind`, add a `ParametricDef` to `builtinCatalog.ts`. Set `verticalSpan`/
  `mounted`/`noClip` for non-floor; `lightEmitters.ts` to emit light; `furniture/defaults/`
  to ship in the flat (collision-checked by `defaultLayout.test.ts`). 15 categories
  (`FurnitureCategory`: beds/seating/tables/storage/kitchen/bathroom/appliances/lighting/
  decor/textiles/outdoor/electronics/kids/laundry/others=catch-all). A new category must
  update the union, `FURNITURE_CATEGORIES`, every exhaustive `Record<FurnitureCategory,…>`
  consumer, + `CategoryTabs`/`CategoryIcon`. Category auto-detected for imports.
- **Finish**: add to `materials/builtinCatalog.ts` (`procedural` w/ a pattern, or
  `solid`); new patterns in `procedural/generators.ts`.
- **GLB models**: bundled + user uploads go through `GltfModel`; set collision flags;
  run `optimize:glb`. **Bundled pipeline** (`scripts/asset-pipeline/`): drop `<name>.glb`
  (+ optional `.glb.json` sidecar) into `public/assets/furniture/`, `npm run index-assets`
  → regenerates `generatedCatalog.ts` + `CREDITS`. Must be floor-anchored + centred (no
  runtime fit). License CC0 default, may be CC-BY (sidecar → inspector `SourceLine`).
