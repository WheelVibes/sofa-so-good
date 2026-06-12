# Changelog

Autonomous improvement log for the HDB 3D interior-design sandbox. Newest first.
Each entry corresponds to one focused commit. The pre-C251 history (C1–C250) was
pruned from `main`; entries from C251 on (branch
`claude/codebase-analysis-optimization-ny3xm9`) are kept here. See `TASKS.md` for the backlog.

## Scene time/lighting overhaul: real location/date sun, slider-only time, independent lights

- **Time of day is now a single free-scrub slider** (no preset chips/checkpoints) shared by the
  desktop Scene menu + mobile sheet (`ui/scene/TimeOfDaySlider`). The sun position — and hence the
  light level — follows the real sun for the user's location (lat/lon) + today's date at the
  selected local hour, on a smooth gradient, so sunrise/midday/sunset land at the place's real
  times (e.g. a Singapore evening stays lit until ~19:10 rather than going dark at 18:00).
- **System time fix.** The "System time" control always shows the real wall-clock time now, not
  whatever manual time is currently selected.
- **Lights is a single off/on/auto toggle**, independent of the time of day (lights can be on in
  daytime). Removed the "lighting moods" (Daylight / Golden hour / …) bundle — the
  `lightingScenes` module + `lightingMoods` feature flag + ⌘K mood commands are gone.

## Help slimmed to a launcher; sign-in moved to the main menu; admin password → "admin"

