# Architecture index

The full map of the codebase. Root `CLAUDE.md` holds the hard rules + conventions and
points here; area-specific rules live in path-scoped `CLAUDE.md` files (`src/state/`,
`src/furniture/`, `src/scene/`, `src/ui/`, `src/materials/`). Keep this current in the
same change that reshapes a system.

> **Keep this index ≤250 lines** — one dense line per system, not a manual. When you add
> a system, add a line and trim/merge elsewhere; push deep detail to the path-scoped files.

## Commands (full)
- `npm run dev` (localhost:5173; store on `window.__store`); `npm test`/`test:watch`;
  `npm run build` (= `tsc` + Vite prod build). `predev`/`prebuild` run `copy-decoders`
  (self-hosts the Draco decoder into `public/draco/`); `npm run copy-decoders` runs it manually.
- `npm run deadcode` — **knip** (unused files/exports/deps report; `knip.json`).
- `npm run check`/`check:fix` — **Biome** (format+lint; 2-space/100-col/single-quote/
  no-semicolons/trailing-commas). CI blocks on format+`tsc`+lint; **pre-commit hook**
  (`.githooks/`, auto-installed by `prepare`) runs `biome check --staged` (bypass
  `--no-verify`). `noExplicitAny`=warning (tests); `python/` excluded.
- Docs: **user guide** = VitePress `docs/user/` (`base:/sofa-so-good/docs/`);
  `docs:build`/`build:all` (= `build` then `docs:build` — order matters; `deploy.yml`);
  in-app via `src/ui/docsUrl.ts` (guide only in a built `dist/`, `docs:dev` port 5175).
  **Developer docs** = local-only `docs/developer/` (`docs:dev:developer` 5176).
- `node scripts/shot.mjs <out.png> [waitMs] [evalFile] [actionsJson]` — Puppeteer legacy
  one-shot screenshot harness (actions drag/rdrag/wheel/click/type/key/wait; `SHOT_URL`
  env targets a non-default dev port).
- `node scripts/shot.mjs --scenario <file.json|file.mjs> [--out-dir <dir>]` — **scenario
  mode** (recommended for multi-step journeys): ordered named steps run in one browser
  session with structured `STEP n/N name … OK (1.2s)` logging; failure dumps a
  `failed-<name>.png`; step types: eval/waitFor/click/drag/rdrag/wheel/key/type/select/
  wait/screenshot/store/viewport. Scenario schema in `scripts/lib/validate.mjs` (pure,
  unit-tested). Worked example: `scripts/scenarios/first-run.json`. Playbook:
  `docs/visual-verification-playbook.md`.
