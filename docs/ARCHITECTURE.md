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
  `window/document is not defined`. Both scripts set `NODE_OPTIONS=--no-webstorage`: Node >= 25
  enables the Web Storage API by default, and its global `localStorage` shadows the one
  happy-dom installs, leaving it `undefined` in DOM tests (upstream vitest#8757 /
  happy-dom#1950, both open — `--no-webstorage` is the documented workaround). Invoking
  `vitest` directly bypasses the scripts, so `src/setupTests.ts` throws with the fix rather
  than letting tests fail on a bare `Cannot read properties of undefined`. CSS regex guards are consolidated in
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
  multi-stage image (node:26.7.0-alpine build with `VITE_BASE=/` → nginx:1.27-alpine).
  `docker/nginx.conf` adds the wasm/glb/ktx2 MIME types, SPA fallback (excluding `/docs/`),
  cache headers, and a same-origin `/kenney` proxy for the runtime CC0 catalog (the
  production equivalent of the dev-only Vite proxy). `.dockerignore` keeps
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
  unsigned. Node pinned at **26.7.0** (`.nvmrc`, CI, `engines`).
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
  windows/rooms. `walls/`, `floor/`, `Window`/`Door`/`Ceiling`/`Skirting`.
  `doorLeafGeometry.ts` holds the pure multi-leaf placement maths shared by `Door.tsx` (curated
  flat) and `PlanDoorLeaf.tsx` (custom plans), so the two renderers can't drift: **a closed door
  must fully cover its opening** — `bifoldLeafFrame` puts the inner leaf a half-leaf BEYOND its
  fold hinge (centred ON the pivot it covered only 3/4 of the doorway and a quarter-width slice
  of the room showed through, `Door.tsx`'s bug), and `slidingLeafFrame` oversizes a slider past
  both jambs + the head (`SLIDING_LEAF_OVERLAP`) because the leaf hangs proud of the wall
  (`SLIDING_LEAF_STANDOFF`), where an exactly-opening-sized slab shows a parallax sliver of the
  gap at any oblique angle. Bath/WC doors open INWARD — see `floorplan/doorSwing.ts`'s
  `servedRoom`/`withInwardDoorSwings`. `PlanShell.tsx`
  renders a user-authored plan (extruded walls + per-room floor/ceiling) when active; its wall
  boxes carry `walls/PlanWallFace.tsx` interior faces so a room's WALL finish shows in the
  overview too (the box itself is only the plan's flat wall colour — before this, a picked wall
  finish appeared only inside that room's editor). `roomFacingWallSide` probes just off each face
  to decide which room owns it (correct on notched plans), and `syncFaceFade` mirrors the reveal
  fade onto the faces' cloned materials. A floor click routes through the shared
  `floor/floorClick.ts` decision (`select-room` inside the editor → opens the finish picker,
  `enter-room` from the overview) so `RoomFloor` and `PlanRoomFloor` cannot drift again.
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
  each carries a `category` {housingType › projectName › apartmentType} — housingType is
  `'HDB'|'Condominium'|'Landed'` (SG1; the terrace template is filed under `'Landed'`, its own
  BCA-direct approval path — see `floorplan/permitNotes.ts`) — and `templateCategoryTree`
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
  `roofModel.ts` (parametric roof — pure `buildRoofModel` turns the top storey's footprint
  bounding box + `FloorPlan.roof` `{style gable|hip|flat-parapet, pitchDeg, overhang, ridgeAxis,
  material?, dormers?}` into triangulatable roof planes + parapet/dormer boxes, rendered by
  `apartment/Roof.tsx` which fades the roof out when the orbit camera looks down inside;
  `parametricRoof` Pro flag, edited via `ui/floorplan/RoofSettings.tsx`, seeded on the Terrace +
  Maisonette templates — UX-round-3),
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
  `breakRepetitionPlane`/`breakRepetitionShape`/`cellUvTransform` tile-repetition break-up,
  RD-406/MAT-006a, gated by the `tileBreakup` flag at the rect AND polygon floor build sites —
  irregular rooms clip to the tile grid via `clipPolygonToRect`; `finishDirection.ts`
  (`allowsQuarterTurns`) limits directional finishes to 180° turns so a wood floor keeps one grain
  direction — and decides that by MEASURING the albedo (`analyzeTextureDirection.ts` +
  pure `textureDirection.ts`: gradient coherence + axis-profile lattice similarity), so a new
  pattern/scan/upload classifies itself with no list to maintain), `tileSize.ts` (physical metres-per-tile
  resolved from the map — provider scan size → a guess capped by the map's resolution at
  512 px/m → the resolution alone; a map is never stretched past its own texels), `boxUv.ts` (object-space box
  projection for parametric furniture UVs, MAT-006c, `furnitureBoxUv` flag — metre-scaled tiles
  with U on the longer face axis, so grain runs along a part instead of across it),
  `apartment/walls/wallTexTransform.ts` (per-room `wallTexScale`/`wallTexAngle`, `wallTexture`
  flag — the wall counterpart of the room's floor pair), `finishDrop.ts` (drag-to-apply core; canvas drop =
  `scene/FinishDropSurface.tsx` + `scene/finishDropTarget.ts`, commit = `state/finishDropApply.ts`), `convert/`
  (`decodeImage.ts` incl. TGA/TIFF/EXR/HDR/KTX2/DDS, `reencode.ts`→WebP; 16MB cap; `decodeGpuTexture.ts` handles KTX2+DDS via pure-JS or GPU readback).
- `src/ui/loading/frameGate.ts` — `afterFrames` / `shouldForceSceneReady`: the boot gates that
  used to await animation frames outright (the phase-1→2 Canvas mount, `sceneReady`) fall back to
  timers when the page is hidden, because Chrome delivers no rAF to a hidden — including merely
  OCCLUDED — window, which left a background tab stuck on the boot cover with no canvas. Same
  trade as `state/storage/bootstrap.ts:yieldFrame`; forcing `sceneReady` is hidden-only, so a
  visible tab still waits for four painted frames. `npm run chrome:focus` raises the window when a
  capture needs real pixels.
- `src/scene/` — R3F `<Canvas>` + systems: `lighting/`, `Effects.tsx` (bloom+SMAA),
  baked grounding decals (`ContactShadow.tsx` under-furniture blob RZ1; the RD-403 wall/floor
  corner-AO strip was removed in v0.23.1.11 — it read as a black outline at wall bases from
  top-down views),
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
  `RenderPump.tsx` invalidates only when wanted (`renderDecision.ts` pure tested logic —
  including a short dirty tail on the FALLING edge of drei asset streaming,
  `assetsSettleDirtyUntil`, so a surface that suspended on its textures gets a frame once it
  commits; `renderPumpSignal.ts` gates FPS sampling). `InstancedBoxes.tsx` (pure tested
  `bakeInstanceMatrix`, now baking an optional per-instance rotation as `T·R·S`, plus a sibling
  `InstancedCylinders`) collapses repeat geometry — bookshelf/crib + RoomDivider/CubeShelf/
  FeatureWall/ToyStorage, and the **rotation-capable** venetian-blind slats + drying-rack rods
  (batten/slat/rod maths in pure `primitives/slatLayout.ts`); `ContextLossGuard.tsx` recovers
  WebGL context loss — and rebuilds what a restore can't (GPU-STARVE-2: pulses the frozen sun
  shadow map + bumps `contextRestoreSignal.ts` so `SceneEnvironment` re-bakes its IBL probe,
  holding the pump continuous for ≥8 rendered frames). **Interactive resolution degrade**
  (GPU-STARVE-1, `interactiveDegrade` flag): `InteractiveDprController.tsx` (both Canvases)
  halves the pixel ratio while an orbit gesture is held (`cameraMotionSignal.ts`, published by
  OrbitControls start/end) or within 3 s of a >250 ms frame (pure decision in
  `interactiveDegrade.ts`) so High/Maximum frames stay far below the OS GPU watchdog whose
  driver reset was the "white flash while panning" bug; DPR changes go through r3f
  `setDpr` + a same-value `setSize` nudge so the postprocessing composer resizes too.
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
  **Room categories (RM1, 2026-07-19 SG-presets plan):** `PlanRoom.category?: RoomCategory`
  (`floorplan/types.ts` — 13 values: living/dining/bedroom/masterBedroom/kitchen/bath/powder/
  study/serviceYard/storeroom/balcony/foyer/other; `PlanRoomZ` additive enum) is the persisted,
  USER-declared room type, edited via the `RoomInspector`'s "Room type" `Select` right under Name
  (first option "Auto — ‹inferred›" clears it back to undefined; `updateRoom` persists, undoable).
  `floorplan/roomCategory.ts` is the ONE resolver: `roomCategory(room)` (explicit `category` wins,
  else `roomCategoryFromName` infers from the name, else `'other'` — total, never null) +
  `toRoomKind`/`toArrangeKind` downmaps to the two coarser PRE-EXISTING classifiers
  (`analysis/suggestions.ts`'s `RoomKind` and `autoArrange.ts`'s internal 5-kind arranger union)
  so every existing coarse consumer keeps working unchanged when a room has no explicit category.
  This module owns its OWN regex set rather than delegating to `roomKindFromName` — `RoomCategory`
  is a strict refinement (splits `bath`→`bath`/`powder`, `bedroom`→`bedroom`/`masterBedroom`, the
  catch-all `balcony` bucket→`serviceYard`/`storeroom`/`foyer`/`balcony`) that the coarser
  classifiers' regexes can't recover once collapsed. RM1 migrated: `CatalogDrawer`'s room-aware
  landing (explicit category resolved from `floorPlan.rooms` before falling back to
  `roomDisplayName`), `EmptyRoomHint`'s starter chips, `furnishPlan.ts`'s `kitForRoom` (switches on
  `roomCategory(room)` — `serviceYard`/`storeroom`/`foyer`/`other` still get no kit; those kits are
  RM2), and `autoArrange.ts`'s `roomKindFromItems` (explicit category → name → item-inference,
  in that priority order). `templates/shared.ts`'s `room()` builder takes an optional trailing
  `category` param, seeded across every HDB + condo starter template. **RM1-tail migration
  complete:** the five deferred consumers now resolve through `roomCategory` too —
  `analysis/suggestions.ts`, `lighting2d/roomLux.ts`, `analysis/planStatistics.ts`,
  `analysis/handoverChecklist.ts`, `analysis/electricalSchedule.ts` (plus `ai/designChatContext.ts`
  and `state/slices/resetSlice.ts`'s dry-floor pass). Each honours an explicit `category` (via
  `toRoomKind`, or `toArrangeKind` in resetSlice) and keeps the legacy name classifier
  byte-identical when a room has none. **One deliberate output change:** suggestions no longer
  treats a `serviceYard`/`storeroom` (household shelter, service yard) as `'balcony'` — it maps them
  to a suggester-local non-habitable `'utility'` kind so they stop getting the bogus "add outdoor
  seating or planters" idea (flagged by the quality round); genuine balconies/ledges keep it. The
  `'utility'` kind is local to `suggestions.ts` so it doesn't ripple into `RoomKind`'s other
  consumers.
  **Pet fittings** (Pet program P1, `petFittings` flag, tier: **simple**, default on): the `pets`
  `FurnitureCategory` (16th value) collects pet beds, safety fittings and pet furniture. The flag
  gates the tab via `useUnifiedCatalog(includeRemote, includeShared, includePets)` — off zeroes the
  pets block so the tab hides and its cards never surface (grid/search/favourites/recent). Two
  fitting kinds snap to the plan like curtains do to windows: the **window/balcony mesh screen**
  (`windowBound`; a slim frame + an alpha-mapped canvas grid texture in
  `primitives/meshGridTexture.ts` that reads as ≤5 cm safety mesh — the SG Cat Management Framework
  fitting), and — via **NEW `doorBound` plumbing** — the **pet gate** + **pet-door insert**, which
  snap across the nearest **door** opening. `doorBound` is the door analog of `windowBound`:
  `furniture/placement/doorSnap.ts:snapToNearestDoor`/`doorFixtureProps` (a clone of `windowSnap`
  filtering `kind==='door'`, floor-anchored, spanning `op.width`) threaded through the same three
  surfaces windowBound uses — `usePlacementController` (`commitDoorBound`), `scene/PlacementGhost`
  preview, and the plan editor (`planFurnishPlacement.ts:buildPlanDoorGhostItem`/`planHasDoor`,
  wired in `FloorPlanEditor`) — and every "static fixture" gate (`Furniture.tsx` drag, inspector
  Transform sections, plan `FurnitureLayer`/`FurnitureRotateHandle`) now checks
  `windowBound || doorBound`. The **playpen** is an ordinary freestanding item (`frontClearance`).
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
  **Compare items** (CATALOG-COMPARE, `catalogCompare` flag, simple): a header "Compare" toggle
  arms select-for-compare (a checkmark overlay on `CatalogCard`, NOT a new per-card button — per
  the `src/ui/CLAUDE.md` no-card-buttons rule); 2–3 same-category picks open the
  `catalog/CatalogCompareTray.tsx` modal with one column per item (thumbnail, W×D×H, footprint
  area, price, room-fit verdict via `itemFitsRoom`), each Place button reusing
  `useCatalogPlacement`; pure selection/row logic in `catalog/catalogCompareData.ts`.
  **Room-starter chips** (`roomStarters` flag, simple): `ui/EmptyRoomHint.tsx` offers tap-to-add
  anchor pieces per room kind (pure `catalog/roomStarters.ts` map) placed one-at-a-time,
  wall-anchored + `canPlace`-validated via pure `layout/placeStarterItem.ts`.
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
  finish, opened by a wall-face click OR the FinishPicker Walls-tab "Add accent wall…" Select —
  room→walls enumeration for both plan types via the pure `materials/roomWalls.ts`;
  `wallAccentPicker` flag), GraphicsSettings,
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
  the `.empty-mini` token vocabulary) for consistent, friendly empty-state messaging; the four
  saved collections that render on both a desktop menu and a mobile sheet section share one copy
  record, `toolbar/savedEmptyStates.ts:SAVED_EMPTY` (its test asserts every surface still spreads
  it instead of re-inlining a headline).
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
  **Shared UI systems**: `InfoCallout` (flag-gated dismissible hint banners, per-id persisted), `OnboardingChecklist` (UIUX-28 — `onboardChecklist` flag, simple tier: the bottom-left getting-started card; steps auto-check from store transitions via `checklistSlice`, per-device persisted `hdb_checklist`) and `ui/newBadges.ts` (registry-driven "New" `.new-dot` on toolbar/menu entries, seen-state persisted). **Shared form controls** (`src/ui/controls/`): `Button` (typed composer over the `.btn-*` vocabulary — variant/size/block/icon/loading), `Select` (themed dropdown — replaces every native
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
  `lightsMode` ('on'/'off') brightness multiplier in `FurnitureLights.tsx`, so a
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
  "Design" button). **State lives in a designer context** (Stage 4a, `ui/glbEditor/
  designerContext.tsx` — `DesignerProvider` + `useDesigner()`): the controller hook owns the spec +
  bounded undo/redo history, selection (parts + transform group), gizmo mode + the live-preview
  mesh/group registries, armed component/template state, live combine (CSG v2) evaluation, the
  make-configurable assignments, and every commit/save/export handler + the reset-on-open / modal
  guard / hotkey / dev-only `__glbDesigner*` automation-seam effects (it runs unconditionally, so
  those stay stable whether the dialog is open or closed). `GlbDesignerDialog.tsx` is then pure
  **composition** — the dialog chrome under `<DesignerProvider>` plus a flat list of panels, each of
  which reads what it needs from `useDesigner()` (no props; conditionally-shown panels self-gate).
  This replaced the ~99 hand-threaded props the panels carried through Stages 0–3, so a new Stage-4
  tool no longer widens a prop firehose. The UI is split into focused sibling modules —
  `DesignerViewport` (canvas + gizmo + source model), `DesignerToolbar` (undo/redo + add-shape
  palette), `LayersPanel` (part list), `SourcePanel` (start-from + restore + recolour),
  `CombinePanel` (CSG), `SavePanel` (name/category/placement/save) + `PartInspector` +
  `GroupInspector` + `TemplatesPanel` + `ComponentsPanel` + `MakeConfigurablePanel` +
  `PartsPreview`. All pure spec/geometry logic stays in `furniture/glbEdit/` — the context is only
  the React state wiring. Compose a custom asset from primitive shapes
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
  box-projected UVs (`boxProjectUvs`) so a finish tiles on them too).
  **Stage 2 — materials** (v0.21.2.32): each part also carries optional
  `PhysicalSurfaceFields` (`editSpec.ts`) — sheen / clearcoat / transmission+ior+thickness /
  anisotropy — and an optional two-tone `gradient`. `buildSurfaceMaterial` upgrades to a
  `MeshPhysicalMaterial` ONLY when a physical axis is set (`hasPhysicalLook`; plain
  `MeshStandardMaterial` otherwise — cost discipline); the gradient bakes to a `COLOR_0` vertex
  attribute (`glbEdit/gradient.ts`, applied in `partGeometry`) rendered with `vertexColors`. The
  inspector's `PartMaterialSection.tsx` shows a one-tap **finish preset** gallery (pure
  `glbEdit/finishPresets.ts`, 14 curated bundles), a "Custom finish" `Disclosure` of the raw
  sliders, and a "Gradient" `Disclosure`. Every field round-trips losslessly through the GLB
  export (verified — `physicalMaterialExport.test.ts`; support matrix in `docs/asset-studio-plan.md`).
  **Stage 3a — transform groups** (v0.21.2.33): named `PartGroup`s (`editSpec.ts`, `partGroups[]`)
  hold a shared `position`/`rotation` applied ON TOP of member transforms — **distinct from a CSG
  `CombineGroup`** (UI copy "Group" vs "Combine"); a part can be in one of each. `buildEditedObject`
  nests grouped parts under a three.Group carrying the group transform (`glbEdit/groupTransform.ts`
  — pure `groupedPartWorldPosition` + `ungroupPartGroup` which flattens so nothing jumps; flat
  groups only, no nesting). `LayersPanel` is a shallow tree (group rows: inline rename, collapse,
  indented members, Ungroup/Duplicate/Mirror; a **Group** action on the multi-select toolbar); the
  gizmo drags a whole group via a group proxy (`gizmoWriteBack.ts:groupGizmoPatch`).
  **Stage 3b — fittings/component library** (v0.21.2.34): a curated set of parametric hardware
  fittings (`glbEdit/components.ts`, pure + unit-tested — 13 legs/handles/feet/hinges, each a
  builder emitting an ordinary `ShapePart[]` in a component-local frame with 1–3 clamped params +
  metal/wood/rubber finish defaults). The **`ComponentsPanel`** arms a fitting; a preview face-click
  places it (SWOOD): `glbEdit/componentPlace.ts` (`componentTransform`) maps the component's mount
  axis (`floor` legs/feet → down, `wall` handles/hinges → out) onto the clicked world normal, 5 mm-
  snaps, and `editSpec.ts:addPlacedComponent` lands it as a named `PartGroup` (no new part kind).
  Face clicks come from `PartsPreview`/`DesignerViewport` (R3F `onClick` + a ground plane; a
  `window.__glbDesignerPlaceOnFace` automation seam mirrors `window.__store`). `GroupInspector`'s
  **Repeat to corners** (`editSpec.ts:repeatComponentGroup` + `assetCenterXZ`, pure) mirrors a placed
  fitting to 2/4 symmetric positions about the asset bbox centre. Scenario `glb-designer-stage3b`.
  **Stage 3c — template-first flows** (v0.21.2.35): 6 archetype STARTER templates (`glbEdit/templates.ts`,
  pure + unit-tested — Dining/Coffee table, Bookshelf, Cabinet, Bed frame, Sofa frame), each a pure
  builder (clamped ergonomic dims → `ShapePart[]` + one wrapping `PartGroup`). The **parametric→designer
  bridge is ruled to FLATTEN at insertion** (not a live recipe in the spec — that would be a fourth spec
  concept; a template is just parts + a group, already covered by the v4 `partGroups` envelope). The
  Bookshelf **reuses `parametric/buildParts.ts`** (its box `ParametricPart[]` map cleanly to `ShapePart`s
  via a thin adapter); cabinet/table/bed/sofa reuse `components.ts` fittings + `finishPresets.ts` (sofa
  cushions get **Velvet**). `TemplatesPanel.tsx` (above Components) arms a template → a compact parametric
  step (2–4 ergonomic sliders with unit + range + hint) with a **live viewport preview** (the dialog
  renders the would-be-inserted spec) → `insertTemplate` (pure) flattens it in as ONE undo step: an empty
  spec is REPLACED, a non-empty spec inserts ALONGSIDE (offset on +X, no confirm). Scenario
  `glb-designer-stage3c`.
  **Stage 3d — sets & modular customization** (v0.21.2.36, closes Stage 3): (1) **Designer →
  configurable product export** (`configurator/designerExport.ts`, pure planner unit-tested + async
  baker; `ui/glbEditor/MakeConfigurablePanel.tsx`, flag `assetConfigurableExport`) — name a **Slot**
  on a `PartGroup` (two groups sharing a slot name = alternative options, first = default) → emit a
  `ConfigurableProduct`. **Options are baked GLB `data:` URLs** on the existing `gltfUrl` field (a
  box-only `ConfiguredPart` can't hold lathe/cylinder/CSG parts), baked in product-world space at an
  identity slot anchor, so the configurator's `model`/`compose`/`buildObject`/`saveConfigured` are
  UNCHANGED; footprint `h` = vertical extent so `fitScaleToFootprint` stays ≈1. Exported products
  register in the `userConfigurableProducts` slice (`state/slices/userProductsSlice.ts`, localStorage
  `hdb_user_products`) and merge into `ConfiguratorDialog`'s tabs + resolution. (2) **Sets**
  (`glbEdit/setSplit.ts`, pure + unit-tested; `SavePanel` switch, flag `assetSets`) — "Save groups as
  separate assets" splits a multi-piece design so each top-level group also saves as its own catalog
  asset (group transform flattened in), no new runtime concept. Scenario `glb-designer-stage3d`.
  `specPersist` is at **v4**, and both it and the configurator's `slotSpec` now ride the shared
  versioned **`furniture/specEnvelope.ts`** `{ kind, v, payload }` envelope + `EnvelopeCodec` (one
  parse/serialize/migrate/guard path — `parseAssetSpec`/`serializeAssetSpec` +
  `configurator/configuredPersist.ts` `parseConfiguredSpec`/`serializeConfiguredSpec`; `parseLegacy`
  keeps reading pre-envelope blobs, re-saved in the envelope on next write).
  **Stage 4b — precision & pro UX** (v0.21.2.39): **align/distribute** (`glbEdit/arrange.ts`, pure +
  tested — kind-aware rotation-projected AABB extents `partWorldExtent`; `alignParts`/`distributeParts`),
  **linear/radial array** (`glbEdit/arrayBuild.ts`, pure + tested — radial **reuses** room
  `radialArray.ts:radialArrayPlacements`, linear implemented directly), and **arbitrary-axis mirror**
  (`editSpec.ts:mirroredTransform`/`mirrorPartAxis`/`mirrorPartsAxis` — the single shared mirror
  conjugation) all surface in `ui/glbEditor/ArrangePanel.tsx` on selection. A **grid-snap** preference
  (`ui/glbEditor/gridSnapPref.ts`, per-device localStorage) feeds an optional length step into
  `gizmoWriteBack.ts` (default 5 mm) + the inspector's numeric stepping; the viewport (`DesignerViewport.tsx`)
  adds a magnet toggle + step Select, **Front/Side/Top/Home** camera presets (in-canvas responder,
  perspective camera kept) and a live **W×D×H** dimension readout (`useFrame` Box3 union over the
  selected preview objects). `LayersPanel.tsx` gains a name **filter** + inline part **rename**;
  `ShapePart.name` bumps the envelope to **v6** (additive identity migration). Scenario `glb-designer-stage4`.
  **Stage 5 — realism detail layer** (v0.21.2.40, closes the program): a **Details** panel
  (`ui/glbEditor/DetailsPanel.tsx`) arms a curated **decal** kind (Button/Stitch line/Seam/Round
  patch/Wear spot); a click on a part surface projects it with three's `DecalGeometry`
  (`glbEdit/decals.ts` + `decalTexture.ts` procedural canvas patterns; the Stage-3b face-click seam
  reused, dev seam `window.__glbDesignerPlaceDecal`). `AssetEditSpec.decals[]` stores each in the
  target part's LOCAL frame (`{partId,position,normal,size,kind,color?,rotation?}`), so it's built
  against the part geometry at identity and rendered as a CHILD of the part mesh — it follows a
  grouped/moved part and `removePart` prunes it (`pruneDecals`). Decals are REAL geometry offset a
  hair along the normal (zero z-fighting, survives export) → they EXPORT into the GLB and reimport
  intact (`decalExport.test.ts`). **Piping** (`glbEdit/piping.ts`): one-tap on a box/extrude traces
  its top-face perimeter (`roundedRectPathPoints`) as a thin `sweep` welt (new explicit `sweepPoints`
  override on the sweep part), grouped with the host, host colour darkened. **Cushion "plump"**
  (`glbEdit/plump.ts`): a `plump` 0…1 box/capsule param applies a sine-falloff vertex bulge (crown +
  bow, corners pinned, normals recomputed) on a tessellated box — the shipped cushion-realism ruling
  (b), see `PHOTOREALISM.md`. Envelope bumps to **v7** (`decals[]` + `plump` + `sweepPoints`, additive
  identity migration). Scenario `glb-designer-stage5`. **The Asset Studio program is complete
  (Stages 0–5).**
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
  `gizmoWriteBack.ts` `gizmoPatch` (pure, tested) coalesces per drag-END and snaps lengths to the
  grid-snap step (default 5 mm, Stage 4b) / rotation to 1°; `mesh` parts hide Scale (triangles are baked).
  **Precision II (Iteration 2, Stage 6d, v0.21.2.45):** with the magnet on, a finished translate also
  **face-snaps** — `faceSnap.ts` (pure, tested) snaps the committed position flush to a nearby part's
  AABB face within ~8 mm (abut = zero-gap outer faces; align = coplanar same-side faces; locality-gated
  on perpendicular overlap, per-axis, face snap wins over grid), with a brief accent-edge hint
  (`SnapHintOverlay`). **Precision III (Iteration 3, Stage 7b, v0.21.2.50):** the snap is now previewed
  **live during the drag** — `TransformControls`' `objectChange` (rAF-gated) runs `dragSnapSession.ts`
  (pure, tested: memoised targets captured once at drag start + per-axis **hysteresis**, a 1.5× release
  band so it doesn't flicker at the threshold), snapping the dragged mesh flush in place with the hint
  showing live; `onMouseUp` still commits through the same 6d write-back (commit-time snap stays the
  authority, so the committed value equals what the user saw). Works for a part and a whole group;
  holding **Alt** disables the magnet for that drag (CAD escape hatch, skips live + commit snap). A viewport **Centre /
  Base / Corner pivot** switch (`pivot.ts`, pure, tested) changes the reference point for numeric
  rotation + gizmo rotate/scale via position compensation on write-back (Centre = byte-identical to
  today); applies to a part and a whole transform group. Both are ephemeral UI state (no spec/envelope
  field). **Realism II (Iteration 2, Stage 6e, v0.21.2.46):** a plumped box/capsule cushion gains a
  procedural **fabric wrinkle** normal map (`glbEdit/wrinkleTexture.ts`, pure height field + bounded
  texture cache) — low-freq creases gathering toward the pinned seam corners (a `cornerness` mask) +
  fine cloth nap, seeded from the part id (stable across renders + save/reload). A **Wrinkles (fabric)**
  inspector slider (next to Plump) is default-on subtle (`DEFAULT_WRINKLES`) when `plump>0`, 0 = off;
  visible strength is `normalScale ≈ 0.15…0.4` following plump depth × intensity. Baked as a
  `DataTexture` (headless-generatable → the spec→material wiring is testable; `GLTFExporter` embeds it
  as PNG, `normalTexture`+`scale` survive), cached in a bounded dispose-on-evict `LruCache` keyed by
  `(seed, intensity-bucket)` (a slider drag reuses a handful of tiles). A textured `mat:<id>` finish
  owns the normal channel, so wrinkles are skipped when a finish is set (inspector shows a hint).
  New spec field `parts[].wrinkles?`, envelope bumps to **v10** (additive identity migration); wood-grain
  direction was already Stage 6c (`finishRotation`). **Undo/redo** (Stage 0): a bounded
  (~50-entry) history around the spec (`specHistory.ts`, pure + tested — push/undo/redo with
  ~300 ms same-key coalescing so a slider drag is one step), wired to ⌘Z / ⇧⌘Z in-dialog (⌘Y
  too) + the toolbar buttons (disabled at the ends). **Editable saves** (Stage 0): the edit
  spec is embedded on the saved def as a versioned JSON `assetSpec` (`specPersist.ts`, the shared
  `specEnvelope` `{ kind:'asset', v, payload }` — same envelope as the configurator's `slotSpec` —
  travels IDB meta + the save schema), so re-picking a designer-built asset as the "Start from"
  source offers **Restore
  editable parts** (its full part list re-opens editable instead of a frozen source mesh); an
  absent spec keeps today's frozen-source behaviour. Launched from ⌘K / the catalog Design button.
  **Any furniture as an editable template (Stage 9a):** the `SourcePanel` "Make parts editable"
  section lets you pick ANY catalog def — a grouped all-catalog `Select` (Built-ins / My uploads /
  Shared library / Packs, built from `useDesigner().decomposableDefs`) — and decompose it into
  editable parts/groups, replacing the current spec as one undo step. Pure core:
  `glbEdit/decompose.ts` `decomposeObject(root, opts)` bakes each mesh's world transform (relative
  to the decompose root) into root-local space, re-centres it on its bbox (so `position`/rotation
  behave like any primitive), and wraps meshes sharing a top-level named child into one
  `PartGroup`; an `InstancedMesh` de-instances one part per instance up to
  `DECOMPOSE_INSTANCE_CAP` (64), merging into a single baked part beyond it, and the pass reports
  `overBudget` past `DECOMPOSE_TRI_BUDGET` (150k tris, informational only — never blocks). Two
  output flavours: **bake** (procedural defs — inlines geometry arrays) and **reference**
  (`opts.ref: { defId }`, GLB defs — emits a `ShapePart.srcRef` = `{ defId, meshPath }` instead of
  inlining a heavy source's triangles). `glbEdit/srcRefCache.ts` lazily resolves a `srcRef` back
  into real geometry: it loads the def's GLB once through the SEC-1 loader
  (`gltf/loaderSecurity.ts`), walks its decomposable meshes in the SAME order
  `decompose.ts:forEachDecomposableMesh` used (so the mesh index re-resolves to the same mesh),
  bakes+re-centres identically, and caches by `defId::meshIndex`; `buildObject.ts`'s mesh-geometry
  case reads the cache synchronously (a placeholder box shows until resolved) and a resolution
  epoch (`getSrcRefEpoch`/`subscribeSrcRef`) re-renders the preview the moment a def finishes
  loading. `glbEdit/decomposeLoader.ts` is the GLB-side async glue: `decomposeGlbDef(defId, url)`
  loads the GLB once, seeds the srcRef cache from that same scene (no second fetch), and
  decomposes in reference mode; `specSrcRefDefIds(spec)` gathers a spec's referenced def ids
  (awaited via `ensureSpecSrcRefs` before export so `buildObject` bakes real geometry into the
  GLB); `dropUnresolvableSrcRefParts` prunes any `srcRef` part whose source def is gone at
  restore time (honest degradation, never a crash). Procedural defs have no pure geometry builder,
  so the PROCEDURAL path renders offscreen: `ui/glbEditor/decomposeHost.tsx`'s `DecomposeHost`
  (mounted once inside the open dialog) is a hidden on-demand `<Canvas>` that mounts the armed
  primitive, waits two frames for its children to build, reads back the group, and resolves
  `requestPrimitiveDecompose(def)` with `decomposeObject(group, { ref: null })` (bake mode) — a
  6s watchdog resolves `null` if a primitive never settles, so a decompose can never hang. The
  spec envelope bumps to **v13** for the new optional `parts[].srcRef` (additive, `specPersist.ts`).
  **Component building blocks (Stage 9b):** two ways to reuse decomposed geometry. **Selective
  extraction** (`glbEdit/decomposeSelect.ts`, pure): SourcePanel's "Choose parts to insert…" runs
  the same decompose, then `decomposeEntries(result)` presents a part-granular picker (a group
  "select-all" row + indented member rows, then loose parts; selection is by PART id) and
  `insertDecomposedSubset(spec, parts, groups)` adds only the chosen meshes **alongside** the design
  (fresh part/group ids, srcRefs verbatim, +X offset — never replacing; a source group survives only
  when fully selected). **User components** (`glbEdit/componentFragment.ts`): `captureGroupFragment`
  turns a `PartGroup` into a small `ComponentFragment` (parts-only, srcRefs kept) serialized to the
  shared spec envelope kind **`'component'` v1**; `state/slices/userComponentsSlice.ts` persists them
  to `localStorage` (`hdb_user_components`, the `userProductsSlice` metadata + fail-loud pattern).
  They render in the Components panel under "My components" with the built-in arm→click-to-place flow
  (`placeComponentFragmentOnFace` via the shared `componentPlace` math, `'floor'` mount);
  `componentFragmentFits` refuses a >256 KB fragment (a baked-mesh member) at save;
  `dropUnresolvableComponentParts` (reusing 9a's `dropUnresolvableSrcRefParts`) degrades a
  place whose `srcRef` def is gone; delete gates on `confirmAction` (confirm, no undo). Scenario
  `scripts/scenarios/glb-designer-stage9b.json`.
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
  Maximum. **The boot tier is capability-detected** (TIER-AUTODETECT, `tierForCapabilities`,
  pure + unit-tested) is now only a best-effort **veto** — software rasteriser / phone-tablet /
  no-WebGL2 / <4 cores → Performance, everything else → High meaning "no opinion". The tier is
  actually chosen by MEASURING frames (`scene/adaptiveTier.ts` + `scene/frameCost.ts`,
  TIER-ADAPTIVE): first visit boots `initialAutoTier` (conservative Medium), then the ladder steps
  both ways on p90 render COST per displayed frame (never frame rate — under `frameloop="demand"`
  rate measures demand, not capability, and vsync clamps it). Promotion is a probe; oscillation is
  prevented by a persisted learned ceiling (`autoMaxTier` = the rung that failed). **Maximum is
  never auto-selected.** Measured p90 cost at 2560x1600: performance 4.7ms / medium 6.0 / high 8.9
  / maximum 11.7, budget 16.7ms (`scripts/dev-probes/frame-time.mjs`).
  Performance is flat (no shadows/IBL/post, DPR 1);
  Medium=+sun shadows+IBL; High=+post (N8AO+Bloom+**ToneMapping**+HueSat+Vignette+SMAA);
  Maximum=+cinematic
  (full-res AO + film grain + chromatic aberration, `EffectsImpl` props from `aoFullRes`/`cinematic`).
  `QualityController` only steps
  **down** for 30fps, off once pinned — so an over-optimistic detection self-corrects. It is
  deaf for `FPS_GUARD_WARMUP_MS` (5s) after `sceneReady`: boot renders continuously at its least
  representative, and it used to walk a freshly detected tier straight back down. **Asset quality** = separate `AssetTier`
  (low/medium/high=Original LOD), follows render (`null`=Auto) but pinnable + FPS-immune.
  **Tone-mapping look** (`look.ts` `ToneMappingMode` Filmic/AgX/Neutral → three constant via
  `toneMappingThree.ts`; `Lighting` sets `gl.toneMapping`+exposure per-frame): user-selectable
  view transform, all tiers, persisted in qualityPrefs. **On the post tiers the view transform
  is a composer effect, not `gl.toneMapping`** (TONE-POST, `toneMappingPost.ts`): three applies
  `renderer.toneMapping` only when rendering to the DEFAULT framebuffer, so under
  `<EffectComposer>` High/Maximum previously ran with no view transform at all (31.8% of the
  frame clipped to white vs 3.4% below). `EffectsImpl` mounts `<ToneMapping>` from the same
  `resolveToneMapping` call, and pass order is scene-referred (AO/DoF/Bloom) → tone map →
  display-referred (HueSat/CA/Vignette/grain/SMAA). **Context-aware default (RD-404,
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
  **Textured colour correctness (REAL-2)**: the same branch tags the loaded photo albedo
  `SRGBColorSpace` (drei's `useTexture` leaves it untagged → wrong gamma) and keeps `m.color`
  **white** for a plain textured def — the swatch is only the picker-chip preview; multiplying the
  photo by it crushed every bundled/remote/uploaded material (the generated catalog's `#888888`
  placeholder darkened photo floors to ~25%). The multiply survives ONLY for real legacy
  `tint:<baseId>:<#hex>` ids (`isTintMaterialId`), which is the tint mechanism. **AO maps load
  (REAL-3)**: `useTexturedMaterial` includes the `ao` channel in its `useTexture` list (remote CC0
  bundles fetch it; previously it was fetched but never loaded/bound). **Bundled photo swatches**:
  each `public/assets/materials/<id>/material.json` sidecar carries a mean-albedo `swatch`
  (emitted by `index-assets` into `generatedCatalog.ts`; grey `#888888` only for legacy sidecars).
  **A finish change on a render path resolves the DEFERRED id (FINISH-DEFER)**: a `textured` def
  suspends on first use (drei `useTexture`, ~12 s for a 1K ambientCG scan) and every surface sits
  inside `<Suspense fallback={null}>`, so an eager id swap made React hide the committed surface
  and paint nothing for the whole load — the bare wall body showed through and read as "the finish
  didn't apply". Every wall/floor/ceiling dispatch therefore calls
  `useMaterialDef(useDeferredFinishId(id))` (`WallSegment`, `RoomShell`, `PlanRoomShell`,
  `RoomFloor`, `PlanRoomFloor`, `RoomCeilingTile`, `PlanRoomCeiling`), keeping the current finish
  on screen until the new maps land; the boundaries stay as the first-mount / error net.
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
  selected time). **Lights** (`lightsMode` on/off, an iPhone-style switch — the follow-the-sun 'auto' mode was removed 2026-07-24) is an independent fixture toggle — not
  tied to the sun (lights can be on in daytime). **Lighting mood presets** (UX round-3 #3,
  `lightMoodPresets` flag, simple tier): a one-tap Scene-menu chip row (Normal/Reading/Movie
  night/Entertaining/Romantic, `lighting/moodPresets.ts`, pure) layers a brightness multiplier +
  warm/cool tint on top of the `lightsMode` level (`FurnitureLights.tsx`: `baseIntensity *
  lightsModeLevel * moodMultiplier`) — ceiling-mounted kinds dim harder for Movie
  night/Romantic. It can only scale an already-lit fixture, never re-light one switched off via
  `lightOn === 'no'`; the mood persists with the design like `lightsMode`. Fixtures emit capped
  night point lights; shades glow via `fixtureGlow`. **Orbit and the room editor run this exact same graded simulation**
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
  providers** (`catalog/remote/providers/`): Poly Haven (CORS, prod) + ambientCG, gated
  by `activeProviderIds`/`PROD_PROVIDER_IDS`. **ambientCG has exactly one transport**:
  `acgLibrary.ts` reads our **R2 mirror** (`acg/` prefix + `library/acg-index.json` manifest)
  over the same-origin auth-gated `/api/assets` proxy, in dev and prod alike, whenever the
  `ambientcgLibrary` flag is on (pro tier, default on). The live ambientcg.com transport
  (`ambientcg.ts` + the `/acg`,`/acg-cdn` proxies) was **removed 2026-08-25**: its CDN moved to
  `acg-media.struffelproductions.com`, `full_json` caps a page at 100 of ~2000 assets, and
  `category` is now `null` on every material. Because the index cache lives a week, a provider
  may implement `validateCached(entries)` — `acgLibrary` rejects entries not served from
  `/api/assets/acg/`, so an index cached from the old transport is refetched instead of
  rendered (stale entries produced cards that loaded forever). The mirror is
  built by `scripts/pack-ambientcg.mjs` (zips → the seven bound channels as near-lossless WebP +
  a 256 px thumb + manifest) and published with `scripts/push-r2-library.mjs`. The bound set is
  albedo/normal/roughness/AO/**metalness**/**opacity**/**displacement** — see
  `src/materials/CLAUDE.md` for the binding rules (metalness map drives the scalar to 1; opacity
  is alpha-TESTED not blended; displacement feeds POM rather than `displacementMap`). **Poly Haven supplies materials/textures (+ HDRIs
  via `scene/lighting/hdriCatalog.ts`) plus these curated model bundles — but is NOT a *browsable*
  model source** (its multi-file glTF is why), so no provider emits `kind:'furniture'` (the
  `remoteFurniture` browse is dormant until one does). Add a source: poly-pizza-style client reusing
  `buildEntry`/`commit`, a `RemoteProvider`, or a `'manual'` entry.
- **Showroom finishes (SHOWROOM-FINISHES)** (`materials/showroomCatalog.ts`,
  `ui/finish/ShowroomRow.tsx`, flag `showroomFinishes` — simple tier, default on, prod-safe CC0):
  a hand-curated shortlist of Poly Haven photo-PBR finishes (honest names, mean-albedo swatches,
  physical `uvScale` per scan) rendered as a one-tap strip above the FinishPicker grid (Floor +
  Walls tabs) AND in the WallAccentPicker (applies as the wall face's accent). A tap streams the
  full map set through the existing `resolveRemoteAsset` path
  (CORS-direct, IDB-cached) at `SHOWROOM_RESOLUTION` (1k) and applies the resolved
  `polyhaven:<slug>:<res>` finish id. `bundleToMaterialDef` applies the curated
  name/swatch/uvScale override for showroom slugs (generic downloads keep the 1 m default).
  Dead slugs degrade gracefully (thumb 404 hides the chip; resolve failure toasts). **Reload
  rehydration** (`state/storage/rehydrateRemoteFinishes.ts`, boot step `remoteFinishes`): applied
  remote finish ids (incl. tint-wrapped / `mat:`-wrapped, scanned by pure
  `extractRemoteFinishRefs`) are re-resolved on boot from the IDB bundle cache (offline) or the
  provider — deliberately NOT flag-gated (gating is browse/add only).
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
  **Mount-height dimensions (H3):** every projected item that's actually wall/ceiling-mounted right
  now carries an AFFL height in mm — `projectElevation.ts:itemMountHeight` resolves it (live
  `mountHeight` prop → the def's parametric default → a non-parametric mounted def's
  `verticalSpan.base`), where "mounted right now" (`isWallMounted`) is `def.mounted` (sconces, cove
  lights, wall cabinets, always-mounted GLBs) **or** a def whose own `mount` enum param (TVs,
  aircon — floor-or-wall) currently reads `'wall'`; a floor-standing item resolves to `null` and gets
  no height dim (no clutter). `elevationSvg.ts` draws it as a vertical dimension (`"1100 AFFL"`)
  tucked inside the item's own footprint, opposite the below-floor width-dimension row; two mounted
  items close together on one wall fan into separate columns via
  `dimensionLayout.ts:staggerMountHeightColumns` (mirrors `staggerDimensionRows`'s greedy collision
  assignment, but 2D — close in BOTH x and height — since a height dim is a vertical line, not a
  horizontal span).
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
  **Per-instance handover metadata (ITEM-META, `itemMeta` flag, pro)**: an optional `FurnitureItem.meta`
  (`furniture/types.ts`) — `url`/`price`/`brand`/`model`/`supplier`/`description`/`remarks`, all trimmed,
  empty→omitted, set via the dedicated `setItemMeta` store action (coalesced undo, `state/slices/
  itemsSlice.ts`) from the inspector's **Notes & link** section (`ui/inspector/ItemMetaSection.tsx`,
  URL validated http/https on blur via `itemMetaValidation.ts`). `meta.price` is the one field read by
  `furniture/furniturePrices.ts:itemPrice` (the single price-resolution choke-point — every consumer
  passes it through) as a per-instance override, ahead of the IKEA-variant/user-def/category fallback.
  `ffeSchedule.ts`/`ffeCsv.ts`/`report.ts`'s FF&E table AND `drawingSet.ts`'s FF&E sheet (G9 — the
  latter renders the SAME `FfeRow[]` from `buildFfeSchedule`, no metadata re-derived) gain
  Brand/Model/Supplier/URL/Remarks columns (and `ui/shoplist.ts`'s line URL) only when any item
  carries them; two instances with differing meta/price never silently aggregate into one line.
  `meta.custom?: {key,value}[]` (arbitrary user-defined fields, ordered, ≤20 entries/key≤40/
  value≤500 chars — clamped not rejected on import + in the setter,
  `furniture/itemMetaLimits.ts:clampCustomMetaEntries`, shared by `schema.ts` and
  `itemsSlice.ts`) adds a "Custom fields" add/remove-row sub-list to `ItemMetaSection.tsx`; each
  DISTINCT key across the FF&E schedule becomes its own alphabetical CSV/report/drawing-set column
  (`ffeCsv.ts:customMetaColumns`, reused by `drawingSet.ts` — never a second key-collection pass) —
  shoplist/the report's other tables are untouched by `custom`. `drawingSet.ts`'s sheet is a
  fixed-width printed page (not a scrollable table), so its URL column shows a shortened
  host+path display string (`drawingSet.ts:shortUrl`) instead of the full link — the CSV export
  is the reference copy of the untouched URL.
  **Cost breakdown CSV** (`export/costBreakdownCsv.ts` pure `buildCostBreakdown`/`buildCostBreakdownCsv` →
  one sectioned RFC-4180 CSV reconciling Furniture-by-category (qty + subtotal via `itemPrice`) +
  Renovation/finishes lines (floor/wall area × the `renovationCost` rate table via `estimateRenovation`
  over `reportData.floorAreaByFinish`/`wallAreaByFinish`) + a reconciling GRAND TOTAL row
  (`grandTotal === furnitureSubtotal + renovationSubtotal`); `ui/openCostBreakdownCsv.ts` = Blob download,
  filename `<plan>-costs.csv`). No reinvented pricing. File menu + mobile + ⌘K, `shopExport` flag (simple).
- **Drawing set** (`ui/drawingSet.ts` + `openDrawingSet.ts`): a paginated multi-sheet "plan set"
  (cover + plan + per-wall elevations + cross-section + lighting + electrical (`floorplan/electricalPlan*`,
  `electricalPlan` flag) + plumbing (`floorplan/plumbingPlan*`, `plumbingPlan` flag — points auto-derived
  from fixtures) + a contractor-grade finishes schedule + FF&E + a door & window schedule, title blocks,
  a user-customizable `@page` size/orientation) reusing all the pure renderers — the formal counterpart
  to the one-page `report.ts`.
  **Per-trade handover packs (BSJ-5, `tradePacks` pro flag): `ui/tradePacks.ts` + `openTradePack.ts`.**
  The designed→ordered bridge — re-bundles the master set (organised by drawing TYPE) into per-RECIPIENT
  packs (Tiler / Electrician / Plumber / Carpenter / Aircon / Curtains / Painter). `drawingSet.ts` split
  into `buildDrawingSheets` (numbered `Sheet[]`) + `renderDrawingDocument` (shared HTML wrapper); a pack
  builds the master sheets ONCE, selects its recipient's subset by `calloutGroup` **keeping the master
  A-N numbering** (`NUMBERING_NOTE` — a contractor cross-references), and prepends a pack cover (scope +
  contact placeholder + title-block info + an included-sheet index + honest EXCLUSION notes for missing
  data + advisory tables composed from the same pure builders the editor uses — `socketAdvisory` + MEP
  mount-height defaults + `airconSystem` proposal + `switchCircuits` status + placed window-treatment /
  built-in-joinery / paint-area summaries). The finish schedule is narrowed per pack via
  `finishScheduleHtml`'s optional `kinds` param (tiler → floors+walls, painter → walls). No sheet builder
  is forked. File menu: desktop `TradePacksPicker` Disclosure + mobile FileSection "Trade packs" section.
  **Door & window schedule (H1):** `layerOn(layers, 'openingSchedule')` gate — one whole-set `NTS` sheet
  (like Finishes/FF&E, not per-storey: `analysis/openingSchedule.ts:buildOpeningSchedule` already walks
  every storey internally) rendering the same `D1/D2…`/`W1/W2…` mark rows as `report.ts`'s "Openings
  schedule" section, so the two stay in lock-step. Sizes/sill print in **millimetres always** (not
  `formatLength(units)`) — door/window schedules are a carpentry-adjacent trade deliverable, matching
  the carpentry sheets' own `overallMm` convention regardless of the app's metric/imperial display
  preference. `CalloutSheet` gained `'opening-schedule'` (`state/slices/drawingCalloutsSlice.ts` +
  `DrawingCalloutsPanel.tsx`); `DrawingLayer` gained `'openingSchedule'` (`ui/drawingLayers.ts`,
  auto-picked up by the generic `DRAWING_LAYERS`-driven "Include sheets" checklist). No new feature
  flag — rides the existing `drawings` flag like every other sheet group.
  **Finish schedule (G4)**: the pure `floorplan/finishSchedule.ts:buildFinishSchedule(plan, finishes,
  nameOf)` returns a `FinishSchedule` — per-room floor/wall/ceiling `FinishCell`s (each with a stable,
  first-seen-order material **code** `FL-01`/`WL-01`/`CL-01` that never renumbers on a later addition,
  a display name, and an area quantity: floor = room area, wall = perimeter × ceiling height **net of
  door/window openings** — deducted per bordering room via `openingProbePoints`, ceiling = the flat
  footprint with a tray/coffered/dropped/sloped treatment flagged as a verify-on-site note rather than
  silently under-counted), a separate `accentWalls` list (`PlanWall.color` overrides, keyed `AW-0N` by
  distinct colour, with orientation + net-of-openings face area), and a per-code `totals` array (what a
  contractor prices from) plus a standing "verify on site" caveat. `ui/finishScheduleHtml.ts` is the ONE
  HTML renderer both `report.ts`'s "Finishes schedule" section and `drawingSet.ts`'s sheet consume, so
  the two documents can't drift. `floorTexScale` is surfaced honestly as a tiling-scale factor (no base
  tile mm size is stored in the model, so none is invented). No new flag — rides the existing
  `report`/drawing-set gating. **Sheet/layer toggles**
  (PARITY-DRAWLAYERS): `ui/drawingLayers.ts` (dependency-light list + `DrawingLayerVisibility` so the
  heavy builder stays dynamically imported) + `buildDrawingSetHtml`'s optional `layers` arg gate each
  group on/off (floor plan always included); the Tools-menu "Include sheets" checklist writes
  `uiSlice.drawingLayers` (session-only).
  **Locked, print-true scale** (TODO G2): `floorplan/drawingScale.ts`'s pure `pickDrawingScale(extentM,
  printableMm)` walks the standard ladder `[1:20…1:200]` and picks the largest-detail ratio whose
  printed extent fits the printable area; `drawingSet.ts` computes one per plan-bearing sheet (floor
  plan/elevations/lighting/dimensioned/demolition/electrical/plumbing/section — schedules + cover show
  "NTS") and threads the resulting `mmPerM` into every SVG builder's optional `printMmPerM` param, which
  sizes the `<svg>` via an inline `style="width:…mm;height:…mm"` (a bare `width`/`height` **attribute**
  would be silently overridden by the `.draw svg{width:100%}` rule — presentational attributes have the
  lowest CSS priority; see the playbook gotcha). The graphic scale bar (`reportPlanSvg.ts`
  `scaleBarSvg`) stays as a second, PDF-viewer-rescale-proof check.
  **User-customizable paper (G2 follow-up):** `drawingScale.ts`'s `PAPER_SIZE_MM` (ISO 216 A4/A3/A2/A1,
  portrait `[width,height]` mm — the single source of truth) + `paperDimensionsMm(size, orientation)` +
  `printableAreaMm`/`PAPER_PRINTABLE_MM` (every size × orientation combo, precomputed) generalise the
  printable-area math beyond the original hardcoded A4-landscape constant (kept as
  `A4_LANDSCAPE_PRINTABLE_MM` for callers that don't care). `drawingSet.ts` reads `template.paperSize`/
  `template.orientation` to pick each sheet's scale AND to parameterize the `@page { size: … }` rule +
  `.sheet`/`.draw svg{max-height}` CSS dimensions from the SAME table (never a second hardcoded
  A4 number) — so the `@page` size, the sheet box, and the scale-picker's printable area can never
  drift apart. The title block states the real combo, e.g. `"1:50 @ A3 LANDSCAPE"`.
  **Title-block handover metadata** (TODO G5): `export/drawingSetTemplate.ts` (`DrawingSetTemplate` —
  project name/address, client, drawn-by, checked-by, revision + note, `paperSize`/`orientation`)
  mirrors `quoteTemplate.ts`'s shape/persistence pattern exactly, via `drawingSetTemplateSlice.ts`
  (persisted in `serialize()`/autosave/history like `quoteTemplate`; `paperSize`/`orientation` are
  additive optional Zod fields defaulting to `'a4'`/`'landscape'` on load, no version bump); a minimal
  editor (`FileMenu.tsx`'s `DrawingSetInfoEditor`, a collapsed `Disclosure` with two `controls/Select`
  drop-downs for paper size + orientation alongside the text fields) sits under the "Drawing set" row.
  Every sheet's title block now shows client/drawn/checked/date/locked-scale/sheet-of-total/revision;
  plan-view sheets add a small north-arrow glyph (`northIndicatorSvg`, rotated by the live
  `orientationDeg`); the cover sheet carries a revision-table row + a General notes block with the
  standard SG disclaimers (mm units, don't scale from screen, HDB permit/PE/LEW/LP responsibilities,
  verify on site).
  **Setting-out & datum dimensioning (TODO G3, `settingOutDims` flag, pro):**
  `floorplan/settingOut.ts` is the pure core (`datumPoint`/`settingOutDimensions`/
  `tileSettingOutPoints` — see `floorplan/CLAUDE.md` for the full design rationale:
  why a fixed datum instead of cumulative chains, the face-offset convention, and why
  `dimensionChain.ts`'s `projectToBaseline` is reused but `runningDimensions` is not).
  The dimensioned-plan sheet gets a datum-referenced setting-out row
  (`autoDimensionSvg.ts`'s `dimensionSvg({settingOut:true})`, same sheet as the
  existing auto-dims, drawn dashed/further-out so the two never overlap); the
  floor-plan sheet gets a tile setting-out cross per room + one shared caption
  (`reportPlanSvg.ts`'s `showTileMarks`, gated to when the finishes sheet is also
  included). `FloorPlan.datum?: {x,z}` is an additive optional override reserved for
  a future placement UI (unused by any editor in this pass).
  **Waterproofing zones (BSJ-7, `waterproofing` flag, pro):** `floorplan/waterproofing.ts`
  (pure → `buildWaterproofingZones(plan, items)`) models a zone per wet/hard-service room
  (bath/powder/kitchen/serviceYard/balcony) = floor area + wall upturn (300 mm general,
  1800 mm at shower walls — localized from a placed `shower`/`shower-screen`, else the full
  bath perimeter conservatively) + a total membrane area (m²). Fed to: a diagonal wet-area
  hatch + zone table on the dimensioned plan (`autoDimensionSvg.ts` overlay), the tiler
  handover pack (`ui/tradePacks.ts`), a "waterproofing membrane below" note on wet floor rows
  of the finish schedule (unconditional — factual), and an additive `waterproofing` budget
  sub-line (`renovationAllocator.ts`, `trades.waterproofingPerM2`, gated by the flag).
  **Floor levels & transitions (BSJ-8, `floorLevels` flag, pro):** additive
  `PlanRoom.floorLevelMm?` (mm vs the FFL datum; schema.ts ⇄ types.ts parity). `floorplan/floorLevels.ts`
  (pure) derives per-room FFL tags (`buildRoomFflTags`, only where set), doorway step markers
  between rooms at different levels (`buildFloorTransitions`, via `openingProbe.roomsAcrossOpening`),
  and a kerb/step advisory (`buildKerbAdvisories` — a bath/powder level with its adjacent dry room).
  Rendered as FFL pills + step diamonds + a legend on the dimensioned plan (same `autoDimensionSvg.ts`
  overlay) and in the tiler pack; edited via the RoomInspector "Floor level (mm)" field. Intake
  states deliberately don't seed it (see `intakeStates.ts` note).
  **3D representation (BSJ-8 follow-up):** `floorplan/floorLevels3d.ts` (pure) resolves each
  room's Y offset (`roomFloorOffsetM`, flag off ⇒ 0) and doorway riser specs
  (`buildThresholdRisers`, reusing `buildFloorTransitions` for the pairing). `PlanRoomShell`
  (isolated room editor) and `PlanShell` (whole-plan overview) offset each room's floor +
  skirting and add a plinth (`WallBasePlinth`/inline plinth mesh) filling the wall-base gap a
  lowered floor would otherwise leave — walls/ceiling stay at the plan datum (an FFL change is a
  slab build-up, not a storey change); a `ThresholdRiser` mesh renders the step face + nosing at
  each transition. `FurnitureLayer` re-seats floor-anchored furniture at RENDER time only (no new
  field on `FurnitureItem` — mirrors the existing multi-storey elevation wrapper);
  `FirstPersonCamera` follows the walker's current room offset continuously on top of the
  storey elevation. Plan-room feature only — the curated default flat (`RoomShell`) has no
  `floorLevelMm` concept and is unchanged.
  **Carpentry/joinery elevations + sections (TODO G8, `carpentrySheets` flag, pro):**
  the single most-cited DIY-handover gap — a dimensioned front elevation + one
  representative section per distinct PLACED parametric piece (bookshelf/wardrobe/
  sideboard/desk/kitchen-run — the 5 `parametric/spec.ts` `ParametricType`s; a
  standalone kitchen-cabinet catalog item does NOT share this path yet, see
  `furniture/CLAUDE.md`). Geometry is pure + reused, never re-derived:
  `furniture/carpentryElevation.ts:buildCarpentryPiece(spec)` runs the piece's OWN
  `buildParametric(spec)` part list through two projections — front elevation (drop
  Z) and a vertical section at a per-type cut X reconstructed FROM the part
  positions themselves (bay boundaries from `side`/`divider` parts, never a second
  bay-math formula): bookshelf/sideboard/kitchen-run cut through the first bay,
  wardrobe through whichever bay carries the most `shelf` parts, desk through its
  pedestal's `side` panels (or the first `leg` on a 4-leg desk). Every dimension
  (overall W/H/D, bay widths, panel thickness, plinth/toe-kick height, worktop
  thickness, and — the actual gap this closes — every shelf/rail/drawer-front
  height above floor, AFF) is read straight off the cut parts' real positions/
  sizes, always in **mm** (carpentry is mm-throughout, unlike the plan sheets'
  `UnitSystem` toggle); a shelf/rail hidden behind a closed door/drawer renders
  dashed. `ui/carpentrySheetSvg.ts` renders each view (tick+label dims mirroring
  `autoDimensionSvg.ts`'s convention) and runs a `declutterLabelY` pass per
  `labelSide` column so two close-together AFF heights (e.g. a wardrobe's top
  shelf + the rail just under it) never overlap — a nudged label gets a short
  dashed leader back to its tick's true height. `ui/carpentrySheets.ts:
  collectCarpentrySheets(items, catalog)` resolves distinct placed pieces from
  each def's persisted `parametricSpec` (JSON, `UserGltfDef.parametricSpec` —
  the same "recipe alongside the baked GLB" pattern as `slotSpec`/`assetSpec`,
  written by `saveParametricAsset`), deduping repeats of the SAME def to one
  sheet noted `"(×N)"`. `ui/drawingSet.ts` appends one "Carpentry — `<name>`"
  sheet per entry (own locked scale via `carpentryScale`, sized against HALF the
  printable width since the elevation + section sit side by side on one sheet —
  finer than a whole-plan sheet since a joinery piece is far smaller) with the
  standard "verify all dimensions on site before fabrication" note; no placed
  parametric pieces → no carpentry sheets (and the cover's sheet index omits
  them). New `carpentry` `DrawingLayer` + `CalloutSheet` entry follow the
  existing toggle/callout plumbing. **Buildability callouts (TODO H2 — "a
  carpenter can cut the carcass but can't order hardware or select finish"):**
  `buildCarpentryPiece` also returns `sectionTitle` (always `"SECTION A-A"`,
  standard drafting convention) + `elevationCutX` (the section's cut X, same
  local frame as the elevation rects) and two note-line arrays,
  `materialNotes(spec, parts)` and `hardwareCallouts(spec, parts)` — both pure,
  exported, unit-tested. Materials: the finish kind + tint stated HONESTLY
  (`"or equivalent, confirm exact board/laminate code with fabricator"` — a
  `mat:<id>` DLC finish names the catalog id, never a fabricated brand/code),
  board + back-panel thickness read straight off the piece's own `side`/`back`
  parts (`"TBC by fabricator"` when there's no side panel to read, e.g. a
  four-leg desk), and a fixed edge-banding line. Hardware: counts are read
  straight off the piece's REAL part list (`role: 'door'|'handle'|
  'drawer-front'|'drawer-handle'`) — never invented. `role:'door'` doesn't
  distinguish sliding vs hinged wardrobe fronts, so that's the one case
  `hardwareCallouts` reads `spec.wardrobeFront` for: `sliding` → "sliding track
  + rollers, soft-close" for however many door panels the builder emitted
  (always 2, any bay count); `hinged` → a hinge count per the standard rule (2
  hinges/door ≤1200mm tall, 3 above, stated inline) + a handle count. Every
  other type/bay (sideboard/kitchen-run doors, any drawer bank on any type,
  wardrobe interior drawers) is generic over the same role vocabulary — no
  per-type branching needed. Zero doors + zero drawers (bookshelf, any
  open-front bay) → "shelf supports as required by fabricator" (the spec
  doesn't track fixed-vs-adjustable, so a pin count is never invented).
  `ui/carpentrySheetSvg.ts:carpentrySvg`'s `cutX` opt draws the dash-dot
  section-cut line + "A" bubbles top/bottom on the elevation only (its Y-extent
  is the piece's own geometry bbox ± a small margin, clear of the dimension
  rows). `ui/drawingSet.ts` retitles the section pane `piece.sectionTitle`,
  passes `cutX: piece.elevationCutX` to the elevation's `carpentrySvg` call,
  and renders the two note arrays as a "MATERIALS & FINISH" / "HARDWARE" pair
  BELOW the elevation+section row (not overlaid — the sheet's declutter
  precedent), each a bulleted list.
  **On-plan D/W mark callouts (H1-F):** `reportPlanSvg.ts`'s FLOOR-PLAN sheet draws a small rose
  (`#be123c`) `D1`/`W1`… label near each opening (nudged off the wall centreline like the DXF
  export's own marks, `openingMarksSvg`'s `MARK_LABEL_OFFSET`), keyed off
  `analysis/openingSchedule.ts:assignOpeningMarks(openings)` — a per-opening (not aggregated)
  variant of `buildOpeningSchedule`'s grouping, extracted here from `export/dxf.ts`'s own
  identical local copy (that module was owned by a concurrent change in this pass and left
  untouched; `TASKS.md` tracks migrating its copy to this shared export on next touch). `showOpeningMarks` is a new optional `reportPlanSvg` param, gated in `drawingSet.ts` to
  `layerOn(layers, 'openingSchedule')` (same "don't reference a hidden sheet" rule as the G3 tile
  marks) — no new feature flag, since it's presentation over data the schedule sheet already
  carries.
  **Reflected ceiling plan (TODO H4, `rcpSheet` flag, pro):** canonical drawing #4 — per-storey
  false-ceiling/bulkhead zones with drop heights, ceiling-fixture positions dimensioned off the
  nearest walls, aircon points marked. Pure core `floorplan/rcp.ts:buildReflectedCeilingPlan(plan,
  fixtures, electricalPoints)` reuses existing systems wholesale rather than inventing a parallel
  model: each room's zone note + treatment rect/beam-grid come straight from the SAME geometry
  engine the 3D scene renders from (`apartment/ceiling/ceilingModel.ts:buildCeiling` — pure, no
  three/React, safe to import from `floorplan/`), so a printed "FFL to false ceiling: 2450mm" and
  its inset dashed rect can never drift from what the room actually shows in 3D; a non-rectangular
  room or too-low ceiling that the geometry engine falls back on (`CeilingModel.fallback`) prints
  "treatment not applied — verify room shape/height on site" rather than a treatment that isn't
  really built. Ceiling-mounted fixtures are the SAME `PlanLight[]` the lighting plan already
  derives (`lighting2d/lightingPlan.ts:buildLightingPlan`), filtered to `CEILING_FIXTURE_TYPES`
  (`ceiling-light`/`ceiling-fan`/`cove-light` — matches `furniture/lightEmitters.ts`'s
  `LIGHT_EMITTERS` registry; floor/table lamps, sconces, and the vanity's mirror bulbs are NOT
  ceiling fixtures and are excluded), each dimensioned off the nearest wall on each axis
  (`nearestAxisWall` — centreline distance, not the setting-out sheet's face-offset precision; a
  ceiling point only needs "roughly here off that wall", matching the electrical/lighting plans'
  own convention). Aircon points are the SAME persisted/heuristic electrical points the electrical
  plan draws (`kind === 'aircon'`), marked here for cross-reference only — their full schedule
  stays on the Electrical plan. SVG renderer `floorplan/rcpSvg.ts:rcpSvg` mirrors
  `electricalPlanSvg.ts`'s shape (wall context, circle+marking symbols, legend/schedule below,
  `printMmPerM` sizing) and reuses `mepLabelLayout.ts:layoutMepLabels` to declutter fixture
  distance labels exactly like the MEP sheets (H-D1). `ui/drawingSet.ts` appends one "Reflected
  ceiling plan" sheet per storey that has rooms (unlike the lighting/electrical sheets, which only
  print for a storey with fixtures/points — every room carries a useful zone note even when flat);
  new `rcp` `DrawingLayer` + `CalloutSheet` entry (`state/slices/drawingCalloutsSlice.ts` +
  `DrawingCalloutsPanel.tsx`) follow the existing toggle/callout plumbing. New `rcpSheet` flag
  (pro, default true) gates it — analytical drawing-set content, same category as
  `settingOutDims`/`carpentrySheets` (NOT the pre-existing `drawings` flag, which gates the
  separate live in-app Drawings panel — elevations + lighting — an unrelated feature).
  **False-ceiling clearance validator (R4-2):** `floorplan/ceilingClearance.ts:buildCeilingClearance(plan)`
  (pure) reuses `buildCeiling(...).lowestY` as the finished clearance per treated room and warns below
  `MIN_FINISHED_CLEARANCE_M` (2.4 m; `STANDARD_SLAB_M` 2.6, `CORNICE_MIN_M` 2.1). `rcp.ts` attaches the
  per-zone clearance (headroom mm + warn/belowCornice) only when `isFeatureEnabled('ceilingClearance')`
  (the `ceilingClearance` pro flag), and `rcpSvg.ts` prints it as a "⚠ …mm under 2400mm min headroom"
  marking (or a passing clearance readout) in each zone note.
  **Aircon trunking overlay (BSJ-2 follow-up):** `rcp.ts`'s `ReflectedCeilingPlan.trunking`
  (resolved routes only, see `analysis/airconTrunking.ts` above) is drawn by `rcpSvg.ts` as a
  dashed polyline + length label per system, gated by the `airconTrunking` flag.
  **Elevation sheet grouping (TODO H6):** a 4-room HDB flat produced ~20 one-per-wall elevation
  sheets, most bare. `ui/drawingSet.ts`'s elevation loop now partitions `projectAllElevations`'
  output (tagged with its ORIGINAL index so "Wall N" captions never repeat across the two kinds
  of sheet) into: dropped entirely (0 items AND 0 openings — noted under the cover's sheet index,
  "N minor walls omitted"), grouped (`MINOR_WALL_MAX_LENGTH_M` = 1.2m, `MINOR_WALL_MAX_ITEMS` = 1,
  no openings — up to `MINOR_WALL_GROUP_SIZE` = 4 per sheet in a CSS 2×2 `.minor-grid`, one shared
  scale via `minorElevationScale` sized to the largest wall in that group, quarter-page budget),
  or full (everything else — any opening, or >1 item, always gets its own page). Thresholds are
  constants, noted on the cover's general notes.
- **CAD plan exports**: `ui/openDxf.ts` (`export/dxf.ts` `planToDxf`) downloads the plan as an ASCII
  DXF R12 document for a contractor/fabricator CAD handoff (TODO G6): `WALLS`/`ROOMS`/`DOORS`/
  `WINDOWS`/`LABELS` (base geometry) plus `FURNITURE` (each placed item's rotated footprint — the
  same `collision/placement.ts:itemFootprint` OBB collision/selection use — as a closed POLYLINE)
  + `FURNITURE_TEXT` (item name), `DIMENSIONS` (the `floorplan/autoDimension.ts` auto-dimension
  strings rendered as LINE + perpendicular tick + extension-stub + TEXT primitives — no native
  `DIMENSION` entity, since R12's needs a `DIMSTYLE` table lightweight readers render
  inconsistently), `OPENING_MARKS` (a D1/D2…/W1/W2… mark TEXT beside each door/window,
  cross-referencing `analysis/openingSchedule.ts`), and `ELECTRICAL`/`PLUMBING` (TODO G6b — a
  CIRCLE + symbol TEXT, `@<mm>` mount-height suffix when set, per PERSISTED
  `plan.electricalPoints`/`plumbingPoints` — same `ELEC_SYM_TEXT`/`PLUMB_SYM_TEXT` glyphs the MEP
  sheets use, never the furniture heuristic; ground-only, same single-storey convention as
  walls/rooms). Every layer carries a distinct AutoCAD colour index via the LAYER table.
  `ui/openPlanSvg.ts` downloads the bare plan as a vector `.svg`,
  reusing `reportPlanSvg` + pure `ui/planSvgExport.ts` `buildPlanSvgDocument` (XML prolog +
  injected `xmlns`). Both in Tools + mobile + ⌘K, `dxfExport` flag (pro).
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
- **Sweet Home 3D furniture library import** (`importSh3f` flag, pro; PARITY-SH3F): imports a
  `.sh3f` furniture LIBRARY (not a home plan) as user furniture. Pure parser core
  `furniture/import/sh3f.ts` `parseSh3f(bytes)` unzips the archive (fflate `unzipSync`), parses
  every `PluginFurnitureCatalog*.properties` (a hand-rolled Java-`.properties` reader —
  `parseJavaProperties`: `#`/`!` comments, `=`/`:`/whitespace separators, line continuations,
  `\uXXXX`/escape handling; catalog bytes decoded ISO-8859-1), and maps each indexed entry
  (`name#n`/`model#n`/`width#n`…) to a normalized `Sh3fEntry` — dims cm→m, category via the
  shared `categoryForPieceName`, model format by extension (`convert/formats.ts`
  `modelFormatFromName`), `movable`/`doorOrWindow` flags. Pure (no three/React/store), so the
  mapping is unit-tested without a browser. DOM glue `ui/openSh3fImport.ts` resolves each entry's
  model (+ sibling MTL/textures, or a nested multi-part `.zip`) to `File`s, converts it to a
  self-contained GLB through the SAME upload path as drag-drop imports (`convert/convertModel` →
  `GLTFExporter`, so OBJ/DAE/3DS/FBX/STL/PLY/… are all supported), and persists it via
  `persistUserGlb` (batch-committed with `addManyUserFurniture`). Entries with an unrecognized
  model extension, a missing model, or a conversion failure are SKIPPED per-entry with a note; the
  toast summarises "N of M imported, K skipped". `.sh3f` content is user-supplied → treated like
  any other user upload (no bundled-asset licence). File menu + mobile File + ⌘K (`import-sh3f`);
  dev hook `window.__importSh3fBytes(bytes, name)` (mirrors `__importSh3dBytes`) drives the full
  parse→convert→persist headlessly (needs a real browser for the three loaders).
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
- **3D scene export** (two flags, split by tier — Q-3DEXPORT, UIUX-71): `ui/openSceneExport.ts`
  `exportScene3d` downloads the whole furnished home as `.glb` (reusing `furniture/convert/toGlb.ts`
  `exportGlb`), `.obj` (`export/sceneObj.ts`, dynamic `OBJExporter`), `.stl` (`export/sceneStl.ts`),
  or `.usdz` (`export/sceneUsdz.ts`). The consumer-facing formats (`.glb`, `.usdz`/AR) ride
  **`sceneExport3d`** (simple); the geometry-only professional formats (`.obj`, `.stl`) ride
  **`sceneExportCad`** (pro), beside `dxfExport` — a Simple-mode audit found the File menu offering a
  casual owner a Wavefront OBJ and an "STL for 3D printing / CAD" (this doc already described the
  feature as pro while the registry had drifted to simple). The live scene root is reached from DOM code via `scene/SceneExportController`
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
- **Socket-count & DB-load advisory** (`analysis/socketAdvisory.ts` pure → `buildSocketAdvisory(plan)`:
  per-room recommended outlet targets `TARGET_SOCKETS_BY_CATEGORY` (living 8 / kitchen 10 / masterBedroom
  6 / bedroom 4 / study 6 / dining 4 / bath 2 / powder 1 / serviceYard 2, keyed via `roomCategory`) vs the
  placed `electricalPoints` attributed by room — `socket`=1, `socket-double`=2 outlets; `data`/`tv-point`
  counted separately — flagging under-provisioned rooms, plus the static `DB_LOAD_NOTE` (40 A common in
  older blocks; 63 A upgrade needs SP Group approval)). Surfaces on the electrical plan sheet's notes
  block (`electricalPlanSvg.ts`, under the `electricalPlan` flag) + a per-room "N/target sockets"
  shortfall tag in the editor's `MepLayer.tsx` (under `mepEditor`) — no new flag (R4-4).
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
  `buildHandoverChecklist(plan,items,catalog,keyCollectionDate?)`: a derived snagging + key-handover
  punch-list grouped by room (per-`RoomKind` defect rules via `roomKindFromName`, generic bucket for an
  unrecognised kind), plus appliance/utility activation items for the appliance categories
  actually placed, plus an always-present keys/meters/documents group). The report's **Move-in
  checklist** section (PARITY-MOVEIN-CHECKLIST); rides the existing `report` flag, always renders
  (an empty plan still yields the generic group).
- **DLP / warranty date tracker (R4-8)** (`analysis/handoverDates.ts` pure →
  `buildHandoverDates(iso)`: from a `keyCollectionDate` computes the DLP end (+1yr), ceiling-leak
  (+5yr) and spalling (+10yr) deadline dates; `addYears` clamps 29 Feb, `daysUntil` drives the
  countdown). When set, `buildHandoverChecklist` appends a "Warranty & defect dates" group; surfaced
  live in `ui/HandoverPanel.tsx` (`handoverOpen`, Tools → Handover & DLP) with a date input +
  countdowns, and in the report. `keyCollectionDate` persists (additive zod in `schema.ts` +
  autosave watch-list).
- **SG renovation-rules reference pack (R4-6)** (`floorplan/renoRules.ts` static data → `RENO_RULES`
  4 cited sections: wet-area 3-year tile rule, windows & grilles, working hours/noise, permits/DRC).
  Surfaced by `ui/RenoRulesPanel.tsx` (`renoRulesOpen`, Tools → Reno rules), gated by the
  `renoRulesPack` pro flag.
- **Floor-loading / raised-platform advisory (R4-5)** (`analysis/floorLoading.ts` pure →
  `buildFloorLoadingReport(items,catalog)`: flags heavy suspects — bathtub/aquarium/stone tables/
  piano/loaded bookcases from a static kg table + density = weight ÷ scaled footprint vs the 150 kg/m²
  slab guideline — plus raised platforms >50 mm). A "Floor loading" advisory group in
  `ui/ClearancePanel.tsx`, gated by the `floorLoading` pro flag.
- **BTO OCS starter (R4-3)** (`furniture/ocsStarter.ts` pure manifest → OCS floor finishes by room
  id/category + `OCS_BATH_KIT` sanitary fittings). `state/slices/resetSlice.ts:applyOcsStarter` seeds
  the bare OCS handover state (vinyl bedrooms / porcelain living + bath fittings, furniture cleared);
  `furnishPlan.ts:furnishOcsItems` places the bath fittings for a custom plan. Exposed as "New BTO
  (with OCS)" in `ui/wizard/SmartStartWizard.tsx`, gated by the `ocsStarter` simple flag.
- **Bare-BTO & resale starting states (BSJ-4)** (`furniture/intakeStates.ts` pure: screed-dry floor
  map + retained-wet rule, `absentLeafDoorIds`, bare WC/basin `bareSanitaryProvisions`, strip-out
  fitting keep-set, `INTAKE_STATES` metadata → `floor-screed` material). Three `resetSlice` actions
  (`applyBareBto`/`applyResaleAsIs`/`applyResaleStripout`) sit beside `applyOcsStarter`; each captures
  `baselinePlan` so the hacking diff is honest (bare BTO → no hacking line). Absent door leaves =
  `DoorState.leaf:'none'` (rides `doors` persistence/history; guarded in `Door.tsx` + `PlanDoorLeaf.tsx`,
  2D symbol keeps the opening). Smart Start's OCS entry becomes a 4-option "Starting state" group gated
  by the (relabelled) `ocsStarter` flag. Fixed-flat plumbing provisions are session-only (default plan
  isn't serialized); screed floors + absent leaves persist.
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
- **Whole-reno budget allocator** (`analysis/renovationAllocator.ts` pure → `buildRenovationAllocation(input)`:
  a full SG **trade** breakdown — hacking (from `demolitionPlan.diffWalls` vs. the baseline), masonry/wet
  works (wet-room tiling area), flooring (dry floors), carpentry (placed cabinet/wardrobe/counter lin.m),
  ceiling works (non-flat ceiling area), painting (dry wall area net of openings), M&E (electrical +
  plumbing point count), aircon (PLACED `aircon-unit` FCU count when present, else the `airconSystem`
  planner's per-room proposal), glass & aluminium
  (shower-screen/partition area), plumbing fixtures (count), + a contingency line and indicative SG
  reference bands. Reuses ONE rate card: tiling/flooring/painting/carpentry from `PriceRules`
  `floor`/`wall`/`carpentryPerM`, the trades with no prior rate from the additive `PriceRules.trades`
  (`TradeRates` — hacking/ceiling/M&E/aircon/glass/fixture/contingency, editable in the same
  `QuoteTemplateModal` price-rules section; `estimateRenovation`/BOQ ignore `trades`, so their output is
  unchanged). Surfaced as the `RenovationBudgetPanel` aux panel (`ui/renovationBudget.ts` assembles from
  the store + a CSV export), in the File "Budget & costs" group, `renoBudget` flag (simple, default on).
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
- **Pet compliance** (Pet program P6) (`analysis/petCompliance.ts` pure → `buildPetCompliance(petTypes,
  items, plan)`: a data-driven `PET_RULES` table over the declared `PetType[]` producing
  `required`/`recommended`/`info` checklist entries with `status` (`done`/`partial`/`missing`),
  `have`/`need`, `cite` + satisfying `defIds`; the cat window-mesh rule counts `window-mesh-screen`
  items vs the plan's window openings across every storey. Also `petComplianceSummary` (badge counts) +
  `essentialDefIdsForPetTypes` (catalog surfacing). The per-design `petTypes` profile lives on
  `state/slices/petProfileSlice.ts` (`setPetTypes`/`togglePetType`), persisted via the save schema
  (`schema.ts` optional `petTypes` + autosave watch-list, like `location`). Surfaces: the "Do you have
  pets?" setting (shared `ui/PetProfileControl.tsx`, in the Scene menu/sheet, `petProfile` simple flag),
  the catalog "Essential" badge + first-ordering in the pets tab (`petProfile`), `ui/PetCompliancePanel.tsx`
  (`.aux`, Tools + ⌘K, `petCompliance` pro flag; "Add" CTA jumps the catalog to the pets tab via the
  session-only `pendingCatalogCategory`), and the report's Pet-compliance section.
- **Daylight & ventilation check** (`analysis/daylight.ts` pure → `buildDaylightReport(plan)`:
  per-room window glazing % + openable % vs rule-of-thumb thresholds `DAYLIGHT_MIN_RATIO` (0.1) /
  `VENT_MIN_RATIO` (0.05); windows attributed to rooms by a wall-midpoint probe, `OPENABLE_FRACTION`
  for sliding windows; level-gated for multi-storey). `ui/DaylightPanel.tsx` + the report's
  "Daylight & ventilation" section (PARITY-DAYLIGHT-DIGEST; skipped when no room has a window).
- **Aircon cooling-load (BTU) advisory** (`analysis/airconSizing.ts` pure → `buildAirconSizing(plan,
  orientationDeg)`: per-room recommended BTU = floor area × `BTU_PER_SQM` (600, the ~50–60 BTU/ft²
  SG rule-of-thumb mid) × modifiers — `+15%` for an exterior window facing W/E (room-side compass ⊕
  `orientationDeg`, via `planRoomShell`), `+20%` for a ceiling > 3 m — plus `+4000 BTU` on a
  living/dining zone an open (≥1.8 m opening) kitchen vents into (`roomsAcrossOpening` + `roomCategory`);
  rounded up to a standard split size `[9k,12k,18k,24k]`, external rooms skipped, whole-flat total).
  Rides the Daylight & ventilation panel (`ui/DaylightPanel.tsx` "Cooling load" section) gated by the
  `airconSizing` pro flag (R4-1).
- **Aircon SYSTEM planner (BSJ-2)** (`analysis/airconSystem.ts` pure → `buildAirconSystemPlan(plan,
  orientationDeg)`: groups the served (habitable) rooms from `buildAirconSizing` into common (living/
  dining) vs private (bedroom/study) usage zones, packs each zone onto outdoor condensers of ≤4 FCUs
  (`MAX_FCU_PER_CONDENSER`) → System-2/3/4 proposals with connected-load %, over-`MAX_CONNECTION_RATIO`
  (130%) flag against a cited nominal-capacity table (`CONDENSER_NOMINAL_BTU`), per-system trunking
  note, and a ~110 kg (`LEDGE_MAX_KG`) ledge-weight advisory when ≥2 condensers share a ledge).
  Placement is pure `analysis/airconPlacement.ts:planAirconPlacements` — a wall FCU (`aircon-unit`)
  flush on each served room's exterior wall at 2.25 m + condenser(s) (`aircon-condenser`, new
  `AirconCondenser` primitive) on the AC-ledge / service-yard / balcony room (`findLedgeRoom`).
  Applied by `resetSlice.planAircon` (suggest-then-apply: drops existing aircon items, appends the
  fresh set, ONE undo step). Surfaced as the "Aircon system" section + "Plan aircon" action in
  `DaylightPanel`, gated by the `airconSystem` pro flag. The `renovationAllocator` aircon line now
  counts PLACED FCUs when present, else this planner's proposal.
- **Aircon trunking route (BSJ-2 follow-up)** (`analysis/airconTrunking.ts` pure →
  `buildAirconTrunkingPlan(plan, systemPlan, input)`: for each served room, routes an orthogonal
  polyline condenser → FCU at ceiling height. Router (deliberately simple — correctness over
  optimality): a room-adjacency graph over DOOR openings only (`doorLinks`, via `planRoomShell`'s
  per-room openings — a door's world centre is attributed to every room it borders), BFS shortest
  hop-count path from the condenser's room to the FCU's room (`shortestDoorPath` — naturally
  prefers the corridor/hallway spine, since that's the room with doors to every bedroom), then
  each hop (condenser pos → door threshold → … → FCU pos) expanded into an axis-aligned
  `manhattanDogleg`. A run with no door-connected path is `resolved:false` (empty waypoints) —
  the caller keeps the ORIGINAL one-line advisory for that system, never a partial/guessed route.
  `resolveAirconTrunkingInput(plan, systemPlan, placedItems)` mirrors `renovationAllocator`'s
  placed-items-else-planner-proposal fallback (prefers real `aircon-unit`/`aircon-condenser`
  items when placed, else re-runs `planAirconPlacements` read-only) so the 3D route, RCP sheet
  and budget line can never disagree on the same design. **3D**: `scene/AirconTrunking.tsx` —
  small (~60×40mm) painted-white duct boxes per segment, mounted in `Scene.tsx` alongside
  `PlanShell`, **custom plans only** (the curated default flat has no room-graph/door-opening
  model to route against — `planRoomShell` is plan-model-only). **RCP sheet**:
  `rcp.ts`'s `ReflectedCeilingPlan.trunking` (resolved runs only, plan-projected `[x,z]`) +
  `rcpSvg.ts` draws a dashed polyline + `~XXm` label + a legend row. **Budget**: a new
  `trades.airconTrunkingPerM` rate (S$20/m) feeds a separate `aircon-trunking` trade line
  (`renovationAllocator.ts`, real modeled-route length, only when resolved) alongside the
  existing flat per-FCU `aircon` line; gated by the caller passing `airconTrunking: true`
  (mirrors the `waterproofing` boolean-input pattern). `DaylightPanel`'s per-system trunking
  note becomes "Trunking ~XX m …" once every FCU in that system resolves a route. New pro flag
  `airconTrunking` (default on, rides alongside `airconSystem` in the Cooling-load section).
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
  lands in rooms of BOTH storeys — `isStaircaseItem` matches the `staircase` def id OR any def
  rendering the `Staircase` primitive). The adjustable `staircase` catalog item (def in
  `furniture/defs/others.ts`, geometry `furniture/primitives/staircaseModel.ts`) is gated by the
  `parametricStairs` **pro** flag — hidden from the catalog in Simple mode via
  `useUnifiedCatalog(…, includeStairs)`; its honest plan footprint (`staircaseFootprintParts`) traces
  the L/U flights rather than the full bounding box. Both surface in the report's "HDB compliance hints" section —
  gated to `housingType==='HDB'` (or absent, back-compat); a Condominium/Landed plan gets a
  "Renovation compliance notes" section instead with a one-line pointer to its own approval path
  (MCST/BCA) plus any stair advisories (SG1). `floorplan/permitNotes.ts:permitNotes(housingType)`
  is the single source of the HDB-permit / Condominium-MCST / Landed-BCA note text, read by the
  demolition-plan sheet (`demolitionPlanSvg.ts`) and the drawing-set cover sheet's general notes.
  The curated default flat SEEDS `PlanWall.structure` from the official plan's line types
  (`apartment/constants.ts` `WallSpec.structure`, traced from `assets/floor_plan/default.png`'s
  legend — solid black → `'load-bearing'`, the distinct gable-end lining symbol (walls.jpg legend
  #3, the block's exposed external end wall — the default flat's `wall-ext-W`) → `'gable-end'`,
  hollow double lines → `'brick-partition'`; copied through by `buildDefaultPlan`), so its
  overlay/demolition guidance starts from the plan rather than all-`'unknown'`.
  **Live hackability overlay (R4-7):** `floorplan/wallHackability.ts` is the one classifier —
  `wallHackability(structure)` → `'no'` (load-bearing/RC/gable-end, demolition NOT permitted) /
  `'permit'` (brick/dry partition, permit required) / `'unknown'` (unclassified) + `hackClassLabel`/
  `hackClassDescription`/`isDemolitionRestricted`. `ui/floorplan/editor/layers/HackabilityLayer.tsx`
  tints each current-storey wall by class (`--danger`/`--sun`/`--text-3`) with a legend, mounted under
  a "Hackability" toggle in the plan editor's View ▾ menu (`PlanViewMenuActions.tsx` + `FloorPlanEditor.tsx`
  `showHackability` state), gated by the `hackabilityOverlay` pro flag. `WallsLayer.tsx`'s wall stroke is
  ALSO structure-aware (unconditional, not a toggle — matches the HDB plan drawing convention): a
  structural wall (load-bearing/RC/gable-end) draws with the strongest ink + a heavier body, and a
  `'gable-end'` wall additionally overlays a thin dashed lining stripe (its distinct plan symbol).
  Deleting a load-bearing/RC/gable-end wall in `WallInspector.tsx` first raises a
  `confirmAction({ danger })` "NOT PERMITTED" warning (warns, doesn't block). Layer registered in
  `inlinePxGuard`'s grandfathered list like `MepLayer`.
  **Wall-types 3D overlay (`wallTypes3d` pro flag):** a View-menu toggle (`showWallTypes` on
  `uiSlice`, session-only) tints each wall's translucent overlay "jacket" by its `structure`
  (`floorplan/wallTypeColor.ts:wallTypeOverlayColor` — structural red `#e5484d`, gable-end blue
  `#3e63dd`, brick/dry amber `#f5a524`, unclassified untinted) in the whole-flat orbit view AND the
  per-room editor. `apartment/walls/WallSegment.tsx` exports the shared `WallTypeOverlayJacket`
  (a `polygonOffset` box ~1% larger than the wall body, `meshBasicMaterial` opacity 0.35,
  `depthWrite:false`, no pointer events) reused by the default flat's `RoomShell.tsx` and custom
  plans' `PlanShell.tsx`/`PlanRoomShell.tsx`; every jacket renders as a SIBLING of (never a child of)
  the wall's reveal-tracked mesh/group, since the camera-facing wall-reveal `useFrame`/`useWallReveal`
  traversal would otherwise stomp the jacket's fixed opacity (or throw — its `MeshBasicMaterial` has
  no `emissive`). Wired into the View ▾ menu (desktop `ViewMenu.tsx`, mobile `ViewSection.tsx`) —
  visible whenever the camera is in orbit (whole-flat overview OR the room editor).
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
  `layout/arrangeBroadphase.test.ts`. **Layout reroll (LAYOUT-REROLL, `layoutReroll` flag, simple):**
  `arrangeRoom`/`arrangePlanRoom` take a `seed` (default 0 = today's byte-identical output;
  `LAYOUT_VARIANT_COUNT`=4) that rotates candidate walls / bed anchor / lounge z-band / focal wall —
  each variant still validated by `tryPlace`, so never collision-dirty. `layoutVariantSlice`
  (session-only `layoutVariants: Record<roomId, seed>`) `rerollRoomLayout(roomId)` advances the seed
  and commits one `pushHistory` + `setItems` (one undo step); UI is FinishPicker's "Try another layout".
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
  `.sec-h`; the Walls tab also opens the **real-photo paint visualizer** (`paintVisualizer` flag, simple
  tier): `ui/paintViz/PaintVizModal.tsx` — a self-contained modal (lazy-loaded, all state
  component-local) that composites a chosen wall swatch onto an uploaded wall photo via the pure
  `ui/paintViz/composite.ts` (point-in-polygon mask + a W3C "color" luminance-preserving blend, so the
  photo's shading/texture survive). Client-side only (photo never leaves the device); reuses the wall
  paint swatches (`groups.wall`) as its colour source;
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
  `floorplan/polyline.ts`; `planPolyline` flag, simple — PARITY-POLYLINE).
  **MEP points** (G1 — persisted, editable electrical/plumbing points, contractor-handover goal):
  `FloorPlan.electricalPoints`/`plumbingPoints` (`PlanElectricalPoint`/`PlanPlumbingPoint`,
  `floorplan/types.ts` — `ElectricalKind`/`PlumbingKind` moved there so `electricalPlan.ts`/
  `plumbingPlan.ts` re-export type-only, avoiding an import cycle), free XZ (not wall-anchored —
  wall attachment is a placement-time snap, not a persisted binding) + a level tag, mount height
  in mm AFFL (per-kind default in `floorplan/mepPoints.ts`'s `ELECTRICAL_MOUNT_DEFAULTS_MM`/
  `PLUMBING_MOUNT_DEFAULTS_MM`) + optional label. The `'mep'` editor tool (+ an editor-local armed
  `family`/`kind`, default electrical socket) is a 4th `DrawToolPalette` `PlanMenu` group ("MEP",
  Electrical/Plumbing sub-headers, 12 kinds total) that arms tool+kind in one click (mirrored on
  mobile by a `PlanToolsSheet` "MEP" rail section, 44px chips) — `FloorPlanEditor`'s `onDown` snaps
  the grid/guide-snapped click onto the nearest wall FACE when within 0.25 m (pure decision in
  `ui/floorplan/editor/mepPlacement.ts`, given an already-computed `nearestWall()` hit — an MEP
  point conventionally sits ON the wall it serves) and adds to the family the kind belongs to; the
  tool stays armed (door/window convention) so several points place in a row. `layers/MepLayer.tsx`
  (a `NotesLayer` clone) renders each point as a circle + glyph, reusing the exported sheets' exact
  symbol vocabulary (`electricalPlanSvg.ts`/`plumbingPlanSvg.ts` export `ELEC_SYM_TEXT`/
  `PLUMB_SYM_TEXT` — one symbol set, not two) — electrical in `--accent`, plumbing in the distinct
  `--accent-2` token, selected always `--accent`; click (select tool) selects, drag repositions via
  `beginElementDrag` + coalesced `updateElectricalPoint`/`updatePlumbingPoint`. `PlanInspector`'s
  `'mep'` case is a within-family kind `Select`, a mount-height `Num` (step 50 mm, placeholder = the
  per-kind default) + quick-pick preset chips for electrical (300/1050/1200/2400 mm — `Num` grew an
  optional `undefined`-value + `placeholder` mode for this), a label input, delete. A `showMep`
  session toggle in `PlanViewMenuActions` (shown by default — unlike furniture footprints, MEP
  points are plan elements authored here, not a duplicate of the 3D scene); `Delete`/`Backspace`
  removes the selection; a right-click gets the same minimal delete-only menu as notes/dimensions/
  polylines (`ContextTarget`'s `'mep'` kind). All six store actions (`add`/`update`/`remove` × 2
  families) fork the default plan + push history (unlike `addNote`'s pre-existing non-forking
  quirk, deliberately not copied — a non-forking add on the untouched default plan would lose its
  points on the next save/share-link). Gated end-to-end by the `mepEditor` flag (pro, default on) —
  the pre-existing `electricalPlan`/`plumbingPlan` flags still gate the exported SHEETS separately.
  **Suggest MEP points** (G1 PR4): the Plan ▾ menu's (+ mobile Plan-tools sheet's) "Suggest MEP
  points" entry (`mepEditor`-gated) derives a starting layout from the current furniture + doors
  via `floorPlanSlice.suggestMepPoints()` — the SAME heuristic the drawing-set export falls back to
  (`furniture/mepSuggest.ts:deriveElectricalPoints`/`derivePlumbingPoints`, moved verbatim out of
  `openDrawingSet.ts` so there is exactly ONE derivation source, never two that could drift), drops
  any candidate duplicating an already-persisted point (`floorplan/mepPoints.ts:isDuplicateMepPoint`
  — same kind + storey within 0.3 m), assigns ids + per-kind default mount heights, and appends both
  families under ONE undo step + fork-if-default. A toast reports "Added N electrical + M plumbing
  points — drag to refine" (or an info toast when a re-run finds nothing new). **Sheets prefer
  persisted points (G1 PR5):** `openDrawingSet.ts` now reads `floorPlan.electricalPoints`/
  `plumbingPoints` first and only falls back to the heuristic when that family's array is empty —
  `buildDrawingSetHtml`'s electrical/plumbing params are bundled `{points, source: 'persisted' |
  'heuristic'}` objects (rather than a 13th/14th positional param) so each sheet knows its own
  provenance: a `'persisted'` sheet carries a neutral "Points as designed — heights in mm AFFL" note
  + prints an `@1200`-style mount-height suffix beside each symbol (a "Heights in mm AFFL" legend
  line appears whenever any point on the sheet carries one — `electricalPlanSvg.ts`/
  `plumbingPlanSvg.ts`), a `'heuristic'` sheet keeps the pre-existing amber "Indicative — derived
  from the furniture layout; verify on site" caveat. `ElectricalPoint`/`PlumbingPoint` (the sheet-
  builder's transient shape, distinct from the persisted `PlanElectricalPoint`/`PlanPlumbingPoint`)
  both grew an optional `mountHeightMm` carried through `buildElectricalPlan`/`buildPlumbingPlan`'s
  clean-copy validation loop. **Lighting & switching schematic** (BSJ-3, `switchCircuits` pro flag):
  additive `PlanElectricalPoint.controls?`/`gang?`/`way?` link a `switch` to the light fixtures it
  drives (controlled id = light-fixture item id — no lighting-kind point exists; see
  `floorplan/switchCircuits.ts` for the id-vocabulary decision). Pure `switchCircuits.ts`
  (`buildSwitchCircuits`) assigns deterministic S/L tags (two-way pair = two `way:2` switches with the
  same `controls` → one circuit, `Sna`/`Snb`) + unswitched-light/empty-switch advisory counts;
  `suggestCircuitLinks` (door-nearest-switch heuristic) backs `floorPlanSlice.suggestSwitchCircuits`
  (one undo). The electrical sheet (`electricalPlanSvg`, when `drawingSet` passes `opts.lights` under
  the flag) tags each linked switch + draws controlled-light crossed-circle markers through the SAME
  `mepLabelLayout` declutter as the symbols + a "Lighting circuits" legend; `export/dxf.ts:mepSection`
  suffixes the ELECTRICAL text with the identical tag (sheet↔DXF consistent). Editor: the selected
  switch's inspector "Controls" section (`SwitchControlsSection`, room-grouped light list + two-way +
  gang, list-only v1) + `SwitchLinksLayer` dashed leader lines to controlled lights. **Draggable
  room-name labels**
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
  (`backdropPersist.ts`, `usePlanBackdrop.ts`) + **"AI walls"** (BYO-key; the one vision pass
  drafts walls AND door/window openings AND a scale estimate — `ai/floorPlanAi.ts:
  parseVisionResponse` → pure `ai/floorPlanAiPlacement.ts` nearest-wall snap →
  `usePlanAiWalls.applyAiPlanDraft`; AI scale never overwrites a manual Set-scale calibration
  (`backdrop.scaleCalibrated`); dev hook `window.__applyAiVisionResponse` for no-network testing).
  **AI plan generation** ("Generate plan with AI…" in the Plan menu + ⌘K `ai-plan-generate`,
  `aiPlanGenerate` flag, pro, BYO-key): a text brief → wall/opening/room JSON via
  `ai/floorPlanGenerate.ts` reusing the same parse/apply path + `usePlanAiGenerate`; dev hook
  `window.__applyAiGeneratedPlan`.
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
  `batchRender` flag, pro; plus the **day→night clip sweep** — `DayNightClipSetup` checkbox +
  From/To sliders under Record walkthrough video (`dayNightClip` flag, pro): the saved-views
  tour drives `manualHour` from tour progress via `timeSlice.begin/apply/endTimeSweep` +
  `scene/cameras/dayNightSweep.ts:sweepHourAt`, restoring the pre-tour time on stop; plus
  **Suggest views** — `SavedViewsSection`/`ViewSection` action calling
  `scene/cameras/suggestViews.ts:suggestViews` (`suggestedViews` flag, pro) to auto-save a
  corner three-quarter view per largest furnished room + a whole-home overview via the
  pose-based `cameraViewsSlice.saveView`, deduped by name),
  **Scene** (time slider + Lighting + Backdrop + sun `CompassModal`), **Edit** (step into
  room / floor-plan), **Arrange** (Tidy + Sets/Presets/Styles pick→Apply `PickApply`),
  **Tools** (Budget/Checks/Sun study/Walkthrough/Report + **Design chat** — the read-only
  BYO-key `ui/DesignChatPanel.tsx` advisor grounded in `ai/designChatContext.ts`'s digest of
  the app's own numbers, prompt/call in `ai/designChat.ts`, `aiDesignChat` flag, pro), **File**,
  **Graphics**. Three
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
  drag-look; `WalkHud`, `Crosshair`. **Point-to-point measure** (WALK-MEASURE, `walkMeasure`
  flag, simple): aim + `G` (`keybindings.ts:walkMeasurePoint`) / the WalkHud "Measure" pill sets
  two points; `FirstPersonCamera`'s throttled aim raycast (filtered by pure
  `collision/walkMeasureHit.ts`) drives `state/slices/walkMeasureSlice.ts` and
  `scene/WalkMeasureOverlay.tsx` renders the segment + live distance; the button↔frame-loop
  handoff is the `scene/cameras/walkMeasureRequest.ts` module signal (walkTeleport pattern).
  **Observer camera controls** (PARITY-WALKCAM,
  `walkCameraControls` flag, simple): FOV (50–100°, default 70) + eye-height (1.2–1.9 m, default
  1.6) sliders in `ui/walk/WalkCameraControls.tsx`, persisted in `editorPrefs`; pure clamp
  helpers + ranges in `scene/cameras/walkCameraSettings.ts`; FOV applies reactively to the live
  camera (own effect, restored on exit), eye-height ref'd so a drag re-heights without re-spawn.
  **The slider is calibrated for a 3:2-or-wider viewport (WALK-HFOV-FLOOR).** three's
  `PerspectiveCamera.fov` is the VERTICAL angle, so a narrower viewport loses sideways view rather
  than height — 70° reads ~96° horizontal on a 1.57 desktop canvas but only ~43° on a 390x800
  phone in portrait, tunnel vision that reads as a cramped flat even though the home is modeled at
  true size. `walkVerticalFov(fov, aspect)` (pure, unit-tested) widens the vertical angle below
  `WALK_FOV_REF_ASPECT` (1.5) so the HORIZONTAL view the slider promises is what you keep (the
  "Hor+" convention), capped at `WALK_FOV_MAX`; at/above the reference aspect the slider value is
  passed through untouched, so desktop is unchanged (phone portrait: 100° vertical / ~60°
  horizontal). The FOV effect therefore depends on the r3f `size`, not only on `walkFov`.
  **Spawn clearance (WALK-SPAWN-CLEAR):** every entry point into walk mode resolves its nominal
  standing point through `scene/cameras/walkSpawn.ts:resolveWalkSpawn` — the same
  `resolveCircleVsObbs` furniture push + `resolveMovement` wall re-resolve a normal step (and the
  minimap teleport) uses, at the same `WALK_PLAYER_RADIUS` — so entering walk mode can't put the
  eye inside a table/bed/sofa. The default flat's own spawn is the entrance foyer (11, 7.5) facing
  north up the living/dining's long axis (how you actually walk in); it used to be (11, 6), dead
  centre of the dining table, so the first frame was a tabletop 0.2 m away and the first step
  jerked sideways as the furniture solver shoved the walker out. Multi-storey (ML6c): the walker's storey follows
  `viewLevelId` (`walkLevel`/`levelSpawnPoint` in `floorplan/levels.ts`) — picking a level in
  View→Levels while walking teleports to its first room centre at `elevation + eye`, and
  collision walls (`levelAsPlan`) + furniture blockers are that storey's own. **Minimap
  tap-to-teleport** (MINIMAP-JUMP, `minimapTeleport` flag, simple): clicking/tapping
  `ui/Minimap.tsx` converts the pointer to world XZ (`ui/walk/minimapTeleport.ts`, pure —
  `svgViewBoxPoint` inverts the SVG client→viewBox mapping (`svgSquareViewBoxPoint` is now a
  square-viewBox wrapper over it), `minimapPointToWorld` inverts the component's own world→svg
  transform). **The minimap's viewBox tracks its measured pixel box** (ResizeObserver, 1 svg unit
  = 1 CSS px) and `ui/walk/minimapGeometry.ts:fitMinimapView` fits the plan into it with a small
  `INSET`: a fixed SQUARE viewBox inside the 168x132 widget was letterboxed to the box's SHORT
  side, so the map only ever filled ~76% of the width on top of the widget's CSS padding. The
  player marker is an accent arrow over a soft `.mm-cam-halo` disc so it reads over furniture
  dots and clamps it inside
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
- **Replace with similar** (PARITY-REPLACE, `replaceSimilar` flag, simple): pure
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
  `panorama` flag, simple), **HQ render** (`scene/pathtrace/hqRenderSession.ts` progressive
  path-traced still via `three-gpu-pathtracer`; `hqRenderSource.ts` module singleton exposes
  live scene+camera; `ui/HqRenderModal.tsx` — resolution/samples/DoF; `hqRender` flag, simple;
  **AI denoise** PHOTO-DENOISE: OIDN U-Net over the finished still via the lazy-loaded
  `denoiser` package (tfjs — WebGPU→WebGL2→CPU fallback chain), guided by one-shot raster
  albedo/normal AOVs (`hqAovPasses.ts`) captured at session start; Apache-2.0 weights
  self-hosted in `public/denoiser-tzas/` (~0.6 MB/model, offline-safe); pure gates in
  `hqAiDenoiseMath.ts` (≤4K eligibility, backend order, weights URL); runs automatically on
  done/Stop via `session.applyAiDenoise()`, edge-blur `DenoiseMaterial` blit stays as live
  preview + fallback; `hqAiDenoise` flag, simple),
  **Render preset A/B compare** (`ui/renderCompare/compareState.ts` pure logic — preset
  selection, swap, divider clamping; `ui/RenderCompareModal.tsx` two sequential captures +
  Lightroom-style before/after slider with touch parity; `renderCompare` flag, simple),
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
  `movingStop` state); `panoTour` flag, simple), **Presentation mode** (`ui/PresentationMode.tsx`, `presentation` flag,
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
  **Poly Haven fetcher** (`scripts/asset-pipeline/fetch-polyhaven-models.mjs`, dev): downloads
  CC0 model gltf bundles (1k default) and repacks self-contained GLBs into
  `local-assets/<category>/` (gitignored) for the Part-1 local-asset dev DB; pure selection
  helpers in `polyhaven-select.mjs` (unit-tested); idempotent, rate-limited,
  `--limit/--category/--ids/--res`.
  **Build-time KTX2** (`scripts/asset-pipeline/ktx2-encode.ts`, opt-in): an optional
  UASTC-encode `@gltf-transform` transform for GLB textures via the same Basis-Universal WASM
  encoder as the browser (`ktx2-encoder` + `sharp`, no native `toktx`), registering
  `KHR_texture_basisu`. `processGlb(…, {ktx2:true})` / `fetch-assets.ts --ktx2`; OFF by default
  (WASM encode is slow; win is VRAM not size); degrades cleanly when the encoder is absent.
  **Cache lifecycle (PERF-001/008)**: `GltfModel` caches parsed GPU scenes (drei `useGLTF`)
  plus module-level `FOOTPRINT_CACHE`/`SUPPORT_PLANE_*`; removal paths (`freeResource` in
  `userAssetsSlice`, `markPackUninstalled` in `installedPacksSlice`) call
  `evictGltfAsset(url)` to clear + dispose those (base + all tier-variant urls) so GPU
  memory is reclaimed instead of leaking toward WebGL context loss.
