# Architecture index

The full map of the codebase. Root `CLAUDE.md` holds the hard rules + conventions and
points here; area-specific rules live in path-scoped `CLAUDE.md` files (`src/state/`,
`src/furniture/`, `src/scene/`, `src/ui/`, `src/materials/`). Keep this current in the
same change that reshapes a system.

> **Keep this index ≤250 lines** — one dense line per system, not a manual. When you add
> a system, add a line and trim/merge elsewhere; push deep detail to the path-scoped files.

## Commands (full)
- `npm run dev` (localhost:5173; store on `window.__store`) — runs **both** the Vite dev server
  **and** the local backend (`scripts/dev.mjs` orchestrates Vite + `scripts/dev-api.ts`), so real
  admin login + cloud sync work in dev. Vite proxies `/api` → the backend on :8788. The backend
  hosts the actual Cloudflare Worker app (`functions/api/[[route]].ts`) on Node with shimmed
  bindings (`node:sqlite` for D1 → `.wrangler/sofa-dev.sqlite`, in-memory KV, R2 stubbed) —
  because `wrangler pages dev`/`workerd` needs glibc ≥ 2.32, which some dev boxes lack. Copy
  `.dev.vars.example` → `.dev.vars` (seeds the admin via `ADMIN_EMAIL`/`ADMIN_PASSWORD` on the
  first request); requires Node ≥ 22 (`node:sqlite`, run with `--experimental-sqlite`). Use
  `npm run dev:web` (Vite only) / `npm run dev:api` (backend only) to run either half alone.
- `npm test`/`test:watch`.
  **Test environments**: Vitest defaults to `node` (fast, no DOM); any test file that touches
  the DOM (render/`@testing-library`/`window`/`document`/canvas/IndexedDB) must start with a
  `// @vitest-environment happy-dom` line — a missing pragma fails with
  `window/document is not defined`. CSS regex guards are consolidated in
  `src/styles/styleGuards.test.ts` (one node-env file) — add new style guards there, not as
  new per-feature files;
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
- **Performance profiler (dev-only)**: `src/dev/profiler/` — detached-window
  (`window.open`) live metrics dashboard + on-demand effect-cost sweep + per-object
  GPU breakdown; ⌘K → "Open profiler (dev)" (`profiler` flag, `devOnly`+`pro`, plus
  `import.meta.env.DEV` at every wiring point so it tree-shakes out of prod). Full
  guide: `docs/developer/profiler.md`; path-scoped rules: `src/dev/profiler/CLAUDE.md`.
- **Deploy base**: `VITE_BASE` env overrides the build's base path (default `/sofa-so-good/`
  for GitHub Pages; the dev server stays `/`). Must end with `/`. `scripts/static-serve.mjs`
  honours matching `BASE`/`PORT` envs for serving non-default-base builds locally.
- **Docker**: `docker build -t sofa-so-good . && docker run -p 8080:80 sofa-so-good` —
  multi-stage image (node:24.18.0-alpine build with `VITE_BASE=/` → nginx:1.27-alpine).
  `docker/nginx.conf` adds the wasm/glb/ktx2 MIME types, SPA fallback (excluding `/docs/`),
  cache headers, and same-origin `/acg`/`/acg-cdn`/`/kenney` proxies for the runtime CC0
  catalog (the production equivalent of the dev-only Vite proxies). `.dockerignore` keeps
  the ~1 GB asset/tooling trees out of the build context.
- **Desktop (Electron)**: `npm run build:desktop` (web build with `VITE_BASE=./` +
  `VITE_DISABLE_PWA=1`, via `scripts/build-desktop.mjs`); `npm run electron:start` (run the
  shell); `npm run dist:desktop` (electron-builder installers → `release/`; config in
  `electron-builder.yml`). Shell = `electron/main.mjs` — serves `dist/` over a privileged
  `app://` scheme (fetch() is blocked on `file://`), sandboxed renderer, no Node integration;
  `ELECTRON_SMOKE_SHOT=<png>` captures a headless smoke screenshot and exits; a leaked
  `ELECTRON_RUN_AS_NODE` (VSCode/agent hosts) is detected and the shell re-execs without it.
  App icon: `scripts/make-desktop-icon.mjs` renders `public/favicon.svg` → `build/icon.png`
  (generated in `build:desktop`, gitignored). In the shell, "Check for updates" queries GitHub
  releases (`src/desktop/updateCheck.ts`, `app:` protocol detection) instead of the SW flow.
  `.github/workflows/release.yml` packages Win/mac/Linux on `v*` tags (publishes to the
  release) and, artifact-only (no publish), on every push to `main` + manual dispatch — the
  per-merge test-build channel, like the Android debug-APK workflow (`android-apk.yml`, also
  push-to-main); signing/notarization activate via secrets (`MAC_CSC_LINK` +
  password, `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`, `WIN_CSC_LINK` +
  password) with hardened runtime + `electron/entitlements.mac.plist`; secretless builds are
  unsigned. Node pinned at **24.18.0** (`.nvmrc`, CI, `engines`).
- **Android (Capacitor)**: `npm run build:mobile` (web build with `VITE_BASE=./` +
  `VITE_DISABLE_PWA=1`, regenerate launcher icons, `cap sync android`; via
  `scripts/build-mobile.mjs`) bundles `dist/` into the committed `android/` native project
  (Capacitor 8, `capacitor.config.ts`, `appId sg.sofasogood.app` shared with Electron). The
  WebView loads the bundled assets over `https://localhost` — no live URL or service worker,
  so the app runs fully offline (same bundle shape as the Electron shell). Launcher icons:
  `scripts/make-android-icons.mjs` renders `public/favicon.svg` → mipmap PNGs + adaptive-icon
  layers (committed). The APK is compiled on CI, not locally: `.github/workflows/android-apk.yml`
  (manual dispatch) runs `assembleDebug` on a GitHub runner (JDK 21, Android SDK 36) and uploads
  the sideloadable `app-debug.apk` as an artifact — the local sandbox can't build it (the Android
  SDK / Google-Maven hosts are network-blocked). Keep `android/app/build.gradle` `versionName` in
  sync with `APP_VERSION`. Full guide: **[docs/packaging-android.md](packaging-android.md)**.

## Layout of the code
- `src/state/` — Zustand store, `slices/*`: items, selection, finishes, doors, time,
  location, camera, ui (quality+snap+`backdrop`+`uiMode`), placement (+`pendingEdit` tick/cross
  confirm + `reopenCatalogAfterPlace`), clipboard, history,
  remoteCatalog, installedPacks, measurements (+`units`), orientation, notifications,
  **prompt** (`promptText`/`confirmAction`→themed modals), **project** (`designNote`),
  reset, **userAssets** (user GLBs + `IkeaGltfDef`s), **floorPlan**, **appearance**,
  **features** (cmdk/layers/context-menu/onboarding/tour/budgetTarget + `layersCollapsed`), **userStyles**,
  **callouts** (dismissed `InfoCallout` ids, self-persisted) and **badges** (seen "New"-dot flags, self-persisted).
  `storage/`: autosave + `qualityPrefs`/`editorPrefs`/`appearancePrefs`/`floorPlanStore`/
  `budgetPrefs`; `hydrate*.ts` re-resolve user/IKEA defs + IDB blobs. `schema.ts`=serializer.
  `storage/adapter.ts` = the dynamic adapter: guests use `LocalStorageAdapter`, a signed-in user
  on a backend build uses a cloud-mirror (local always + throttled cloud via `ServerAdapter`);
  `cloudBoot.ts` reconciles the autosave latest-wins on boot.
- **Cloudflare backend (opt-in, `VITE_API_BASE`/`hasBackend()`)** — `server/` (bindings-typed
  helpers: `crypto` PBKDF2, `sessions` KV, `db` D1, `assets` R2+Cache API, `guardrails`
  kill-switch/rate-limit, `turnstile`), `functions/api/[[route]].ts` (Hono API: login-only auth,
  admin-created accounts, designs CRUD, favourites, auth-gated R2 proxy, flags), `workers/usage-monitor/`
  (standalone cron circuit-breaker that trips `killswitch:r2` in KV). Client seam: `src/features/api/client.ts`
  + `auth/backendProvider.ts` + `catalog/packs/sharedLibrary.ts`. Type-checked via `tsconfig.worker.json`
  (`npm run typecheck:worker`). CI/CD: `.github/workflows/deploy-cloudflare.yml` builds the
  backend-enabled bundle and deploys to Pages on push to `main` (wrangler-action; needs
  `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` repo secrets). Full guide: `docs/deployment-cloudflare.md`.
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
  `planIntegrity` Pro flag), `rescalePlan.ts` (PARITY-PLAN-SCALE — pure `rescalePlan(plan, factor |
  {anchorWallId,targetLength}, items?, opts?)` scales every wall endpoint / room polygon / opening
  offset / note·dim·polyline / upper storey + furniture POSITION about an anchor; furniture sizes
  preserved unless `scaleFurnitureSize`; `rescaleFloorPlan` slice action = one undo step;
  `ui/floorplan/ScalePlanModal.tsx` "Scale plan…" in the Plan menu / mobile Tools sheet; `planScale`
  Pro flag), `levels.ts` (multi-storey resolution layer F13: top-level arrays = ground,
  `upperLevels` adds storeys; `planLevels`/`levelById`/`levelAsPlan`/`allPlanRooms`/
  `withLevelGeometry` — see `docs/research/multi-level-design.md`),
  `wallArc.ts` (curved walls — `PlanWall.arc` bulge → quadratic-Bézier chord sub-segments reused by
  `wallBoxes`/`planCollisionWalls`/room detection; 2D bulge handle; `curvedWalls` flag, openings
  disabled on curves), `slopedWall.ts` (sloping walls — `PlanWall.topHeightEnd` → a prism rendered by
  PlanShell's `SlopedWallMesh`; `slopingWalls` flag, openings disabled),
  `mirrorPlanRegion.ts` (whole-plan left↔right reflection about a vertical axis `x` — every wall/room/
  opening/annotation + all storeys + furniture, for mirror-image HDB stacks; flips opening hinge/swing
  handedness + wall `arc` sign + furniture yaw/`flipX`; pure + composable, double-mirror = identity;
  store action `floorPlanSlice.mirrorFloorPlan`, "Mirror plan" in the editor's Plan menu behind the
  `planMirrorRegion` Pro flag — PARITY-PLAN-MIRROR-REGION). Each wall may carry a
  per-wall baseboard override (`PlanWall.baseboard` height/colour/hidden → PlanShell skirting;
  `wallBaseboard` flag, custom plans only). Furniture also supports multi-axis tilt (`pitch`/`roll`, `furniture/tiltRotation.ts`,
  `tiltFurniture` flag). `duplicateRoom.ts` (pure room clone — offset polygon + finishes + own boundary
  walls/openings, re-flowed names; powers the `floorPlanSlice.duplicateRoom` action). 2D editor = `ui/floorplan/`.
  `tiltFurniture` flag). `insetRoom.ts` (PARITY-ROOM-INSET, pure) — `insetPolygon(points, dist)`
  offsets every edge of a room polygon by a signed distance (dist>0 shrinks for a dropped
  soffit, dist<0 grows for a setback) and re-intersects adjacent offset edges (convex + concave
  L-shapes; a collapse / self-intersection → `null`); the `floorPlanSlice.insetRoom(id, dist)` /
  `insetSelectedRoom(dist)` actions write the result back as an explicit `polygon` in ONE undo
  step and reject a degenerate inset with a toast (`roomInset` Pro flag; ⌘K "Inset / Grow room"
  + PlanInspector room buttons). 2D editor = `ui/floorplan/`. **Editor HUD**: a compass + a
  **dynamic scale bar** (`editor/scaleBar.ts` `chooseScaleBar`, pure + tested, zoom-aware) pin to
  the canvas column's bottom-right (`planCompass` flag). The View "Labels" toggle (`showRoomLabels`)
  hides room name + dimensions; **finishes are NOT offered in the plan inspector** (per-room editor
  only). New walls/openings auto-name by room (`roomWallNames.newWallName`/`newOpeningName`). Custom
  **dimensions** are selectable + deletable + **editable** (`updateDimension` — drag A/B handles or
  edit length/endpoints in the inspector). Room outlines drag as a whole (polygon points translate
  with the origin).
- `src/furniture/` — catalog + rendering. `builtinCatalog.ts` (assembles the catalog from
  per-category `defs/<category>.ts` modules + the `cabinet/` engine; also derives
  `BUILTIN_BY_CATEGORY`),
  `catalog.ts` (merges built-ins+packs+user/IKEA; `useCatalogGetter` = stable
  non-rendering accessor), `primitives/` (components registered in `index.ts` +
  `PrimitiveKind`), `GltfModel.tsx`/`gltfRender.ts` (all GLB items), `defaults/` (per-room layout
  files assembled by `defaultLayout.ts`; each room file owns its own decor props so the styled flat
  is self-contained; all set-dressing props carry `noClip: true` so they pass collision checks),
  `lightEmitters.ts` (fixture registry + `resolveEmitterSpec`; any item with `props.lightOn ===
  'yes'` emits via the `OVERRIDE_EMITTER` fallback — `itemAsLight` flag; `props.lightOn ===
  'no'` is a hard per-item off override checked FIRST, winning over a registered fixture's own
  `enabled` gate too — the walk-mode light toggle, WALK-LIGHT-INTERACT above; `props.iesProfile`
  swaps the omni point light for an IES `SpotLight` — see `src/lighting/ies/`). Sub-dirs: `gltf/` (`decoders.ts` Draco@boot, `lod.ts`,
  `textureBudget.ts`, `finishTargets.ts`, `mirrorPlane.ts`); `convert/` (any-format→GLB:
  `formats.ts`/`loadToObject.ts`/`toGlb.ts`/`convertModel.ts`; `zipGuard.ts` bounds the
  DECLARED decompressed size of usdz/3mf via fflate central-directory reads before the
  loader inflates — IO-006 zip-bomb guard; `runConvert.ts`/`convert.worker.ts` run `convertModel`
  in a pooled Worker off the main thread — see the `optimize/` pool paragraph below for the shared
  `WorkerPool` primitive both use, and `imageLoaderWorkerPatch.ts` for how texture-bearing formats
  work in a Worker with no `document`); `optimize/` (`optimizeGlb.ts`
  pure worker-safe weld/prune+Draco+WebP, never-throws; opt-in KTX2 `lib/ktx2encode.ts`;
  `lodVariants.ts` in-browser `-low`/`-medium` tier generation for uploads — meshopt simplify
  + tier texture caps from `gltf/lod.ts` `TIER_BUDGETS`, stored in IDB under
  `<assetId>:lod-<tier>` keys, routed by the `lod.ts` variant registry; `runOptimize.ts` is the
  main-thread entry — a **worker POOL**, not a single worker: `computePoolMax(cores,
  deviceMemory)` = `cores - 1` (hard-capped `HARD_POOL_MAX`=8, downshifted on low-RAM devices),
  workers spawn lazily **on contention** (`pickWorker` reuses an idle worker before growing the
  pool) and **idle-teardown** (terminate + drop) after `IDLE_TEARDOWN_MS` once a worker's queue
  empties — each holds a heavy Draco/Basis WASM stack, so the pool sheds back down after a bulk
  burst instead of holding its peak size all session. A worker `error`/`messageerror` retires
  only that worker (its queued calls fall back to the unoptimized original; the rest of the pool
  is unaffected); no Worker available at all (e.g. tests) falls back to a direct in-thread call.
  Mock-`Worker` pool tests: `runOptimize.pool.test.ts`. This pool predates and keeps its own
  from-scratch implementation — NOT refactored onto `furniture/worker/workerPool.ts` (the generic
  `WorkerPool` class factored out for the convert pool below), to avoid destabilizing it right
  after it shipped; a future third pool should build on the generic version instead of copying
  either); `convert/runConvert.ts` runs the SAME lifecycle (spawn-on-contention, per-worker error
  retirement, idle-teardown) via that generic `WorkerPool`, sized with the same
  `computePoolMax` heuristic — its worker (`convert.worker.ts`) calls `convertModel` unchanged
  (see `convert/` above); a worker crash or unexpected in-worker failure falls that ONE file back
  to a direct main-thread `convertModel` call, a genuine `ConvertError` (bad format/over-size/
  zip-bomb) is re-thrown as-is with no pointless retry. Mock-`Worker` tests:
  `furniture/worker/workerPool.test.ts` (generic pool) + `convert/runConvert.test.ts`
  (success/expected-error/unexpected-error/crash fallback branches);
  `ikea/` (`metadata`/`translate`/`importGroup`/`compatibility`/`detectGroups`/`stacking`/
  `supportPlane`/`thumbnail`/`ikeaSets`); `upload/` (`bulkImport.ts` `prepareModelFile`=
  convert+optimize+`persistUserGlb` — `prepareGlb` runs the IO-002 early size-cap gate **before**
  `runOptimize`: only a HOPELESSLY oversized converted/raw GLB (> `EARLY_REJECT_MULTIPLIER`(3) ×
  `MAX_GLB_BYTES`) is rejected up front (never burns a pool slot); a merely over-cap file keeps
  its optimize chance (Draco+WebP routinely shrink 5-10×) and the post-optimize check enforces
  the real `MAX_GLB_BYTES` cap on the actual stored bytes, `hashFile.ts`
  dedupe, `readDrop.ts` (drag-drop walk),
  `pickDirectory.ts` (**File System Access** folder pick on Chromium — no native "upload N files?"
  prompt + live scan progress; falls back to the native `<input webkitdirectory>` elsewhere),
  `coalesceProgress.ts` (rAF progress throttle), `runImport.ts`
  background job w/ **batched writes** to avoid O(n²) rebuilds); `cabinet/`.