- `crop.mjs`/`perf.mjs`.
- `npm run optimize:glb` (offline LOD pass); `compress:glb-textures <dir> [--etc1s]`
  (offline KTX2/UASTC re-encode; needs `toktx`+`@gltf-transform/cli`); `scraper-server`
  (5174, dev) IKEA scrape SSE; `price-server` (5175, dev) SG retailer price lookup
  (IKEA/Courts/HipVan/Castlery).
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
  `isDefaultPlan`), `templates.ts` (the registry — builders in `templates/{hdb,condo,shared}.ts`;
  19 starter `PLAN_TEMPLATES`: HDB 2/3/4/5-room + Exec/3Gen/Jumbo +
  two-storey Executive Maisonette, condo studio/1-bed/1+study/2/3/4-bed/penthouse, two-storey
  terrace + mezzanine loft (real `upperLevels`, ML6a) — `docs/research/{hdb,condo}-floor-plans.md`;
  each carries a `category` {housingType › projectName › apartmentType} and `templateCategoryTree`
  groups them for the cascading `ui/floorplan/TemplatePicker.tsx`; default = HDB › Serangoon North
  Vista › 4-Room; `ui/floorplan/SaveTemplateModal.tsx` prompts for the category on save),
  `roomDetect.ts`, `planIntegrity.ts` (stray-element checks — walls joined to no other wall,
  rooms touching no other room, openings off any wall — drawn red in the editor behind the
  `planIntegrity` Pro flag), `levels.ts` (multi-storey resolution layer F13: top-level arrays = ground,
  `upperLevels` adds storeys; `planLevels`/`levelById`/`levelAsPlan`/`allPlanRooms`/
  `withLevelGeometry` — see `docs/research/multi-level-design.md`),
  `wallArc.ts` (curved walls — `PlanWall.arc` bulge → quadratic-Bézier chord sub-segments reused by
  `wallBoxes`/`planCollisionWalls`/room detection; 2D bulge handle; `curvedWalls` flag, openings
  disabled on curves), `slopedWall.ts` (sloping walls — `PlanWall.topHeightEnd` → a prism rendered by
  PlanShell's `SlopedWallMesh`; `slopingWalls` flag, openings disabled). Each wall may carry a
  per-wall baseboard override (`PlanWall.baseboard` height/colour/hidden → PlanShell skirting;
  `wallBaseboard` flag, custom plans only). Furniture also supports multi-axis tilt (`pitch`/`roll`, `furniture/tiltRotation.ts`,
  `tiltFurniture` flag). 2D editor = `ui/floorplan/`.
- `src/furniture/` — catalog + rendering. `builtinCatalog.ts` (assembles the catalog from
  per-category `defs/<category>.ts` modules + the `cabinet/` engine; also derives
  `BUILTIN_BY_CATEGORY`),
  `catalog.ts` (merges built-ins+packs+user/IKEA; `useCatalogGetter` = stable
  non-rendering accessor), `primitives/` (components registered in `index.ts` +
  `PrimitiveKind`), `GltfModel.tsx`/`gltfRender.ts` (all GLB items), `defaults/`,
  `lightEmitters.ts` (fixture registry + `resolveEmitterSpec`; any item with `props.lightOn`
  emits via the `OVERRIDE_EMITTER` fallback — `itemAsLight` flag). Sub-dirs: `gltf/` (`decoders.ts` Draco@boot, `lod.ts`,
  `textureBudget.ts`, `finishTargets.ts`, `mirrorPlane.ts`); `convert/` (any-format→GLB:
  `formats.ts`/`loadToObject.ts`/`toGlb.ts`/`convertModel.ts`); `optimize/` (`optimizeGlb.ts`
  pure worker-safe weld/prune+Draco+WebP, never-throws; opt-in KTX2 `lib/ktx2encode.ts`;
  `lodVariants.ts` in-browser `-low`/`-medium` tier generation for uploads — meshopt simplify
  + tier texture caps from `gltf/lod.ts` `TIER_BUDGETS`, stored in IDB under
  `<assetId>:lod-<tier>` keys, routed by the `lod.ts` variant registry);
  `ikea/` (`metadata`/`translate`/`importGroup`/`compatibility`/`detectGroups`/`stacking`/
  `supportPlane`/`thumbnail`/`ikeaSets`); `upload/` (`bulkImport.ts` `prepareModelFile`=
  convert+optimize+`persistUserGlb`, `hashFile.ts` dedupe, `readDrop.ts`, `runImport.ts`
  background job w/ **batched writes** to avoid O(n²) rebuilds); `cabinet/`.
- `src/materials/` — `builtinCatalog.ts` (floors/walls), `procedural/generators.ts`
  (wood/parquet/tile/marble/carpet/concrete/terrazzo/plaster/wallpaper/checker/brick…),
  `furnitureMaterials.ts` (tintable grain + `getSolidMaterial` + `mat:<id>` DLC +
  `getSurfaceMaterial`), `worldUv.ts`, `finishDrop.ts` (drag-to-apply core; canvas drop =
  `scene/FinishDropSurface.tsx` + `scene/finishDropTarget.ts`, commit = `state/finishDropApply.ts`), `convert/`
  (`decodeImage.ts` incl. TGA/TIFF/EXR/HDR/KTX2/DDS, `reencode.ts`→WebP; 16MB cap; `decodeGpuTexture.ts` handles KTX2+DDS via pure-JS or GPU readback).
- `src/scene/` — R3F `<Canvas>` + systems: `lighting/`, `Effects.tsx` (bloom+SMAA),
  `quality.ts`+`QualityController`, `ScreenshotController`, `PanoramaController`
  (+`panorama/equirect.ts` — six 90° screen-path renders → CPU equirect; viewer/export in
  `ui/PanoramaModal.tsx`, `panorama` flag), cameras, selection,
  `SceneBackdrop.tsx` — the surroundings are a **flat equirectangular photo as `scene.background`**
  (skybox; **zero per-frame draws**) shown **in walk mode only** (seen through windows); orbit renders the
  plain procedural sky with no surroundings (`isPhotoBackdropActive(kind, cameraMode, hasCustom)` gates it;
  `Sky.tsx` hides its dome when active). Presets `city/dusk/park/hills` bake procedurally
  (`backdropEquirect.ts` + pure `backdropHorizon.ts` buildings/treeline/hills generators); `custom` is a
  **user-uploaded photo** (persisted in IDB via `storage/walkBackdrop.ts`, hydrated on boot, controlled by
  `ui/scene/BackdropUpload.tsx` + the `customBackdrop` flag); `none` = plain sky. (The legacy instanced 3D
  City/Park/Hills/Studio estates were removed.) Main Canvas is **`frameloop="demand"`**:
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
  Esc exits. **Walk bounded to the room** (`buildRoomCollisionWalls`). On entry the orbit
  camera **fits the whole room to the viewport** (`OrbitCamera` room branch → aspect-aware
  `fitDistance`, the same helper as the whole-plan dollhouse), so the room just fills the
  screen on any aspect ratio.
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
  emissive glow + opacity, plus an optional **texture finish** — GE3c: `ShapePart.finish` =
  `mat:<id>`, the same furniture finish vocabulary placed items use. The picker lives in
  `ui/glbEditor/PartInspector.tsx` (the extracted per-part edit panel), reusing the inspector's
  `useSurfaceMaterialOptions` dropdown + `QuickFinishes` swatch row; `EnsureFurnitureMaterials`
  (the reusable body of `FurnitureMaterialLoader`) builds picked ids into the shared cache, and
  `partMaterial` resolves the finish to a clone of the cached material — solid-colour fallback
  while unbuilt/unknown, never a crash. The texture is **baked into the exported GLB** (like
  the solid colours), so the saved asset needs no `mat:` re-resolution; CSG results gain
  box-projected UVs (`boxProjectUvs`) so a finish tiles on them too)
  and/or start from an uploaded GLB
  (uniformly scaled) to make a variant; live R3F preview (`buildEditedObject`), then
  `saveAsset.ts` exports via `exportGlb` (GLTFExporter) → `persistUserGlb` so it lands
  in the catalog like any upload — or, with **Update original** (when built from a user asset),
  re-homes the export under the source's id via `replaceUserFurniture` so placed copies update
  (`buildOverwriteDef`, pure-tested). **Combine (boolean)**: with a part selected, pick a
  second part ("with…") and union/subtract/intersect — `csgCombine.ts` bakes each part's
  transform into its geometry, runs `three-bvh-csg` (dynamic-imported at the call site so it
  stays out of the boot bundle), and replaces both with one `mesh` part (baked triangles in
  `ShapePart.geometry`, re-centred on the result bounds, first part's material; degenerate
  results throw → toast). Pure helpers (`canCombineParts`/`bakedPartGeometry`/
  `meshPartFromGeometry`/`replaceWithCombined`) are tested. **Drag gizmo**: the selected part
  gets a drei `TransformControls` gizmo in the preview (Move/Rotate/Scale segmented control
  overlay + G/R/S keys in-dialog; orbit auto-pauses while dragging via `makeDefault`). A
  finished drag is written back through the SAME `updatePart` path as the numeric inputs —
  `gizmoWriteBack.ts` `gizmoPatch` (pure, tested) coalesces per drag-END and snaps to 5 mm /
  1°; `mesh` parts hide Scale (triangles are baked). Launched from ⌘K. TODO:
  per-component recolour/hide of a source GLB's meshes (v2).