- **Help modal** no longer embeds how-to tips (the user guide covers them). It's now a launcher:
  **Replay the guided tour** + **Open the user guide ↗**, plus a desktop-only **Keyboard
  shortcuts** button that opens the shortcut reference in its own modal (mobile has no hardware
  keyboard, so it's omitted there). New `Keyboard` icon.
- **Sign in / account** moved out of Help into the main menu: a persistent footer at the bottom of
  the mobile hamburger sheet, and the bottom of the desktop Appearance popover.
- **Admin dev-gate password** dev fallback is now `admin` (was `sofa-admin`).
- Mobile menu rail is icon-only (dropped the per-row chevron).

## Mobile menu → master-detail; tour spotlight genuinely click-through (desktop + mobile)

Two related fixes for the mobile menu + product tour:

**Spotlight wasn't clickable (the "can't click the Edit menu" bug).** The tour overlay root
(`.tour-root`, `position:fixed; inset:0`) had the default `pointer-events:auto`, so it swallowed
taps/clicks landing in the spotlight hole — the highlighted control never received them. Diagnosed
via `elementFromPoint` at the target centre returning `.tour-root`. Fixed by making the root
`pointer-events:none` and re-enabling it on the blocker panes and the card, so the hole truly
passes input to the real control. This was a latent bug on **desktop** too (action steps were never
exercised by a real click there); verified fixed on both with new real-click scenarios.

**Mobile menu redesigned to master-detail.** The accordion sheet got unwieldy with many items per
section. Replaced it with an icon-only left rail (each section shows its icon + a right chevron)
that opens the selected section's items in a right-hand detail pane under a sticky title
(`MobileToolbar.tsx`). The tour's mobile reveal now *selects* the target's section in the rail
(checked via `aria-current`) instead of expanding an accordion.

**Verification:** `scripts/scenarios/first-run-mobile-tour.json` now advances the action steps with
**real hit-tested clicks** on the spotlighted rail/detail controls; new
`scripts/scenarios/first-run-desktop-tour.json` does the same on desktop (Edit menu → Edit a room →
Catalog). Both pass end-to-end; docs updated.

## Tour: reorder so Scene precedes entering a room (spotlights on desktop + mobile)

The "Set the mood" (Scene) step ran after "Edit a room" entered the room editor — but the Scene
menu is `!roomEditorActive` on **both** desktop (`Toolbar.tsx`) and the mobile sheet, so the step
had no live target and fell back to a centred card on every platform. Moved Scene to right after
View (both are overview/environment controls), before the room-editor steps, and renumbered the
step titles. Scene now spotlights its real control everywhere. `first-run-mobile-tour.json` walks
the new order; `first-run.json`'s step-3 screenshot renamed to match.

## Fix: interactive guided tour on mobile (was falling through to the location prompt)

On a mobile viewport, picking "Take the guided tour" in the onboarding carousel set
`tourOpen = true`, but `ProductTour` immediately called `end()` (it was desktop-only and
bailed on mobile). That flipped `tourOpen` back to `false`, so `LocationPrompt` — suppressed
only while `onboardingOpen || tourOpen` — popped up instead of the tour.

The tour now runs **interactively on mobile**, mirroring desktop: it opens the hamburger sheet,
expands the right accordion section, and spotlights the real control for the user to tap.

**What changed:**
- `src/ui/tour/ProductTour.tsx` — removed the mobile self-`end()` effect and `isMobile`
  early-return. Before measuring each step on mobile, `revealMobile()` opens the sheet (the
  tour overlay's `--z-modal` sits above the sheet's `--z-overlay`, and the spotlight hole stays
  click-through) and expands the step's `mobile.section`; `findTarget()` then resolves the
  mobile selector. Steps with no mobile-reachable control centre as before. On unmount the tour
  closes any sheet it opened, so it doesn't linger behind the location prompt.
- `src/ui/tour/tourSteps.ts` — added `TourStepMobile` (`{ target, section? }`) and a `mobile`
  entry per step (View / Edit / Edit-a-room / Catalog / Appearance map to sheet headers + rows;
  Scene/customise/finishes centre).
- `src/ui/toolbar/MobileToolbar.tsx` — added `data-tour-section` to accordion headers and an
  optional `tourId` (`data-tour`) on rows; tagged the "Edit a room" and "Catalog" rows.

**Tests/verification:**
- `src/ui/tour/ProductTour.test.tsx` — new: tour renders + stays open on both desktop and a
  mobile (`matchMedia`) viewport (regression guard for the self-terminate bug).
- `scripts/scenarios/first-run-mobile-tour.json` — new IXT-SUITES rung: full interactive mobile
  journey (onboarding → guided tour → spotlight View → Edit → Edit a room → Catalog → centred
  steps → Appearance → Done → location prompt last). Verified with screenshots.

## [C274] Standalone KTX2/DDS texture upload decode

Extends the material-upload pipeline (`materials/convert/`) to decode `.ktx2` and `.dds` texture files
that users upload via `UploadMaterialDialog`. Previously only PNG/JPG/WebP/BMP/TGA/TIFF/EXR/HDR were decoded.

**What shipped (KTX2 + DDS, both enabled):**
- `src/materials/convert/decodeGpuTexture.ts` — new module with `decodeKtx2()` and `decodeDds()`:
  - **KTX2 uncompressed** (`VK_FORMAT_R8G8B8A8_SRGB/UNORM`, `R8G8_UNORM`, `R8_UNORM`): pure-JS decode via `ktx-parse` — no WebGL needed.
  - **KTX2 Basis-compressed** (`VK_FORMAT_UNDEFINED`, BasisLZ/UASTC): `KTX2Loader` + shared Basis transcoder (same singleton the GLB path uses, at `/basis/`) + `readRenderTargetPixels` GPU readback via a minimal offscreen `WebGLRenderer`.
  - **DDS uncompressed** (`RGBAFormat`): pure-JS via `DDSLoader.parse()` — no WebGL.
  - **DDS compressed** (DXT1/3/5, BC6H, BC7, ETC1): GPU readback via offscreen `WebGLRenderer`.
  - Graceful error on missing `OffscreenCanvas`/WebGL: friendly error toast, never a crash.
  - sRGB/linear not modified — raw RGBA8 bytes are passed to the re-encode pipeline; the runtime material loader assigns the correct `colorSpace`.
- `src/materials/convert/decodeImage.ts` — `.ktx2` and `.dds` added to `EXTRA_TEXTURE_EXTENSIONS` and routed to `decodeGpuTexture.ts`.
- `src/materials/upload/validate.ts` — `GPU_TEXTURE_EXTS` set (`{'.ktx2', '.dds'}`) skips `createImageBitmap` (which can't decode GPU formats); size cap still applies; dimension check deferred to post-normalize.
- `src/ui/upload/UploadMaterialDialog.tsx` — `accept` attribute and format-list text updated to include KTX2/DDS.
- `public/basis/` — Basis transcoder (`basis_transcoder.js` + `.wasm`) served at `/basis/` for `KTX2Loader`.
- `public/test-fixtures/solid-teal-4x4.ktx2` — CC0 fixture (generated from a solid-colour PNG by `ktx-parse`, no external tooling).
- `vite.config.ts` — `resolve.dedupe` extended with `react`, `react-dom`, `react/jsx-runtime`, `scheduler` to prevent duplicate-React errors in worktree environments with nested `node_modules`.
- `src/state/storage/bootstrap.ts` — `window.__persistUserMaterial` dev helper exposed (alongside `__store`, `__arrangeRoom`, etc.) for the scenario harness.
- `scripts/scenarios/texture-upload-simple.json` + `scripts/scenarios/evals/upload-ktx2-material.mjs` — interaction-test ladder: fetch `solid-teal-4x4.ktx2` from `/test-fixtures/`, decode via pipeline, assert in `userMaterials` store, apply to `livingDining` floor, assert `finishes.floor`.

**Tests:** `src/materials/convert/decodeGpuTexture.test.ts` (12 tests) — extension gate, pure-JS KTX2 decode (uncompressed RGBA8 fixture), pure-JS DDS decode (uncompressed ARGB fixture), error paths (corrupt input, empty buffer, OffscreenCanvas unavailable), Basis-compressed mock path routing. All 61 materials tests pass. TypeScript clean.

**Fixtures:** `solid-teal-4x4.ktx2` (4×4 teal, `VK_FORMAT_R8G8B8A8_SRGB`, no supercompression, 292 bytes) and `solid-orange-4x4.dds` (4×4 orange, uncompressed ARGB, 192 bytes) — both generated programmatically, CC0/no-license.

## [C275 / R-CURTAIN/L1] Window glass tint + curtain light attenuation

Two coupled window-light effects, both simple-tier, default on, zero per-frame cost at rest:

**Glass tint** — `glassTint: string` added to `AppearanceSlice`; `setGlassTint(hex)` stores a
hex colour applied as a component-wise RGB multiply to the directional sun light each frame via
`getWindowGlassTint()` in `Lighting.tsx`. Empty / `'#ffffff'` = neutral (no effect). Gated by
`windowGlassTint` feature flag.

**Curtain attenuation** — `CurtainLightController` subscribes to the Zustand store and
recomputes `sceneAttenuationFactor()` whenever `items` or `glassTint` changes; the result is
written to the `attenuation` module-level signal and applied to `sunRef.current.intensity`
each frame. Matching criteria: item `defId` = `'curtains'` or `'roller-blind'`; centre within
0.5 m of the wall; rotation within ±90° of the wall angle; 1-D projection overlaps the window
extent. `style='open'` (tied back) → no obstruction (factor 1.0). `style='drawn'` + opaque →
OPAQUE_MIN 0.05 per fully covered window; sheer (`material='sheer'`) → SHEER_MIN 0.40. Scene
factor = average over all windows. Gated by `curtainLightEffect` feature flag.

**Architecture:** three new files (`windowLightModifiers.ts` pure functions,
`windowLightSignal.ts` module-level signals, `CurtainLightController.tsx` store subscriber) +
five modified (`Lighting.tsx`, `featureFlags.ts`, `appearanceSlice.ts`, `Scene.tsx`). Demand
frameloop: `RenderPump` already calls `invalidate()` on every store change — no explicit call
needed in the controller.

**Tests:** `windowLightModifiers.test.ts` — 34 unit tests covering isCurtainItem / isCurtainOpen
/ hexToRgb01 / glassTintRgb / curtainWindowOverlap (null cases: non-curtain, wall distance,
angle, no overlap; + overlap fraction + sheer detection) / windowAttenuationFactor (open, drawn,
sheer, partial) / sceneAttenuationFactor (no windows, single window, multi-window average) /
computeWindowModifiers; feature flag tier assertions in both Simple and Pro modes. Full suite:
301 files, 2251 tests, all pass. `tsc` clean. Biome clean (3 pre-existing warnings unrelated).

**Scenario:** `scripts/scenarios/window-light-simple.json` — 26 steps on port 5216: baseline
sunlit room (no curtains), add 3 drawn curtains over bedroom windows (5 total windows → scene
factor ≈0.43), screenshot visibly dimmer, apply amber tint `#e8b860`, screenshot tinted,
open all curtains, clear tint, final screenshot.

## [C272] Interaction-test ladders for pro-tier analytical features (drawings, versions, history, pano tour, render compare)

Seven scenario files added to `scripts/scenarios/`, covering 5 pro-tier features:

- **`drawings-lighting-simple.json`** — `drawings` flag gate (Simple/Pro); opens ElevationPanel; Lighting tab; lux overlay toggle + store assertions; time scrub to hour 19.
- **`versions-simple.json`** — `versions` flag gate (Simple/Pro); opens VersionsPanel; mounts and closes.
- **`versions-journey.json`** — seeds a schema-valid saved version into `localStorage`; opens panel; mutates design (adds dining table); clicks Compare → asserts `.ver-diff`; clicks Restore → asserts item count round-trips to 1 sofa.
- **`history-simple.json`** — `history` flag gate (Simple/Pro); clears items + history; places sofa then armchair; pushes history twice; opens HistoryPanel; `jumpHistory(0)` → asserts 1 sofa (first push snapshot); jumps to latest.
- **`pano-tour-simple.json`** — `panoTour` flag gate (Simple/Pro); seeds 2 stops via `window.__store.setState`; opens tour modal; asserts stop tab buttons; opens 2D plan editor (`setFloorPlanEditing(true)`); asserts `circle` count ≥ 2 in `.plan-screen`.
- **`pano-tour-journey.json`** — multi-step tour flow (plan editor markers, modal stop switching) plus a **mobile viewport leg** at 390×844 asserting stop tabs visible on small screens.
- **`render-compare-simple.json`** — `renderCompare` flag gate (Simple/Pro); opens modal via `setRenderCompareOpen(true)`; asserts preset `<select>` elements visible.

All 7 scenarios pass (37/37, 30/30, 19/19, 27/27, 31/31, 30/30, 14/14 steps respectively).

**Docs:** `docs/visual-verification-playbook.md` — added worked-examples section for all 7 scenarios with step counts, key gotchas (`jumpHistory(0)` semantics, `addPanoTourStopHere` headless limitation, versions schema seed requirements).

## [C273 / GE3c tail] Per-part texture on combined-mesh (CSG) parts

CSG-combined mesh parts now preserve each source part's finish on its own face group.
Previously combining two parts with different textures produced a union that took only
the first part's material; now every source part's colour/finish/PBR is kept on its triangles.

**Approach:** `three-bvh-csg`'s `Evaluator` is set to `useGroups = true` with per-brush
proxy `MeshStandardMaterial` instances (colour-keyed so parts sharing the same
finish+colour naturally merge their groups). The result geometry carries one draw group
per distinct source material; the brush's `result.material` array is mapped back to
`GroupMaterialData` snapshots (serialisable POJOs) stored in `geometry.groups` /
`geometry.materials` on the `MeshGeometryData` spec. Back-compat: old specs without
these fields fall back to the single-material path unchanged.

**Serialisation round-trip:** `GroupMaterialData[]` is plain JSON — finish id, colour hex,
roughness, metalness, glow, opacity. `partGeometry` restores geometry groups from
`data.groups` on rebuild so Three.js applies the per-group material array. `partMaterials`
(new export, supersedes `partMaterial` for mesh kind) returns `MeshStandardMaterial[]`
built from the group configs; the live preview `PartMesh` and `buildEditedObject` both
use it. The GLTFExporter handles the multi-material mesh correctly (roughness/metalness
maps merged per group — confirmed by exporter warning in the headless run).

**UVs:** `boxProjectUvs` runs on the whole geometry (vertex-by-normal, group-agnostic) so
each group's finish tiles at physical metre scale — no per-group split needed.

**Inspector behaviour:** combined (`mesh` kind) parts with `geometry.materials` hide the
colour/finish/PBR slider controls — those surface-look fields are frozen per-group at
combine time. Position and rotation remain editable. The inspector note says "re-add the
parts and combine again to change finishes" — no face-picker UI needed.

**Tests:** +18 new unit tests (6 `meshPartFromGeometry` group-path cases, 7 `combineParts`
group/UV/serialise cases, 2 `partMaterials` array-return cases, 3 deduplication/round-trip).
Scenario `glb-csg-textures-simple.json` drives the full flow headless: open designer →
add box 1 (Oak finish) → add box 2 (Walnut finish) → Union → confirm "Combined" shape →
save to catalog → reopen designer. All 32 steps pass; GLTFExporter confirms multi-material
export via merged-texture warning; combined mesh renders in the preview.

## [C269 / IXT-SUITES batch 1] Interaction-test ladders for the Simple-mode core design loop

Eight scenario JSON files covering the five Simple-mode features — catalog/furnish,
finishes, budget/shopping, share, and view modes (orbit ↔ walk ↔ 2D plan):

| File | Rungs | Steps | Shots | Mobile leg |
|---|---|---|---|---|
| `catalog-furnish-simple.json` | simple | 28 | 5 | — |
| `catalog-furnish-journey.json` | journey | 34 | 5 | 390×844 |
| `finishes-simple.json` | simple | 25 | 5 | — |
| `finishes-journey.json` | journey | 31 | 4 | 390×844 |
| `budget-simple.json` | simple | 23 | 4 | — |
| `share-simple.json` | simple | 18 | 3 | — |
| `view-modes-simple.json` | simple | 24 | 6 | — |
| `view-modes-journey.json` | journey | 39 | 6 | 390×844 |

All scenarios: `waitFor` over blind `wait`, `store` steps for all store actions,
`setManualHour(13)` for reviewable frames, real `FurnitureItem` shapes
(`position:[x,z]`, `rotation`), in-room livingDining coordinates, `SHOT_URL`
env-overrideable URL. All 8 passed against the dev server at port 5220.

Bugs/oddities caught during authoring and verified correct in app:
- Builtin finish IDs have no `mat:` prefix: `floor-wood-oak`, `wall-paint-white`.
- `shopTab` valid values: `'list'` | `'saved'` (no `'rooms'` value).
- CatalogDrawer only mounts when `open && cameraMode==='orbit' && roomEditor.active`.
- `BudgetHud` only mounts when `budgetTarget` is non-null.
- `localStorage.setItem('hdb_onboarded','1')` in `dismiss-overlays` prevents the
  onboarding carousel from mounting after the eval step returns (store call alone is
  insufficient because the boot decision runs before React mounts).
- Multiple `eval` steps sharing page scope must use IIFEs to avoid `const` redeclarations.

Docs: playbook `worked-examples` section updated with all 8 scenarios, key gotchas,
and a run-all command block. `TASKS.md` IXT-SUITES entry updated.

## [C271 / PERF9 tail] OffscreenCanvas worker generation for procedural textures

Moves procedural PBR texture generation off the main thread to eliminate jank at boot
and finish-switch time. Three-file addition, two modified, all existing APIs and material
IDs unchanged.

**New files:**
- `src/materials/procedural/procedural.worker.ts` — Vite `?worker`-pattern module
  worker; receives `{id, pattern, swatch, size}`, generates fields via the pure
  `generateProceduralRaw()` function, renders each PBR map to an `OffscreenCanvas`,
  and returns three `ImageBitmap`s (zero-copy transferables) to the main thread.
- `src/materials/procedural/runProceduralWorker.ts` — main-thread façade with lazy
  worker init, request coalescing (same `{id,pattern,swatch,size}` key → one message),
  graceful degradation (`offscreenAvailable` feature-detect; `workerBroken` flag;
  `null` return → caller falls back), and test escape-hatches
  (`_setOffscreenAvailableForTest`, `_setWorkerFactoryForTest`, `_resetProceduralWorker`).
- `src/materials/proceduralSwapSignal.ts` — lightweight module-level signal
  (mirrors `finishDragSignal.ts` pattern) that fires when a worker result hot-swaps a
  material's textures, so the demand-mode canvas renders one extra frame.
- `src/materials/procedural/proceduralWorker.test.ts` — 12 unit tests covering:
  seed determinism (`generateProceduralRaw` is pixel-identical for same inputs, different
  for different ids), worker-key stability, fallback when unavailable, request coalescing
  (two concurrent same-key calls → one worker message), and ok:false fallback.

**Modified files:**
- `src/materials/procedural/generators.ts` — adds `generateProceduralRaw()` (pure,
  DOM-free pixel-array generation, deterministic given `{id,pattern,swatch,size}`) and
  `rawToTexture()` (main-thread helper to materialise worker-returned buffers).
- `src/materials/cache.ts` — `buildMaterial()` for procedural kinds now: (1) immediately
  builds a sync texture via the existing path (no first-paint delay), (2) fires
  `scheduleWorkerUpgrade()` off-thread, (3) on worker resolution hot-swaps the material's
  maps in-place, disposes the old GPU textures, and calls `notifyProceduralSwap()` to kick
  a demand-mode render frame. Fallback: if OffscreenCanvas is unavailable or the worker
  errors, the sync textures stay in place — identical behaviour to today.
- `src/scene/RenderPump.tsx` — subscribes to `subscribeProceduralSwap` so worker texture
  upgrades trigger `markDirty()` (a settle-tail render) without routing through the store.

**Sync-fallback + swap strategy:** `buildMaterial` immediately calls the existing
`generateProcedural()` (sync, DOM) for a fast first paint, caches the material, then
`scheduleWorkerUpgrade()` sends a worker request with the same key. The worker encodes
pixels into `ImageBitmap`s (OffscreenCanvas, zero-copy transfer). On resolution, the main
thread draws each bitmap to a `<canvas>`, wraps it in a `CanvasTexture`, and swaps the
material's `map`/`normalMap`/`roughnessMap` in-place, setting `needsUpdate`. The
`proceduralSwapSignal` then fires to kick a render frame.

**Determinism guarantee:** `generateProceduralRaw` uses `hashSeed(id+':'+pattern)` →
`mulberry32` PRNG, all seeded deterministically. Same inputs → pixel-identical output
across calls and threads.

**Scenario:** `scripts/scenarios/procedural-worker-simple.json` — boots to daylight,
screenshots the default flat (wood floors), switches living-room floor to hexagon tile,
waits for worker swap, screenshots result.

**Caveats:** OffscreenCanvas is unavailable in Node.js / headless Vitest (all unit tests
exercise the sync fallback path, which is correct and sufficient). Worker pixel-identity
with sync output is guaranteed by the shared `generateProceduralRaw` function (same
seeded RNG, same math). The upgrade is best-effort and invisible if the worker fails —
the sync texture stays.

## [C270] Parametric kitchen-run type — toe-kick, per-bay doors/drawers, worktop slab, optional uppers

**New parametric type `kitchen-run`** in the custom-size furniture dialog (PF2). Ships behind the `kitchenCabinets` feature flag (tier: `pro`, default on). Tab "Kitchen run" appears in the dialog when in Pro mode.

**Geometry (`buildParts.ts`):** `buildKitchenRun(spec)` builds:
- Toe-kick plinth: 0.1 m tall, recessed 0.05 m from front, full run width.
- Carcass sides (floor → worktop underside), back panel, top + bottom panels.
- Per-bay dividers (spec-driven count, not auto-sized by span).
- Per-bay fronts: hinged door leaves (each ≤ 0.6 m) with handle; stacked drawer fronts with horizontal pulls; or open with mid-height shelf.
- Worktop slab at spec.height: 0.04 m thick, 0.02 m front overhang, 0.01 m side overhang.
- Optional uppers (`hasUppers: true`): 0.35 m deep × 0.72 m tall wall-mounted carcass above the worktop (0.18 m gap), with full-width door leaves per bay.

**Dimension envelope:** width 0.6–3.6 m (default 1.8 m), worktop height 0.85–0.92 m (default 0.87 m), depth 0.55–0.65 m (default 0.6 m), bays 1–6 (default 3).

**spec.ts:** Added `bays` and `hasUppers` to all `ParametricSpec` entries in `DEFAULT_SPECS` (required by TypeScript); `clampSpec` clamps `bays` to 1–6 and validates `hasUppers`. `specLabel` returns `"Custom kitchen run N cm wide"` for kitchen-run. All existing non-kitchen defaults carry `bays: 1, hasUppers: false`.

**saveParametric.ts:** `TYPE_CATEGORY` maps `kitchen-run → 'kitchen'`.

**ParametricControls.tsx:** `KitchenControls` component for the kitchen-run tab: width/height/depth sliders, bays count slider (1–6), uppers toggle with description, per-bay style picker (Open / Door / Drawer) using the existing `BayStylePicker`, and finish swatches.

**Tests:** 29 new unit tests in `src/furniture/parametric/__tests__/kitchen-run.test.ts` covering dimension clamping, toe-kick geometry (y=0, height=0.1), worktop top face at spec.height, no floating members, per-bay door/drawer/open output, uppers part-count increase, price monotonicity (bays and width), and price reasonableness.

**Scenario:** `scripts/scenarios/parametric-kitchen-simple.json` — simple ladder: pro mode, open dialog, switch to Kitchen tab, toggle bay to drawers, screenshot.

## [C264 / PR6-tail] Default common furniture finishes to local CC0 `mat:` materials

**Categories updated (17 catalog entries):** `bed-single`, `bed-double`, `bed-queen`, `bed-king`,
`bunk-bed`, `crib`, `dining-table-4`, `desk`, `coffee-table`, `console-table`, `wardrobe-3door`,
`dresser`, `shoe-cabinet`, `bookshelf`, `sideboard`, `nightstand`, `floor-mirror` — all had
`default: 'wood'` on their primary wood finish field (`finish` or `frameFinish`); changed to
`default: 'mat:floor-wood-oak'`.

**Decision: NEW items only.** `mat:floor-wood-oak` applies to newly placed items (the catalog
schema default). Existing saved designs carry their stored props (`'wood'` or any explicit value)
untouched — `defaultParamProps` is only called on first placement, and the store merges on top,
so the user's explicit choice always wins. No migration of existing stored data.

**Per-furniture UV-scale / repeat support** (`furnitureMaterials.ts`): `getSurfaceMaterial` now
honours the `repeat` parameter for `mat:` finishes (previously ignored). Added
`getFurnitureMatWithRepeat` (private): clones the base material, individually clones+reassigns
`map`/`normalMap`/`roughnessMap` with the new repeat, caches per `(id, repeat)`. Repeat ≈ 1 returns
the base unchanged (no clone). Same pattern as `getWoodMaterial(color, repeat)` for procedural wood.

**Pre-warm on scene mount** (`FurnitureMaterialLoader.tsx`): `CATALOG_WOOD_DEFAULTS` (the five wood
variants: oak, walnut, teak, ash, ebony) are seeded into the `ids` set before items are scanned,
so the five most common finishes are built synchronously on the first render — no first-frame pop.
All are procedural (offline-safe); no remote fetch needed.

**Tests:** 6 new unit tests in `furnitureMaterialFinish.test.ts`: user override wins, key categories
default to `mat:floor-wood-oak`, fallback to procedural when mat: not in cache, repeat=1 identity,
repeat≠1 distinct clone (cached, stable), UV-scale clone preserves map repeat. Updated
`builtinCatalog.test.ts` enum-default validation to exempt `mat:` defaults.

**Scenario:** `scripts/scenarios/furniture-finishes-simple.json` — simple ladder verifying default
finish, sofa-level angle, bookshelf closeup, performance-tier regression.

## [C265 / T2] Crown-molding revisit + kitchen/bath template polish

**Crown molding (T2):** Adds decorative crown-molding strips at every wall–ceiling junction
in both the curated default flat (`WallSegment.tsx`) and user-authored plan shells
(`PlanShell.tsx`). The `crownMolding` feature flag (`tier: 'simple'`, default `true`) was
wired in the previous partial attempt; this commit completes the geometry with the same
abutment-extended span lengths used by skirting boards, so mitre corners close flush at
every wall junction with no gaps or overlaps. `polygonOffset` prevents z-fighting against
the ceiling plane. Applies to rectangular and polygon rooms; correct in the room editor and
multi-storey plans (PlanShell uses the same wall-box abutment logic as Baseboard).

**Kitchen template polish:** Counter back face moved flush to north wall (z≈6.85 = wall
inner + `CLEARANCE.wallGap`); fridge SW corner flush to west + south walls; stove + range
hood flush to south wall; washing machine in service yard flush to west + south walls;
microwave repositioned above the counter near the west end (away from the stove).

**Bathroom template polish:** Shower in Bath 1 flush to west + north walls; WC in both baths
repositioned flush to east + south walls with correct wall-gap clearances; basin repositioned
flush to east wall; all fixtures verified within room bounds.

**Tests:** `src/apartment/crownMolding.test.ts` — 18 tests covering the `atCeiling` predicate,
`wallEndAbutmentThickness` corner-extension regression, and template fixture bounds for kitchen,
bathrooms, and service yard (all pass).

**Scenario:** `scripts/scenarios/crown-molding-simple.json` — simple interaction-test ladder
(crown flag gated, renders, toggleable on/off, daytime lighting).

## [C268 / FIRST-RUN] Onboarding carousel fires first; product tour is opt-in from carousel choice

**Behaviour change:** on a clean profile the onboarding carousel now fires FIRST (welcome →
overview → "Where would you like to start?"). The product tour is no longer auto-started — it
only fires when the user explicitly selects **"Take the guided tour"** from the carousel's choice
step. Choosing any other option (Smart Start, Browse the catalog, Move-in demo, Start empty, or
"Enter sandbox") or clicking Skip closes the carousel without ever starting the tour.

**Location-prompt ordering:** the "Where are you?" sun-position modal is now suppressed while
EITHER the onboarding carousel OR the product tour is open (`onboardingOpen || tourOpen`), so
overlays never stack. It surfaces after both are fully dismissed.

**Migration behaviour:**
- `hdb_onboarded='1'` (already onboarded) + `hdb_tour_done` unset → **no re-onboarding**.
  The boot decision reads only `hdb_onboarded`; if set, nothing fires.
- `hdb_tour_done='1'` (old tour-first path) + `hdb_onboarded` unset → **carousel fires once**.
  These users saw the old auto-starting tour but never completed the new carousel, so the
  carousel shows once. After they dismiss it `markOnboarded()` sets `hdb_onboarded='1'` and
  future visits are silent.

**Code:** boot-decision logic extracted to pure `src/ui/bootDecision.ts` (injectable for unit
tests). `App.tsx` calls `resolveBootDecision()` instead of the old `hasSeenTour()`/`startTour()`
chain. `LocationPrompt.tsx` adds `onboardingOpen` to its suppression guard.

**Scenarios:** `scripts/scenarios/first-run.json` rewritten for the new flow (carousel first →
choose tour → tour steps → location prompt → final scene; port 5212). New scenario
`scripts/scenarios/first-run-no-tour.json` (carousel → "Enter sandbox" → assert tour === false →
location prompt → final scene).

**Tests:** `src/ui/bootDecision.test.ts` (7 tests: clean profile, returning user, tour not
auto-fired, and both migration edge cases). `src/ui/LocationPrompt.test.tsx` gains 2 new tests
(no-render while onboarding open; no-render while tour open).

**Docs:** `docs/visual-verification-playbook.md` — corrected the "tour comes BEFORE the onboarding
carousel" note to describe the new flow. `docs/user/getting-started.md` — updated first-run
description to reflect carousel-first + optional guided tour.

## [C267 / INTERACTION-HARNESS] Upgrade shot.mjs to a full interaction harness with scenario mode

`scripts/shot.mjs` gains a scenario mode (`--scenario <file.json|file.mjs> [--out-dir <dir>]`)
that drives complex multi-step user journeys headlessly in a single browser session.

**New files:** `scripts/lib/interact.mjs` (step engine), `scripts/lib/validate.mjs` (expanded
scenario schema, pure/node-testable), `scripts/lib/validate.test.mjs` (47 unit tests covering
all step types in both keyed and typed formats), `scripts/scenarios/first-run.json` (32-step
first-run scenario producing 9 named screenshots).

**Step types shipped:** `eval` (inline string or `{file}` ref), `waitFor` (css/text/store/
storeExists conditions with per-step timeout + failure message), `click` (by CSS selector or
visible text — finds deepest clickable match), `screenshot` (named, auto-numbered `NN-name.png`),
`store` (call any store action with args), `viewport` (resize for responsive testing), and all
legacy canvas actions reused as-is: `drag`/`rdrag`/`wheel`/`key`/`type`/`select`/`wait`.

**Structured step logging:** `STEP n/N <name> … OK (1.2s)` per step; failures dump
`failed-<name>.png` + recent console lines + exit non-zero.

**Timing fix documented:** legacy mode fires eval and waits a fixed offset — any async work
inside misses the screenshot. Scenario mode is strictly sequential; use `waitFor` to sync.
Both the gotcha and the fix are documented in the playbook.

**Backward-compatible:** legacy CLI (`node scripts/shot.mjs <out.png> [waitMs] …`) is unchanged.
Legacy mode seeds `sofa.helpHint.dismissed` by default (old behaviour preserved); scenario mode
starts with empty localStorage so first-run flows trigger naturally.

**first-run scenario results:** all 32 steps passed in ~150 s. 9 screenshots captured and
visually reviewed: product tour step 1 (welcome card + furnished flat), tour step 2 (View button
spotlighted, "Look around"), tour step 3 (Edit button spotlighted, "Enter room"), location prompt
dialog, post-tour furnished scene, and all 3 onboarding carousel screens. UI correct at every step
— no clipping, no missing buttons, correct dimmer/spotlight effect, correct choices on step 3.

**Key discovery:** on a clean profile the tour fires FIRST (not the onboarding carousel). The
carousel only appears if `hdb_tour_done='1'` but `hdb_onboarded` not set. Documented in the
playbook under "First-run flow: tour comes BEFORE the onboarding carousel".

**Docs:** `docs/visual-verification-playbook.md` rewritten — scenario mode is now the recommended
approach at the top; legacy mode documented separately; full step-type reference table; worked
example; timing pitfall section. `CLAUDE.md` and `docs/ARCHITECTURE.md` updated with new commands.
+47 unit tests (all passing).

## [C266 / P-720 tail] Presentation-mode tour inclusion
Optional "Include 360° tour" toggle in the presentation setup (View menu, saved-views section)
appends the 360° tour stops as panorama slides after the saved views when both `presentation`
and `panoTour` flags are on (both pro-tier). New `composeTourSlides()` in `slideLogic.ts` builds
the unified `Slide[]` deck (`ViewSlide | TourStopSlide`) — pure, no React, fully tested. Tour-stop
slides use the identical `capturePanorama({eye})` + `panoImageIdb` cache path as `PanoTourModal`
(IDB cache hit = instant; miss = live capture + IDB persist), and set `stopInitialYaw` on arrival
so the viewer faces the room centre. Auto-advance pauses on tour-stop slides (same as existing
`SavedView.pano` slides). Stops on hidden/other storeys are skipped via the `currentLevelId`
filter in `composeTourSlides`. The toggle is disabled (with hint) when the tour is empty. New
`PresentationSetup` component renders the toggle + "Present…" start button inline in
`SavedViewsSection` when both flags are on; falls back to the plain "Present…" menu item when
only the `presentation` flag is on. State: `presentationIncludeTour` / `setPresentationIncludeTour`
in `uiSlice`. Feature flag: uses existing `presentation` (pro) + `panoTour` (pro) — no new flag
needed. 36 unit tests in two new/extended test files cover slide-deck composition, storey filtering,
empty-tour no-op, auto-advance pause on tour slides, and both Simple and Pro mode flag gating.

## [C263 / F4] Render preset A/B compare modal
Adds an industry-standard before/after comparison view for render presets (F4 tail), gated by a
new `renderCompare` pro-tier feature flag. The modal (`src/ui/RenderCompareModal.tsx`) renders
both presets sequentially using the existing HQ path-traced pipeline (`hqRenderSession.ts` via
`capturePreset`), temporarily applying each preset's four levers (time/tone/exposure/lights) and
restoring the store state after capture. A Lightroom-style draggable vertical divider with a
circular drag handle clips the A image over the full B image using CSS `clipPath` — the two halves
are pixel-aligned at the divider with no offset or stretch at any position. Labels float in the
corners (A · left, B · right). Controls: two preset selectors, a swap button (⇄ exchanges images +
sample counts), a quality selector (32–256 samples), and a Render/Re-render button. In-progress
states show per-side sample progress. Touch drag is fully supported (`onTouchStart`/`onTouchMove`)
for mobile parity. Pure state logic lives in `src/ui/renderCompare/compareState.ts` (no React) —
`clampDivider`, `swapAB`, `setPresetA/B`, `isValidPresetId`. The `renderCompare` flag (pro, default
on, prod-safe) is wired into `FEATURE_FLAGS`, `COMMAND_FLAGS` (`render-compare` → ⌘K), File menu,
and MobileToolbar accordion. 10 unit tests cover all pure-state functions + flag visibility in both
Simple and Pro modes. HDRI coupling (F3) remains deferred.

## [C261 / P-720 tail] 360° tour follow-ups: IDB image cache, room-centre yaw, plan stop placement, share-link embedding
Four P-720 follow-ups shipped in one focused commit. **(1) IDB image cache**: new pure
`ui/panorama/panoImageIdb.ts` (`sofa-pano-cache` database, separate from the asset store to
avoid version-bump conflicts) stores captured panorama Blobs keyed `<stopId>:<designKey>` where
`designKey` is a djb2 hash of `{items, finishes, floorPlan, doors, userFurniture}` — revisiting
a stop skips the expensive re-render unless the room or furnishings changed; stale entries are
evicted on access; LRU cap of 30 entries; `evictPanoStop` called on stop removal / drag-end to
force a fresh capture from the new position. `PanoTourModal` now tries the IDB cache before
capturing live; Re-capture evicts then recaptures. **(2) Per-stop room-centre yaw**: new pure
`stopInitialYaw(stop, rooms)` in `panoTour.ts` uses the shape-aware `roomLabelPoint` centroid
(matching the plan-editor labels) and `yawToward` to compute the viewer yaw that faces the room
centre on arrival; the tour modal uses it for direct stop selections (hotspot jumps still face
the travel direction). **(3) Plan-based stop placement**: `FloorPlanEditor` now renders numbered
tour stop markers (ringed dot + number) on the 2D plan SVG when the `panoTour` flag is on; stops
are draggable in the select tool via a new `movingStop` state that mirrors the existing
`movingItem`/`movingVertex` pattern — drag-end evicts the IDB cache for the moved stop; upper-
storey stops render greyed and non-draggable (ground-level only for simplicity). **(4) Share-link
embedding**: `panoTourStops` added as an optional additive field in `schema.ts`
(`RawSerializedStateZ` + `serialize` + `applySerialized`) — old links without the field decode
to `[]` (backward-compatible); the design-share and plan-share codecs carry stops automatically
since both call `serialize`; images are NOT embedded (receivers capture live). +19 new unit tests:
`computeDesignKey` mutation coverage, IDB miss/hit/evict/clear, `stopInitialYaw` round-trip
(including outside-room and at-centre fallbacks), share-link round-trip with/without stops, old-
link compat, `applySerialized` restoration. Verified headless: tour-stop markers visible on the
2D plan as numbered circles with the stop labels offset; opening the tour with a stop places the
viewer facing the room centre; mobile 390×844 plan + tour modal both render correctly.

## [C262 / Q31 tail] Drop-target highlight + custom-plan overview wall-drop cue
Two polish items deferred from C251. (1) **Transient drop-target highlight**: while
a finish swatch is dragged over the 3D canvas a visible ring/tint overlay appears,
implemented as a pure DOM `<div>` (`FinishDragOverlay`) absolutely positioned over
the canvas, styled with `box-shadow: inset 0 0 0 3px var(--accent)` +
`background: var(--accent-soft)` — no hardcoded colours, works in light + dark +
all 5 themes. The overlay renders nothing when inactive, so frameloop-demand
frames are unaffected (zero GPU cost at rest). State is managed by a new
`finishDragSignal.ts` module-level singleton (`setFinishDragActive` /
`subscribeFinishDrag`) wired to `useSyncExternalStore` in the overlay component —
deliberately outside the Zustand store to avoid triggering `RenderPump`'s
`subscribe(markDirty)` on every dragover tick. `FinishDropSurface` drives the
signal: `dragenter` → active, `dragleave`/`drop` → inactive; a `window dragend`
listener also clears it (catches the "drag released outside the browser window"
case where the canvas never fires `dragleave`). (2) **Custom-plan overview wall
drop cue**: `PlanShell`'s `FadeWall` meshes carry no `finishTarget` userData (they
are unassociated boxes at the overview level), so drops on them previously silently
no-oped. New `hasUntaggedHits()` helper in `finishDropTarget.ts` distinguishes an
empty-sky miss (zero hits) from geometry-hit-but-unclassifiable (the overview-wall
case). When a drop lands on untagged geometry in the custom-plan overview (not in
the room editor), a 3 s info toast guides the user: "Open a room to finish its
walls". +18 tests (signal state machine: enter/over/leave/drop/dragend/cancel all
clear; idempotency; subscribe/unsubscribe; hasUntaggedHits: tagged/untagged/invisible
hits, ancestor-walk). `tsc` + full suite green.

