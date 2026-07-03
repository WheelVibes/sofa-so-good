# Dead-export audit (knip) — 2026-07-03

Branch: `task/dead-export-audit`. Investigation only — no `src/` edits in this change.

## Method

1. Ran `npx knip` (node 24.18.0 required — the repo's default `node` on PATH was v20.18.2,
   which crashes knip's oxc-parser with `ERR_REQUIRE_ESM`; had to `nvm use 24.18.0` first).
   A `knip.json` already exists at the repo root (entries: `src/main.tsx`, `setupTests.ts`,
   `scripts/**/*.{mjs,ts}`, `**/*.test.{ts,tsx}`; project glob `src/**/*.{ts,tsx}`). It does
   **not** cover `functions/`, `workers/`, or `electron/` — those have their own tsconfigs
   (`tsconfig.worker.json`) and are invisible to this knip run (see CI section below).
2. Knip reported **107 unused (value) exports** and **106 unused type exports**, 0 unused
   files, plus a handful of unrelated `unlisted`/`duplicate` dependency notices (not in scope
   for this audit — see appendix). The 107 figure matches the prior audit exactly.
3. Split the 107 exports into 6 folder-batches and independently verified each with grep
   across the **whole repo** (`src/`, `scripts/`, `functions/`, `workers/`, `electron/`,
   `docs/`, tests) for: dynamic `import()`, string/`window.__*` hook references, scenario-
   harness (`scripts/scenarios/**`) evals, worker `new Worker(new URL(...))` patterns,
   test-only usage, barrel re-exports, and TASKS.md/TODO.md-documented dormant work.
4. This document reconciles the batches' classifications under one consistent scheme (see
   below — the raw sub-agent reports used "DEAD" and "FALSE POSITIVE" inconsistently for the
   same underlying pattern; the classification here is normalized).

## Classification scheme used in this doc

- **DEAD** — zero references anywhere in the repo, including inside the declaring file
  itself. Safe to delete the whole declaration (not just the `export` keyword).
- **OVER-EXPORTED (false positive, internal-use-only)** — the value/function *is* live code,
  called by a sibling export in the *same file*; knip's "unused export" rule only tracks
  cross-file `import`, so it can't see same-file use. These are false positives for knip's
  purpose ("is this export needed") but the underlying code is not dead — only the `export`
  keyword is prunable, dropping the symbol to module-private.
- **FALSE POSITIVE (real external consumer)** — knip missed a genuine cross-file consumer
  (e.g. hidden behind `vi.mock`, a docs-cited extension point, or a same-name-different-file
  false match). Cited with file:line.
- **FLAG-GATED/DORMANT** — looks like an intentionally-kept hook for unshipped work.
- **TEST-ONLY** — used only by its own `*.test.ts`. **None of the 107 exports fell in this
  bucket** — worth noting since it was an expected category going in.

## Full results (107 exports)

### DEAD — safe to delete outright (20)