- **Onboarding/tour/wizard**: **Onboarding** (`Onboarding.tsx`, `hdb_onboarded`) is the
  **first** first-run surface — fires on clean profile, bot decision extracted to
  `ui/bootDecision.ts` (pure, tested). Carousel step 3 offers "Take the guided tour" as the
  ONLY automatic entry into the **Product tour** (`ui/tour/`, `tourOpen`/`tourStep` — interactive
  click-through spotlight; only "Skip tour"/Esc ends it). The overlay root is
  `pointer-events:none` (blockers + card re-enable) so the spotlight hole genuinely passes
  taps/clicks to the real control on **both** desktop and mobile. On **mobile** the toolbar
  targets live in the hamburger sheet, so each step carries a `mobile` config (`tourSteps.ts`):
  the tour opens the sheet and selects the target's section in the icon rail (via
  `data-tour-section`/`data-tour` hooks + `aria-current` in `MobileToolbar`) to spotlight the
  real control, falling back to a centred card for conceptual steps with no control
  (move/customise, finishes); it closes the sheet on unmount. Step order keeps the overview-only
  controls (View, Scene, Edit) *before* the "Edit a room" step that enters the editor — Scene +
  Edit are hidden in the room editor (desktop `Toolbar` and the mobile sheet both gate them on
  `!roomEditorActive`), so they'd otherwise have no live target.
  **Location prompt suppressed while `onboardingOpen || tourOpen`** (no stacking) — so it always
  surfaces last, after the tour. Replay via Help (?) or ⌘K.
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
  `lod.ts` picks per asset tier (HEAD-probe for `-low.glb` siblings; a **variant registry**
  for uploads, whose in-browser-generated tiers live in IDB as blob URLs — registered at
  persist + rehydration); `textureBudget.ts` = last-resort downscale. `--ktx2`
  emits Basis-Universal (needs `toktx`, else WebP).
- **Procedural materials**: `procedural/patterns/<family>.ts` paint one tiling tile per finish
  from seeded noise (over the shared `procedural/fieldKit.ts` buffers); `procedural/generators.ts`
  owns size/caps + the `PATTERN_FN` dispatch + canvas→texture. World-space UVs tile at fixed scale. `PATTERN_SIZE_CAP` declares
  the max useful resolution per pattern (smooth patterns cap at 256²; high-frequency geometric
  patterns cap at 512²); `effectivePatternSize(pattern)` clamps to `min(BASE_SIZE, cap)` so
  smooth patterns stay at 256 even on Medium+ tiers — saving GPU memory with no visible loss.
  `QualityController` sets `BASE_SIZE` to 256 on Performance, 512 on Medium+.
  **C271 worker**: `buildMaterial` immediately generates a sync texture (no first-paint delay),
  then `runProceduralWorker.ts` fires a single shared `Worker`
  (`procedural.worker.ts`) that re-renders via `OffscreenCanvas` and returns three
  `ImageBitmap`s; the main thread hot-swaps the maps in-place and calls
  `notifyProceduralSwap()` → `RenderPump` renders one settle frame. Graceful degradation:
  if `OffscreenCanvas`/`Worker` absent or worker errors, the sync textures stay permanently.
  `furnitureMaterials.ts` = tintable wood/stone/fabric/concrete/rattan + `getSolidMaterial`.
  The fabric weave/seam/wrinkle normal (RZ6) is built by the pure
  `procedural/upholsterySeams.ts` `buildUpholsteryHeight()` generator (woven micro-texture +
  soft wrinkle + a faint panel-seam channel & topstitch; deterministic, unit-tested), baked once
  into a shared 256² normal singleton behind the `pbrSurfaces` flag (off → the legacy clean weave).
- **Material realism** (`materials/materialRealism.ts`, pure): `sheenLayer`(velvet/satin/leather)
  + `clearcoatLayer`(gloss/ceramic/stone) drive `MeshPhysicalMaterial` upgrades in
  `furnitureMaterials.ts`; `getGlassMaterial(tier,…)`/`GlassMaterial.tsx` = **tier-gated** real
  transmission (High/Maximum) vs cheap transparency (Performance/Medium). `GLOSSY_ENV_INTENSITY`
  boosts IBL on glossy finishes (free on Performance — no IBL there).
- **DLC materials on furniture**: finish value `mat:<id>` applies any catalog finish
  (incl. CC0 PBR). `FurnitureMaterialLoader` builds into the shared cache + bumps
  `materialEpoch`; `getSurfaceMaterial` returns it. **Drag-apply** (`finishDnd` flag,
  simple tier; desktop-only — touch keeps tap-to-apply): `materials/finishDrop.ts` =
  payload + decision table; picker swatches drag onto Objects-list rows **or the 3D
  canvas** — `scene/FinishDropSurface.tsx` (mounted in both Canvases) handles native
  `dragover`/`drop` on the canvas element, raycasts manually from the drop coords, and
  `scene/finishDropTarget.ts` classifies the hit via `userData` tags (`itemId` on item
  root groups; `finishTarget {kind,roomId}` on floor meshes + interior wall faces,
  skipping invisible/untagged hits). Both surfaces commit through
  `state/finishDropApply.ts` (one undo step, floor/wall recents, toast). **Drop-target
  highlight** (Q31 tail, C262): `scene/finishDragSignal.ts` is a tiny module singleton
  (`setFinishDragActive` / `subscribeFinishDrag`) driven by `FinishDropSurface`'s
  `dragenter`/`dragleave`/`drop`/`window.dragend` events; `scene/FinishDragOverlay.tsx`
  subscribes via `useSyncExternalStore` and renders a CSS ring (`box-shadow + accent`
  tokens) over the canvas — entirely DOM-side so `frameloop="demand"` is unaffected.
  Custom-plan overview wall drops show an info toast (`hasUntaggedHits` in
  `finishDropTarget.ts`) rather than silently no-oping.
- **Lighting / time of day**: SunCalc → `altitudeCurve.ts` → directional sun +
  hemisphere + IBL + sky (continuous gradient as the time slides). The manual hour runs on the
  viewer's local clock and `computeSun` evaluates it for the location's lat/lon + today's date,
  so sunrise/midday/sunset are the real times for that place (a Singapore evening stays lit to
  ~19:10). The shared **`ui/scene/TimeOfDaySlider`** (desktop Scene menu + mobile sheet) is a
  free-scrub 24h slider + a "System time" toggle (always shows the real clock, never the
  selected time). **Lights** (`lightsMode` off/on/auto) is an independent fixture toggle — not
  tied to the sun (lights can be on in daytime). Fixtures emit capped night point lights; shades
  glow via `fixtureGlow`.