- `src/materials/` — `builtinCatalog.ts` (floors/walls), `procedural/generators.ts`
  (wood/parquet/tile/marble/carpet/concrete/terrazzo/plaster/wallpaper/checker/brick…),
  `furnitureMaterials.ts` (tintable grain + `getSolidMaterial` + `mat:<id>` DLC +
  `getSurfaceMaterial`), `worldUv.ts` (world-metre UV planes/shapes + the pure
  `breakRepetitionPlane`/`cellUvTransform` tile-repetition break-up, RD-406/MAT-006a, gated by
  the `tileBreakup` flag at the rect-floor build sites), `finishDrop.ts` (drag-to-apply core; canvas drop =
  `scene/FinishDropSurface.tsx` + `scene/finishDropTarget.ts`, commit = `state/finishDropApply.ts`), `convert/`
  (`decodeImage.ts` incl. TGA/TIFF/EXR/HDR/KTX2/DDS, `reencode.ts`→WebP; 16MB cap; `decodeGpuTexture.ts` handles KTX2+DDS via pure-JS or GPU readback).
- `src/scene/` — R3F `<Canvas>` + systems: `lighting/`, `Effects.tsx` (bloom+SMAA),
  baked grounding decals (`ContactShadow.tsx` under-furniture blob RZ1; `CornerAO.tsx`
  `WallFloorAO` wall/floor corner strip RD-403, sizing/gating in `cornerAoMath.ts`, mounted
  in `apartment/walls/WallSegment.tsx`, tier-gated via the `cornerAo` QualitySettings flag),
  `quality.ts`+`QualityController`, `ScreenshotController`, `PanoramaController`
  (+`panorama/equirect.ts` — six 90° screen-path renders → CPU equirect; viewer/export in
  `ui/PanoramaModal.tsx`, `panorama` flag), cameras, selection,
  `SceneBackdrop.tsx` — the surroundings are a **flat equirectangular photo as `scene.background`**
  (skybox; **zero per-frame draws**) shown **in walk mode only** (seen through windows); orbit renders the
  plain procedural sky with no surroundings (`isPhotoBackdropActive(kind, cameraMode, hasCustom)` gates it;
  `Sky.tsx` hides its dome when active). Presets `city/dusk/park/hills` bake procedurally
  (`backdropEquirect.ts` + pure `backdropHorizon.ts` buildings/treeline/hills generators); the `sky` preset is a
  **sun-driven procedural sky** (RD-412, `proceduralSky` flag, pro tier) baked from the pure analytic Preetham
  core `lighting/skyGradient.ts` (`skyRadiance`/`paintSkyEquirect`) via `backdropEquirect.ts`
  `bakeSkyEquirect(sunDir, turbidity)`, re-baked (debounced + old texture disposed) when the sun crosses the
  pure `lighting/skyRebuild.ts` `shouldRebuildSky` threshold — **walk-mode `scene.background` only, never
  `scene.environment`** (the IBL is a separate, deferred concern); `custom` is a
  **user-uploaded photo** (persisted in IDB via `storage/walkBackdrop.ts`, hydrated on boot, controlled by
  `ui/scene/BackdropUpload.tsx` + the `customBackdrop` flag); `none` = plain sky. (The legacy instanced 3D
  City/Park/Hills/Studio estates were removed.) Main Canvas is **`frameloop="demand"`**:
  `RenderPump.tsx` invalidates only when wanted (`renderDecision.ts` pure tested logic;
  `renderPumpSignal.ts` gates FPS sampling). `InstancedBoxes.tsx` (pure tested
  `bakeInstanceMatrix`, now baking an optional per-instance rotation as `T·R·S`, plus a sibling
  `InstancedCylinders`) collapses repeat geometry — bookshelf/crib + RoomDivider/CubeShelf/
  FeatureWall/ToyStorage, and the **rotation-capable** venetian-blind slats + drying-rack rods
  (batten/slat/rod maths in pure `primitives/slatLayout.ts`); `ContextLossGuard.tsx` recovers
  WebGL context loss.
- `src/ui/` — DOM overlays. **CatalogDrawer** (`catalog/`, tab row Catalog/Layers/Packs):
  Catalog = unified grid (`useUnifiedCatalog.ts`) of built-ins/generated/user/IKEA/packs/
  CC0 + Poly Haven + the R2 shared library (signed-in, pro), one fuzzy search + browse Sort +
  favourites/recent (`recentSlice` /
  `favouritesSlice` — both persist to localStorage, both per-device convenience state; `calloutsSlice`/`badgesSlice` follow the same pattern for hint dismissals + "New"-badge seen state).
  The grid is paginated (PAGE_SIZE=12); list virtualization was evaluated and deferred
  (2026-07-03) — revisit with a lightweight scroll window only past ~200 live rows in one list.
  Search is synonym- + intent-aware (`catalog/searchSynonyms.ts` `fuzzySearchSmart`:
  couch→sofa, plurals, and **search-by-room** — "bedroom"→bed/wardrobe/…); when a query
  names a room/use, a subtle caption (`matchedIntents`, `.catalog-search-hint`) reads
  "Showing <room> furniture" so that otherwise-invisible capability is discoverable.
  Favourites (star/heart button on each card, Favourites tab) are gated by the
  `catalogFavourites` feature flag (tier: simple, default on). Browsable **remote CC0
  *models*** (`RemoteCard`s) are gated by the **`remoteFurniture`** flag (tier:
  **pro**, default on — CORS-direct CC0, prod-safe; mirror of `remoteMaterials`): the flag is
  passed into `useUnifiedCatalog(includeRemote)`, so in Simple mode (where `resolveFlags` forces
  pro flags off) the grid shows only the curated builtin/uploaded loop and no un-downloaded remote
  entries surface; remote-model browsing is a Pro/advanced surface. The drawer only bootstraps the
  remote provider index when `remoteFurniture || remoteMaterials` is on (no fetch otherwise).
  Gating affects the browse/add path only — a placed/resolved remote def still merges into
  `useCatalog` (`buildMergedCatalog`) and renders regardless of the flag.
  **Sticky stamp placement** (`stampPlace` flag, tier: **pro**, default on — Floorplanner parity,
  PARITY-STAMP-PLACE): armed from ⌘K **"Stamp — place an item repeatedly"** (`stamp-mode`, gated in
  `COMMAND_FLAGS`, arms the held/selected def) → `startStamp(defId)`, which sets
  `placementSlice.stampMode` + `activeDefId` (no per-card button — the earlier `.stamp-btn` on every
  catalog card was removed, it was mobile-broken and duplicated the inspector's Duplicate). While
  `stampMode` is on, `usePlacementController`'s commit click (and the `addItem` it fires — one undo
  step each) keeps the placement **armed** instead of disarming, so the same item drops repeatedly
  with one click each (chairs, downlights, plants) until **Escape** / the **Done** button / a
  different item (`cancelPlacement` clears it). The active-stamp **`StampBanner`** above the catalog
  footer is the on-cue. A plain single-add arm (`setActiveDefId`) always clears `stampMode`, and the
  controller defends with `isFeatureEnabled('stampPlace')` so a stale `stampMode` can't persist a
  click once the flag is off (Simple mode forces it off → the banner hides and each click commits
  once as before).
  **"Fits this room" size cue** (CATALOG-FITS, `catalogFits` flag, tier: **simple**, default on):
  the pure predicate `catalog/roomFit.ts:itemFitsRoom(footprint, rects)` compares a def's
  `defaultFootprint` (same seed used by placement/collision) against the free-space rects of the
  room being edited (`ui/catalog/useCatalogRoomFit.ts:useActiveRoomFreeRects` → resolves via the
  existing `scene/roomEditorShell.ts:getRoomEditorShell` — the same shell the camera framing and
  furniture room-filter already use, unified across the built-in-apartment `RoomShell` and
  custom-plan `PlanRoomShell`) and returns `'fits' | 'tight' | 'wont-fit' | 'unknown'`, using the
  shared `layout/designRules.ts` `CLEARANCE` constants for the margin (a bare skirting gap for
  "won't fit" vs. a full walkway margin for "fits"). Missing/degenerate footprint or room data
  always resolves to `'unknown'` — a data gap is never reported as a false "won't fit". `CatalogCard`
  renders `'wont-fit'` as a `.pr.warn`-toned "Won't fit" note plus a dimmed `.no-fit` card (both
  cues; no cue at all outside the room editor or when the flag is off) and `'tight'` as a plain
  "Tight fit" note (no dimming). The pro-tier **"Fits only" browse filter** (`catalogFitsFilter`
  flag, default on, hidden in Simple) is a checkbox in the catalog's sort row
  (`catalogBrowse.ts:filterByFits`) that hides `'wont-fit'` local items (never remote/shared
  entries, whose footprint is unresolved pre-import) from the grid; browse-only, a no-op during
  search (mirrors the existing Max $ filter).
  (An earlier **pick-a-finish-before-placing** card popover — `Icon.Palette` trigger,
  `catalogVariantPick` flag, `CatalogVariantPopover` + `furniture/placement/catalogVariants.ts` —
  was **removed**: it was broken on mobile and redundant with the inspector's post-placement finish
  controls. The generic `placementSlice.armWithVariant`/`armedVariantProps` plumbing that
  `usePlacementController`'s `doCommit` merges over `defaultItemProps(def)` remains, unused by the
  UI but tested, in case a variant-arming entry point returns.)
  **Room-aware catalog default** (CATALOG-ROOMAWARE, `catalogRoomAware` flag, tier: **simple**,
  default on — 2026-07-03 core-loop parity audit): on **entering a room to edit**, the catalog
  lands on the category most relevant to that room's kind (bedroom→beds, kitchen→appliances,
  bath→bathroom, living→seating) instead of always the persisted/curated default. The pure,
  unit-tested mapping lives in `ui/catalog/roomAwareCategories.ts`: `relevantCategoriesForRoomKind`
  (RoomKind → ordered `FurnitureCategory[]`, reusing the existing `analysis/suggestions.ts`
  `RoomKind` + `furniture/types.ts` `FurnitureCategory` vocab — no new types),
  `orderCategoriesForRoomKind` (relevant-first, then the untouched `FURNITURE_CATEGORIES` tail —
  falls back to the plain curated order for an unmapped/`null` kind), and
  `defaultCategoryForRoomKind` (the first relevant category that actually has cards per
  `unified.counts`, else the caller's `firstBrowsableCategory` fallback so it never lands on a
  dead tab). `CatalogDrawer` classifies the active room via
  `roomKindFromName(roomDisplayName(roomId, plan))` and applies the landing category in a
  `useEffect` keyed on the `roomEditor.roomId` (via a `roomEntryKeyRef`), so it only fires on the
  room-**entry** transition — a subsequent manual tab pick during the same room-editing session is
  never overridden (the effect body is a no-op unless the room id itself changes), and an
  unmapped/whole-flat view leaves today's persisted default untouched. This only changes the
  DEFAULT landing tab — the CategoryTabs order, search, filters, and favourites/recent are
  unchanged. Flag off → today's behaviour exactly.
  **Stable order across download** (STABLE-CATALOG-ORDER, in `useUnifiedCatalog.ts`): each category
  lists a leading local block, then the remote CC0 block, then the shared-library block — and a card
  never jumps blocks when it's downloaded. When a remote entry's `provider:slug` resolves to a local
  def, that def is emitted `{kind:'local'}` **at the remote entry's slot** (and excluded from the
  leading block); likewise an imported shared item (`ikea-<groupKey>` local def exists) renders its
  local def **at the shared item's slot**. This relocation only happens when the remote/shared entry
  is actually present in the merge input, so with `includeRemote=false`/`includeShared=false` (Simple,
  non-admin, or shared library not loaded) the resolved/imported def simply stays in the leading local
  block exactly as before. Result: downloading a card keeps its grid position instead of jumping to
  the top. Unit-tested in `useUnifiedCatalog.order.test.tsx` (index preserved for shared + remote;
  includeShared=false keeps the def in the local block; no card appears twice).
  **Catalog filter control** (`catalogFilters` flag, tier: **simple**, default on): a funnel
  `Icon.Filter` button in the catalog panel header opens a `Popover` (desktop) / `Modal` sheet
  (mobile) — `ui/catalog/CatalogFilterButton.tsx` — with **Availability** (All / Downloaded /
  Not-downloaded — only shown when the grid actually holds remote/shared cards), **Source** (All /
  Built-in / My items / CC0 library, derived from `def.source`/card kind), and a **Favourites only**
  toggle (reuses `favouriteDefIds`/`gridItemId`). Pure filtering lives in
  `catalogBrowse.ts:filterCatalog(cards, filter, favouriteIds)` (+ `cardSource`,
  `isCatalogFilterActive`, `DEFAULT_CATALOG_FILTER`); `CatalogDrawer` applies it to the grid items
  after the price/fits filters. Filter state is component-local + **ephemeral** (never persisted / not
  in the save schema); an active filter shows an accent dot on the button and a "Reset to All" row,
  and an all-filtered-out grid shows the shared `EmptyState` with distinct copy. Unit-tested in
  `catalogBrowse.test.ts` + `CatalogDrawer.filter.test.tsx` + `features/flags/catalogFilters.test.ts`
  (both modes); scenario `scripts/scenarios/catalog-filter-simple.json`.
  Layers (`LayersPanel.tsx`, `leftMode`) = Objects tree, select/hide/lock/delete + name
  filter + per-row finish drop target. Packs = downloadable content. Plus InspectorPanel
  (`inspector/InspectorPanel.tsx` is now a thin ~180-line composition shell — REFAC-1 extracted
  its inline sections into sibling files: `InspectorHeader`, `ItemActionButtons`
  (`ItemBasicActions`/`ItemOrientActions`), `ItemBulkActions` (multi-select), `ItemLightControls`,
  `ItemPhysicalControls`, `LinearArraySection`, `RadialArraySection`, and pure `itemTransforms.ts`;
  behaviour-preserving):
  `label` rename, minimize, price/total, Quick finishes, Apply-to-all,
  Straighten, **linear array** (`furniture/arrayPlacement.ts` — pure, unit-tested),
  **radial/polar array** (`furniture/radialArray.ts` — pure, unit-tested, Pro-only via
  `radialArray` flag), **path/polyline array** (`furniture/pathArray.ts` — pure, unit-tested;
  `inspector/PathArraySection.tsx` arrays copies along a drawn plan polyline by arc-length
  sampling with tangent yaw; Pro-only via `pathArray` flag), **scatter-fill room**
  (`inspector/ScatterFillSection.tsx` → pure `layout/scatterInRoom.ts` — evenly fills the
  selected item's room with N collision-safe copies on a packed grid, deterministic by seed;
  Pro-only via `scatterFill` flag)), FinishPicker, WallAccentPicker (paint one wall face an accent
  finish, opened by a wall-face click; `wallAccentPicker` flag), GraphicsSettings,
  BudgetPanel, NavCluster, CreditsModal (asset attribution/licenses, opened from the Appearance
  panel's "Asset credits" entry; `assetCredits` flag; built on the shared `Modal`),
  CommandPalette, **ContextMenu** (dynamic right-click menu — `featuresSlice.ContextTarget`
  carries what was right-clicked; `ContextMenu.tsx` rebuilds actions per target + selection:
  furniture rotate/flip/duplicate/**layer-order**/group/lock/hide/delete, plan walls
  reverse/split/join/dup/lock/delete, rooms/openings dup+delete, dim/note/polyline delete.
  Overrides the browser menu in both editors; gated by the `contextMenu` flag. The 2D editor's
  canvas `onContextMenu` opens it for the current selection), Onboarding, HelpModal, Modal,
  `upload/`/`floorplan/`/
  `toolbar/`/`tour/`/`wizard/`/`ai/`/`auth/`. Empty panels/lists render the shared
  **`EmptyState`** (`EmptyState.tsx`: icon + title + optional description + optional CTA on
  the `.empty-mini` token vocabulary) for consistent, friendly empty-state messaging.
  The analytical **Tools** cluster (Analyse + Review panels) is defined once in
  **`src/ui/actions/toolActions.tsx`** (a declarative `ToolAction[]` — `flag`/`docs`/`surfaces`/
  `isActive`/`run`); the desktop `menus/ToolsMenu`, the `MobileToolbar` sheet, and the
  `CommandPalette` all render from it via `visibleToolActions(surface, flags)` /
  `groupToolActions`, so they can't drift (invariants + per-surface projection covered by
  `toolActions.test.ts`). The local-state Sun-study toggle stays hand-rendered. **TB-5 (File owns
  output):** every one-shot export/document row lives in the **File** menus (`menus/FileMenu` +
  `mobile/FileSection`), grouped under section headers (Save & capture · Share & document ·
  Budget & costs · CAD, 3D & data · Load & reset); Tools holds analysis panels/modes only
  (Analyse · Review & tour · Style). The four cost surfaces (Budget panel + Shopping list +
  Quote/BOQ + Cost breakdown) sit together under File → **Budget & costs**; the Budget row
  renders from the registry (`toolAction('budget')`, surfaces `['palette']` so ⌘K keeps it).
  Aux panels that share the centred-top slot are closed as a group via `src/ui/auxPanels.ts`
  (`closeAllAuxPanels`); contextual user-guide deep-links resolve through `src/ui/docsUrl.ts`.
  **Shared UI systems**: `InfoCallout` (flag-gated dismissible hint banners, per-id persisted) and `ui/newBadges.ts` (registry-driven "New" `.new-dot` on toolbar/menu entries, seen-state persisted). **Shared form controls** (`src/ui/controls/`): `Button` (typed composer over the `.btn-*` vocabulary — variant/size/block/icon/loading), `Select` (themed dropdown — replaces every native
  `<select>`; `Popover` on desktop / `Modal` sheet on mobile, listbox keyboard + ARIA) and
  `ColorPicker` (replaces every native `<input type=color>`; SV pad + hue bar + hex +
  `ThemeColorRows` + recents, HSV math in the pure `colorConvert.ts`). The native iOS focus-zoom on
  small fields is suppressed by `src/controls/iosZoomGuard.ts` (dynamic viewport `maximum-scale`
  toggle, installed in `main.tsx`) — no `font-size:16px` mobile bump.