| File:line | Export | Evidence |
|---|---|---|
| `src/materials/cache.ts:201` | `disposeCachedMaterial` | Docstring claims it fires on user-material delete, but the real delete path (`src/state/slices/userAssetsSlice.ts:153`, called from `src/ui/FinishPicker.tsx:290`) never calls it — only revokes object URLs. Looks like a **real leak, not just dead code** — general eviction was superseded by `disposeOwnedMaterial` (`furnitureMaterials.ts:521`, AUD-002/CHANGELOG:3564) but the explicit-delete path was left unwired. Flag as a bug, not a pure prune. |
| `src/materials/composeMaterial.ts:36` | `DEFAULT_COMPOSE_ROUGHNESS` | No references anywhere, not even internally (sibling `DEFAULT_COMPOSE_SCALE` *is* used at lines 40/68/74/83). |
| `src/materials/procedural/generators.ts:364` | `mix` | Bare pass-through re-export of `mix` from `./noise`; nothing imports `mix` from `generators.ts`. |
| `src/materials/procedural/generators.ts:143` | `rawToTexture` | Superseded — the worker pipeline now transfers `ImageBitmap`s directly (`procedural.worker.ts:41` → `cache.ts` `imageBitmapToTexture`); no call sites remain. |
| `src/materials/proceduralSwapSignal.ts:43` | `_resetProceduralSwapSignal` | "Reset for tests" but no test file exists for this module at all. |
| `src/materials/proceduralSwapSignal.ts:32` | `getProceduralSwapCount` | Sole consumer `RenderPump.tsx` uses `subscribeProceduralSwap` + its own dirty flag instead. |
| `src/furniture/GltfModel.tsx:537` | `preloadGltf` | Zero references anywhere. |
| `src/furniture/catalog.ts:203` | `getDef` | Distinct from `useCatalogGetter()`'s returned `getDef` closure; the standalone module-level function has zero importers. |
| `src/ui/actions/toolActions.tsx:66` | `toolCategoryLabel` | Zero references anywhere, including its own file and its test. |
| `src/analysis/designScore.ts:406` | `isUnscoredDesign` | Zero references anywhere, including `designScore.test.ts`. |
| `src/state/slices/featuresSlice.ts:7` | `hasSeenTour` | Superseded — `CHANGELOG.md:7319` confirms `App.tsx` now calls `resolveBootDecision()` instead of the old `hasSeenTour()`/`startTour()`; `App.tsx:403` confirms. |
| `src/state/store.ts:146` | `PRESET_HOURS` (barrel re-export) | This specific re-export statement is dead — real consumers (`src/ui/toolbar/menus/SceneMenu.tsx:7`, `src/ui/toolbar/mobile/SceneSection.tsx:5`) import `PRESET_HOURS` directly from `state/slices/timeSlice`, bypassing the `store.ts` barrel. The underlying symbol is alive; only the re-export line is prunable. |
| `src/scene/xr/xrStore.ts:22` | `peekXrStore` | Sibling `getXrStore()`/`enterVr()` from the same file ARE consumed (`XrProvider.tsx`, `MobileToolbar.tsx`, `ViewSection.tsx`, `ViewMenu.tsx`); `peekXrStore` itself has zero callers. |
| `src/catalog/remote/cache/db.ts:176` | `deleteAsset` | Never called; `evictAssetsUntilUnder` (db.ts:184-197) does its own `del()` instead of calling this. |
| `src/catalog/remote/cache/db.ts:199` | `listAssetKeys` | Never called in src/ or tests; only appears in a historical design-doc snippet. |
| `src/catalog/remote/cache/lru.ts:4` | `DEFAULT_THUMB_CAP_BYTES` | Sibling `DEFAULT_ASSET_CAP_BYTES` (lru.ts:3) IS used (`remoteCatalogSlice.ts:10/148`); this one was defined for symmetry but the "evict thumbs by cap" path was never wired. |
| `src/apartment/constants.ts:694` | `TOTAL_AREA_M2` | No references beyond declaration anywhere (its sibling `AC_LEDGE_AREA_M2` on the same line IS used to compute it — but `TOTAL_AREA_M2` itself is unused downstream). |
| `src/ai/aiClient.ts:43` | `setImgModel` | No UI/settings caller, no dev hook, no test; sibling `getImgModel`/`DEFAULT_IMG_MODEL` are used. |
| `src/lighting/ies/sampleProfiles.ts:57` | `DEFAULT_IES_PROFILE_ID` | Sibling `BUNDLED_IES_PROFILES` is the one actually consumed (`IesProfilePicker.tsx:4/60` + tests); this constant has zero callers. |
| `src/layout/designRules.ts:39` | `tvViewingDistance` | No code caller anywhere; only prose mentions in `docs/interior-design-guidelines.md:6,37`. No TASKS.md/TODO.md item references it — documented-but-never-implemented, not tracked dormant work. |

### OVER-EXPORTED — false positive, internal-use-only; live code, drop `export` only (86)

All of these are constants/helpers called by a sibling function *in the same file*, where
external callers only ever import the higher-level wrapper. Verified via grep that the
internal call site exists and that the wrapper's external consumers never import the raw
symbol directly.