- **Parametric furniture generator** (`furniture/parametric/`, PF1): dimension-driven
  bookshelf/wardrobe/sideboard. Pure tested core — `spec.ts` (`clampSpec` envelopes, never
  throws), `buildParts.ts` `buildParametric(spec)` → box parts (floor-anchored/centred/+Z;
  auto centre divider >1.2 m bays, ≤0.6 m door leaves, rail; bounds = footprint),
  `price.ts` board-area estimate → def-level `price` (wins in `itemPrice`). `buildObject.ts`
  maps parts → meshes (furnitureMaterials) shared by the dialog preview AND
  `saveParametric.ts` (exportGlb → `persistUserGlb`, hash-dedupe → new `UserGltfDef` per
  spec; price+footprint persist via IDB meta + schema). UI `ui/parametric/ParametricDialog`
  (type tabs + DimField sliders + live preview; Add to room arms placement); entries:
  catalog-foot **Custom size**, ⌘K, mobile Design menu — `parametricFurniture` flag (pro).
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
- **Cross-section** (`floorplan/section.ts` pure → a `Section` cut along a mid-plan line: cut wall
  columns w/ heights, floor/ceiling runs, room spans, opening gaps, + furniture silhouettes beyond the
  cut supplied via `ui/elevation/sectionFigure.ts` `sectionSilhouettes` so the core stays footprint-
  helper-free; `floorplan/sectionSvg.ts` renders a palette-injected SVG). A "Section A–A" sheet in the
  drawing set + a section block in `report.ts`; rides the existing `drawings` flag (pro). Guards a bare
  shell / partial plan.
- **FF&E schedule** (`ffe/ffeSchedule.ts` pure → per-(room,def,variant) rows: source/SKU/real dims/
  qty/pricing, reusing `pointInRoom` + `itemPrice`). Rendered as the report's procurement table.
  **Furniture CSV** (`ui/furnitureCsv.ts` pure `buildFurnitureCsv` → RFC-4180 CSV of the schedule:
  Room/Item/Source/SKU/W·D·H mm/Qty/Unit/Total + grand-total footer; `ui/openFurnitureCsv.ts` =
  Blob download). File menu + mobile + ⌘K, `shopExport` flag (simple).
- **Drawing set** (`ui/drawingSet.ts` + `openDrawingSet.ts`): a paginated multi-sheet "plan set"
  (cover + plan + per-wall elevations + cross-section + lighting + electrical (`floorplan/electricalPlan*`,
  `electricalPlan` flag) + plumbing (`floorplan/plumbingPlan*`, `plumbingPlan` flag — points auto-derived
  from fixtures) + a per-room finishes schedule (`floorplan/finishSchedule.ts` — floor/wall material
  callouts) + FF&E, title blocks, `@page` A4) reusing all the pure renderers — the formal counterpart
  to the one-page `report.ts`. **Sheet/layer toggles** (PARITY-DRAWLAYERS): `ui/drawingLayers.ts`
  (dependency-light list + `DrawingLayerVisibility` so the heavy builder stays dynamically imported) +
  `buildDrawingSetHtml`'s optional `layers` arg gate each group on/off (floor plan always included);
  the Tools-menu "Include sheets" checklist writes `uiSlice.drawingLayers` (session-only).
- **CAD plan exports**: `ui/openDxf.ts` (`export/dxf.ts` `planToDxf`) downloads the plan as DXF;
  `ui/openPlanSvg.ts` downloads it as a vector `.svg`, reusing `reportPlanSvg` + pure
  `ui/planSvgExport.ts` `buildPlanSvgDocument` (XML prolog + injected `xmlns`). Both in Tools +
  mobile + ⌘K, `dxfExport` flag (pro).
