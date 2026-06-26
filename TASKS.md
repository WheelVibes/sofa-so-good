# TASKS — autonomous improvement backlog (OPEN ITEMS ONLY)

Working branch: `claude/codebase-analysis-optimization-4ijn0x` (previous batches merged via PR #24).
Each task = its own commit; log every shipped task in `CHANGELOG.md`.
Licensed/non-redistributable additions are dev-gated; unlicensed ship in prod too.

**File policy (user rule, 2026-06-11):** when a task / feature / bug-fix is COMPLETED it is
**removed from this file** (its record lives in `CHANGELOG.md`) — only pending (`[ ]`) and
in-progress (`[~]`) work stays here, and every entry is **max 2 sentences**.

## ⭐⭐⭐ COMMERCIAL-READINESS PROGRAM (2026-06-10, ongoing — primary directive)

**Mandate (from the user):** systematically analyze ALL aspects of the codebase and continuously
improve it — performance/optimization, scalability, reliability, realism, bug fixes, security, clearing
`TODO.md`, and new functionality/aesthetic/QOL features informed by researching other interior-design
apps — until the app **surpasses every interior-design app on the market and is commercial-ready**.
Autonomy granted for large features incl. architectural revamps. Loop continuously; when out of ideas,
do more research. **Do not stop until the user says so.**

**Hard rules for every item:** one focused commit per item; log it in `CHANGELOG.md`; keep code modular
+ flexible + extensible (no monolithic files); handle edge cases; no functional bugs or visual artifacts;
viewport-responsive with desktop **and** mobile/touch parity; licensed/non-redistributable additions are
**dev-gated**, CC0/unlicensed ship in prod too; run `npm test` + `tsc` + `biome` before each commit;
visually verify any app (non-docs/test) change via `scripts/shot.mjs` and review the pixels.

**How to resume after a context clear:** read this file + `CHANGELOG.md` (newest first — everything
shipped is recorded there), then pick the next item (highest priority first). Work one item at a
time: make the change, re-run the gates (`npm test` + `tsc` + `biome`), and push.

**Prioritization:** (1) correctness/security → (2) reliability/edge-cases + mobile parity →
(3) performance/memory → (4) realism + high-value features → (5) QOL/aesthetic polish.

---

## WAVE 1 (dispatched 2026-06-26) — conflict-disjoint parallel batch
- [~] PARITY-SH3D-FURN (`cg-sh3d`): place parsed SH3D furniture descriptors (today `setItems([])`
  discards them) via a pure `floorplan/import/sh3dItems.ts` mapper + wire into `openSh3dImport.ts`.
- [~] PARITY-DUP-PATH (`cg-arrayplace`): duplicate-along-polyline array (pure `furniture/pathArray.ts`
  arc-length + tangent yaw) + inspector array section.
- [~] AUD-002 (`cg-materials`): add LRU + dispose-on-evict to `furnitureMaterials.ts` caches
  (`cache`/`furnitureRepeatCache`/`patternTex`) to stop session VRAM ratchet.
- [~] AUD-003 (`cg-inspectorpanel`): `InspectorPanel.tsx:371` array "didn't fit" toast `${total + 1}`
  → `${total}` (total already excludes the source).

---

## Multi-storey remnants (F13 core shipped C221–C235 — see CHANGELOG)

## Competitor research 2026-06 (sources: coohom.com/article Planner5D-alternative · capterra.com
## compare 164022-192882 · spacesbydee.com coohom-vs-planner-5d · plansnapper.com compare)
- [ ] COLLAB-STRUCT: structured collaboration (projects/teams) is Coohom's enterprise edge —
  backend-dependent; revisit if/when a backend exists.

## Realism & rendering
- [~] F1 (C238/C240/C243): HQ render + DoF + denoise shipped. TAIL: real-GPU convergence/quality
  pass + decide quality-tier gating of the menu entry.
- [ ] F3/R-HDRI [PROD] HDRI environment library (Poly Haven CC0 `.hdr`) for IBL + backdrop.
  Sandbox can't fetch — wire + dev-verify; CC0 so prod-ok.
- [ ] F4 tail (HDRI only): A/B compare shipped (C263); HDRI coupling deferred until F3 (R-HDRI) lands.
  Once F3 is available, wire the HDRI selector into `capturePreset` and expose it in the compare modal.
- [ ] F6 [PROD] WebGPU SSGI experimental Maximum-only toggle with WebGL fallback.
- [ ] PR4/R-SSAO Soft-shadow upgrade (PCSS/VSM) + contact-shadow refinement; needs real GPU.
- [ ] R-BLEED: inter-room light bleed directional weighting (deferred from C275 — needs geometry
  raycasting; revisit with PR4).
- [ ] C275 tail: real-GPU check that curtain-dim frames present immediately (headless presents one
  render-burst late; scene-graph light intensity provably updates instantly — see playbook).

## Content & catalog
- [~] C-PLANTS/DECOR + F9 [PROD] Set-dressing pack shipped (C276) + auto-styling of move-in default flat
  shipped (C277) + auto-arrange styling pass shipped (C278, `decorStyling.ts`). Remaining: curated
  CC0 bundles from Poly Haven/Poly Pizza (networked assets, still needed for photoreal surfaces).
- [ ] F11 [DEV] Pluggable brand-catalog importer beyond IKEA (licensing → dev-gate).

## Productivity / QOL
- [x] PC-EMPTY-STATES: shared `EmptyState` component (`src/ui/EmptyState.tsx`, icon + title +
  optional description + optional CTA on the `.empty-mini` token vocabulary) applied across every
  empty panel/list (comments, history, versions, budget + saved items, layers, catalog grid +
  favourites/recent/no-results, remote browse, swap, daylight, accessibility) for consistent,
  friendly copy in light/dark/all themes + mobile bottom-sheets.
- [~] IXT-SUITES (user rule, 2026-06-12): build interaction-test scenarios (simple → complex per
  feature, incl. cross-feature journeys like onboarding→tour→location) for every EXISTING feature
  using the C267 harness; work down the `FEATURE_FLAGS` list in priority order.
  Covered: batch 1 (C269) Simple core loop — catalog/furnish, finishes, budget, share,
  view-modes; batch 2 (C272) pro analytical — drawings/lighting, versions, history, panoTour,
  renderCompare; batch 3 — 2D-editor tools journey (plan labels, level duplicate + all-levels, wall
  reverse/join, text notes + dimension lines) → `plan-editor-tools-journey.json`; batch 4 —
  `clearance-checks-simple.json` (clearanceChecks pro gate + panel mount + in-scene overlay toggle +
  mobile bottom-sheet) + `smart-start-simple.json` (Smart Start wizard → style grid → "Furnish my
  flat" populates an empty flat + closes; mobile leg) + `room-editor-simple.json` (enter isolates a
  room + mounts the editing catalog, placed item persists, exit unmounts the catalog; mobile
  bottom-sheet) + `design-score-simple.json` (designScore pro gate + panel mount with grade dial +
  category breakdown for a furnished flat + mobile) + `measure-simple.json` (measure/tape pro gate +
  tape-mode toggle + two store-injected points → a 3.00 m measured line whose drei-Html distance label
  renders + clear) + `parametric-designer-simple.json` (custom-size furniture pro gate + dialog mount +
  live 3D preview + type switch Bookshelf→Wardrobe updates preview/controls + close) +
  `saved-views-simple.json` (saved camera views: save → move → applyView restores pose + bumps nonce →
  delete) + `daylight-simple.json` (daylight & ventilation pro gate + panel mount with per-room
  glazing/openable PASS/FAIL breakdown + mobile) + `accessibility-simple.json` (accessibility pro gate +
  panel with door-width + 1.5 m turning-circle checks + mobile) + `comments-simple.json` (pinned
  comments pro gate + panel + addComment in-scene pin + resolve + mobile) + `user-sets-simple.json`
  ("My sets" pro gate + select items → saveSelectionAsSet → delete) + `presentation-simple.json`
  (presentation pro gate + seed 2 views → setPresenting slideshow 1/2 → Next 2/2 → Exit). Remaining: AI
  surfaces, GLB designer re-rung, crown-molding, ceilingDesign (logic unit-tested; visual needs
  walk-mode look-up), livePrices, first-run re-rungs, backdrop-upload + furnlight re-rungs.
- [~] Q-3DEXPORT Whole-scene glTF/GLB + OBJ export — **shipped** (`sceneExport3d` flag, pro tier;
  Tools/Share/⌘K/mobile). Pure extract/filter core (`export/sceneGltf.ts`) drops editor helpers; live
  scene reached via `scene/SceneExportController` + `sceneExportAccess`; reuses `convert/toGlb.ts`,
  adds `export/sceneObj.ts`. Browser-verified via `scenarios/scene-export-simple.json` (full pipeline
  → success toast — the earlier "unverifiable headless" gap is closed by asserting in the real browser).
  Now also exports **STL** (3D printing / CAD) and **USDZ** (iOS AR Quick Look). **Still open:**
  worker-streamed export for very large scenes.
- [~] F22 [PROD] Mobile AR "view in your room": **shipped (PARITY-AR)** — Tools → "View in your room"
  opens iOS AR Quick Look from USDZ, GLB download elsewhere (`ui/viewInAr.ts`, `viewInAr` flag).
  Remaining: Android Scene Viewer (needs an https-hosted model → a backend/upload step).
- [~] F21 (C247): WebXR entry + inert provider shipped; controller locomotion + real-headset pass open.
- [ ] GE4 tail: "Update original" full export round-trip needs a real-env verification pass.

## Commerce / collaboration
- [ ] X-SHOP real-network pass: Courts/HipVan/Castlery adapters (C253) were built offline —
  verify/fix response shapes against the live sites on a connected machine (see TODO.md).
- [ ] F24 tail: live presence / multi-user sync on pinned comments — needs a backend; deferred.
- [ ] F26 [DEV] Photo-to-3D room replica (vision/photogrammetry, BYO-key cloud).

## Performance / scalability
- [ ] P2 Memoization audit of hot R3F components/selectors — needs real-hardware profiling to justify.
- [ ] P3 tail: rotation-capable instancing for venetian-blind / drying-rack slats (needs a
  rotation-aware `InstancedBoxes` sibling; deferred until a consumer justifies it).
- [ ] PERF6 tail: `antialias`/`preserveDrawingBuffer` are context-creation attributes — toggling
  needs a context recreate (flash) + real-GPU verify.

## FEATURE PARITY IMPLEMENTATION (2026-06-13) — feasible client-side features from FEATURE_PARITY.md

Tracking the client-side-feasible parity gaps as they move to implementation. Status: `[ ]` pending,
`[~]` in progress (agent assigned), shipped → removed (see CHANGELOG). `[backend]`/`[BYO-key]` tags
mark non-pure-client features. Source of detail: `FEATURE_PARITY.md`.

### ⭐ PRIMARY DIRECTIVE (2026-06-13, user): ULTRA-DETAILED PHOTOREALISM
Top parity goal with Coohom + Sweet Home 3D = make everything ultra-detailed + photorealistic.
Deep research fleet in flight (render pipelines, real-time WebGL techniques, in-browser
path-trace quality + denoise, ultra-detail CC0 assets/materials, our-pipeline gap audit) →
consolidate into `PHOTOREALISM.md` then implement highest impact÷effort first.
Full prioritised roadmap in **`PHOTOREALISM.md`**. Status of the key items:
- PHOTO-COLORSPACE — RESOLVED/already-correct: audited generators + `furnitureMaterials` + worker
  hot-swap (`cache.ts`); albedo = `SRGBColorSpace`, normal/roughness = linear (`srgb=false`). No fix.
- PHOTO-BACKDROP ✓ SHIPPED — surroundings are a flat equirectangular photo as `scene.background`, **walk
  mode only** (orbit clean); legacy 3D City/Park/Hills/Studio removed. Presets city/dusk/park/hills +
  **user-uploaded `custom` photo** (IDB-persisted) + none; flags `backdrops`/`customBackdrop`, prod-safe.
  Follow-up: bundle real CC0 equirectangular photos for the presets; pairs with PHOTO-HDRI (#1b).
- [ ] PHOTO-PT-TUNE: tune `three-gpu-pathtracer` in `hqRenderSession.ts` (bounces/transmissiveBounces/
  filterGlossyFactor/MIS/stableNoise/minSamples) + AgX/Neutral + exposure. Pure config; pixel pass
  real-GPU-pending.
- [ ] PHOTO-HDRI (R-HDRI): CC0 Poly Haven HDRI for IBL + sky through windows (Medium+); keep
  procedural backdrops for near parallax + far HDRI dome. `hdriEnvironment` pro flag, prod-safe (CC0).
  Needs the .hdr asset added in a connected session (sandbox can't fetch). M.
- [ ] PHOTO-DENOISE: browser OIDN (`DennisSmolek/Denoiser` WebGL / `oidn-web` WebGPU) + albedo/normal
  AOV on the HQ render; fallback to current DenoiseMaterial. [real-GPU verify]
- [ ] PHOTO-PBR + PHOTO-KTX2: real 2K CC0 PBR maps (Poly Haven/ambientCG) over procedural fallback;
  un-stub `lib/ktx2encode.ts` with `ktx2-encoder` (basis WASM now exists — stale assumption) to ship
  KTX2 in prod (ETC1S albedo / UASTC normal+ORM).
- [ ] PHOTO-DETAIL: set-dressing prop pack (books/cushions/plants — biggest perceived-realism lever); edge-bevel rollout is complete (see RZ3/PHOTO-BEVELS).
- [ ] PHOTO-EMISSIVE tail: real-GPU pass to tune the bloom look on High/Max for the boosted fixtures
  (intensities now clear the 1.05 threshold; the flat-tier self-lit read is verified, the bloom amount
  needs a GPU eye). Base wiring shipped — see CHANGELOG.
- [ ] PHOTO-GLASS / PHOTO-GTAO / PHOTO-SOFTSHADOW (VSM, NOT drei PCSS — broken r182+) / PHOTO-POM /
  PHOTO-SSGI-SSR (WebGPU) / PHOTO-WEBGPU — see PHOTOREALISM.md (mostly real-GPU/frontier).

### Pending — quick wins (S)
- [x] PARITY-BATCHRENDER: SH3D batch-render all saved views — Saved-views "Render all views" flies the
  camera to each saved view (`applyView`) and downloads a hi-fi PNG per view via `captureCanvasPng`
  (`ui/renderAllViews.ts`, `batchRender` pro flag).
### Pending — high value (M)
- [~] PARITY-AR: AR "view in your room" **shipped** — iOS AR Quick Look (USDZ) + GLB fallback
  (`ui/viewInAr.ts`, `viewInAr` flag). Remaining: Android Scene Viewer (needs an https-hosted model).
- [ ] PARITY-DENOISE: Coohom render denoiser (OIDN-wasm/bilateral post-pass on HQ render). [real-GPU verify]
- [ ] PARITY-8K: Coohom 8K+ tiled still render.
- [x] PARITY-SLOPECEIL: SH3D sloping ceilings **shipped** (see PARITY-SLOPECEIL in CHANGELOG).
- [x] PARITY-SLANTWALL: SH3D slanting walls **shipped** (PARITY-SLOPEWALL: `PlanWall.topHeightEnd` prism).
- [x] PARITY-BASEBOARD: SH3D per-wall baseboard params **shipped** — `PlanWall.baseboard`
  (height/colour/hidden) drives the PlanShell skirting; Plan-inspector wall section + `wallBaseboard`
  pro flag. (Custom plans only; default HDB layout uses the fixed `Skirting.tsx`.)
- [x] PARITY-QUOTE-XLSX: quote XLSX/CSV + user-editable quote templates **shipped** (v0.1.0.7). `QuoteTemplate` model, `quoteTemplateSlice`, `QuoteTemplateModal`, `applyTemplate`, BOQ export threaded. Feature flag `quoteTemplate` (pro), undo-tracked, persisted in save schema.

### Pending — marquee (L)
- [x] PARITY-VIDEO: video flythrough export **shipped** — saved-views cinematic tour → .webm
  (`ui/recordViewTour.ts`, PARITY-VIDEO in CHANGELOG).
- [~] PARITY-CURVEDWALL: SH3D curved/arc walls **shipped** — `PlanWall.arc` bulge + `floorplan/wallArc.ts`
  (Bézier → chord sub-segments) reused by `wallBoxes`/`planCollisionWalls`/room detection; 2D midpoint
  bulge handle (`curvedWalls` flag, pro). **Openings on curves now supported** — arc-length positioned,
  cut per-chord (wallBoxes/collision), arc-positioned door leaf + window glass, arc-aware doorSwing +
  placement (`nearestArcLength`). Curve is a **true circular arc** (`arcCircle`, SVG `A`). Complete.
- [~] PARITY-SLOPEWALL: SH3D sloping (variable-height) walls **shipped** — `PlanWall.topHeightEnd` +
  `floorplan/slopedWall.ts` prism (flat-normal triangle soup), `PlanShell` `SlopedWallMesh`, inspector
  start/end height fields (`slopingWalls` flag, pro). Openings disabled on sloped walls. Pairs with a
  sloped ceiling (PARITY-SLOPECEIL).
- [~] PARITY-SLOPECEIL: sloped (pitched) ceiling **shipped** — `sloped` `CeilingConfig` style
  (`slope:{axis,rise}`) in `ceilingModel.ts` `CeilingSlope` + `RoomCeiling` tilted plane; per-room
  picker (under `ceilingDesign`). Pairs with PARITY-SLOPEWALL for a shed roof.
- [~] PARITY-VIDEO: keyframed walkthrough-video export **shipped** — "Record walkthrough video" records
  the saved-views cinematic tour to a `.webm` (`ui/recordViewTour.ts` + RecordController), pace via
  `cameraSlice.viewTourLegSeconds` (`walkthrough` flag). Follow-up: an MP4 transcode + a duration modal.
- [~] PARITY-AILAYOUT: **engine + collision-aware placement shipped** — `ai/autoLayoutAi.ts` (prompt +
  tolerant parse + BYO-key call) + `layout/aiLayoutApply.ts` (validate/clamp into rooms +
  `placeNonOverlapping` drops colliding pieces) + ⌘K "AI auto-furnish" (`aiLayout` flag, pro). Pure
  logic + no-key guard unit-tested; live LLM output needs a real key to tune. Follow-up: a key/brief
  panel beyond the ⌘K prompt + route through autoArrange for tidier spacing.
- [x] PARITY-3DEXPORT: whole-scene OBJ/glTF/STL export **shipped** (see Q-3DEXPORT).
- [~] PARITY-TILT: multi-axis furniture tilt (pitch/roll) **shipped** — `tiltFurniture` flag,
  `FurnitureItem.pitch/roll`, inspector sliders, `furniture/tiltRotation.ts` (`[pitch, yaw, roll, 'YXZ']`).
  Follow-up: a 3D tilt gizmo handle + the SH3D 2D-plan tilt indicator; collision stays yaw-OBB.

## Codebase analysis batch (2026-06-13, branch …-4ijn0x) — verified findings

### Reliability / data-integrity
- REL1 — RESOLVED as already-covered: `schema.applySerialized` drops non-finite transforms on
  BOTH share-link and `.sofa.json` load, and `parametric/spec.ts clampSpec` (`num()`+`clamp`)
  sanitizes NaN props → defaults → envelopes. Placed parametric items bake to GLB defs, so no
  runtime numeric-prop NaN path. No redundant guards added (would mask real bugs).

### Realism (pure-code, prod-safe — most users see the flat Performance tier)
- [~] RZ2: window glass realism — **emissive sky-catch shipped** on the fixed apartment
  (`apartment/Window.tsx`) AND custom-plan windows (`PlanShell` `FadeWindow`: daylight day/night tint +
  sky-catch emissive). Tail: room-editor glass (`PlanRoomShell`, separate lightweight canvas) + wire
  `getGlassMaterial`/`glassConfig` transmission on High+ (real-GPU verify).
- [~] RZ3/PHOTO-BEVELS: edge-bevel rollout complete for all appropriate box-built case goods and structural
  panels (KitchenCounter, KitchenIsland, ShoeCabinet, WallCabinet, Vanity, ChangingTable, WallShelf, Bench,
  Bed, ToddlerBed, BunkBed, Staircase treads/landings — plus prior case goods). Remaining: edge light-catch
  real-GPU verify pass.
- [~] RZ5: painted-trim realism — baseboard + crown molding now bevel their edges in BOTH the fixed
  apartment (`WallSegment`) and custom plans (`PlanShell` skirting + crown), so trim catches a highlight
  (light-catch real-GPU-pending). Remaining: skirting-floor seam AO + painted-trim wear.
- [x] RZ6: upholstery seam stitching + soft fabric wrinkle now ship on the fabric material
  (`procedural/upholsterySeams.ts`, behind `pbrSurfaces`) so sofas/chairs read as woven cloth.
- [ ] RZ7: PCF/penumbra shadow softening on Medium+ tiers.

### Code quality
- [~] CQ1: dead-code sweep — `knip` audit (2026-06-20): removed the unused `react-virtuoso` dep; the
  ~90 "unused export" hits are over-exported-but-live symbols (used within their own module), so removing
  the `export` keyword would be cosmetic churn with test-import risk — left as-is. `playwright`/
  `@playwright/test` are unused but plausibly intentional e2e infra (no config) — left.

## Process
- Keep CLAUDE.md / README.md / docs current per repo rule after each user-facing change.
- Run `npm test` + `tsc` + `biome` before each commit; visual-verify app-facing changes.
- Keep this file pending-only (see policy above); keep `TODO.md` (legacy deferred-work log) current.

Competitor-research sources: capterra.com/compare Planner-5D-vs-Coohom;
coohom.com/article best-online-room-planner-2026; saasworthy.com Planner-5D.