**src/materials/** (8): `composeMaterial.ts` `COMPOSE_ROUGHNESS_MAX`/`COMPOSE_ROUGHNESS_MIN` (used in `clampRoughness`, exposed via `composedMaterialDef`/`tintedMaterialDef` in `useMaterial.ts`); `convert/reencode.ts` `reencodeToWebp` (used by `normalizeTextureFile`, consumed at `materials/upload/persist.ts:3`); `designerPicks.ts` `DESIGNER_FLOOR_IDS`/`DESIGNER_WALL_IDS` (feed `designerPickIds` → `resolveDesignerPicks`, live in `FinishPicker.tsx` behind the `designerPicks` flag); `draperyOpacity.ts` `DRAPERY_OPACITY` (feeds `Curtain.tsx`/`RollerBlind.tsx`/`windowLightModifiers.ts`); `stylePresets.ts` `STYLE_ROOMS` (feeds `applyStyle`, live in `ArrangeMenu.tsx`/`ArrangeSection.tsx`); `useMaterial.ts` `customColorDef` (feeds `resolveFinishDef`/`useMaterialDef`).

**src/furniture/** (12): `FurnitureMaterialLoader.tsx` `CATALOG_WOOD_DEFAULTS`; `convert/convertModel.ts` `ConvertError` (thrown/caught at 4 sites within the same file — genuinely live, just intra-module); `glbEdit/gizmoWriteBack.ts` `MIN_SIZE_M`/`POSITION_LIMIT_M`/`POSITION_SNAP_M`/`ROTATION_SNAP_DEG`/`SIZE_SNAP_M` (feed `gizmoPatch`, consumed via `GlbDesignerDialog.tsx`); `ikea/compatibility.ts` `categoryMatches`/`productCategories` (feed `resolveCompatible`, consumed by `DragController.tsx`/`IkeaBody.tsx`); `ikea/detectGroups.ts` `DETECT_CONCURRENCY` (feeds `detectGroups()`); `ikea/metadata.ts` `IkeaMetadataZ` (feeds `parseMetadata`); `parametric/buildObject.ts` `partMaterial` (feeds `buildParametricObject`, consumed by `ParametricPreview.tsx`). Note: a *different*, correctly-used `partMaterial` also exists in `src/furniture/glbEdit/buildObject.ts:80` — not to be confused with this one.

**src/ui/ + src/export/ + misc** (18): `Onboarding.tsx` `markOnboarded`; `catalog/searchSynonyms.ts` `CATEGORY_INTENT`/`SYNONYM_GROUPS`; `catalog/thumbnails.tsx` `requestThumbnail`; `floorplan/PlanFurnitureInspector.tsx` `itemFootprintWD`; `floorplan/editor/marqueeSelect.ts` `MIN_MARQUEE_SIZE_M`; `floorplan/planLabels.ts` `PLAN_LABEL_CYCLE`; `panorama/viewerLook.ts` `ZOOM_SENSITIVITY`; `scene/TimeOfDaySlider.tsx` `formatClock` (note: `ElevationPanel.tsx:41` has its own unrelated local `formatClock` — not a consumer); `staging/stagingReveal.ts` `STAGING_SETTLE_MS`; `export/dxf.ts` `dxfY`/`polygonCentroid`/`wallPointAt` (all internal-only inside `dxf.ts`; `roomCentroid.ts:12`'s `polygonCentroid`-alike is a same-name-different-file red herring, not a consumer); `export/sceneGltf.ts` `NO_EXPORT_KEY`; `pwa/swUpdate.ts` `applyUpdate` (called only as a closure inside `showUpdatePrompt`'s `onAction`, never by name elsewhere — no service-worker `postMessage` bridge found); `elevation/projectElevation.ts` `ELEVATION_NEAR_WALL`; `controls/planEditorHotkey.ts` `onPlanEditorKey`; `collision/wallSnap.ts` `WALL_SNAP_DISTANCE`.

**src/analysis/ + src/state/** (14): `hdbCompliance.ts` `COMPLIANCE_THRESHOLDS`/`RULES`; `renoTimeline.ts` `BASELINE_ROOMS`/`BASELINE_SQM`/`WORK_DAYS_PER_WEEK`/`inputFromFloorPlan`; `renovationCost.ts` `DEFAULT_CARPENTRY_RATE`; `suggestions.ts` `SUGGESTION_RULES`; `state/slices/localAssetsSlice.ts` `LOCAL_ASSETS_MOUNT`; `state/storage/appearancePrefs.ts` `applyAppearance` (documented in `src/state/CLAUDE.md:22` as internal); `state/storage/designFile.ts` `DESIGN_FILE_EXT`; `state/storage/editorPrefs.ts` `applyDensity`; `state/storage/migrations.ts` `CURRENT_VERSION`; `state/storage/walkBackdrop.ts` `MAX_WALK_BACKDROP_BYTES`.

**src/scene/ + src/catalog/** (12): `scene/backdropEquirect.ts` `HORIZON_Y` (also already flagged as a false positive by a *prior* audit: `docs/research/2026-06-20-followup-audit.md:196` — "do not bulk-remove"); `scene/dragHelpers.ts` `ALIGN_TH`; `scene/lighting/statusBarTint.ts` `sampleCanvasTopHex`; `scene/lighting/windowLightModifiers.ts` `curtainTransmission`; `scene/selection/resizeGizmoMath.ts` `RESIZE_MAX_FACTOR`/`RESIZE_MIN_FACTOR`; `scene/selection/rotateGizmoMath.ts` `GIZMO_HANDLE_GAP`; `catalog/remote/cache/db.ts` `assetsStore`/`indexStore`/`metaStore`/`thumbsStore` (internal IndexedDB store handles, each backing an exported CRUD function that's the real, imported consumer); `catalog/remote/providers/index.ts` `PROD_PROVIDER_IDS` (used internally by `activeProviderIds(isDev)`, the app-wide dev-gate; also the named extension point TODO.md:38-43 references for adding `ambientcg` once a prod CORS proxy exists — tests mock this module with `vi.mock` rather than importing the real value, which is why knip's static graph misses the true internal consumer).

**src/floorplan/ + src/features/ + misc** (22): `floorplan/autoDimension.ts` `DIMENSION_OFFSET`; `floorplan/demolitionPlan.ts` `MATCH_EPSILON`; `floorplan/gridSnap.ts` `assertGrid`/`snapItem`; `floorplan/planIntegrity.ts` `roomsAdjacent`; `floorplan/rescalePlan.ts` `rescaleItem`; `floorplan/roomWallNames.ts` `roomForWall`; `features/auth/localAdmin.ts` `ADMIN_USER`; `features/designShare.ts` `MAX_DESIGN_DECOMPRESSED_BYTES`; `features/planShare.ts` `MAX_CODE_LENGTH`/`MAX_DECOMPRESSED_BYTES`; `lighting2d/luxGrid.ts` `DAYLIGHT_HALF_DEPTH`/`DAYLIGHT_REF_GLAZING`/`LUX_GRID_CELL`; `apartment/constants.ts` `AC_LEDGE_AREA_M2`; `apartment/walls/wallRoomSides.ts` `wallRoomSidesAt`; `ai/aiClient.ts` `DEFAULT_IMG_MODEL`/`getImgModel`; `lighting/ies/sampleProfiles.ts` `bundledIesById`; `layout/clearance.ts` `doorProbePoints`; `desktop/updateCheck.ts` `RELEASES_API_URL`/`RELEASES_PAGE_URL` (used inside `updateCheck.ts` itself — `electron/main.mjs` doesn't need them directly since the fetch happens renderer-side).

### FLAG-GATED/DORMANT (1)

| File:line | Export | Evidence |
|---|---|---|
| `src/ui/openSh3dImport.ts:115` | `importSh3dFile` | Only called internally (`openSh3dImport.ts:108`); its doc comment claims it's "exported for direct/drag callers," but no such caller exists today (`FileMenu.tsx`/`FileSection.tsx`/`CommandPalette.tsx` all use `openSh3dImport`, and `openSh3dImport.test.ts` tests `applySh3dResult`). No TASKS.md/TODO.md item tracks a planned drag-and-drop SH3D import — this is an unrealized hook without a backlog entry, not confirmed dormant work. |

### TEST-ONLY (0)

None of the 107 flagged exports were consumed exclusively by their own test file.

## Prioritized prune plan

### Task 1 — Delete genuinely dead code (19 exports, ~18 files)
Delete the declaration (not just `export`) for every item in the DEAD table above **except**
`disposeCachedMaterial`, which needs a product decision first (see Task 4). Files:
`src/materials/composeMaterial.ts`, `src/materials/procedural/generators.ts` (2 exports),
`src/materials/proceduralSwapSignal.ts` (2 exports), `src/furniture/GltfModel.tsx`,
`src/furniture/catalog.ts`, `src/ui/actions/toolActions.tsx`, `src/analysis/designScore.ts`,
`src/state/slices/featuresSlice.ts`, `src/state/store.ts` (drop the `PRESET_HOURS` re-export
line only), `src/scene/xr/xrStore.ts`, `src/catalog/remote/cache/db.ts` (2 exports),
`src/catalog/remote/cache/lru.ts`, `src/apartment/constants.ts`, `src/ai/aiClient.ts`,
`src/lighting/ies/sampleProfiles.ts`, `src/layout/designRules.ts`. Run `tsc` + targeted vitest
for each touched file's test suite after deleting.

### Task 2 — Drop unnecessary `export` on internal-only helpers, batch A (44 exports)
Mechanical, zero behavior change (module-private, not deleted). Folders: `src/materials/**`
(8), `src/furniture/**` (12), `src/scene/**` + `src/catalog/remote/**` (12+ overlap — combine
with materials/furniture since same review pass), plus `src/analysis/**` + `src/state/**` (14
— wait, exact split at implementer's discretion; keep each PR under ~50 line changes). Verify
with `npx knip` re-run (count should drop) + full lint pass — this is a Biome-safe mechanical
change since no call sites move.

### Task 3 — Drop unnecessary `export` on internal-only helpers, batch B (42 exports)
Same mechanical change for the remaining folders: `src/ui/**` + `src/export/**` + misc singles
(18), `src/floorplan/**` + `src/features/**` + `src/lighting2d/**` + `src/apartment/**` +
`src/ai/**` + `src/lighting/**` + `src/layout/**` + `src/desktop/**` (22 minus the 2 already
counted as DEAD = matches remainder). Same verification as Task 2.

### Task 4 — Investigate before touching (2 items, product/bug decision needed)
- `src/materials/cache.ts:201` `disposeCachedMaterial` — confirm whether user-material delete
  (`FinishPicker.tsx:290` → `userAssetsSlice.ts:153`) should call this to avoid a GPU-texture
  cache leak, or whether `disposeOwnedMaterial`'s LRU eviction already covers it in practice.
  If it's a real gap, wire it in and keep the export; if superseded, delete both the function
  and confirm no leak exists via a manual heap-snapshot check.
- `src/ui/openSh3dImport.ts:115` `importSh3dFile` — either wire up the drag-and-drop SH3D
  import the doc comment describes (log a TASKS.md item first) or drop the `export` if there's
  no near-term plan to build it.

## CI recommendation

Add `npm run deadcode` (the existing `knip` script alias) as a **non-blocking** CI step for
now, not a hard gate — the current `knip.json` produces zero false "unused file" hits but a
majority (86/107, ~80%) of its "unused export" hits are same-file-internal-use false
positives that knip's rule set can't distinguish from real dead code without extra config.
To make it noise-free enough to gate on:
1. After Tasks 2–3 land (dropping the unnecessary `export` keyword from the 86 over-exported
   internal helpers), the remaining true positives should mostly disappear, since the pattern
   causing 80% of today's noise goes away.
2. Add an `ignoreExportsUsedInFile: true`-equivalent behavior isn't a knip config option
   directly, but Biome's `noUnusedPrivateClassMembers`-style linting plus this cleanup gets
   the same effect — the honest fix is Tasks 2–3, not a knip ignore-list.
3. Extend `entry`/`project` in `knip.json` to cover `functions/**/*.ts`, `workers/**/*.ts`,
   and `electron/*.mjs` (each has its own tsconfig — `tsconfig.worker.json` etc. — and is
   currently **entirely invisible** to knip; this audit did not cover those trees at all).
   Verify no false positives appear there (Cloudflare handler exports and Electron IPC handler
   exports are often referenced only by binding name in `wrangler.jsonc`/`main.mjs`, which is
   another common false-positive source) before gating on it.
4. Once (1)+(3) are done, wire `npm run deadcode` into `.github/workflows/ci.yml` as blocking.
   Keep the existing `ignore: ["src/**/*.d.ts", "src/types/**"]` and add path ignores for any
   genuinely-intentional dormant hooks (e.g. `src/ui/openSh3dImport.ts` if it's kept unwired
   on purpose) via knip's per-file `ignoreExportsUsedInFile` or `entry` markers rather than a
   blanket suppression.

## Appendix — other knip output not in scope for this audit

- **106 unused type exports** — a separate knip category (type-only exports), not covered by
  this pass; likely has a similar internal-use-only false-positive rate and would benefit
  from the same Task 2/3-style treatment in a follow-up.
- **`unlisted` dependency notices**: `python/scripts/compress_glb_textures.mjs` uses
  `@gltf-transform/cli`; `src/furniture/GltfModel.tsx`, `src/ui/catalog/thumbnails.tsx`,
  `src/scene/cameras/OrbitCamera.tsx` use `three-stdlib`; `src/materials/convert/
  decodeGpuTexture.ts` (+ its test) use `ktx-parse`. These are all real dependencies used via
  subpath imports that knip's dependency resolver doesn't associate with the declared
  `package.json` entry — worth a package.json audit but out of scope here.
- **1 duplicate-exports notice**: `src/utils/safeUrl.ts` exports `safeUrl`, `safeHref`,
  `sanitizeUrlField` from the same statement — knip flags this as a duplicate-export pattern,
  not dead code; not investigated further here.

`knip.json` is unchanged by this audit — the existing config already produces a clean run
(0 unused files, exports/types counts match the prior audit exactly), so no new config was
committed. The CI-readiness gap is the noise rate on the export list (Task 2/3 above), not
the config itself.