- **Multi-axis furniture tilt** (`tiltFurniture` flag, pro; PARITY-TILT): `FurnitureItem` gains optional
  `pitch`/`roll` (radians); `furniture/tiltRotation.ts` `itemRotation` returns the intrinsic Euler tuple
  `[pitch, yaw, roll, 'YXZ']` the `Furniture` root group uses (reduces to pure yaw when untilted).
  Inspector **Tilt** sliders via `itemsSlice.tiltItem`; serialized (optional) in `schema.ts`. Collision
  stays yaw-OBB (tilt doesn't change the plan footprint).
- **3D scene export** (`sceneExport3d` flag, pro; Q-3DEXPORT): `ui/openSceneExport.ts` `exportScene3d`
  downloads the whole furnished home as `.glb` (reusing `furniture/convert/toGlb.ts` `exportGlb`) or
  `.obj` (`export/sceneObj.ts`, dynamic `OBJExporter`). The live scene root is reached from DOM code via
  `scene/SceneExportController` + the `scene/sceneExportAccess.ts` singleton (mirrors
  `ScreenshotController`/`captureCanvas.ts`). Pure `export/sceneGltf.ts` `buildExportRoot` clones the
  scene and strips editor-only helpers — anything tagged `userData.noExport` via `noExportUserData`/
  `markNoExport` (selection/gizmo/overlays/sky/pins/ghost), plus a structural fallback for three helper
  types + cameras. In Tools + Share modal + mobile + ⌘K.
- **Shoppable buy-list** (`ui/shoplist.ts` pure `buildShopList`+`buildShopListHtml` →
  per-retailer-grouped buy-list HTML: qty/unit/line totals per (def,variant,room), grand + per-retailer
  totals, budget under/over; `openShoplist.ts` opens the window synchronously then dynamic-imports the
  builder). Flag `shopExport` (simple, prod); File menu + mobile File + ⌘K. IKEA product links/SKUs only
  with retailer defs; links dev-gated via `ikeaLive` (licensing) — generic export ships in prod.
- **Quote / bill of quantities** (`export/boq.ts` `buildBoq` → priced sections [FF&E, finishes by area,
  carpentry by linear metre]; `boqToHtml`/`boqToCsv`, and `export/boqXlsx.ts` `boqToXlsx` — a hand-built
  minimal OOXML `.xlsx` via `fflate`, mirroring the CSV columns). `ui/openBoq.ts` `assembleBoqInput`
  (shared by the HTML quote + the Excel download `ui/downloadBoqXlsx.ts`) prices both identically. Flag
  `boq` (pro); Tools menu (desktop). PARITY-QUOTEXLSX.
- **Lighting plan** (`lighting2d/lightingPlan.ts` pure → fixtures from the `LIGHT_EMITTERS` registry
  with world pos/height/intensity/coverage + a schedule, honouring per-item `enabled()` gates;
  `ui/lighting2d/lightingPlanSvg.ts` draws walls + coverage circles + glyphs).
  `lighting2d/roomLux.ts` (pure) adds a per-room average-lux estimate (lumen method: candela → 4π
  lumens × calibration, utilisation factor 0.45, ÷ floor area) statused ok/low/high against
  recommended residential bands per room kind (`roomKindFromName`). Surfaced in the Drawings panel
  (badge list), the report and the drawing set (`roomLuxTableHtml`). Same pure-core →
  palette-injected-SVG pattern as elevations. **3D lux overlay** (LP5+LP6): pure
  `lighting2d/luxGrid.ts` samples a per-room point-illuminance grid (calibrated inverse-square
  fixtures, scoped to the bulb's room/storey, + a simple near-window daylight wash; masked
  outside polygon rooms, never NaN) + `luxGrid`→RGBA via `lighting2d/luxColor.ts` (residential-band
  blue→red stops, shared with `ui/lighting2d/LuxLegend.tsx`); `scene/LuxOverlay.tsx` renders one
  DataTexture plane per room at `levelElevation`+5 mm (depthWrite off, visible levels only),
  toggled by `luxOverlayOn` from the Drawings panel's Lighting tab — rides the `drawings` flag.
  LP6: `luxExcludedIds` filters fixtures before grid build; `luxPlaying` rAF auto-advances `manualHour`
  at 1 hr/s; Drawings panel Lighting tab gains inline time slider + play button + per-fixture checkboxes.
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
- **Plan advisories** (`analysis/hdbCompliance.ts` pure → `buildComplianceReport(plan)`: data-driven
  `RULES` producing non-binding permit/caution/info `Advisory` hints — structural walls, wet areas,
  facade windows, floor loading, ceiling heights). `analysis/stairConnectivity.ts` (ML6b) follows
  the same pattern for multi-storey plans: `buildStairAdvisories(plan, items, getDef)` flags any
  upper storey no staircase reaches (a `staircase`-family item on the storey below whose footprint
  lands in rooms of BOTH storeys). Both surface in the report's "HDB compliance hints" section.
- **Collision** (`collision/placement.ts`): `canPlace(item,def,{others,defs,doors,
  walls?})`; `findItemOverlaps(items,defs)` runs the same furniture-vs-furniture
  rule across the whole design (frame-scoped memo: same items/defs identities within
  one task reuse the result) and `findWallClips(items,defs,walls)` flags pieces
  embedded in a wall (both power the Clearance panel's checks); items
  carry a vertical span + `mounted`/`noClip`. `placementWalls.ts`
  centralizes wall selection (room editor → solid perimeter; upper storeys → own
  walls). All cross-item/wall scans are **storey-scoped** (F13/ML3): `itemsCollide`
  + `findNarrowGaps` gate pairs on `levelId`, `levelWallClips.ts
  findWallClipsByLevel` resolves each item's own level's walls (used by score /
  report / Clearance panel), and walk-mode `buildWalkBlockers` keeps the
  walker's-storey items (level teleport, ML6c). **Wall reveal**
  (`apartment/walls/`): exterior walls between camera and interior fade out.
- **Snap + drag aids + rotate** (`scene/snap.ts`, `GridOverlay.tsx`, `DragController`,
  `selection/RotateGizmo.tsx`+`rotateGizmoMath.ts`): grid 10/25/50cm/1m; align
  (`AlignmentGuides`), flush-to-wall (`wallSnap.ts`, off when grid-snap on), gap HUD
  (`clearanceGap.ts`); touch rotate ring (single 15°, multi rigid centroid, Shift=free,
  green/red validity, complements **R** 90°).
- **Floor plan editor** (`ui/floorplan/`, `floorplan/`): 2D editor of store `floorPlan`
  — walls, rectangular/L-shape (`extension`)/free-`polygon` rooms (Polygon + Auto-room),
  doors/windows, ceiling height (global + per-room), grid+corner snap, per-room floor
  finishes, length labels, and a **furniture name/price label** toggle (`planLabels`
  flag + pure `ui/floorplan/planLabels.ts`, SH3D parity). Per-room **floor + wall finishes** resolve through
  `floorplan/roomFinishes.ts` (live `finishes` slice → `PlanRoom.floor`/`wall` → default);
  the finish setters write through to the active plan and plan activation prunes stale
  custom-room keys; `PlanRoomShell` paints plan walls via `apartment/walls/PlanWallFinishFace`. **Split / Reverse / Join** (pure `wallOps.ts` — openings re-homed) + **exact length/angle** inspector
  fields (`wallOps.ts` `endForLength`/`endForAngle`/`wallAngleDeg` — PARITY-WALLDIM) + draggable endpoint handles (`moveWallVertex`) +
  whole-wall drag/rotate keeping connected corners joined (`moveWallTo`, rotation clamped ±90°) for
  non-orthogonal shapes. Drawing a new wall snaps its endpoints to existing corners **and** wall spans
  (a T-junction) via pure `ui/floorplan/editor/snapToWalls.ts` (vertex wins over edge; free past the radius);
  **on touch the Wall tool is tap-to-place + chaining** (tap start, tap end, continues from the last end;
  `wallTapHadAnchor` ref distinguishes placing the start vs the end), with snapped start-dot/end-ring markers
  drawn on the draft (desktop keeps drag-to-draw).
  **Wall + door/window inspectors mirror the furniture inspector** (`PlanInspector`): a custom **Name**
  (pure defaults in `floorplan/planElementName.ts`; `PlanWall.name`/`PlanOpening.name`, custom wins; room
  creation auto-names boundary walls `<room> wall ##` **and the doors/windows on them**
  (`<room> door/window ##`) via pure `floorplan/roomWallNames.ts` (`assignRoomWallNames`/
  `assignRoomOpeningNames`) in `addRoom`, flagged `nameAuto` (walls + openings) so a user-typed name is
  never overwritten; **renaming a room re-flows** the auto names via `applyRoomElementNames` in `updateRoom`.
  Structural plan edits to the seeded default flat **fork it to a custom id** (`forkIfDefault`) so the 3D
  scene switches from the curated `<Apartment/>` to the live `<PlanShell/>` and edits bind in orbit/walk) +
  an **action grid** (Reverse/Split/Join/Duplicate/Lock/Delete for walls; Flip hinge/swing/Duplicate/Lock/Delete
  for doors). **Lock** (`PlanWall.locked`/`PlanOpening.locked`) keeps an element selectable but un-draggable/
  -deletable on the canvas; **`duplicateWall`/`duplicateOpening`** make an editable copy (name + lock dropped).
  **Multi-select walls** (Shift/⌘-click, or touch **Select+** = `planWallMultiAdd`): primary `planSelection`
  ∪ session `selectedWallIds` (filtered to existing); the inspector shows an *N walls selected* panel with
  bulk **Lock all** / **Delete all** (`setWallsLocked`/`removeWalls`, locked-skipping) + Clear; `toggleWallSelection`
  drives add/remove and ⌫ deletes the whole set in one step. **Text notes** (Text tool → `plan.notes`, draggable/editable; also rendered on
  the report + drawing-set plan sheets via `reportPlanSvg` `notesSvg`, level-scoped by `levelAsPlan` —
  PARITY-PLANTEXT) + **dimension
  lines** (Dimension tool → `plan.dimensions`, measured-length labels) — both persisted (PARITY-DIMTEXT).
  **Polyline markup** (Polyline tool → `plan.polylines`, open/closed + dashed + end-arrow; pure
  `floorplan/polyline.ts`; `planPolyline` flag, pro — PARITY-POLYLINE). **Draggable room-name labels**
  (`room.labelOffset`; `roomLabelPosition` = centroid + offset, shared by editor + report/drawing set —
  PARITY-ROOMLABEL). Live furniture as `canPlace`-checked footprints (active storey
  only). **Level tabs** (`LevelTabs.tsx`, F13/ML4b): Ground floor + each upper level +
  "＋ Level" (adds + switches) + "⧉ Duplicate" (`duplicateLevel` clones a storey's geometry +
  furniture + finishes via pure `cloneLevelGeometry`) + ✕ on upper tabs (confirmed `removeLevel`); an
  **"All levels"** toggle draws the other storeys' walls as a dimmed underlay to align floors; every tool,
  overlay and `PlanInspector` edit routes through the active level (`levelAsPlan` reads,
  `levelId` action args; `updateRoom`/`setRoomCeiling`/finish write-through search all
  storeys by room id). **`P` toggles
  2D⇄3D** — the binding lives in `controls/planEditorHotkey.ts` (always mounted via App,
  modal-guarded), NOT in the lazy-mounted editor, so it opens from the 3D view too.
  **Reference backdrop** (Scale → `mPerPx`, IDB) + **"AI walls"** (BYO-key).
  Undoable + persists (`floorPlanStore.ts`). On open the plan is **fit to the measured canvas
  viewport** (a `ResizeObserver` drives `basePX`, replacing a fixed 940×620 assumption) so it
  fills any screen without a manual zoom-out. **Mobile:** the toolbar is a single row
  (`isMobile`) — a **☰ Menu** button, a **`PlanToolMenu`** grid popover for the drawing tool (shows the
  current tool; replaces a native `<select>`), **undo/redo** (top-bar, not buried in the menu), and Done; everything
  else (name, levels, New/Reset/Template/Save/Reference, labels/dims/all-levels/export/zoom, the
  plan defaults, and a Help → user-guide link via `openDocs`) opens in a **"Plan tools" `Modal`**, grouped
  into labelled **Plan / View / Edit / Defaults** sections (`.plan-tools-group`) so it reads as a tidy sheet.
  The secondary controls are shared fragments; **desktop** keeps the core loop inline and groups the
  rest into two `PlanMenu` dropdowns (`editor/PlanMenu.tsx`, on the shared `Popover`): **Plan ▾**
  (New/Reset/Reference) + **View ▾** (labels/dims/furniture/all-levels/export). Escape closes an open
  dropdown (`.plan-menu-panel` guard) before it can exit the editor.
  `PlanInspector` gets a **minimize toggle** in its header (`usePlanInspectorMinimize`, starts
  minimized on selection) and is **hidden entirely on mobile when nothing is selected** (its
  resting view only repeats the defaults, which now live in the Tools modal).
- **Toolbar** (`ui/toolbar/`): scrollable icon island (`IconButton` + `ToolbarMenu`).
  Menus: **View** (Orbit/Walk + top/reset/turntable + saved views `cameraViewsSlice` with
  per-view note + 360°-slide toggles, Present…, and **Render all views** —
  `ui/renderAllViews.ts` flies each saved view and downloads a `captureCanvasPng` PNG per view,
  `batchRender` flag, pro),
  **Scene** (time slider + Lighting + Backdrop + sun `CompassModal`), **Edit** (step into
  room / floor-plan), **Arrange** (Tidy + Sets/Presets/Styles pick→Apply `PickApply`),
  **Tools** (Budget/Checks/Sun study/Walkthrough/Report), **File**, **Graphics**. Three
  states: overview/room-editor/walk. Tooltips+menus via `Popover`; shortcut chips from
  `controls/keybindings.ts`. Mobile: minimal bar → bottom action-sheet with a master-detail
  layout — an icon-only left rail of sections (`data-tour-section`) opens each section's items in
  the right detail pane (`MobileToolbar.tsx`).
- **Keyboard shortcuts** (`controls/`): `keybindings.ts` (the key map) + `useKeyboard.ts`
  (global keydown hook; skips repeats + editable targets) + `modalGuard.ts` (module-level
  open-modal counter — the shared `Modal` primitive and the modal-style overlays register
  while open, and every global keydown handler early-returns via `isAnyModalOpen()`, so
  hotkeys can't fire behind a dialog; Escape stays per-modal, ⌘K/undo are suppressed).
- **Walk-mode** (`scene/cameras/FirstPersonCamera.tsx`, `walkInput.ts`, `ui/walk/`): fine
  = Pointer Lock (WASD+mouse, Esc; native banner unstyleable), coarse = `WalkJoystick` +
  drag-look; `WalkHud`, `Crosshair`. **Observer camera controls** (PARITY-WALKCAM,
  `walkCameraControls` flag, pro): FOV (50–100°, default 70) + eye-height (1.2–1.9 m, default
  1.6) sliders in `ui/walk/WalkCameraControls.tsx`, persisted in `editorPrefs`; pure clamp
  helpers + ranges in `scene/cameras/walkCameraSettings.ts`; FOV applies reactively to the live
  camera (own effect, restored on exit), eye-height ref'd so a drag re-heights without re-spawn. Multi-storey (ML6c): the walker's storey follows
  `viewLevelId` (`walkLevel`/`levelSpawnPoint` in `floorplan/levels.ts`) — picking a level in
  View→Levels while walking teleports to its first room centre at `elevation + eye`, and
  collision walls (`levelAsPlan`) + furniture blockers are that storey's own. **Mobile viewport** (`index.html`, `responsive.css`,
  `MobileLongPress.tsx`): `viewport-fit=cover`+`100dvh` full-bleed canvas (controls in
  `env(safe-area-inset-*)`); `body.mobile` kills text-select/callout/double-tap-zoom;
  long-press → `contextmenu`. **Dynamic status-bar tint** (`scene/lighting/statusBarTint.ts`):
  because the canvas is full-bleed under the notch, a static `<meta name="theme-color">` band
  fights the time-of-day sky on the iOS standalone (Add-to-Home-Screen) status bar. `Lighting`'s
  frame loop `updateStatusBarTint`s every `theme-color` meta to the **real top-centre canvas
  pixel** (read back via the preserve-drawing-buffer Export/Record already need; the analytic
  hemisphere sky colour, linear→sRGB, is the pre-first-frame fallback), so the chrome matches the
  scene exactly — tone-mapping, exposure and camera pitch included. The apply step dedups on an
  unchanged hex; because the read runs *before* r3f draws, the day/night settle edge fires one
  extra `invalidate()` so the final frame is the one sampled. **FPS** (`FpsCounter.tsx`): DOM
  pill, rAF, `showFps`.
- **Design tools** (Arrange/Tools): **Sets** (`furnitureSets.ts` + IKEA `ikeaSets.ts`),
  **Checks** (`layout/clearance.ts`), **Sun study**, **Walkthrough** (tour+record),
  **Measure** (`TapeMeasure.tsx`, Distance/Area, 📌 Pin → persistent `annotations`),
  **Comments** (F24: `commentsSlice` `{position,[levelId],text,resolved}` + undoable CRUD;
  `scene/CommentPins.tsx` level-elevated numbered pins + one-tap placement plane →
  `promptText`; `ui/CommentsPanel.tsx` `.aux` list with resolve/edit/focus; persists in the
  save schema (optional `comments[]`) so pins travel with `.sofa.json` + `#/design/` links;
  `comments` flag, pro),
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
- **Replace with similar** (PARITY-REPLACE, `replaceSimilar` flag, pro): pure
  `furniture/similarItems.ts` `similarItems(defId, catalog, limit?)` ranks same-category catalog
  siblings nearest-footprint-first (orientation-independent W×D from `defaultFootprint`, tie-break
  name→id; excludes self/unknown); the `itemsSlice.replaceItemDef(id, newDefId)` store action swaps
  the def in place keeping id/position/rotation/levelId/label/locked/groupId and resetting props
  (`defaultParamProps` for parametric, else `{}`) in one undo step. UI `ui/SwapModal.tsx` (shared
  single mount → desktop + mobile inspector parity) lists the ranked alternatives with fit badges;
  entries: inspector "Replace with similar…", right-click menu, ⌘K `replace-similar`.
- **Production feature panels** (mutually-exclusive `.aux` slot): **Swap** (`SwapModal`),
  **Clearance** (`ClearancePanel`), **Versions** (`VersionsPanel` — save/restore/Compare
  `versionDiff.ts` + Export/Import `.sofa.json` `designFile.ts`), **History** (`HistoryPanel`
  — `jumpHistory`, `historyTimeline.ts`), **Shopping + Collections** (`BudgetPanel` + heart
  `fav-btn`; budget target → over/under + Spend by room/category; `ui/BudgetHud`; pure
  `itemsCost`/`spendByRoom`/`shoppingGroups`/`shoppingCsv`), **Share** (`ShareModal` —
  `sofa:export` PNG + photoreal/link), **360° panorama** (`scene/PanoramaController` six-face
  capture → pure `scene/panorama/equirect.ts` CPU assembly → `ui/PanoramaModal` + shared
  drag-to-look viewer `ui/panorama/PanoramaViewer.tsx` (pure `viewerLook.ts` clamp math) + PNG,
  `panorama` flag, pro), **HQ render** (`scene/pathtrace/hqRenderSession.ts` progressive
  path-traced still via `three-gpu-pathtracer`; `hqRenderSource.ts` module singleton exposes
  live scene+camera; `ui/HqRenderModal.tsx` — resolution/samples/DoF; `hqRender` flag, pro),
  **Render preset A/B compare** (`ui/renderCompare/compareState.ts` pure logic — preset
  selection, swap, divider clamping; `ui/RenderCompareModal.tsx` two sequential captures +
  Lightroom-style before/after slider with touch parity; `renderCompare` flag, pro),
  **360° tour** (P-720: `panoTourSlice` stop list `{label,position,[levelId]}`
  persisted per-device to localStorage + encoded in share/save links (C261, optional field →
  back-compat); pure `ui/panorama/panoTour.ts` DERIVES room-to-room hotspots (yaw/pitch via
  atan2, screen projection, room-name labels) and `stopInitialYaw` (room-centre facing on
  stop open); per-stop panoramas captured live via `capturePanorama({eye})` then cached in
  `ui/panorama/panoImageIdb.ts` (`sofa-pano-cache` IDB, keyed `<stopId>:<designKey>` —
  auto-invalidated on design change); stop drag in the 2D plan editor SVG (`FloorPlanEditor`
  `movingStop` state); `panoTour` flag, pro), **Presentation mode** (`ui/PresentationMode.tsx`, `presentation` flag,
  pro — full-screen saved-views slideshow with per-view notes; views marked 360° (`SavedView.pano`)
  capture a panorama live at the slide and show it in `PanoramaViewer`; auto-advance pauses on
  panorama slides; **tour inclusion** — when both `presentation` + `panoTour` flags are on, the
  View-menu "Present…" item becomes `ui/presentation/PresentationSetup.tsx` (inline toggle +
  Start button); `presentationIncludeTour` state in `uiSlice`; `composeTourSlides()` in pure
  `ui/presentation/slideLogic.ts` builds a `Slide[]` deck (`ViewSlide | TourStopSlide`) — tour
  stops use the same `capturePanorama({eye})` + `panoImageIdb` cache as `PanoTourModal`; storey
  filter via `viewLevelId`; toggle disabled when tour is empty).
- **Mirror reflections** (`primitives/MirrorMaterial.tsx`): real planar reflection on
  High/Maximum (`mirrorReflectorConfig(tier)`), fake-shiny pane below. Uploaded GLB
  mirrors via inspector "Reflective surface" (`props.reflective`, `gltf/mirrorPlane.ts`).
- **Live pricing/AI/sharing**: dev-only "Live SG retailer prices" (`livePrice.ts`/
  `price-server.mjs` — IKEA SG/Courts/HipVan/Castlery, per-line offers cheapest-first,
  fails soft to `furniturePrices.ts`); **AI photoreal** (`ui/ai/`, BYO-key i2i in Share; after a result, "Redesign this
  render" style chips re-run the same call with a restyled prompt — pure `ai/styleVariants.ts`
  + `ui/ai/variantGallery.ts` reducer — into a selectable/downloadable variant gallery);
  **AI auto-furnish** (`ai/autoLayoutAi.ts` prompt+parse + `layout/aiLayoutApply.ts` validate/clamp,
  BYO-key LLM via the ⌘K "AI auto-furnish", `aiLayout` flag);
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
  `main.tsx` imports the self-hosted fonts, registers decoders, then renders immediately; async
  `runBootstrap()` (IDB + autosave restore + default seed *after* hydration) flips
  `bootPhase`→`'ready'`. `LoadingOverlay` covers boot + orbit↔walk + room enter/exit.
- **Fully offline / PWA**: the core app needs **no runtime network**. Fonts (Plus Jakarta Sans +
  JetBrains Mono) are self-hosted via `@fontsource` (imported in `main.tsx`, no Google Fonts CDN);
  the Draco decoder is self-hosted under `public/draco/` (copied from the installed `three` by
  `scripts/copy-decoders.mjs`, wired into `predev`/`prebuild`) and `gltf/decoders.ts` defaults to
  the base-aware `withBase('/draco/')` (override `VITE_DRACO_DECODER_PATH`); the Basis transcoder
  is `public/basis/` via `withBase('/basis/')`. A `vite-plugin-pwa` Workbox service worker
  (`vite.config.ts`) precaches the build so the app loads and runs offline after the first visit
  (build-only — `devOptions` off; opt out with `VITE_DISABLE_PWA=1`, which `disable`s the plugin
  while keeping `virtual:pwa-register` resolvable). **Updates** (`registerType: 'autoUpdate'`):
  registration is owned by `src/pwa/swUpdate.ts` (`injectRegister: null`) which polls
  `registration.update()` hourly **and** on foreground (visibility/focus) so installed Home-Screen
  PWAs — iOS standalone has no reload UI — pick up new builds; a found build installs + reloads
  silently, and a manual **"Check for updates"** (`runUpdateCheck`, File menu / mobile Appearance &
  help) gives toast feedback. Optional network-bound
  features (remote CC0 catalog, AI, geocoding) degrade gracefully when offline. The SPA
  navigation fallback is denylisted for `<base>/docs/` (`navigateFallbackDenylist`) so it can't
  serve the app shell in place of the separately-built VitePress **user guide**. The guide is
  **precached** so it works offline from the first launch: `npm run build:all` runs
  `scripts/build-with-guide.mjs`, which builds the guide into `dist/docs` *first*, then runs the
  app build with `VITE_KEEP_DIST=1` (so `emptyOutDir` is off and the PWA scan includes
  `dist/docs`; `globPatterns` cover its html/js/css/woff2 + a `docs/**` rule for screenshots). A
  `StaleWhileRevalidate` `user-guide` runtime cache still backs any page not in the precache.
  Every code-split feature (panels/modals/tools in `ui/app/lazyComponents.tsx`, plus the post
  stack, XR, upload dialogs) loads through **`ui/app/lazyWithRetry.tsx`** instead of bare
  `React.lazy`: a failed chunk `import()` (stale hash after a redeploy — Workbox
  `cleanupOutdatedCaches` drops old chunks — or a transient miss before precache finishes) is
  retried, then recovered with a single guarded reload when online, so it never crash-lands the
  app on the top-level ErrorBoundary with "Importing a module script failed". `main.tsx` also
  installs a `vite:preloadError` handler (`installChunkErrorRecovery`) for `modulepreload`
  failures. After boot, **`ui/app/preloadOnIdle.ts`** idle-warms those feature chunks (2D
  editor first, then dialogs/panels) so they're cached + instant without the user opening each
  one once — closing the window where someone disconnects mid-precache before a feature is
  cached (App's post-boot idle effect; warming imports are SW-cache hits, so no extra network).
  Verify with `node scripts/static-serve.mjs` (serves `dist/` under the prod base — unlike `vite
  preview`, which doesn't honour `base` for assets in this sandbox) + headless offline runs
  (`scripts/offline-test.mjs`, `scripts/offline-features-test.mjs`, `scripts/offline-guide-test.mjs`,
  `scripts/preload-verify.mjs`).

## Adding content
- **Furniture**: add `primitives/<Name>.tsx` (`{props}`), register in `index.ts` +
  `PrimitiveKind`, add a `ParametricDef` to `furniture/defs/<category>.ts`. Set `verticalSpan`/
  `mounted`/`noClip` for non-floor; `lightEmitters.ts` to emit light; `furniture/defaults/`
  to ship in the flat (collision-checked by `defaultLayout.test.ts`). 15 categories
  (`FurnitureCategory`: beds/seating/tables/storage/kitchen/bathroom/appliances/lighting/
  decor/textiles/outdoor/electronics/kids/laundry/others=catch-all). A new category must
  update the union, `FURNITURE_CATEGORIES`, every exhaustive `Record<FurnitureCategory,…>`
  consumer, + `CategoryTabs`/`CategoryIcon`. Category auto-detected for imports.
- **Finish**: add to `materials/builtinCatalog.ts` (`procedural` w/ a pattern, or
  `solid`); new pattern painters in `procedural/patterns/<family>.ts`, wired into `PATTERN_FN`.
- **GLB models**: bundled + user uploads go through `GltfModel`; set collision flags;
  run `optimize:glb`. **Bundled pipeline** (`scripts/asset-pipeline/`): drop `<name>.glb`
  (+ optional `.glb.json` sidecar) into `public/assets/furniture/`, `npm run index-assets`
  → regenerates `generatedCatalog.ts` + `CREDITS`. Must be floor-anchored + centred (no
  runtime fit). License CC0 default, may be CC-BY (sidecar → inspector `SourceLine`).