## [C260 / LP6] Lux overlay — time-of-day scrub, auto-play, and per-fixture exclusion
Extends the static 3D lux floor heatmap (C256/LP5) with live time-of-day scrubbing and
per-fixture contribution isolation. `LuxOverlay.tsx` now reads `luxExcludedIds` from the
store and filters out excluded fixtures before recomputing grids; the memo already reacts
to `manualHour` via `useSunPosition` / `lightingFromAltitude`, so scrubbing the time-of-day
slider in either the Scene menu or the new inline slider updates the heatmap live (debounced
implicitly by the quantised fixture/daylight levels — sub-percent changes don't churn the memo).
A `luxPlaying` rAF loop auto-advances `manualHour` at 1 hr/s for a full-day preview. New
store state (`luxExcludedIds: string[]`, `luxPlaying: boolean`) + actions in `featuresSlice.ts`
— clearing on overlay-off; per-fixture toggle (`toggleLuxExcluded`), bulk set, play toggle.
`ElevationPanel.tsx` gains two new sections in the Lighting tab: (1) a compact time slider (reusing
`setManualHour` / `effectiveHour`) with a ▶/⏹ play button showing the current clock; (2) a
scrollable per-fixture checkbox list labelled "Fixture contributions — uncheck to isolate" with
struck-through dimmed text for excluded items — responsive on both desktop and mobile
bottom-sheet. Gated behind the same pro-tier `drawings` flag. 16 new unit tests: store slice
actions, per-fixture exclusion changes lux computation, time-input sensitivity, flag/mode gating.
Verified headless: 09:00 (warm orange/red pools, high fixture contribution), 13:00 (similar but
with higher daylight component), 20:00 night (deep blue/teal pools, no daylight), and with
3 fixtures excluded (reduced pool area); no z-fighting, no loading-screen artifacts on any shot.
Mobile panel (390 px) shows fixture list and slider cleanly. `drawings` flag off in Simple,
on in Pro.

## [C259 / PERF9] Per-pattern procedural texture size registry — GPU memory reduction
Added `PATTERN_SIZE_CAP` registry in `procedural/generators.ts` that declares the maximum useful
resolution for each of the 17 procedural patterns, and `effectivePatternSize(pattern)` which clamps
the global `BASE_SIZE` (256 on Performance, 512 on Medium+) to that cap. Smooth/noise-based patterns
(`carpet`, `concrete`, `marble`, `terrazzo`, `batten`, `fluted`, `plaster`) cap at 256² regardless
of tier — saving 75 % of their GPU texture memory on Medium/High/Maximum with no visible quality
difference at typical room-viewing distances. High-frequency geometric patterns (`wood`, `tile`,
`hexagon`, `checker`, `parquet`, `herringbone`, `subway`, `brick`, `grasscloth`, `stripe`) cap at
512² so their grain lines, grout, and mortar joints stay sharp on Medium+ tiers but still drop to
256 on Performance. Cache keys in `cache.ts` now use `effectivePatternSize` so tier changes correctly
invalidate only the patterns that actually resized; `getBuiltMaterial` probes both `@512` and `@256`
suffixes for backward-compatible furniture `mat:<id>` lookups. 5 new unit tests verify the registry
and clamping logic across both tiers. OffscreenCanvas worker generation remains deferred (PERF9 tail).
Visually verified at Performance/256 tier: smooth textures (plaster, carpet, concrete) look identical
to 512²; high-frequency textures (wood grain, tile grout) correctly receive 256 on Performance where
quality tradeoff is acceptable. `QualityController` already set `BASE_SIZE` per tier (unchanged).

## [C258 / PF2] Parametric furniture v2 — drawers, per-compartment config, desk type
Extends the PF1 generator with three new capabilities. (1) **Drawers**: a new
`CompartmentStyle = 'open' | 'door' | 'drawer'` drives `addDrawerFronts()` which emits stacked
`drawer-front` + `drawer-handle` parts at ~0.18 m per drawer, inset within the bay opening —
drawer handles are brushed metal via the furnitureMaterials cache. `price.ts` adds a DRAWER_ADDER
per front (drawer box + slides + handle). (2) **Per-compartment configuration**: each bay of a
wardrobe or sideboard can independently be set to open / door / drawer; `bayStyle(spec, b)` resolves
from the per-bay `compartments[]` override then falls back to the global `doors` toggle. A compact
`BayStylePicker` segmented control (Open / Door / Drawer per bay) appears in the dialog below the
Doors toggle for wardrobe and sideboard types. Changing the global toggle clears per-bay overrides
for a clean reset. (3) **Desk**: new `desk` type with real-metre HDB-sized limits (60–200 cm wide,
68–82 cm tall, 50–85 cm deep); two leg options — four-leg (square corner legs, floor-anchored) and
pedestal (right-side carcass with stacked drawers + two left legs). Desk saves to the `tables`
category. `saveParametric.ts` maps each type to its catalog category via `TYPE_CATEGORY`. 54 unit
tests across spec/buildParts/price/dialog — all passing; `tsc` and `biome` clean. Headless visual
verification: bookshelf 3D preview shows floor-anchored shelves; desk preview shows four-leg worktop
with correct proportions (120 × 75 cm default); mobile layout stacks preview above controls with
full-width dialog. No floating parts, z-fighting, or clipping observed.

## [C257 / PF1] Parametric furniture — dimension-driven shelving/wardrobe/sideboard generator
First milestone of the procedural-furniture subsystem (IKEA PAX/BILLY · Tylko configurator
parity). New pure `furniture/parametric/` module: a typed spec `{type, w, h, d, options}` is
clamped to sensible per-type min/max and emitted as a structurally-sound part list — sides reach
the floor, shelves span between sides with auto-spacing, a centre divider is auto-added past
~1.2 m so shelves never span unsupported, back panel inset, wardrobe doors split into ≤0.6 m
leaves, sideboard legs-vs-plinth — all built from real three materials (tintable wood +
`mat:<id>`). A responsive `ParametricDialog` offers type tabs (bookshelf / wardrobe / sideboard),
dimension sliders + option toggles, a live R3F preview, a material-volume price estimate, and an
"Add to room" action; each generate saves a NEW user catalog def (identical specs de-dupe by
content hash), so placement/collision/budget treat it like any other item and it survives
save/reload (additive schema field carries the def-level price). New `parametricFurniture` flag
(tier pro, default on, prod-safe pure code), gated in the catalog drawer, ⌘K (`COMMAND_FLAGS`),
and the mobile toolbar; both-modes tests. Verified headless: the bookshelf preview shows
evenly-spaced shelves with sides on the floor and the wardrobe splits into two handled doors —
both structurally clean, no floating parts or z-fighting. Deferred: drawers, per-compartment
config, more types.

## [C256 / LP5] 3D lux-coverage heatmap overlay on the floor
The lighting plan's illuminance can now be read in the actual scene, not just as 2D numbers.
New pure `lighting2d/luxGrid.ts` (per-room sample grids from fixtures + daylight) +
`luxColor.ts` (a perceptual blue→green→yellow→red ramp with residential lux breakpoints) feed
`scene/LuxOverlay.tsx`, which renders one translucent `DataTexture` plane per visible level's
rooms 5 mm above the floor (`depthWrite` off, transparent — no z-fighting) at the storey's
elevation. Toggled from the Drawings panel's Lighting tab (`luxOverlayOn`) with a colour→lux
legend, and gated by the same pro-tier `drawings` flag as the rest of the lighting plan
(LP1–LP4). Recompute rides the existing render-time memos on items/plan/level/daylight —
nothing per-frame; textures dispose on toggle-off. Edge cases handled: rooms with no samples
never emit NaN, polygon rooms supported. Verified headless at midday: per-room heatmaps hug the
floor with a smooth gradient that varies sensibly by room (brighter near windows), no shimmer.
+both-modes flag test. Deferred follow-up only.

## [C255 / GE3c] GLB designer per-part texture pick
Parts in the GLB designer can now take a real material/texture, not just a solid colour. The
part spec gains an optional `finish` (`mat:<id>`); `partMaterial` resolves it through the
existing furniture-material cache and returns a CLONE of the shared textured material (textures
stay shared, per-part glow/opacity still apply on top, roughness/metalness sliders hide because
the finish's own maps win). CSG-combined results get box-projected metre-scale UVs
(`boxProjectUvs`) so a tiling finish reads at the right physical scale instead of smearing one
texel. The ~900-line dialog's part inspector is extracted into a new `PartInspector.tsx` reusing
the inspector's finish dropdown + `QuickFinishes` swatch row (Oak/Walnut/Teak/Ash/Ebony/Marble).
The finish persists through the save-asset round trip (re-resolved at render, like solid colours).
Rides the existing GLB-designer flag — no new flag. Verified headless: clicking "Oak" sets the
part finish to `mat:floor-wood-oak` and the box renders with tiling wood grain (not flat/black),
no artifacts. Follow-up C273 completes the feature: per-part texture on combined-mesh parts.

## [C252 / P-720] Linked 720° panorama tour — multi-pano capture with room hotspots
Coohom "720° tour" parity. A tour is an ordered list of stops `{id, label, position:[x,z],
levelId?}` in the new `panoTourSlice`, persisted per-device to localStorage like saved camera
views (images are NOT stored — each stop is captured live + session-cached when viewed, so the
tour always reflects the current design, same model as the C237 presentation slides). Hotspots
are derived, never authored: pure `ui/panorama/panoTour.ts` computes yaw (`atan2(−dx,−dz)`,
matching the viewer's −Z-forward convention) + pitch toward every other stop, culling
coincident (guards the degenerate atan2), distant (>14 m) and cross-storey stops, with
room-derived labels + duplicate numbering and screen projection for the overlay pills. Capture
reuses the C217 pipeline with one additive extension — `capturePanorama({eye})` honours an
explicit eye at the stop position + level elevation. The viewer overlays clickable/tappable
hotspot pills (fade → fresh capture → arrive) plus a numbered stop strip; `PanoramaViewer`
gained generic optional `initialLook`/`onLook` props (stays chrome/store-free). New `panoTour`
flag (tier pro, default on, consistent with `panorama` — asserted by a test), gated in the File
menu (desktop AND mobile), two ⌘K commands, and an "Add to tour" button in the panorama modal.
+31 tests (pure math, slice, both-modes flag). Verified headless with real SwiftShader
captures: kitchen stop shows a geometrically-correct "Living / Dining" hotspot dead ahead,
clicking it lands in the living-room pano; mobile 390×844 modal clamps + strip scrolls.
Deferred: share-link/presentation embedding, plan-based stop placement UI, IDB image
persistence, per-stop initial yaw.

## [C251 / Q31 part 2] Drag finish swatches onto the 3D canvas — raycast drop
Dragging a swatch from the finish picker and releasing it over the 3D view now applies the
finish to whatever is under the cursor — room floor, wall, or furniture item — completing the
Q31 drag-to-apply program (part 1 shipped the pure payload/`resolveFinishDrop` core + Layers-row
drops). New pure classifier `scene/finishDropTarget.ts` walks the raycast hit list, skipping
invisible hits (the camera-facing wall reveal toggles `visible`, which three's Raycaster does
NOT skip) and untagged meshes (grid/gizmos/sky), and classifies via `userData` tags
(`itemId` on `Furniture` roots; `finishTarget {kind, roomId}` on floor meshes, wall interior
faces, and room-editor shells). `scene/FinishDropSurface.tsx` does the thin DOM wiring in BOTH
Canvases (main + room editor): native `dragover`/`drop` on the GL canvas (R3F's pointer system
never sees HTML5 drag events), `dropEffect='copy'` feedback, manual `Raycaster.setFromCamera`,
and it only claims events carrying the finish MIME — catalog-card placement and upload drops
untouched. Commits flow through the new shared `state/finishDropApply.ts` (now also used by the
Layers rows): exactly one undo step per drop, floor/wall recents, success toast — and it fixes a
latent part-1 bug by normalising raw catalog ids to `mat:<id>` on item drops (previously fell
back to generic wood). Part 1 had shipped ungated, so this adds the `finishDnd` flag
(`tier: 'simple'`, default on) gating picker dragstart + both drop surfaces. Touch keeps the
existing tap-to-apply flow (HTML5 DnD doesn't exist there). +18 tests (classifier, apply path,
both-modes flag). Visually verified headless: floor → checker, wall → navy, table → ebony in
one session with `past` 1→4, foreign-payload and sky drops no-ops; docs updated. Deferred:
custom-plan overview wall drops no-op (overview walls are unassociated fade boxes); transient
target highlight skipped under frameloop=demand.

## [C254 / PERF-FOLLOWUPS] History cap amortisation + frame-scoped overlap memo
Two backlog micro-optimisations. `historySlice.appendCapped` no longer slice-and-spreads the
whole past stack on every push once the 50-entry cap is hit: the stack grows into a 16-entry
headroom band and is trimmed back to the cap with ONE amortised slice, so steady-state pushes
stay a single spread copy; undo depth is always ≥ the cap and undo/redo/jump semantics are
unchanged (new tests pin the trim point, dropped-oldest order, and a full undo drain across a
trim). `collision/findItemOverlaps` gains a frame-scoped single-slot memo: same-task calls with
unchanged `items`/`defs` identities (several panels can scan in one render pass) return the
cached array allocation-free; it invalidates on identity change and self-expires on microtask
flush because OBBs read the mutable GLB-footprint cache. +6 tests; behaviour-preserving (full
suite green).

## [C253 / X-SHOP tail] SG retailer expansion in the dev price sidecar — Courts/HipVan/Castlery
The dev-only live-pricing sidecar (`scripts/price-server.mjs`) now has three retailer adapters
alongside IKEA SG: Courts (Magento GraphQL search), HipVan (Algolia-style hits), Castlery
(JSON-LD products in the search page HTML), each following the existing convention — pure
exported parser + URL builder, candidates re-ranked by fuzzy name match
(`scoreNameMatch`/`pickBestMatch` with the retailer's own top hit as fallback), all upstream
fetches timeboxed at 8 s, shape drift degrading to a 404 `no match` and network errors to a 502
`{error, retailer}` (never a crash). `/price` responses carry `retailerLabel`. Client:
`livePrice.ts` adopts the retailer list from `/health` (never hardcoded), fetches all retailers
per item in parallel with per-retailer failures dropping out, and returns offers
**cheapest-first**; the Budget panel prices each line/total by the cheapest offer and renders a
wrappable cheapest-first row of retailer buy links. Gating unchanged: the same devOnly pro-tier
`livePrices` flag, with a new test asserting it stays off in prod (Simple AND Pro). Verified
desktop 1600×1000 + mobile 390×844 with a stubbed sidecar: offers render cheapest-first, a 404
retailer drops silently, 4-offer rows wrap cleanly. The retailer URL/response shapes are
best-effort offline reconstructions — a real-network verification pass is tracked in TODO.md.
+15 tests.