- `src/styles/` — design CSS (after Tailwind via `index.css`): `tokens.css` (10 OKLCH
  palettes) + `components`/`parts`/`features`/`flows`/`screens`/`responsive`/`app`.
  Components use the class vocabulary (`.panel`/`.btn`/`.toolbar`/…), never hardcoded colour.
- `python/scripts/` — offline: `ikea_model_scraper.py`, `glb_analysis.py`,
  `categorize.py`, `compatibility.py`, `optimize_glb_lod.mjs`.

## Key systems
- **Multi-select transforms & layering** (Canva parity): a multi-selection (`selectedItemIds`)
  moves/rotates/flips/**resizes** as one unit in BOTH editors — 3D via `DragController` (rigid
  translate) + `RotateGizmo` (centroid pivot + `enclosingRadius` ring) + `ResizeGizmo` (floor corner
  handles, uniform scale about the opposite corner; publishes the live selection **W×D** to
  `scene/selection/resizeReadoutSignal.ts` — a module signal read by the bottom-centre `ui/ResizeHud`
  pill, `itemDimensionReadout` flag, so the group scales to a target size) + keyboard F/R; 2D via the editor's
  `movingItem` group-drag + a unified dashed bounding box with a `rotatingMulti` rotation ring
  (reusing `scene/selection/rotateGizmoMath`) and `scalingMulti` corner resize handles (uniform
  `props.scale` about the opposite corner). The `MultiSelectPanel` also **bulk-recolours** the
  selection (Appearance › Tint all → `itemsSlice.updateManyItemProps(ids, {tint})`, one undo step;
  `bulkAppearance` flag) and can paste a copied appearance to all (`copyAppearance`).
  **Grouping** (`groupsSlice`, `furnitureGroups` flag)
  binds members so a click selects the whole group. **Z-order / layering** (`layerOrder` flag): pure
  `state/zorder.ts` `reorderByIds` + `itemsSlice.reorderItems(ids, move)` give bring-forward /
  send-to-back (render order = array order), surfaced in the context menu. **Locked** items/walls are
  pinned — a locked wall never moves even when a connected wall is dragged (`moveWallTo`/`moveWallVertex`
  detach at the corner). **Undo/redo** keyboard shortcuts are always active (App.tsx global handler,
  not `canEditScene`-gated) so they work in the floor-plan editor + overview too.
- **View / edit split** (`state/editing.ts`): orbit-overview + walk are **view-only**.
  **All editing happens only in the per-room editor**;
  `canEditScene(s)=roomEditor.active && cameraMode==='orbit'` gates every handler. No
  select-vs-rotate tool; orbit freezes only during a drag/gizmo (`rotatingGizmo`+
  `draggingItemId`). Enter via toolbar "Edit a room" or a room-floor click (→ "Enter
  <room>?" confirm, `enterRoomConfirm.ts`).
- **Walk-mode interact** (`state/editing.ts:dispatchWalkInteract` — the single gate; walk-only,
  inert in orbit): doors (`doorsSlice` `toggleDoor`, aim → `nearbyDoorId`, `ui/DoorPrompt`) and
  **curtains/blinds** (WINDOW-FIXTURE-INTERACT, `walkWindowFixtures` flag, simple): click/tap or
  E flips the fixture's own `props.drawAmount`/`lower` 0↔1 via `windowFixtureSlice`
  `toggleWindowFixture` (undoable; persists through the existing `items` schema field — no new
  schema work). Eligibility + prop mapping are pure in `furniture/windowFixtureInteract.ts`;
  the E-key aim reuses the door aim's ray/segment math (`collision/aimRay.ts:nearestAimedSegment`)
  against live per-item segments (`windowFixtureAimSegments`), surfaced as `nearbyFixtureId` +
  `ui/FixturePrompt` ("Open curtains" / "Lower blind"). Scenario:
  `scripts/scenarios/walk-curtain-interact.json`. **Screens** (WALK-SCREEN-INTERACT,
  `walkScreens` flag, simple): click/tap or E on any parametric def whose `paramSchema`
  exposes a `screenContent` enum field (`monitor`/`flatscreen-tv`/`tv-wall`, all sharing the
  `Monitor`/`FlatscreenTV` primitives — eligibility is keyed on that schema **capability**, not
  a def-id list) advances `props.screenContent` to the next enum option, wrapping around.
  Pure logic in `furniture/screenInteract.ts`; state in `screenInteractSlice`
  (`nearbyScreenId` + `cycleScreenContent`, no new schema field); prompt `ui/ScreenPrompt`
  ("Change wallpaper"). **Lights** (WALK-LIGHT-INTERACT, `walkLights` flag, simple): click/tap
  or E on any light-capable item (a registered `lightEmitters.ts` fixture — lamp/sconce/ceiling
  light-fan/cove light/vanity/aquarium — or any item already flagged via the `itemAsLight`
  override) flips `props.lightOn` between on (`'yes'`/absent) and off (`'no'`) — a discrete
  switch flip, like curtains' draw toggle. `lightOn === 'no'` is evaluated FIRST in
  `isItemEmitter`/`resolveEmitterSpec` and wins over a fixture's own `enabled` gate (e.g. the
  vanity's Hollywood-bulb condition): the item-level gate runs upstream of the scene-wide
  `lightsMode` ('auto'/'on'/'off') brightness multiplier in `FurnitureLights.tsx`, so a
  switched-off item never enters the active-lights set in any mode — **per-item toggle always
  wins**. Pure logic in `furniture/lightInteract.ts`; state in `lightInteractSlice`
  (`nearbyLightId` + `toggleLightPower`); prompt `ui/LightPrompt` ("Turn off table lamp").
  Screens and lights are the first pair to use genuine **nearest-wins** disambiguation (not the
  fixed door>fixture priority order): `FirstPersonCamera` merges their aim segments into one
  `nearestAimedSegment` call with `screen:`/`light:` id prefixes, so whichever is physically
  closer sets its own `nearby*Id` (the other cleared). Scenario:
  `scripts/scenarios/walk-screens-lights.json`.
- **Per-room editor** (`scene/RoomEditorScene.tsx`, `apartment/roomShellGeometry.ts`+
  `RoomShell.tsx`, `uiSlice.roomEditor`): the **sole editing surface**. A separate
  `<Canvas>` that now mounts the **same rendering stack as the main orbit Canvas** —
  `frameloop="demand"` + `RenderPump`, the tier-driven shadow filter (VSM on Medium+, PCF on
  Performance — `RendererTierController` + the Canvas `shadows` prop), `Sky`/`SceneBackdrop`,
  `SceneEnvironment` (procedural/HDRI IBL), the graded `Lighting` sun + tone mapping,
  `FurnitureLights`, and the tier-gated `Effects` post stack + `QualityController` — so a
  glossy/metallic finish reflects the environment and looks identical to orbit at every
  quality tier (it inherits the user's global tier, never pins Performance). Reuses every
  controller on the **same live `store.items`**. `roomShell(roomId)` clips shared walls to
  the footprint; `<RoomShell>`
  hides walls on the camera's outward side. Toolbar = exit + room-switcher `<select>`,
  Esc exits. **Walk bounded to the room** (`buildRoomCollisionWalls`). On entry the orbit
  camera **fits the whole room to the viewport** (`OrbitCamera` room branch → aspect-aware
  `fitDistance`, the same helper as the whole-plan dollhouse), so the room just fills the
  screen on any aspect ratio.
- **Eased camera transitions** (`scene/cameras/cameraTween.ts`, pure + unit-tested): every
  retarget — saved view, double-click focus, top-down, reset/home, frame-selection — flies
  through one shared `startFly` in `OrbitCamera` (smoothstep ease, **distance-aware**
  `flyDurationFor` so a short hop snaps and a long jump glides) rather than a hard
  `controls.update()` snap. The fly self-pumps the demand-mode renderer via OrbitControls'
  `change` event each frame.
- **Frame selection (FEAT-A, `Z` or the NavCluster button, `frameSelection` flag, simple tier)**:
  dolly/retarget the orbit camera so the current selection fills the view — the universal
  SketchUp/Blender/Figma "zoom to selection". Pure bounds→camera math in
  `scene/cameras/frameSelection.ts` (unit-tested): `resolveSelectionExtents` turns each selected
  item into a world-space `itemFootprint` OBB + vertical span (`def.verticalSpan ?? [0, h]`),
  `selectionBounds` unions them (via `layout/alignDistribute.ts` `obbAxisHalf`) into one bounding
  sphere, and `fitDistanceForFov` (the same formula `OrbitCamera`'s whole-plan `fitDistance` uses)
  turns the radius into a camera distance, clamped to the `<OrbitControls>` min/max
  (`clampOrbitDistance`). `App.tsx`'s key handler resolves the bounds (needs `catalog`, only
  available outside the Canvas) and calls `cameraSlice.requestFrameSelection`, which bumps
  `frameNonce`; `OrbitCamera`'s effect reads `frameBounds` and flies to it through the shared
  `startFly`, **keeping the current orbit angle** (same "re-target without resetting the view"
  feel as double-click focus) rather than a fixed 3/4 dollhouse angle. No-op with nothing
  selected. Bare `F` was already `flip` in the same orbit+selection context (`controls/
  keybindings.ts`), so the binding is `Z` (mnemonic: Zoom). Scenario:
  `scripts/scenarios/frame-selection-simple.json`.
- **Two-point-perspective / vertical-line-lock (FEAT-D, `twoPointPerspective` flag, pro):**
  `scene/cameras/verticalLock.ts` (`computeVerticalLock`, pure + unit-tested, no three.js import)
  takes the orbit camera's pose + FOV and returns a leveled look-at target (same yaw, zero pitch)
  plus a vertical projection-window shift (`camera.view.offsetY`, assigned directly rather than via
  `setViewOffset` so `camera.aspect` is never touched) that re-centres the original framing — the
  architectural-photographer's shift-lens trick, so wall corners/door frames render exactly
  parallel instead of converging when the view is pitched. `OrbitCamera.tsx` applies it in a
  dedicated `useFrame` registered (and thus run) after both drei's own `OrbitControls.update()`
  (priority -1) and the fly/tour `useFrame` above, so it always corrects the frame's final pose; it
  only touches orientation + projection, never `camera.position`/`controls.target`, so
  OrbitControls' own spherical state is unaffected. Toggle lives in the `ViewMenu`/`ViewSection`
  "Framing" cluster (desktop + mobile parity) next to Turntable; persisted per-device via
  `qualityPrefs` (`verticalLock`, back-compat default off).
- **Parallel projection / orthographic dollhouse (R3-FEAT-3, `parallelProjection` flag, pro):**
  swaps the whole-flat orbit camera between perspective and orthographic projection (the SketchUp /
  Sweet Home 3D / Planner 5D "Parallel projection" toggle) so parallel building lines stay parallel
  with no foreshortening. `OrbitCamera.tsx` conditionally mounts a drei `<OrthographicCamera
  makeDefault>` (ortho gated to the overview — the room editor stays perspective); OrbitControls
  re-binds to it reactively and drives its `.zoom` for pinch/wheel. The pure, unit-tested
  `scene/cameras/orthoProjection.ts` bridges perspective distance ↔ ortho zoom so the swap
  preserves the on-screen framing (a layout effect keyed on the recreated controls restores the
  live pivot + matches the new camera's pose — no jump; every nonce fly translates its framing
  distance into a zoom). Vertical-lock cleanly no-ops in ortho (no vanishing point). Toggle lives
  in the `ViewMenu`/`ViewSection` "Framing" cluster + a ⌘K "Parallel projection" command; persisted
  per-device via `qualityPrefs` (`parallelProjection`, back-compat default off).
- **Placement drop-in easing** (`scene/placementDrop.ts`, pure timing + unit-tested): a freshly
  placed piece eases DOWN onto its resting spot from a small height (~0.16 m, 300 ms, ease-out).
  `Furniture` keeps NO per-item `useFrame` (perf rule) — instead each item registers its root
  group (`registerDropGroup`), the commit calls `beginDrop(id)`, and one mounted
  `<PlacementDropAnimator>` (`useFrame`) mutates only the dropping groups' Y and holds the render
  pump open (via `registerAnimatedSource`) until the drop lands. Idle cost is a single `Map.size`
  check per frame.
- **Design system & theming** (`appearanceSlice`, `appearancePrefs`): 5 themes
  (Clay/Kampong/Porcelain/Estate/Harbour) × light/dark = 10 OKLCH palettes via
  `[data-theme]`+`[data-mode]` (pre-paint inline script, `hdb_appearance`, Auto=OS).
  Toolbar **Appearance** popover = theme + Light/Dark/Auto + **Simple/Pro** `uiMode`
  (Simple hides advanced clusters + collapses inspector sections; floor-plan always
  available). `useIsMobile.ts` ≤640px hook; `body.mobile` → bottom-sheets + minimal bar.
  **Row density** (P38, `densityMode` flag, pro-tier): a Comfortable/Compact `seg` in the
  same popover sets `uiSlice.density`, persisted via `editorPrefs` and applied as
  `[data-density]` on `<html>`, which overrides `--row-pad-y` (vertical rhythm only) consumed
  by `.menu-item` (`styles/tokens.css` + `styles/components.css`).
  **Ambient FX** (P7, `ambientFx` flag, simple-tier): decorative accents behind the single
  `useAmbientFx()` gate (flag AND `qualityTier !== 'performance'` AND no reduced-motion — dormant
  by default) — the HQ-render border-beam (`.beam`, mounts only while rendering, IntersectionObserver-
  paused off-screen) and the catalog/preset mouse-follow radial gradient (pointermove-driven `--mx`/
  `--my`, `color-mix` accent, no continuous animation).
- **GLB Asset Designer** (a.k.a. Asset Studio — `furniture/glbEdit/`, `ui/glbEditor/`,
  `featuresSlice.glbDesignerOpen`, gated by the **`glbDesigner`** flag — pro tier, default on;
  the flag gates the dialog mount, the ⌘K `glb-designer` command (COMMAND_FLAGS) and the catalog
  "Design" button). `GlbDesignerDialog.tsx` is composition + state wiring; the UI is split into
  focused sibling modules — `DesignerViewport` (canvas + gizmo + source model), `DesignerToolbar`
  (undo/redo + add-shape palette), `LayersPanel` (part list), `SourcePanel` (start-from + restore +
  recolour), `CombinePanel` (CSG), `SavePanel` (name/category/placement/save) + `PartInspector` +
  `PartsPreview`. Compose a custom asset from primitive shapes
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
  1°; `mesh` parts hide Scale (triangles are baked). **Undo/redo** (Stage 0): a bounded
  (~50-entry) history around the spec (`specHistory.ts`, pure + tested — push/undo/redo with
  ~300 ms same-key coalescing so a slider drag is one step), wired to ⌘Z / ⇧⌘Z in-dialog (⌘Y
  too) + the toolbar buttons (disabled at the ends). **Editable saves** (Stage 0): the edit
  spec is embedded on the saved def as a versioned JSON `assetSpec` (`specPersist.ts`,
  `{ v, spec }`, mirroring the configurator's `slotSpec` round-trip — travels IDB meta + the save
  schema), so re-picking a designer-built asset as the "Start from" source offers **Restore
  editable parts** (its full part list re-opens editable instead of a frozen source mesh); an
  absent spec keeps today's frozen-source behaviour. Launched from ⌘K / the catalog Design button.
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
  surfaces last, after the tour. Replay the tour via the Appearance panel or ⌘K. (`?`
  itself now opens the **keyboard-shortcuts overlay** — `ui/ShortcutsModal`, `shortcutsHelp`
  flag; `controls/shortcutHelp.ts` sources single keys from `KEYBINDINGS`; also on the ⌘K
  "Keyboard shortcuts" command.)
  **Smart Start** (`ui/wizard/`, one-click furnish+finish over presets `applyLayoutPreset`; on a
  **custom plan/template** it instead seeds a per-room kit + runs the plan arranger via pure
  `furniture/furnishPlan.ts` `furnishPlanItems`, so any template furnishes in one click).
  After arranging, `furniture/layout/decorStyling.ts` `applyDecorStylingForPlan` adds a
  styling pass: up to 2 `noClip` decor props per host surface (sofa→cushions, coffee
  table→bowl/magazines, bed→cushions, nightstand→plant/candle, desk→plant/books,
  sideboard/console→frames/sculpture). Skip via `withDecor=false`.
- **Quality tiers** (`quality.ts`): **render** `RenderTier` = Performance/Medium/High/
  Maximum. **Performance is the default for everyone** (flat: no shadows/IBL/post, DPR 1);
  Medium=+sun shadows+IBL; High=+post (N8AO+Bloom+HueSat+Vignette+SMAA); Maximum=+cinematic
  (full-res AO + film grain + chromatic aberration, `EffectsImpl` props from `aoFullRes`/`cinematic`).
  `QualityController` only steps
  **down** for 30fps, off once pinned. **Asset quality** = separate `AssetTier`
  (low/medium/high=Original LOD), follows render (`null`=Auto) but pinnable + FPS-immune.
  **Tone-mapping look** (`look.ts` `ToneMappingMode` Filmic/AgX/Neutral → three constant via
  `toneMappingThree.ts`; `Lighting` sets `gl.toneMapping`+exposure per-frame): user-selectable
  view transform, all tiers, persisted in qualityPrefs. **Context-aware default (RD-404,
  `toneContext.ts`):** the stored setting is `ToneMappingSetting` = the 3 operators + `'auto'`
  (the default); `resolveToneMapping(setting, ctx)` picks Neutral while the FinishPicker is open
  (`selectedRoomId != null` — accurate product colour), AgX for a photo context, else filmic — and
  an explicit pick always overrides context. A user **exposure** multiplier (`clampExposure`,
  Graphics slider) rides on top of the auto-exposure.
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
  **Texture anisotropy (RD-401)**: `materials/anisotropy.ts` is the single source of truth —
  every CanvasTexture creation (+ per-repeat `.clone()`) routes through `applyAnisotropy(tex)`,
  which stamps a cached cap (default 8) and tracks the texture. `scene/AnisotropyController`
  (mounted in both Canvases) calls `setMaxAnisotropy(gl.capabilities.getMaxAnisotropy())` on
  first render → clamps to `max(1, deviceMax)` (commonly 16) and re-applies to all already-built
  textures so module-load singletons + worker hot-swap maps sharpen at grazing angles. **DLC/
  uploaded (`textured`) maps get the same treatment (REAL-1)** — `cache.ts:buildMaterial`'s
  `textured` branch calls `applyAnisotropy` on every loaded albedo/normal/roughness/ao map, so a
  photo-textured floor/wall no longer renders blurrier than a procedural finish at grazing angles.
  **Wall/floor/ceiling material cache is a bounded LRU (PERF-A)**: `cache.ts`'s `CACHE` (also
  backs furniture `mat:<id>` DLC finishes, `furn:`-prefixed) is `materials/materialLru.ts`'s
  `LruCache` — the same bounded + dispose-on-evict shape the furniture material cache uses
  (AUD-002), capped at 256. Disposal only frees textures a material owns exclusively (the
  procedural branch's per-material canvas bakes, tagged via a file-local `own()`/
  `OWNED_TEXTURES`) — never the shared plaster normal/roughness singletons or `textured`-branch
  maps (loaded through drei's `useTexture`/`useLoader` URL cache, so a `tint:<baseId>:#hex`
  variant shares the same `Texture` instances as its base).
  **Finish recolor (FINISH-RECOLOR)**: a `tint:<baseId>:<#hex>!r` id switches a tint from the
  legacy `m.color` multiply (darken-only) to a **repaint** — `materials/recolor.ts` bakes a
  luminance-preserving, mean-anchored recolor of the albedo (per-pixel Rec.709 luma / image mean ×
  target colour, sRGB-byte domain, ≤1024px) into an **owned** `CanvasTexture` (disposed on evict;
  the normal/roughness/ao maps stay shared), so a dark walnut really becomes a light-grey wood.
  The picker writes it via the pure `composeMaterial.ts:recolorFinishId` (custom colour repaints
  the current finish; picking a new texture keeps an active colour override), gated by the
  `finishRecolor` flag (simple tier); `recolorThumbnailDataUrl` powers the composer/preview thumbs
  with a flat-colour fallback on any failure.
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
  The glossy-ceramic painters (`procedural/patterns/tile.ts` tile/hexagon/subway) get their glaze
  micro-detail from the pure `procedural/tileSurface.ts` (MAT-002): a fine face-only orange-peel
  micro-normal (`makeGlazePeel`) + an explicit glaze↔grout roughness contrast (`glazeRoughness`)
  that rides each painter's own grout grid so it aligns with the visible joints; Path-A, all-tier,
  no flag, tasteful defaults. Stone/marble (MAT-001) get their micro-detail from the pure
  `procedural/stoneSurface.ts`: a vein normal-relief (`veinHeight`) driven by the caller's OWN vein
  mask (so the relief aligns with the visible albedo veins) + a broad polished roughness drift
  (`makeRoughDrift`). Wired into Path A (`patterns/stone.ts:marbleFields`, all-tier, no flag) and
  Path B (`getMarbleMaps`/`getStoneMaterial` — the shared marble singleton gains a roughness-drift
  map gated behind `pbrSurfaces`; off → legacy uniform polish). Concrete (CONCRETE-PORES) adds a
  fine pinhole-pore roughness lift from the same `stoneSurface.ts` helper (`makePinholePores` — a
  sparse, non-negative roughness term where a high-frequency noise field crosses a high threshold,
  so scattered air pinholes read rougher than the sealed face) LAYERED onto `concreteFields`'
  existing macro mottle/pore/stain roughness (Path A, all-tier, no flag; roughness clamped [0,1]).
  Painted plaster/concrete (MAT-003)
  gets its micro-detail from the pure `procedural/plasterSurface.ts`: a signed, mean-preserving
  roller-nap roughness drift (`makeRollerNap` — broad coverage + fine nap stipple) so the matte
  wall isn't a single flat value yet stays matte. Path A (`patterns/wall.ts:plasterFields`, the
  `0.92` roughness now drifts; all-tier, no flag) and Path B (`generators.ts:getPlasterNormal`
  builds the shared normal AND, behind `pbrSurfaces`, a tint-independent roughness-drift multiplier
  map via `getPlasterRoughness()`, wired into the plaster branch of `cache.ts`; off → legacy flat
  `0.92` scalar). Brushed/satin metal (MAT-004) comes from the pure `procedural/metalBrush.ts`
  (`buildBrushedMetalFields` — directional U-running brush hairlines, row-variance ≫ column-variance)
  via `getMetalMaterial(color, finish, repeat)`: under `pbrSurfaces` a `MeshPhysicalMaterial` with the
  shared brush normal + roughness-streak maps + three.js `anisotropy` (finish presets
  `stainless`/`satin`/`black-steel`); off → a plain `MeshStandardMaterial` (legacy flat steel). The 8
  steel-bodied appliance primitives wire to it via `furniture/primitives/shared.tsx:applianceBody`
  (MAT-004b).
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
  glow via `fixtureGlow`. **Orbit and the room editor run this exact same graded simulation**
  (ORBIT-CEILING) rather than a flat daytime fill — since orbit culls the real ceiling to see
  inside, an invisible shadow-casting virtual ceiling occluder (`apartment/ceiling/
  CeilingOccluder.tsx`, mounted in both `Scene.tsx` and `RoomEditorScene.tsx`) blocks the sun
  from flooding straight in through the open top, so interiors stay lit only through windows and
  open doors, matching walk mode. The sun shadow map is **frozen when static** (PERF-MAX-1,
  `shadowRefreshSignal.ts`): the plan-centred (not camera-centred) frustum makes a pure camera
  orbit/auto-rotate/walk produce an identical depth map every frame, so `Lighting` sets the sun
  `shadow.autoUpdate=false` and only re-renders it on a sun tween, a discrete store change (via
  `RenderPump.markDirty`'s tail), or a moving shadow caster (`pulseShadowRefreshForMotion` in the
  fan/curtain/blind primitives) — a large per-frame GPU saving at High/Maximum with no visual
  change. See `src/scene/CLAUDE.md`.
- **Parametric furniture generator** (`furniture/parametric/`, PF2): dimension-driven
  bookshelf / wardrobe / sideboard / desk / **kitchen-cabinet run**. Pure tested core —
  `spec.ts` (`ParametricType` union, `clampSpec` envelopes, `defaultSpec`, never throws),
  `buildParts.ts` `buildParametric(spec)` → box `ParametricPart[]` (floor-anchored/centred/+Z;
  type-dispatch to specialist builders). Per-type builders: storage carcass (auto centre
  divider >1.2 m bays, ≤0.6 m door leaves, hanging rail, stacked drawers), desk (four-leg or
  pedestal with drawer stack), **kitchen-run** (recessed toe-kick 0.1 m, carcass shell,
  per-bay door/drawer/open fronts, continuous worktop slab 0.04 m thick with 0.02 m front
  overhang, optional wall uppers 0.35 m deep × 0.72 m tall with 0.18 m gap).
  `price.ts` board-area + worktop-premium estimate → def-level `price`. `buildObject.ts`
  maps parts → meshes (furnitureMaterials) shared by dialog preview AND
  `saveParametric.ts` (exportGlb → `persistUserGlb`, hash-dedupe → `UserGltfDef`;
  price+footprint via IDB meta + schema). UI `ui/parametric/ParametricDialog`
  (type tabs + DimField sliders + live preview; Add to room arms placement); entries:
  catalog-foot **Custom size**, ⌘K, mobile Design menu — `parametricFurniture` flag (simple),
  `kitchenCabinets` flag (simple) gates the Kitchen run tab specifically.
- **Parametric cabinet engine** (`furniture/cabinet/`): mm-customisable modular cabinets.
  `cabinetModel.ts` = pure tested `buildCabinet(spec)` → flat `CabinetPart[]` (toe-kick/
  carcass/countertop/cornice + slab·shaker·drawers·glass·open fronts; structurally sound).
  `CabinetModule.tsx` renders via `CabinetBase`/`Wall`/`Tall`; `cabinetCatalog.ts` = 3
  defs spread into `BUILTIN_CATALOG`.
- **Cabinet open/close** (`furniture/cabinetOpen.ts` + `primitives/openable.tsx`,
  `cabinetOpen` flag, simple/on): cabinet-family fronts open with eased ~0.4 s motion —
  doors swing on their hinge edge (`HingedDoor`), drawers slide forward (`SlideDrawer`) —
  driven by the per-item persisted `props.open` and an inspector "Doors & drawers" toggle
  (capability-gated via `supportsCabinetOpen`). Wired: kitchen cabinets, hinged wardrobes,
  sideboard, dresser. Animation holds the demand render-loop + shadow refresh open only
  while moving (the Curtain/RollerBlind pattern).
- **Slot product configurator** (`furniture/configurator/`, SLOT, `productConfigurator` flag,
  simple/prod-safe): a configurable product = base + named `slots`, each resolving to one option
  (procedural `parts` OR a bundled CC0 `gltfUrl`, never both) under a floor-anchored/+Z anchor.
  Authored in `products.ts` (`CONFIGURABLE_PRODUCTS` — mattress-on-frame bed, modular sofa);
  `clampConfig` (never throws, mutex/requires/excludes left-wins) + the pure render-agnostic
  `composeProduct` (parts + `gltfPieces` + unioned footprint + summed price + finish-target keys)
  feed BOTH the dialog preview and the bake, so they can't drift. `buildObject.ts` maps the composed
  model → a three `Group` (per-`finishKey` cloned materials for procedural parts); a **preview**
  build (`buildConfiguredPreview`) returns the body synchronously and attaches GLB pieces
  non-blocking + fail-soft (warn + skip a bad asset), while the **bake** (`buildConfiguredObject`)
  awaits every piece and fails LOUD (a load error rejects so the save never persists a phantom asset).
  **GLB slot-option load path (SLOT-203, `gltfSlot.ts`):** a raw `GLTFLoader` behind the shared SEC-1
  secure manager + the `gltf/decoders.ts` Draco path + meshopt, `withBase`'d url, parse-cached per url
  (few bundled slot urls) with an independent `scene.clone(true)` + per-attach material clones per
  attach → `fitScaleToFootprint` to the option footprint → reparent under a holder at the slot anchor
  (position + quarter-turn) → per-slot `namespaceGltfFinishTargets` renaming its material groups to
  `<slot>::<name>` so `listFinishTargets` returns them without colliding. `saveConfigured.ts` bakes it
  through the GLB-designer pipeline (`exportGlb` → `persistUserGlb`) into a regular `UserGltfDef` — no
  new persisted asset kind. Dialog `ui/configurator/ConfiguratorDialog` (product tabs + per-slot option
  buttons + live preview + running price; a bake failure surfaces an error toast); ⌘K "Configure a
  product". Area rules: `src/furniture/configurator/CLAUDE.md`.
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
  `'poly-pizza'` (prod), `'poly-haven-bundle'` (prod), `'zip'` (Kenney dev), `'ikea-live'` (dev
  sidecar `scraper-server.mjs` → `public/assets/ikea/`, SSE), `'manual'`. **Curated Poly Haven
  set-dressing bundles** (`catalog/packs/polyHaven.ts`, `POLY_HAVEN_BUNDLES`): themed one-click
  installs (Indoor plants / Shelf & table decor / Kitchen counter) of CC0 props from the keyless
  Poly Haven API. Poly Haven models are multi-file glTF (`.gltf`+`.bin`+textures), so
  `installPolyHavenBundle` fetches each item (deps come from the API `include` map, never
  constructed) and packs it into a self-contained GLB in-browser via `convertModel`
  (`furniture/convert/`), then reuses `buildEntry`/`commit`; nothing is vendored. **Remote material
  providers** (`catalog/remote/providers/`): Poly Haven (CORS, prod) + ambientCG (proxy, dev), gated
  by `activeProviderIds`/`PROD_PROVIDER_IDS`. **Poly Haven supplies materials/textures (+ HDRIs
  via `scene/lighting/hdriCatalog.ts`) plus these curated model bundles — but is NOT a *browsable*
  model source** (its multi-file glTF is why), so no provider emits `kind:'furniture'` (the
  `remoteFurniture` browse is dormant until one does). Add a source: poly-pizza-style client reusing
  `buildEntry`/`commit`, a `RemoteProvider`, or a `'manual'` entry.
- **Shared library (R2, prod)** (`state/slices/sharedLibrarySlice.ts`, `ui/catalog/SharedCard.tsx`,
  `catalog/packs/sharedLibrary.ts`): the Cloudflare R2 library **auto-populates the catalog grid**
  for signed-in **admins** — `bootstrapSharedLibrary` fetches `library/index.json` once on catalog
  open (guarded on backend + admin role + the `sharedLibrary` simple-tier flag), `useUnifiedCatalog(includeRemote,
  includeShared)` merges items as a `shared` `GridItem` kind (category via `mapCategory`, deduped
  against imported `ikea-<groupKey>` defs), and `SharedCard` lazy-loads its proxy thumbnail +
  imports on click (`addSharedGroup` → `registerSharedGroup` → `importGroup`). Manifest built by
  `scripts/build-library-index.mjs` (`entryFromMeta`, emits `groupKey`).
- **Local asset DB (dev-only)** (`scripts/vite-local-assets.mjs`, `state/slices/localAssetsSlice.ts`):
  GLBs dropped in `local-assets/` are served by a dev-only Vite plugin (`/@local-assets/index.json`
  + `/file/<relPath>`) and loaded straight into the catalog as `LocalGltfDef`s (`source:'local'`) —
  **no upload pipeline** (no convert/optimize/IndexedDB), for bulk datasets. `bootstrapLocalAssets`
  populates `localFurniture` (5th `buildMergedCatalog` source); gated by the `localAssets` devOnly
  flag + `import.meta.env.DEV` (empty in prod). Pairs with the CC0/CC-BY/PD scrapers in
  `research/scrapers/` (run into `scraped_assets/`; both dirs gitignored + dev-only).
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
  **Room-schedule CSV** (PARITY-ROOM-CSV) (`export/roomScheduleCsv.ts` pure `buildRoomSchedule` /
  `buildRoomScheduleCsv` → one row per room across ALL storeys: Storey/Room/Area/Perimeter/Floor finish/
  Wall finish/Ceiling height + a grand-total footer (room count + total area), unit-aware
  (`formatArea`/`formatLength`), RFC-4180-quoted, reusing `planRoomArea`/`planRoomPerimeter`/
  `resolvePlanRoomFloor`/`resolvePlanRoomWall` + `allPlanRooms`/`levelOfRoom`; `ui/openRoomScheduleCsv.ts`
  = Blob download). File menu + mobile + ⌘K, `shopExport` flag (simple).
  **FF&E CSV** (`export/ffeCsv.ts` pure `buildFfeCsv(rows, units, opts)` → RFC-4180 CSV of the same
  schedule: Room/Item/Source/SKU/Size (W×D×H, unit-aware)/Qty/Unit price/Line total + grand-total
  footer; prices blanked when `budget` is off; `ui/openFfeCsv.ts` = Blob download `<plan>-ffe.csv`).
  File menu + mobile + ⌘K, `shopExport` flag (simple) — the machine-readable third FF&E export.
  **Cost breakdown CSV** (`export/costBreakdownCsv.ts` pure `buildCostBreakdown`/`buildCostBreakdownCsv` →
  one sectioned RFC-4180 CSV reconciling Furniture-by-category (qty + subtotal via `itemPrice`) +
  Renovation/finishes lines (floor/wall area × the `renovationCost` rate table via `estimateRenovation`
  over `reportData.floorAreaByFinish`/`wallAreaByFinish`) + a reconciling GRAND TOTAL row
  (`grandTotal === furnitureSubtotal + renovationSubtotal`); `ui/openCostBreakdownCsv.ts` = Blob download,
  filename `<plan>-costs.csv`). No reinvented pricing. File menu + mobile + ⌘K, `shopExport` flag (simple).
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
- **Sweet Home 3D import** (`importSh3d` flag, pro; PARITY-SH3D): pure parser core
  `floorplan/import/sh3d.ts` `parseSh3d(bytes)` unzips a `.sh3d` (fflate `unzipSync`), reads
  `Home.xml` (DOMParser), and maps it into our plan model — cm→m (÷100), origin-anchored bbox,
  `<wall>` → `PlanWall` (thickness→external/internal), `<room>`/`<point>` → polygon `PlanRoom`,
  `<pieceOfFurniture>` → best-effort `categoryForPieceName` descriptors (unmapped → `warnings`,
  never dropped). Door/window pieces (`<doorOrWindow>` / `doorOrWindow="true"`) are flagged
  `opening` (`openingKindForName` → door|window). A second pure pass `import/sh3dPlacement.ts`
  `resolveSh3dImport(items, walls, catalog, existing, genId)` turns those descriptors into scene
  state: furniture → catalog defs (`defForCategory` footprint-best-match, orientation-agnostic)
  placed collision-free via `placeNonOverlapping`; openings → `PlanOpening`s by `associateOpenings`
  (nearest-wall via `floorPlanGeometry.nearestWall`/`alongWall`, centre→offset, sill/head from the
  piece height). Pure (no three/React/store); `importResultToFloorPlan` builds a `FloorPlan`.
  DOM glue `ui/openSh3dImport.ts` file-picks → parse → resolve placement → one undoable step
  (`setItems` + `setFloorPlan` with the openings) + a toast summarising walls / rooms / furniture
  placed / openings / unmatched (with each unplaceable piece as a warning detail). File menu +
  mobile File + ⌘K (`import-sh3d`).
- **Multi-axis furniture tilt** (`tiltFurniture` flag, pro; PARITY-TILT): `FurnitureItem` gains optional
  `pitch`/`roll` (radians); `furniture/tiltRotation.ts` `itemRotation` returns the intrinsic Euler tuple
  `[pitch, yaw, roll, 'YXZ']` the `Furniture` root group uses (reduces to pure yaw when untilted). The
  shared range lives there too (`TILT_LIMIT_DEG`/`TILT_LIMIT_RAD`/`clampTilt`, ±45°). Two affordances,
  one flag, one action (`itemsSlice.tiltItem`): the inspector's **Tilt** sliders
  (`ui/inspector/TiltControls.tsx`) and the in-viewport **`TiltGizmo`** drag handle
  (`scene/selection/TiltGizmo.tsx` + pure `tiltGizmoMath.ts`, PARITY-TILT tail) — a "joystick" (rod +
  ball) anchored above the selected item and tilted with its own live Euler tuple so it always points
  the way the piece leans; drag the ball via pointer events (mouse + touch): vertical screen delta →
  pitch, horizontal → roll, clamped to the shared range (no floor-plane raycast — pitch/roll have no
  world-space plane to project onto, unlike `RotateGizmo`/`ResizeGizmo`). Single-item only, hidden for
  locked items and Staircase. Serialized (optional) in `schema.ts`. Collision stays yaw-OBB (tilt
  doesn't change the plan footprint).
- **3D scene export** (`sceneExport3d` flag, pro; Q-3DEXPORT): `ui/openSceneExport.ts` `exportScene3d`
  downloads the whole furnished home as `.glb` (reusing `furniture/convert/toGlb.ts` `exportGlb`), `.obj`
  (`export/sceneObj.ts`, dynamic `OBJExporter`), `.stl` (`export/sceneStl.ts`), or `.usdz`
  (`export/sceneUsdz.ts`). The live scene root is reached from DOM code via `scene/SceneExportController`
  + the `scene/sceneExportAccess.ts` singleton (mirrors `ScreenshotController`/`captureCanvas.ts`). Pure
  `export/sceneGltf.ts` `buildExportRoot` clones the scene and strips editor-only helpers — anything
  tagged `userData.noExport` via `noExportUserData`/`markNoExport` (selection/gizmo/overlays/sky/pins/
  ghost), plus a structural fallback for three helper types + cameras — **before either export path
  below**, so the exclusion holds regardless of scene size. In Tools + Share modal + mobile + ⌘K.
  - **Worker-streamed export for very large scenes (Q-3DEXPORT tail).** `GLTFExporter.parse()` (and
    OBJ/STL/USDZ's exporters) is a single, un-yielding synchronous call — fine for a furnished room, but
    it can visibly stall the UI for a very large scene (a whole multi-room home, or an import-heavy
    design). `export/exportThreshold.ts` (`computeExportStats` + `shouldUseWorkerExport`, pure + unit
    tested) walks the *pruned* export root and decides: over `WORKER_EXPORT_MESH_THRESHOLD` (400) mesh
    nodes OR `WORKER_EXPORT_TRIANGLE_THRESHOLD` (250k) estimated triangles routes to a Worker; otherwise
    `exportScene3d` keeps the exact prior direct main-thread call (unchanged behaviour, no progress
    toast — it's fast enough not to need one).
    - **Why not `postMessage` the live scene directly**: three's `Object3D`/`Mesh`/`Material`/`Texture`
      instances are class instances (methods, prototypes) and aren't structured-cloneable.
      `export/sceneMarshal.ts` reuses three's own JSON round-trip (`Object3D.toJSON()` + `ObjectLoader`)
      to bridge the gap, with one change: `BufferGeometry.toJSON()` boxes every attribute/index typed
      array into a plain `Array` (`Array.from`) — the one part of that round-trip whose cost actually
      scales with scene size. `marshalSceneForWorker` monkey-patches `BufferGeometry.prototype.toJSON`
      (only for the duration of the call) to keep arrays as native typed arrays instead — a typed array
      survives `postMessage`'s structured clone as a fast memcpy; a boxed number array costs O(n) twice
      over. Primitive geometries (`BoxGeometry`, etc.) already short-circuit via `.parameters` and are
      untouched; an `InterleavedBufferAttribute` (rare for placed furniture) falls back to the original
      boxing path for correctness. **Trade-off**: texture embedding (`Texture.toJSON` → canvas → data
      URL) still runs on the main thread — unavoidable (only the main thread has a live canvas/Image to
      read pixels from) but bounded by unique-texture count, not item count (furniture materials are
      shared/cached, see `furniture/CLAUDE.md`), so it doesn't scale with "very large scene" the way
      node/geometry count does.
    - `export/exportWorker.worker.ts` receives the marshaled payload, calls
      `sceneMarshal.ts:reconstructSceneFromMarshal` to rebuild a REAL three.js `Object3D` tree — geometry/
      material/object parsing goes through `ObjectLoader`'s DOM-independent instance methods
      (`parseShapes`/`parseGeometries`/`parseTextures`/`parseMaterials`/`parseObject`; the shapes table
      is REQUIRED — a `ShapeGeometry`/`ExtrudeGeometry` resolves its `parameters.shapes` uuids against
      it and the parse crashes without it), while embedded image data URLs are decoded via
      `atob`+`Blob`+`createImageBitmap` (Worker-safe; `ObjectLoader`'s own `parseImagesAsync` needs
      `document` and can't run in a Worker) — then calls `updateMatrixWorld(true)`
      (never rendered, so matrices are never auto-synced) and runs the **exact same** per-format
      `exportGlb`/`exportSceneObj`/`exportSceneStl`/`exportSceneUsdz` the main-thread path uses — no
      export-logic duplication.
    - `export/runSceneExport.ts` `runWorkerSceneExport` spawns the worker (lazy, one-shot, injectable
      factory for tests — mirrors `furniture/optimize/runOptimize.ts`), marshals, and rejects (never
      hangs) on worker-unavailable / crash / malformed reply / a `WORKER_EXPORT_TIMEOUT_MS` (60s)
      timeout. `exportScene3d` shows an indeterminate progress toast for the worker path
      (`notify.start({kind:'progress', ...})` → `notify.success`/`notify.error` on the same id, the P32
      live-notification pattern) and, on ANY worker failure, transparently falls back to the direct
      synchronous path (updating the toast, never a silent hang) — small-scene behaviour is untouched.
    - **Real-browser verification**: `scripts/scenarios/scene-export-worker.json` proves REAL
      `new Worker(new URL(...))` construction under the bundler (the unit tests inject a fake Worker,
      so broken worker wiring would otherwise be silently masked by the fallback) via the dev-only
      seams in `openSceneExport.ts` (`window.__forceWorkerExport` forces the worker path;
      `window.__lastSceneExport` records `{path: 'worker'|'direct'|'worker-fallback-direct', bytes,
      format}` — both `import.meta.env.DEV`-gated, inert in prod). The **default furnished 4-room HDB
      scene measures ~1273 meshes / ~311k estimated triangles — over BOTH thresholds — so the default
      export takes the worker path**; measured worker GLB output ≈53 MB.
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
  **Inter-room doorway bleed (R-BLEED):** pure `lighting2d/doorwayBleed.ts` adds a *directional*
  neighbour-contribution term to both the scalar table (`estimateRoomLux`, new `borrowedLux`) and the
  spatial grid (`buildRoomLuxGrid`): a room borrows a documented fraction (`BLEED_TRANSMISSION`, aperture-
  scaled) of each adjacent room's OWN ambient through an **open** doorway (`doors` map; closed by default →
  zero bleed, so the out-of-box overlay/table are byte-identical to before). First-degree only (no cascade,
  like wall-reveal spread). The grid distributes the borrowed room-mean with a facing (cosine) + distance
  falloff weight normalised to unit mean — so the heatmap pools the bleed in front of the doorway and fades
  around corners while the per-room average still equals the 2D table (the lumen-method lock-step holds).
  No raycast (doorway-direction weighting only; convex-room approximation). Rides the same `drawings` flag.
- **Electrical points schedule** (`analysis/electricalSchedule.ts` pure → `buildElectricalSchedule(plan,
  items, catalog)`: a consolidated, room-by-room count of **lighting points** (reuses
  `lightEmitters.isItemEmitter`, the same predicate the lighting plan uses) + indicative **power points /
  sockets** inferred from the powered furniture categories present (`SOCKETS_PER_CATEGORY`:
  kitchen/appliances/electronics/laundry/others) floored to a per-room-kind minimum (`MIN_SOCKETS_BY_KIND`
  via `roomKindFromName`), with per-room + grand totals; items attributed via `allPlanRooms` + `pointInRoom`
  (multi-storey aware, strays → "Unassigned"). An *indicative* rough quote aid, not a certified electrical
  layout. Rendered as the "Electrical points (indicative)" report section (rides the `report` flag, additive
  block — distinct from the lighting plan + fixture schedule). PARITY-ELECTRICAL-SCHED.
- **IES photometric profiles** (`src/lighting/ies/`, pure + render-agnostic — PC-IES-LIGHT, Coohom
  parity): `parseIes.ts` parses an IESNA LM-63 ASCII `.ies` file (header keywords, TILT line incl.
  inline `TILT=INCLUDE`, the 10 photometric params, vertical/horizontal angle arrays, candela grid ×
  multiplier; throws `IesParseError` on malformed input); `iesProfile.ts` derives peak/beam(50%)/
  field(10%) angles; `spotMapping.ts` maps a profile → Three `SpotLight` (`angle`=field half clamped
  6–80°, `penumbra` from beam:field ratio, `intensity` from base × focus); `sampleProfiles.ts` bundles
  two self-authored CC0 downlight profiles; `iesStore.ts` caches bundled + uploaded (`custom:<key>`)
  profiles. A lit item with `props.iesProfile` renders a downward `SpotLight` in `FurnitureLights.tsx`;
  picked via `ui/inspector/IesProfilePicker.tsx`. Gated by the `iesLights` (pro) flag.
- **Design score** (`analysis/designScore.ts` pure → weighted 0–100 + A–F grade over 5 categories:
  clearance/furnishing/circulation/daylight/lighting, each with actionable issues). Reuses the
  overlap/wall-clip/door/walkway/daylight checks + 2 new heuristics (furnishing coverage, per-room
  emitter coverage). `ui/DesignScorePanel.tsx` (`.aux`: grade dial + bars + fixes); Tools + ⌘K; +
  a section in the printable `report.ts`. Guards a partial plan (missing walls/openings).
- **Design suggestions** (`analysis/suggestions.ts` pure → `buildSuggestions({rooms})`: a data-driven
  rule set over each room's inferred kind + the furniture categories present, yielding per-room
  "what to add / improve" tips). Powers the in-app suggestions panel and the report's **Design
  suggestions** section (PARITY-SUGGESTIONS-SECTION) — same builder, categories derived via
  `pointInRoom`; rides the existing `report` flag, omitted when no suggestion fires.
- **Move-in / handover checklist** (`analysis/handoverChecklist.ts` pure →
  `buildHandoverChecklist(plan,items,catalog)`: a derived snagging + key-handover punch-list
  grouped by room (per-`RoomKind` defect rules via `roomKindFromName`, generic bucket for an
  unrecognised kind), plus appliance/utility activation items for the appliance categories
  actually placed, plus an always-present keys/meters/documents group). The report's **Move-in
  checklist** section (PARITY-MOVEIN-CHECKLIST); rides the existing `report` flag, always renders
  (an empty plan still yields the generic group).
- **Renovation estimate** (`analysis/renovationCost.ts` pure → `estimateRenovation(floorAreas,wallAreas,rules?)`:
  SG supply+install $/m² per finish category). The default rate table (`RENO_RATES`) is the factory
  default of a **configurable price-rule library** (`PriceRules`/`DEFAULT_PRICE_RULES`, with
  `mergePriceRules`/`isNonDefaultPriceRules`/`floorRateFor`/`wallRateFor`): the user can override any
  per-bucket floor/wall rate + the carpentry $/lin.m. The card lives in `priceRulesSlice` (`priceRules`,
  `setPriceRules`/`resetPriceRules`, both push undo + in the history snapshot), persists in the save
  schema when non-default, and is threaded into the quote (`assembleBoqInput`), the report
  (`buildReportHtml`) and the cost CSV (`buildCostBreakdown`) so all three price identically. Editor:
  the "Price rules (rates)" section of `QuoteTemplateModal` (`priceRules` flag, pro). The report's
  Renovation estimate section shows the finishes subtotal + combined furniture+finishes total.
- **Plan statistics** (`analysis/planStatistics.ts` pure → `buildPlanStatistics(plan)`: GFA summed
  across ALL storeys, room count + per-kind mix (`roomKindFromName` buckets, unknown→`other`),
  average room size, total room perimeter + total wall length, and the net-vs-circulation split
  (corridor/hallway rooms by name). Reuses `allPlanRooms`/`planLevels`/`planRoomArea`/
  `planRoomPerimeter`/`wallLength`; empty plan → fully-zeroed digest. The report's "Plan statistics"
  section (rides the `report` flag, no new flag).
- **Renovation timeline** (`analysis/renoTimeline.ts` pure → `buildRenoTimeline(input|plan)`: an
  indicative phased schedule [protection/hacking → … → cleaning/handover] scaled by area + room count,
  `RENO_PHASES` table). Rendered as the report's Renovation timeline Gantt section. **`.ics` calendar
  export** (`export/renoIcs.ts` pure `buildRenoIcs(phases, startDate[, now])` → RFC-5545 VCALENDAR,
  one all-day VEVENT per phase, CRLF + TEXT escaping + stable per-phase UID + PRODID; `startDate`
  passed in so the module is clock-free; empty phases → a valid empty VCALENDAR. `ui/openRenoIcs.ts` =
  Blob download starting today, toasts when there are no phases). Tools + mobile + ⌘K, rides the
  existing `report` flag (pro).
- **Thermal envelope** (PARITY-THERMAL) (`analysis/thermalAnalysis.ts` pure →
  `buildThermalReport(plan, finishes?)`: sums exterior opaque wall area + glazing (window-opening) area
  across ALL storeys, maps each surface → a representative SG U-value via the documented `U_VALUES`
  lookup (RC wall 2.0, brick 1.7, lightweight 1.0, cladding 0.6; single glazing 5.7, double 2.8,
  low-E 1.8), returns total envelope area, area-weighted average U + glazing ratio, and a conductive
  heat-transfer index `Σ area×U` (W/K). Indicative, NOT a certified calc; exterior walls
  (`thickness==='external'`) + window openings only. Reuses `planLevels`/`wallLength`; bare-shell /
  all-interior plan → zeroed digest. The report's "Thermal envelope" section (rides the `report` flag,
  no new flag).
- **Accessibility check** (`analysis/accessibility.ts` pure → `buildAccessibilityReport(plan)`:
  door clear widths vs 0.85 m + 1.5 m wheelchair turning circle per habitable room; BCA-Code rule of
  thumb). `ui/AccessibilityPanel.tsx` (`.aux`, Tools + ⌘K) + the report's Accessibility section.
  Plan-only (reads for a bare shell).
- **Daylight & ventilation check** (`analysis/daylight.ts` pure → `buildDaylightReport(plan)`:
  per-room window glazing % + openable % vs rule-of-thumb thresholds `DAYLIGHT_MIN_RATIO` (0.1) /
  `VENT_MIN_RATIO` (0.05); windows attributed to rooms by a wall-midpoint probe, `OPENABLE_FRACTION`
  for sliding windows; level-gated for multi-storey). `ui/DaylightPanel.tsx` + the report's
  "Daylight & ventilation" section (PARITY-DAYLIGHT-DIGEST; skipped when no room has a window).
- **Door & window schedule** (`analysis/openingSchedule.ts` pure → `buildOpeningSchedule(plan)`:
  walks `plan.openings` across all storeys, resolves each opening's room(s) by a wall-midpoint probe
  (`PROBE_OFFSET`, as in `daylight.ts`), and groups openings with identical (kind, width, head−sill)
  into typed marks — D1/D2…/W1/W2… — each with a count, size W×H, sill, door swing/hinge and the
  rooms it borders; openings on a missing wall / off any room fall into an `Unassigned` bucket).
  Renders the report's "Openings schedule" section (PARITY-OPENING-SCHED; omitted when no openings).
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
  carry a vertical span + `mounted`/`noClip`. **Granular (shape-aware) footprints**:
  a def may declare `footprintParts` (a convex decomposition of a non-rectangular
  shape — static, or a function of live props for parametric pieces), and
  `itemFootprintParts(item,def)` maps each part to a world OBB (scale + rotation +
  GLB offset applied). All collision tests are **any-part-vs-any-part** SAT, so e.g.
  an L-sofa's concave notch is open floor; absent `footprintParts` → the single
  `defaultFootprint` OBB (unchanged). The broadphase (`itemAabbBox`) **unions every
  part's AABB** so the box always bounds the true shape (the L-sofa's enclosing OBB
  is read from `depth` and is shallower than the main-run+chaise shape — boxing it
  alone would break the superset invariant and prune a real overlap); single-part
  pieces are identical to before. The **selection floor-tint + placement ghost**
  paint the same shape: `itemFootprintPartsLocal(item,def)` returns the parts in the
  item's local frame (one centred part = the old rectangle for plain pieces), and
  each consumer renders one plane per part inside a group carrying the world pose —
  so an L-sofa tints its true L (notch open). The selection **bounding box + resize
  handles** use `itemFootprintSpanLocal` — the **minimum spanning box of the parts**
  (`SelectionOutline` brackets; `ResizeGizmo` unions every part's `obbCorners`) — so
  the box bounds the true geometry (the L-sofa's chaise included) instead of the
  depth-only OBB that cut through it; single-part pieces are unchanged. The placement
  ghost's green/red tint is driven by `canPlace` → `ghostValid` (true-shape parts, so
  the tint reflects the real fit). (The L-shaped sectional + corner base cabinet ship
  the first decompositions: main run + chaise / two runs.) **Round/oval tables**
  (`furniture/footprintShapes.ts:ellipseFootprintParts(width, depth, steps=4)`) approximate a
  disc/ellipse the same way, since a union of OBBs can't carve a rectangle down to a circle: a
  symmetric "staircase" of axis-aligned boxes inscribed in the ellipse (5 boxes at the default
  `steps=4`), each box's far corner landing exactly on the curve so the whole union is a subset of
  both the ellipse and the enclosing bbox — frees the bbox corners a round/oval top never actually
  reaches without an intersection/polygon footprint primitive. Wired into `dining-table-4`/
  `coffee-table` (`shape: 'round'|'oval'`) and `side-table` (`'round'`/`'drum'`); `'rect'`/`'square'`
  return `[]` (unchanged single-box behaviour). **Soft push-apart on drop**:
  a single-item drag that ends overlapping is nudged out to the nearest valid spot
  instead of hard-reverting — `obbMtv` (SAT minimum translation vector) picks a push
  direction and `nudgeToValid` steps outward (± fan) verifying each candidate with
  `canPlace`, bounded to ~0.4 m (deep overlaps still revert); wired in `DragController`
  as a confirmable edit. `placementWalls.ts`
  centralizes wall selection (room editor → solid perimeter; upper storeys → own
  walls). All cross-item/wall scans are **storey-scoped** (F13/ML3): `itemsCollide`
  + `findNarrowGaps` gate pairs on `levelId`, `levelWallClips.ts
  findWallClipsByLevel` resolves each item's own level's walls (used by score /
  report / Clearance panel), and walk-mode `buildWalkBlockers` keeps the
  walker's-storey items (level teleport, ML6c). **Wall reveal**
  (`apartment/walls/`): exterior walls between camera and interior fade out —
  ANGLE-GRADED (WALL-REVEAL-ANGLE-GRADED, reversing the earlier binary
  target + hysteresis): fade strength ramps with how much the wall's outward
  surface faces the camera (onset `REVEAL_ONSET`, peak head-on; pure curve in
  `wallRevealMath.ts`), settling anywhere along the curve; far walls (outward
  normal away from the camera) are structurally excluded (strength 0 → opaque).
  A wall sharing a corner with a wall fading by its own facing spreads the fade
  (first-degree only, `cornerNeighbors` + the per-frame own-strength registry in
  `wallReveal.ts` — WALL-REVEAL-CORNER-SPREAD). A single **fade-strength** slider
  (`wallRevealStrength`, 0..1, step 0.05, default 0.95 — WALL-REVEAL-STRENGTH,
  replacing the old translucent/auto-hide/opaque modes) sets the head-on opacity
  floor to `1 − strength` (`0` never fades, `1` fully hidden;
  `revealTargetOpacityForFade`), applied together with `wallRevealScope`.
- **Snap + drag aids + rotate** (`scene/snap.ts`, `GridOverlay.tsx`, `DragController`,
  `selection/RotateGizmo.tsx`+`rotateGizmoMath.ts`): grid 10/25/50cm/1m; align
  (`AlignmentGuides`), equal-spacing smart guides (`collision/equalSpacing.ts`
  `detectEqualSpacingAxis` — matching distance badges + ticks when the dragged item
  forms equal gaps with neighbours/walls, snaps to the even-gap centre; pure +
  unit-tested, rendered in `AlignmentGuides`), flush-to-wall (`wallSnap.ts`, off
  when grid-snap on), live per-side distance-to-wall HUD (`DragHud` ← `clearanceGap.ts` `wallGapsPerSide`,
  left/right/back/front gaps, amber under `walkwayMin`); touch rotate ring (single 15°, multi rigid centroid, Shift=free,
  green/red validity, complements **R** 90°). **Smart rotation snap** (`smartRotateSnap` flag, pro;
  PARITY-SNAP-ROTATE): while rotating a single item the ring also snaps to a nearby item's / wall's
  axis (parallel **or** perpendicular, mod-90°) when the free yaw lands within `NEIGHBOUR_SNAP_THRESHOLD`
  (5°) — strict precedence over the 15° grid (5° ≪ one grid step → no flicker zone), Shift still
  bypasses all snapping — with a faint diametric alignment guide drawn while the neighbour snap is
  active. Pure `rotateGizmoMath.ts smartSnapRotation`/`neighbourAxes` (gizmo gathers refs once at grab).
  The drag's two O(n) per-move scans (snug-stack +
  `canPlace` collision) are **broadphased** (PERF-003) through a per-drag spatial grid of the static
  items (`collision/broadphase.ts` `buildGrid`/`queryRect`, built once + cleared on drop): a point query
  for snug-stack, a moved-AABB query for collision; alignment snap keeps the full scan (cross-room
  alignment is intended). Equivalent to the full scan (no overlapping AABB ⇒ no overlapping OBB).
  The **auto-arrange tidy pass** (`layout/autoArrange.ts` → `tryPlace`) reuses the same broadphase:
  each candidate placement restricts `canPlace`'s `others` to its footprint neighbourhood via
  `placement.ts` `broadphaseNeighbours` (ARRANGE-GRID) — identical result, proven by
  `layout/arrangeBroadphase.test.ts`.
  On drop, a single **surface item** (one carrying a numeric `surfaceHeight`) over a table/shelf snaps
  its rest height onto that surface's top (PC2-SURFACE-DROP, pure `collision/surfaceDrop.ts`
  `resolveSurfaceDropHeight` over the `tables`/`storage` categories; updates `props.surfaceHeight` via
  `setItems` so it's one undo step).
- **Floor plan editor** (`ui/floorplan/`, `floorplan/`): 2D editor of store `floorPlan`
  — walls, rectangular/L-shape (`extension`)/free-`polygon` rooms (Polygon + Auto-room),
  doors/windows, ceiling height (global + per-room), grid+corner snap, per-room floor
  finishes, length labels, and a **furniture name/price label** toggle (`planLabels`
  flag + pure `ui/floorplan/planLabels.ts`, SH3D parity). Per-room **floor + wall + ceiling finishes** resolve through
  `floorplan/roomFinishes.ts` (`resolvePlanRoomFloor`/`Wall`/`Ceiling`: live `finishes` slice →
  `PlanRoom.floor`/`wall`/`ceilingFinish` → default; ceiling default = plain white/unset). The
  per-room `FinishPicker` (opens on `selectedRoomId`, aside carries a `finish-picker` class) is the
  unified surface panel — Floor + Walls +
  a **Ceiling** section (paints from the wall pool, `ceilingFinish` flag; apply-all + reset-to-white).
  The three surfaces render as a `.seg` **Floor | Walls |
  Ceiling** tab row (`role="tablist"`/`tab`/`aria-selected`, Ceiling tab only when `ceilingFinish` is on)
  and only the active surface's block shows (the wall-accents section lives under the Walls tab); the tab
  state reuses the persisted `lastSurface` (`LAST_SURFACE_KEY`, extended to `'ceiling'`) that also drives
  the Browse target. The `.finish-picker .sec-h` scoped rule flattens
  the picker's section-header strips (static/transparent/no hairline) without touching the base sticky
  `.sec-h`;
  the finish setters write through to the active plan and plan activation prunes stale
  custom-room keys; `PlanRoomShell` paints plan walls via `apartment/walls/PlanWallFinishFace`. **Split / Reverse / Join** (pure `wallOps.ts` — openings re-homed) + **exact length/angle** inspector
  fields (`wallOps.ts` `endForLength`/`endForAngle`/`wallAngleDeg` — PARITY-WALLDIM) + draggable endpoint handles (`moveWallVertex`) +
  whole-wall drag/rotate keeping connected corners joined (`moveWallTo`, rotation clamped ±90°) for
  non-orthogonal shapes. Drawing a new wall snaps its endpoints to existing corners **and** wall spans
  (a T-junction) via pure `ui/floorplan/editor/snapToWalls.ts` (vertex wins over edge; free past the radius)
  and snaps the draft *direction* to 15° increments (covering 30/45/90°) via pure
  `ui/floorplan/editor/snapWallAngle.ts` — order is grid→angle→wall-snap (a join to real geometry still
  wins), **Shift bypasses** the angle snap, and the live readout shows length + angle (PC2-PLAN-ANGLE-SNAP);
  **on touch the Wall tool is tap-to-place + chaining** (tap start, tap end, continues from the last end;
  `wallTapHadAnchor` ref distinguishes placing the start vs the end), with snapped start-dot/end-ring markers
  drawn on the draft (desktop keeps drag-to-draw).
  The per-tool **draft-state transitions** (commit thresholds + endpoints for wall / room / scale /
  dimension drags, polyroom/polyline vertex-add-vs-close, and the wall rotate-ring transform) are pure,
  unit-tested functions in `ui/floorplan/editor/toolDraftReducer.ts` (`wallCommit`/`roomCommit`/
  `dimensionCommit`/`scaleCommits`/`wallTapCommits`/`polygonClick`/`rectFromVerts`/`rectFromDraft`/
  `rotateWallTransform`); `FloorPlanEditor`'s `onDown`/`onMove`/`onUp` are thin dispatchers that own the
  React draft state + store writes and delegate the math (MOD-FPE-SPLIT, behaviour-preserving extraction).
  The screen→world coordinate mapping those dispatchers call into (grid/guide snap, wall magnetism, the
  wall-draw angle-then-wall-snap pipeline) is itself factored into `ui/floorplan/editor/planPointerMapping.ts`
  (`createPlanPointerMapping`, REFAC-2) — not a pure module (reads the live SVG rect off `svgRef`), so
  it composes the pure `floorPlanGeometry`/`snapToWalls`/`snapWallAngle` primitives rather than being
  unit-tested itself. REFAC-2 also lifted the toolbar/header JSX out of the component: small
  presentational controls (`EditModeToggle`, `DrawToolPalette`, `WallTypeToggle`, `UndoRedoButtons`,
  `GridZoomControls`, `PlanTotalLabel`, `PlanViewMenuActions`, `PlanDefaultsFields`) plus two layout
  shells (`PlanEditorHeader` — the mobile/desktop toolbar row, `PlanToolsSheet` — the mobile menu,
  now the same `MobileSheet` icon-rail sheet as the main mobile toolbar, TB-6-tail) that take
  already-built fragments as `ReactNode` props rather than raw store state, and
  four more SVG **render layers** alongside the eleven from MOD-FPE-SPLIT (`PlanGuidesLayer`,
  `OtherLevelsUnderlay`, `PersistentDimensionsLayer`, `AnnotationsLayer`). The "Plan ▾" menu's file/
  reference-photo actions (~230 lines, many independent feature-flagged pieces) were deliberately
  **left inline** — a prior audit (TASKS.md MOD-FPE-SPLIT) judged that bundling them into one
  component needs a 40+ prop surface that would hurt readability more than the named-fragment consts;
  the same reasoning kept `onDown`/`onMove`/`onUp` themselves in the component (moving ~30 pieces of
  gesture `useState` into an external hook was judged higher-risk than the line-count win).
  **Numeric wall entry** (`wallNumericEntry` flag, pro, default on): while a desktop wall draft is active
  a floating overlay (`ui/floorplan/editor/WallNumericEntry.tsx`) appears near the cursor endpoint with
  Length and Angle ° text fields; typing drives a live preview; Enter commits at the exact values; Tab
  moves between fields; Escape cancels; dragging updates unowned fields live. Pure geometry helpers in
  `floorplan/wallNumericEntry.ts` (`endpointFromLengthAngle`, `segmentLengthAngle`, `parseLengthInput`,
  `parseAngleInput`, `validateLength`, `validateAngle`) parse metric (m/cm) and imperial (ft/in) input.
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
  **`duplicateRoom`** (pure `floorplan/duplicateRoom.ts`, PARITY-PLAN-ROOM-DUP — "Duplicate room" in the room
  inspector) clones a room's polygon (offset 0.5 m), its floor/wall finishes, and its OWN offset boundary
  walls + their openings (fresh ids, re-flowed `<room> copy …` names) so shared walls are never mutated;
  one undo step, selects the copy, stays on the room's storey.
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
  PARITY-ROOMLABEL). Each room's label shows name + live floor **area** (`planRoomArea`) + wall
  **perimeter** (`planRoomPerimeter` — shared with the report) on the full-detail tier, unit-aware
  (`roomLabelDetail` thins it as the room shrinks). Live furniture as `canPlace`-checked footprints (active storey
  only), draggable to move **and** with a **rotate handle** on the selected piece (ring + facing knob
  mirroring the wall rotate ring; reuses the 3D gizmo's `scene/selection/rotateGizmoMath.ts`
  `pointerAngle`/`computeRotation` 15°-snap, Shift = free; `canPlace`-validated per frame, one undo
  step per drag — PARITY-PLAN-FURN-ROTATE); **selecting a placed item also shows a furniture inspector**
  (`ui/floorplan/PlanFurnitureInspector.tsx`, PARITY-PLAN-FURN-INSPECT — rendered by
  `PlanInspector` when the plan selection resolves to `selectedItemId`): rename, numeric
  X/Z, angle and (parametric defs) width/depth + a size readout, lock + delete. Edits route
  through the same `itemsSlice` actions as the 3D inspector — moves/rotations are
  `canPlace`-checked and push one undo step; resize goes through coalesced `updateItemProps`.
  Item- vs plan-element selection is **mutually exclusive** (`selectItem` clears
  `planSelection`; `setPlanSelection` clears `selectedItemId`) so the two inspectors never
  co-render. Available in **both Simple and Pro** (plan editing is a core loop — no extra flag;
  rides the editor's `floorPlanEditor` gate).
  **Click-to-place furniture in the plan** (PLAN-FURNISH Phase 1, `planFurnish` flag, **pro**,
  default on — desktop only): move/rotate/scale of already-placed items works in 2D as above; this
  adds the missing **add** verb, reusing the same `canPlace`/`addItem`/`placementSlice` pipeline as
  the 3D catalog rather than a parallel implementation. `CatalogDrawer` surfaces inside the plan
  editor too — its gate becomes `roomEditorActive || (floorPlanEditing && planFurnish && !isMobile)`
  (a `.catalog-in-plan` modifier bumps its z-index above the plan's full-screen overlay); a desktop
  "Furnish" toolbar button opens it and force-shows furniture footprints. Arming a card
  (`setActiveDefId`, shared `placementSlice` state with the 3D flow) drives a new SVG
  **`editor/layers/PlacementGhostLayer.tsx`** — a footprint polygon tinted `--ok`/`--danger` by
  `canPlace` validity — instead of reactivating the canvas-bound 3D `scene/PlacementGhost.tsx`/
  `usePlacementController.ts` (both stay inert behind the plan overlay: `canEditScene` is
  structurally independent of `floorPlanEditing`, and every 3D commit path is gated on
  `ev.target instanceof HTMLCanvasElement`, which a click on the plan's SVG never satisfies — see
  `state/editing.test.ts`'s PLAN-FURNISH regression case). The ghost build / `canPlace` validity /
  commit decision are pure, unit-tested in `ui/floorplan/editor/planFurnishPlacement.ts`
  (`buildPlanGhostItem`/`planGhostValid`/`decidePlanCommit`); `FloorPlanEditor`'s `onDown` computes
  the click's own world point fresh and commits through the identical `addItem` → `beginDrop` →
  `pendingEdit` path the 3D controller uses, passing the active storey's `levelId` explicitly
  (`addItem` can't infer it outside the room editor). R rotates the ghost and Escape/right-click
  cancel for free via the existing global `usePlacementController` keydown/contextmenu listeners
  (shared `activeDefId`/`ghostRotation` state) — the plan editor's own Escape handler special-cases
  an armed placement first so it cancels the placement instead of exiting the editor. Window-bound
  fixtures (curtains/blinds/grilles) are excluded from Phase 1 (`isPlanPlaceable`) with an
  explanatory toast + auto-disarm — no window-snap branch here yet. New-item defaults are a single
  shared `furniture/placement/defaultItemProps.ts` (factored out of the 3D ghost/controller, which
  used to each define their own copy). **`EditConfirmBar`'s "abandon a pending edit on leaving the
  editor" effect keys off `!roomEditor.active && !floorPlanEditing`** (not `roomEditor.active`
  alone) so a plan-origin placement's tick/cross bar isn't auto-confirmed the instant it appears
  merely because the room editor was never entered. Phases 2–4 (mobile tap-to-place, window-bound
  fixtures, HTML5 drag-from-catalog) are deferred — see
  `docs/research/2026-07-03-plan-furnish-implementation-plan.md`.
  **Rubber-band marquee** (PARITY-PLAN-MARQUEE):
  a drag on **empty canvas** with the select tool draws a dashed accent rect (pure
  `ui/floorplan/editor/marqueeSelect.ts` — SAT **intersection** test reusing `collision/obb.ts`
  `obbVsObb`/`obbVsSegment`, so a footprint/wall counts when it *touches or overlaps* the box, not
  only when fully enclosed; rotated footprints use their true OBB; a zero-area drag is a click and
  doesn't hijack selection). On release furniture hits feed `selectedItemIds` and wall hits feed
  `selectedWallIds` (+ a primary `planSelection`) atomically via `setPlanMarqueeSelection`. Delete/⌫
  bulk-deletes the multi-selection — furniture in **one** coalesced undo step (the `deleteItem`
  `'delete'` coalesce key). Works on desktop **and** mobile touch (in edit mode; two-finger pinch
  still zooms). Selecting only furniture leaves `planSelection` null so the furniture inspector owns
  the panel. When **2+ placed pieces** are selected (`selectedItemIds.length > 1`, e.g. via the
  marquee), `PlanInspector` instead shows the **align/distribute/mirror action panel**
  (`ui/floorplan/PlanMultiSelectActions.tsx`, PARITY-PLAN-ALIGN): Align centres (X/Z), Align
  edges (Left/Right/Top/Bottom), Distribute evenly (Across X/Z) and Mirror — pure **wiring** of
  the SAME render-agnostic ops the 3D `MultiSelectPanel` uses (`layout/alignDistribute.ts` +
  `layout/selectionActions.ts` `mirrorSelectionX`), each one undo step, `canPlace`-checked,
  locked items skipped, **ungated core** (shown in both Simple and Pro, like align/distribute in 3D).
  **Floor menu** (`editor/LevelMenu.tsx`, F13/ML4b): a single dropdown pinned to the canvas
  bottom-left, listing floors **topmost-first** (mall-directory order) — switch / rename
  (`renameLevel`; ground writes `plan.groundName`) / reorder ▲▼ (`moveLevel` re-stacks elevations) /
  add (`addLevel`) / duplicate (`duplicateLevel` clones a storey's geometry + furniture + finishes via
  pure `cloneLevelGeometry`) / remove upper storeys (confirmed `removeLevel`); an
  **"All levels"** toggle draws the other storeys' walls as a dimmed underlay to align floors; every tool,
  overlay and `PlanInspector` edit routes through the active level (`levelAsPlan` reads,
  `levelId` action args; `updateRoom`/`setRoomCeiling`/finish write-through search all
  storeys by room id). **`P` toggles
  2D⇄3D** — the binding lives in `controls/planEditorHotkey.ts` (always mounted via App,
  modal-guarded), NOT in the lazy-mounted editor, so it opens from the 3D view too.
  **Reference backdrop / ghost stencil** (`planTraceBackdrop` flag, pro): loads centered +
  uniform-fit to the plan and renders above room fills but below walls/dims (pure math in
  `editor/backdropPlacement.ts` — fit/centre/anchored-rescale + the 25 MB cap); Scale-tool
  calibration (`mPerPx`) anchors on the drawn segment's midpoint; persisted to IDB
  (`backdropPersist.ts`, `usePlanBackdrop.ts`) + **"AI walls"** (BYO-key).
  **Snap to grid** (Plan menu "Snap to grid", `planGridSnap` flag, pro; PARITY-GRID-SNAP): a
  whole-plan transform that rounds every wall endpoint / room polygon vertex / opening offset /
  note·dim·polyline coordinate (and every upper storey + the `extent`) to the editor's current
  grid via pure `floorplan/gridSnap.ts` `snapPlanToGrid(plan, items, gridM, opts?)` — to clean up a
  traced or imported plan. Openings are re-threaded so they stay on their snapped walls; a wall that
  would collapse to zero length is left as-is; furniture POSITIONS snap only with `{snapFurniture}`
  (sizes always preserved). Pure + idempotent (`snap∘snap === snap`); `gridM ≤ 0`/non-finite throws.
  The store action is `floorPlanSlice.snapFloorPlanToGrid(gridM?, opts?)` (one undo step; defaults
  `gridM` to the editor `gridSize`, else 0.05 m; forks the default plan).
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
  the right detail pane (`MobileToolbar.tsx`). The sheet chrome + a11y contract (overlay,
  grab-pill swipe-dismiss, Escape/modal-guard, Tab trap + focus restore, roving-tabindex rail)
  is the shared `toolbar/mobile/MobileSheet.tsx` shell — also consumed by the 2D plan editor's
  mobile menu (`PlanToolsSheet`, TB-6-tail) so both editing surfaces share ONE menu paradigm.
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
  collision walls (`levelAsPlan`) + furniture blockers are that storey's own. **Minimap
  tap-to-teleport** (MINIMAP-JUMP, `minimapTeleport` flag, simple): clicking/tapping
  `ui/Minimap.tsx` converts the pointer to world XZ (`ui/walk/minimapTeleport.ts`, pure —
  `svgSquareViewBoxPoint` inverts the letterboxed square-viewBox-in-a-wider-box SVG mapping,
  `minimapPointToWorld` inverts the component's own world→svg transform) and clamps it inside
  the tapped (or nearest) room's polygon clear of every wall by `WALK_PLAYER_RADIUS`
  (`clampPointToPolygon`, probes the inward normal via `pointInPolygon` so it works for
  rectangular/L-shaped/free-drawn rooms alike), facing the room's centre
  (`roomLabelPoint`/`computeFacingYaw`) rather than preserving the walker's prior heading — it
  matches how every other walk-mode (re)spawn already orients into the space. The resolved
  `{x,z,yaw}` crosses into the R3F tree via the `scene/cameras/walkTeleport.ts` module signal
  (mirrors `cameraForward.ts`'s plain-object pattern — a tap is a once-per-click event, not
  per-frame state); `FirstPersonCamera` polls it each frame BEFORE re-asserting the camera
  orientation from its `yaw`/`pitch` refs, relocates the camera, and nudges off any furniture
  footprint at the landing point (`resolveCircleVsObbs`) — deliberately NOT `resolveMovement`'s
  wall-slide, which assumes an incremental step and would clamp a cross-room jump back against
  the first wall in between. **Mobile viewport** (`index.html`, `responsive.css`,
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
  **Drawing-set callouts** (PARITY-LIGHTINGTEMPLATE-TEXT: `drawingCalloutsSlice`
  `{id,sheet,text,x,y,leaderX?,leaderY?}` — sheet-relative normalised [0,1] coords; undoable
  CRUD via `addDrawingCallout`/`updateDrawingCalloutText`/`moveDrawingCallout`/`deleteDrawingCallout`
  (each calls `pushHistory`); `promptText` 4-step add chain (text → sheet number → x%/y% position →
  optional leader tip); `ui/DrawingCalloutsPanel.tsx` `.aux` list with edit/delete icon buttons;
  `buildCalloutsSvg()` in `ui/drawingSet.ts` injects an absolutely-positioned SVG overlay per sheet
  (viewBox 100×100, dashed leader line + white bg rect + multi-line `<tspan>` text) when callouts are
  present; `openDrawingSet.ts` forwards `drawingCallouts` as 10th arg; persists in the save schema
  (optional `drawingCallouts[]`) so callouts travel with `.sofa.json` + `#/design/` links;
  `drawingCallouts` flag, pro),
  **Quote templates** (PARITY-QUOTE-XLSX tail: `quoteTemplateSlice` + `export/quoteTemplate.ts`):
  `QuoteTemplate` interface holds company name, contact line, header/footer notes, currency label,
  markup/discount/GST percents, and four section-visibility booleans (FF&E / Flooring / Wall Finishes /
  Carpentry); `DEFAULT_QUOTE_TEMPLATE` is the zero-customisation baseline; `applyTemplate(boq, t)` filters
  sections and appends Markup/Discount/GST rows, recomputing the grand total; `isNonDefaultTemplate` +
  `mergeTemplate` support compact serialisation (omitted when default, partial fields filled on load);
  `quoteTemplateSlice` exposes `setQuoteTemplate`/`resetQuoteTemplate` (both push undo); `quoteTemplate`
  is part of `HistorySnapshot` so template edits are fully undoable; `boqToHtml`/`boqToCsv`/`boqRows`/
  `boqToXlsx` all accept an optional template and produce identical output when omitted; `openBoq.ts`
  and `downloadBoqXlsx.ts` read `quoteTemplate` from the store and apply it; `ui/QuoteTemplateModal.tsx`
  modal with CSS-token-only styling; `quoteTemplate` flag, pro. The same modal also hosts the
  **price-rule library** editor (`priceRulesSlice` → `analysis/renovationCost.ts` `PriceRules`; see the
  Renovation-estimate bullet above), gated by the separate `priceRules` flag, pro),
  **Report** (`ui/report.ts`). Multi-select align (centre + footprint-aware edge) /
  even-gap distribute (`layout/alignDistribute.ts`) / bulk rotate ±90° / face-into-room /
  snap-to-wall (`layout/faceWall.ts`) / arrange-as-run (`layout/arrangeRun.ts`, butt a kitchen
  run flush along a wall) / mirror. The wall/orient/mirror actions live in
  `layout/selectionActions.ts`, shared by the inspector + ⌘K. **Mirror across a room axis
  (FEAT-2)**: `furniture/mirrorSelection.ts` is the pure, unit-tested reflection math
  (`mirrorSelection(items, axis)` mirrors the whole selection as a rigid group about its own
  centroid on axis `'x'`/`'z'`, flipping position + heading + the matching `flipX`/`flipZ`);
  `selectionActions.ts:mirrorSelectionAxis(catalog, axis)` collision-checks + commits
  all-or-nothing, one undo step. The pre-existing ungated left↔right-only `mirrorSelectionX`
  (used by the ⌘K `sel-mirror` command + the 2D plan editor's ungated core mirror,
  `layout/mirrorRoom.ts`'s unrelated whole-room `mirrorItemX` is untouched) is now a thin
  `mirrorSelectionAxis(catalog, 'x')` wrapper. The **Z axis** option — "Mirror Z" in
  `MultiSelectPanel.tsx` (shown alongside "Mirror X" once the flag is on) + the `sel-mirror-z`
  ⌘K command — is gated by the `mirrorSelection` Pro flag (an arrange-tool refinement, not
  core-loop). Lock; double-click focus.
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
  live scene+camera; `ui/HqRenderModal.tsx` — resolution/samples/DoF; `hqRender` flag, pro;
  **AI denoise** PHOTO-DENOISE: OIDN U-Net over the finished still via the lazy-loaded
  `denoiser` package (tfjs — WebGPU→WebGL2→CPU fallback chain), guided by one-shot raster
  albedo/normal AOVs (`hqAovPasses.ts`) captured at session start; Apache-2.0 weights
  self-hosted in `public/denoiser-tzas/` (~0.6 MB/model, offline-safe); pure gates in
  `hqAiDenoiseMath.ts` (≤4K eligibility, backend order, weights URL); runs automatically on
  done/Stop via `session.applyAiDenoise()`, edge-blur `DenoiseMaterial` blit stays as live
  preview + fallback; `hqAiDenoise` flag, simple),
  **Render preset A/B compare** (`ui/renderCompare/compareState.ts` pure logic — preset
  selection, swap, divider clamping; `ui/RenderCompareModal.tsx` two sequential captures +
  Lightroom-style before/after slider with touch parity; `renderCompare` flag, pro),
  **Before/after staging reveal** (`ui/staging/stagingReveal.ts` pure capture orchestrator —
  injected canvas-capture + hidden-set deps, unit-tested; `ui/StagingRevealModal.tsx` captures the
  furnished view then transiently hides all furniture for the empty-room frame and shows the same
  reveal slider; `stagingReveal` flag, pro),
  **Time-of-day compare** (FEAT-1: `ui/timeCompare/timeCompare.ts` pure capture orchestrator —
  injected canvas-capture + `timeSlice` time-mode/hour deps, unit-tested; `ui/TimeCompareModal.tsx`
  reuses the same reveal-slider chrome as the staging reveal above, but jumps the sun/time rig
  (`setPresetTime`) between two `TimePreset`s (default Midday vs Night) to capture the SAME camera
  at two times of day — tone mapping/exposure/lights/HDRI are left untouched so only time differs;
  the user's exact time-mode/hour is restored afterwards; `timeCompare` flag, pro),
  **One-tap style transfer** (`ui/styling/styleTransfer.ts` pure `STYLE_PRESETS` + `planStyleApply`,
  unit-tested incl. a builtin-finish-id guard; `ui/StyleTransferModal.tsx` style-card grid →
  `finishesSlice.applyHomeStyle(floor, wall, palette?)` swaps every room's floor+wall + master palette
  in one undo step; the applied toast carries an inline Undo; `styleTransfer` flag, pro),
  **Style quiz** (`ui/styling/styleQuiz.ts` pure `STYLE_QUIZ` data + `scoreQuiz` weighted-answer
  scoring, unit-tested incl. a preset-id guard; `ui/StyleQuizModal.tsx` stepper → recommends a
  `STYLE_PRESETS` look and applies it via the same path; `styleQuiz` flag, pro),
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
  `backendAuthProvider`) is backend-only: with a backend (`hasBackend()` — Cloudflare, or the
  local dev backend from `npm run dev`) a signed-in **admin** unlocks `devOnly` features + the
  flags panel; without a backend (offline / GitHub Pages) there is no sign-in at all (no
  client-side gate). Local dev backend: `scripts/dev-api.ts` (see Commands).
- **Loading + fast boot** (`ui/loading/`, `storage/bootstrap.ts`, `bootPhase`/`loading`):
  `main.tsx` imports the self-hosted fonts, registers decoders, then renders immediately; async
  `runBootstrap()` (IDB + autosave restore + default seed *after* hydration) flips
  `bootPhase`→`'ready'`. Static `#boot-loader` (index.html) cycles Singapore/HDB status lines
  (`loadingPhrases.json` / `CyclingPhrase`) until scene warm-up pins "Almost ready…"; its art
  **keeps animating through Canvas warm-up** — each animated piece is an HTML div layer holding a
  static SVG (compositor-driven, same rule as `LoadingOverlay`; the old `.bl-static` freeze is
  gone — guarded by `ui/loading/bootLoaderArt.test.ts`);
  `LoadingOverlay` covers orbit↔walk + room enter/exit + floor-plan open/close (explicit labels;
  cycles when empty). Its furnishing-room animation is **compositor-proof**: every animated piece
  is an HTML `<div>` layer holding a static SVG (never an animated SVG child, which would starve
  on the main thread while the swapped-in scene mounts — guarded by `LoadingOverlay.test.tsx`).
  The overlay hides on **readiness, not a timer**: `RenderPump` grants throttled warm frames
  (~10 fps, `OVERLAY_RENDER_MS`) while the overlay is up so the new scene compiles shaders behind
  it, both Canvases publish rendered frames via `scene/frameRenderedSignal.ts`
  (`FrameRenderedNotifier`), and `ui/loading/transitionHide.ts` `scheduleTransitionHide` waits
  for the deferred swap to commit + `READY_FRAMES` real frames (safety `MAX_WAIT_MS` timeout)
  before `hideLoading`; `useOverlayLifecycle` min-time + fade still shapes the visible duration.
- **Fully offline / PWA**: the core app needs **no runtime network**. Fonts (Plus Jakarta Sans +
  JetBrains Mono) are self-hosted via `@fontsource` (imported in `main.tsx`, no Google Fonts CDN);
  the Draco decoder is self-hosted under `public/draco/` (copied from the installed `three` by
  `scripts/copy-decoders.mjs`, wired into `predev`/`prebuild`) and `gltf/decoders.ts` defaults to
  the base-aware `withBase('/draco/')` (override `VITE_DRACO_DECODER_PATH`); the Basis transcoder
  is `public/basis/` via `withBase('/basis/')`. A `vite-plugin-pwa` Workbox service worker
  (`vite.config.ts`) precaches the build so the app loads and runs offline after the first visit
  (build-only — `devOptions` off; opt out with `VITE_DISABLE_PWA=1`, which `disable`s the plugin
  while keeping `virtual:pwa-register` resolvable). **Updates** (`registerType: 'prompt'` — never
  reloads behind the user): registration is owned by `src/pwa/swUpdate.ts` (`injectRegister: null`)
  which checks `registration.update()` **on open**, hourly, **and** on foreground (visibility/focus)
  so installed Home-Screen PWAs — iOS standalone has no reload UI — pick up new builds. A found build
  installs but **waits**; `onNeedRefresh` then surfaces a single de-duped **"New version available"**
  toast (info kind, no auto-dismiss) carrying an **Update** action button — the version line
  (`(v<incoming>)`) is fetched from a build-emitted **`version.json`** (a `vite.config` plugin;
  cache-busted network fetch, since the running bundle only knows its own older `APP_VERSION`).
  `applyUpdate()` sets a `sofa.justUpdated` flag then calls the plugin's `updateSW(true)` (skipWaiting +
  reload) only on confirmation; after the reload paints, App.tsx (`consumeJustUpdated`) shows an
  **"Updated to v<version>"** success toast. The on-open/background checks
  are silent unless they find an update; the manual **"Check for updates"** (`runUpdateCheck`, File
  menu / mobile Appearance & help) shows a checking spinner then up-to-date / the same Update prompt /
  error. Toast feedback rides the notifications slice (`kind:'progress'` toasts spin + show an
  indeterminate bar when `progress` is `null`; toasts may carry an `actionLabel`/`onAction` +
  `icon` override). Optional network-bound
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
  **Cache lifecycle (PERF-001/008)**: `GltfModel` caches parsed GPU scenes (drei `useGLTF`)
  plus module-level `FOOTPRINT_CACHE`/`SUPPORT_PLANE_*`; removal paths (`freeResource` in
  `userAssetsSlice`, `markPackUninstalled` in `installedPacksSlice`) call
  `evictGltfAsset(url)` to clear + dispose those (base + all tier-variant urls) so GPU
  memory is reclaimed instead of leaking toward WebGL context loss.
