# TODO

Deferred-work log — **open items only**. `CHANGELOG.md` is the source of truth for what shipped;
when an item ships it is **removed from this file entirely**. Maintainability refactors live in
`TASKS.md`.

## Active — contractor-handover accuracy & documentation (2026-07-18, user goal)
> The app's purpose: homeowners design/plan/customize themselves, then hand over DIRECTLY to
> contractors — so output must be dimensioned, to-scale, accurate, precise, detailed enough to
> build from, following professional designer→contractor practice. Research:
> `docs/research/2026-07-18-contractor-handover-research.md` (canonical drawing set, conventions,
> SG/HDB specifics). Audit verdict (2026-07-18): geometry engine + drawing-set scaffolding are
> ~70-80% there; gaps concentrated below, ranked by contractor credibility impact.
- [ ] **G3 — Setting-out & datum dimensioning.** Walls are centerline-modeled with no datum
  concept. Add face-of-wall dimension option + a per-plan datum (default: a structural/external
  wall corner) with chain dimensions from the datum (not cumulative) on the floor-plan sheet;
  tile setting-out marks on the finishes sheet (start point + joint direction per room).
- [ ] **G7 — Demolition/hacking plan hardening (SG).** Wall-classification field
  (load-bearing / RC partition / brick infill / drywall — user-declared with an "unknown,
  verify with HDB/PE" default), hatched removals per convention, permit-note block (HDB permit
  required; PE endorsement when RC touched; off-limits elements list).
- [ ] **G8 — Carpentry/joinery elevations+sections.** Most-cited DIY gap: per built-in piece
  (wardrobe/kitchen run/parametric items), generate a dimensioned front elevation + one section
  at 1:20 with internal dimensions (shelf heights, carcass depths) from the parametric spec.
- *(Precision substrate, ride-along: mm display precision option in `measurement.ts`; bbox
  footprint caveat already tracked under Risks.)*
> Direction (user, 2026-07-01): prioritise the **core interior-design loop + its UX,
> discoverability, customizability** (furnish, arrange, finish, view) on desktop **and** mobile,
> researching `REFERENCES.md`; then reliability/edge-cases, a11y, and test-coverage hardening.
> Avoid pricing/quotes/analytics deliverables unless asked.

## Active — graphics-tier performance optimization (2026-07-08, user goal)
Systematically speed up frame processing/rendering **without sacrificing visual quality**, focused
on the heavy **Maximum** tier (also opportunistic wins on other tiers). Shipped work lives in
`CHANGELOG.md` (PERF-MAX-* entries) — this section tracks only **open** items.

**Methodology.** (2026-07-11: the environment NOW HAS a real GPU — `SHOT_GPU=1` — so absolute
verification is possible; the notes below describe the original software-WebGL constraints.)
Sandbox had no GPU (Maximum never finishes warming under software WebGL), so
changes are validated by code analysis + software-WebGL relative harnesses — `scripts/perf-orbit.mjs`
(relative FPS) and `scripts/perf-drawcalls.mjs` (deterministic per-frame draw-call/triangle counts),
both driving a continuous autoRotate span at a pinned tier — never by absolute numbers. All shipped
changes so far are tier-independent, so day→night tint sampled from the live canvas at medium/high is
the representative regression check. Structural note: SSAO/bloom/DoF are **camera-dependent** (only
run when something moves — no idle waste to reclaim); shadows were the uniquely freezable per-frame
GPU-pass cost (shipped). Remaining Maximum costs (full-res N8AO, DPR 2, 12 fixture lights,
geometryDetail 1.8, envResolution 256) are deliberate quality knobs — reducing any sacrifices quality
(out of scope). The CPU-side per-frame waste (readbacks, redundant recomputes/allocations) + the
discrete-edit shadow re-render have all been reclaimed (PERF-MAX-1..5). **No open items** — the
zero-regression-risk frontier for this goal is reached; the parked findings below record what was
evaluated and deliberately not done, so we don't re-investigate.

### Investigated + parked (findings recorded so we don't re-investigate)
- **PERF6 tail — antialias/preserveDrawingBuffer context-attr toggle: REJECTED, no recreate
  (2026-07-11, real-GPU verified).** Both are hardcoded `true` in the Scene + RoomEditor Canvas
  `gl` props; never plumbed into `QualitySettings` and never UI-exposed (the "…+ antialiasing"
  toggle maps to `postprocessing`/SMAA, not the canvas attribute — no silent no-op bug exists).
  Real-GPU probe (ANGLE D3D12 Intel UHD) confirms the context is created ONCE (attributes
  identical across tiers → no runtime toggle without a context recreate/flash) and the default
  framebuffer is 4× MSAA at every tier. On Performance/Medium that MSAA is the *sole* AA
  (load-bearing); on High/Max the composer renders offscreen + SMAA so it's redundant — but
  reclaiming it needs a recreate flash on the Medium↔High boundary for a saving that measured
  UNDER the noise floor (`antialias:false` at Performance gave no FPS gain). `preserveDrawingBuffer`
  stays (Record, already BLOCKED above). Revisit only if tier switches ever remount the Canvas
  for another reason.
- **P2 memoization audit — CLEAN, no changes (2026-07-11).** Render-count probes on the 13 hot
  scene components across orbit/drag/time-scrub: orbit = 0 React re-renders (camera pose flows
  through `cameras/cameraForward.ts` signals, not the store); a furniture drag re-renders ONLY the
  moved `Furniture` instance (the memo comparator holds; `useCatalog` keeps `def` reference-stable
  across drags — documented prior fix); time scrub re-renders only the 4 sun-dependent components.
  Selector sweep found no unstable-object selectors on hot paths (the plain `s.items` subscribers
  are single-field = reference-stable; adding `useShallow` there would cost an 81-element compare
  for identical behaviour — leave them). Don't re-audit without new evidence of churn.
- **`preserveDrawingBuffer: true` always-on — BLOCKED by the Record feature.** The PNG export path
  (`ScreenshotController`) already renders on-demand + reads back synchronously, so it does NOT
  need it. But `RecordController` uses `captureStream(0)` + `track.requestFrame()` from a `useFrame`
  that runs BEFORE r3f's render, so it captures the *previous* frame's buffer — which is only
  reliable with the buffer preserved. A context attribute can't be toggled at runtime, so removing
  it safely needs a render-after-`requestFrame` refactor (positive `renderPriority` manual render),
  and `.webm` output can't be verified in headless swiftshader. Not worth the regression risk.
- **Skip the Bloom pass when its intensity is 0 — NOT a clean win.** `bloomIntensityForDay =
  intensity·(1−dayLevel)` is exactly 0 only at the solar-noon peak; it's a small nonzero for most
  of the day, so unmounting Bloom would change the image except in a narrow window (and the
  mount/unmount recompiles the EffectPass = a hitch). Rejected.
- **Dedup the per-wall `camera.getWorldDirection` in wall-reveal — NOT worth it.** Each wall
  segment's per-frame `useWallReveal`/`WallSegment` recomputes the camera world direction
  (`getWorldDirection(FWD)`), so a plan with ~20-40 walls repeats it 20-40×/frame; `cameraForward.ts`
  already publishes the camera forward once/frame. But `cameraForwardXZ` is pre-**normalised** (len 1)
  and `facingToward`'s `len < 0.15` top-down guard (keeps walls solid looking straight down) relies on
  the raw un-normalised XZ magnitude — feeding the normalised vector defeats the guard → walls fade at
  top-down (visual regression). Safe dedup would need `cameraForward` to also publish the raw XZ
  forward; the gain is a handful of cheap matrix reads/frame. Marginal value vs the added coupling —
  parked.

## Active — asset pipeline (2026-07-02, user goal)
See `docs/research/2026-07-02-local-asset-db-and-scraper-plan.md` for the full design.
- **Local dev asset DB (Part 1, in progress).** Drop GLBs in `local-assets/` → auto-loaded into
  the catalog with NO upload pipeline (convert/optimize/IDB). Dev-only Vite plugin
  (`scripts/vite-local-assets.mjs`) serving `/@local-assets/*`, `localAssets` devOnly flag,
  `localAssetsSlice` (`bootstrapLocalAssets`), `LocalGltfDef` source, merged in `catalog.ts`.
- **Scrapers (Part 3).** `research/scrapers/` has 35 working scrapers with complete enumeration;
  finalized tiering in the plan doc. **Poly Haven model fetcher SHIPPED (v0.22.0.6)** —
  `scripts/asset-pipeline/fetch-polyhaven-models.mjs` downloads CC0 gltf bundles and repacks
  self-contained GLBs into `local-assets/<category>/` (11-item curated furniture set fetched,
  verified loading + placing via the Part-1 plugin). **Kenney Furniture Kit fetcher SHIPPED
  (v0.22.2.36)** — `fetch-kenney-models.mjs` extracts 19 curated CC0 GLBs (already
  self-contained, KHR-unlit-preserving optimize pass) into `local-assets/` (30 GLBs total,
  verified in-catalog + placed). Notes: Kenney site search/category pages are useless for
  enumeration — go straight to known pack slugs; Poly Pizza needs an API key (auth gate, not
  rot); **Quaternius is the natural next batch** (CC0, same ZIP shape). Then: surface these in
  prod (`remoteFurniture` flag — needs a runtime fetch/repack path or pre-bundled assets, see
  the production-infra section).

## Open — UX research round 2 queue (2026-07-18)
Ranked by value÷effort; verified absent against registry + source this pass.
- [ ] **WebXR AR hit-test on Android Chrome** (M) — real `immersive-ar` with the in-memory scene
  (no hosted URL needed), closing the iOS-vs-rest asymmetry `viewInAr.ts` documents. **Blocked on
  real-device QA** — cannot be verified in this sandbox; keep the GLB-download fallback.
- [ ] **Voice dictation for the text brief** (S) — platform research DONE (2026-07-18, sourced:
  MDN/caniuse/WebKit/community): **GO, narrowly scoped**, but **DEFERRED until `textBrief` itself
  ships** (it's default-false "not production-ready" — a mic on a hidden feature is dead UI).
  When built: feature-detect `window.SpeechRecognition || webkitSpeechRecognition`, and
  **suppress on iOS standalone/PWA** (`navigator.standalone || matchMedia('(display-mode:
  standalone)')` — the API consistently fails there per multiple sources); Firefox effectively 0%
  (default-off pref); iOS Safari tabs: `continuous` is broken — use `interimResults` +
  silence-gap end detection, expect ~2-3 s post-permission warmup; Chrome/Android is server-based
  (needs network — disable offline; Chrome 139+ has an on-device path via
  `SpeechRecognition.available()`); locale: try `en-SG`, retry `en-GB` on
  `language-not-supported`. Privacy copy must say audio may go to the browser vendor's cloud.
  WASM Whisper fallback rejected for now (40-76 MB + mobile perf). Rides the `textBrief` flag.

- *(Flagged, needs product decision: `budget`/`clearanceChecks`/`textBrief` are simple-TIER but
  default-false "not production-ready" — ship or demote eventually.)*

## Open — UX research round 3 queue (2026-07-18)
Ranked by value÷effort; each verified absent against registry + source. Near-misses confirmed
already-shipped/ruled-out this round (don't re-propose): align/distribute, dollhouse view,
wardrobe configurator (generic parametric), 2D+3D split view (contradicts plan-stays-structural
ruling), AI photo→plan (= aiWalls), shelf-lift gesture (= surfaceDrop).
- [ ] **Lighting mood presets** (M, simple) — one-tap Reading/Movie/Entertaining/Romantic row
  adjusting placed fixtures' intensity + colour temperature (Coohom precedent); distinct from
  sun-only sunStudy. Preset table over `itemAsLight`-tagged fixtures in `src/lighting/`.
- [ ] **Real-photo paint visualizer** (M, simple) — upload a wall photo, drag a polygon mask,
  composite a finish swatch via canvas blend (no AI seg for v1; Behr/Dulux precedent). Pairs the
  customBackdrop upload path with swatch data.
- [ ] **Parametric staircase generator** (M/L, pro) — real adjustable stairs (width/rise-run/
  landing/handrail; Homestyler v6 precedent) placed as furniture with a levelId span, feeding the
  existing stairConnectivity advisory.
- [ ] **Parametric roof + dormers** (L, pro) — roof slab from the outer wall polygon + pitch,
  dormer cutouts; only offered on Maisonette/terrace templates (Homestyler v6 / Live Home 3D).

## Open — UI/UX polish follow-ups
- [ ] **P37 List virtualization — DEFERRED (2026-07-03 ruling).** Not justified now: the
  catalog is already paginated (`PAGE_SIZE=12`, never renders >12 cards); history/layers
  realistically render <100 rows. Revisit with a lightweight slice-on-scroll window (NOT a new
  dependency) only if a single list is observed to exceed ~200 live DOM rows.

## ⛔ Production-infra-blocked — need a DEPLOYED host/backend, not app code
The dev paths already work (Vite reverse proxy, dev-gated providers); only the *production*
proxy/mirror/host is missing, and standing one up is a deployment task, not a code change here:
- **Runtime catalog CORS proxy** (ambientCG prod) — ambientCG's API/CDN send no CORS headers.
  The Docker image's nginx now ships `/acg`/`/acg-cdn`/`/kenney` proxies (self-hosted deploys
  covered), but the **GitHub Pages** deployment still needs a Cloudflare Worker / Vercel edge /
  hosted reverse-proxy. Until then ambientCG stays dev-gated there (Poly Haven works direct).
- **Kenney / Quaternius mirrors** — no CORS-friendly API, ship single ZIPs; need a build-time mirror
  or proxy worker + format conversion (FBX/OBJ → GLB) before adding to the runtime catalog.
- **Sketchfab** — REST + OAuth token + runtime fetch (auth/ToS friction).
- **Kenney zip extraction** — no CORS-friendly API, ships single ZIPs; still needs a mirror +
  format conversion. (The Poly Haven half of this item shipped as the DEV-side
  `fetch-polyhaven-models.mjs` repack pipeline, v0.22.0.6 — a *runtime/prod* fetcher would still
  need a proxy/host, same class as the ambientCG proxy above.)

## Assets — open pipeline deferrals
- **Standard asset set expansion** (~80 assets) + **per-LOD texture variants** + **lazy/streaming
  GLB loading** — manifest schema already supports these; expand when bundle size justifies it.

## Closure rulings (don't re-propose)
- **Thumbnail-clone GPU disposal — RESOLVED no-leak (2026-07-18, measured).**
  `scripts/scenarios/thumbnail-clone-gpu-probe.json` read `gl.info.memory` on the thumbnail
  canvas across 3 category cycles + a 3-concurrent compare-tray open: counts fluctuate and drop
  back to single digits (no monotonic growth; 0 contextlost on that canvas). Root cause of the
  non-leak: `SkeletonUtils.clone` shares the source `BufferGeometry`/`Material` with drei's
  `useGLTF` per-URL cache — the clone owns nothing disposable, and R3F correctly never disposes
  externally-supplied `<primitive>` objects. Resident GPU memory is the intentional per-URL
  loader cache (documented in `src/furniture/CLAUDE.md`). Don't re-investigate absent new
  evidence of monotonic growth.

## Risks tracked from specs
- **Asset source URL drift** (Poly Haven / ambientCG slug versioning) — pin stable per-asset URLs,
  audit periodically.
- **Bbox-derived footprints** can be wrong for off-floor anchors / non-uniform scale — revisit if
  it bites users.

## Time-of-day — out-of-scope deferrals (from the spec)
Auto-advancing in-world clock; window-glass tinting affecting shadow colour; localized per-room IBL
probes; real-time path-traced GI/RTX (revisit only with affordable WebGPU path tracing).
(Directional door-bleed weighting shipped v0.21.2.7 into the 2D lux model — the 3D render's bleed
was already physically correct via real lights.)

## Deferred candidates
- **Deeper transition-warmup: `renderer.compileAsync` + time-sliced mounts** (2026-07-03).
  v0.10.0.7 shipped compositor-proof overlay animation + readiness-based hide (throttled ~10 fps
  warm frames behind the overlay). The remaining lever if big scenes still block long: explicit
  `renderer.compileAsync(scene, camera)` (KHR_parallel_shader_compile) + `initTexture` during the
  overlay window, and batching FurnitureLayer mounts across frames so no single main-thread block
  exceeds ~50 ms. Only worth it if profiling shows first-frame blocks surviving the warm frames.
- **`livePrices` IXT scenario** — deferred (user, 2026-06-30): dev-only + network/sidecar-bound
  (lower value), and a headless scenario would need a new dev-only `window.__priceSidecarStub` lever
  in `livePrice.ts` purely for the test. Unit coverage already exercises the client logic; revisit
  only if the sidecar path regresses.

## Open — core interactions
- **Live slide during drag — PARKED (2026-07-12 evaluation, numeric evidence).** The specified
  per-move minimal-axis MTV slide (vs walls + furniture, reusing `nudgeToValid`) is provably
  unstable: ±0.02 m frame wobble, 0.39 m face-flip jumps circling an obstacle, and a 0.62 m
  teleport THROUGH a wall once penetration passes the midpoint. Also premise-corrected: there is
  no "hug on release" today (onUp's auto-nudge was deliberately removed — bug #6; `nudgeToValid`
  is test-only dead code), and `wallSnapOffset` already pulls flush within 0.12 m, so the residual
  value is low. **If revisited**: build a walls-only swept two-pass X/Z clamp
  (`collision/slideAlongWalls.ts` modelled on walk-mode `resolveMovement`, seeded from a
  lastValidPos ref, applied after all snaps, snap-off single-item drags only, noClip/windowBound
  excluded) — proven stable + tunnel-proof in the probe (maxJump 0.02 m, corner-stable, no
  tunnelling on a 2 m step); flag `liveSlideDrag` simple/default-OFF; REQUIRES real-device feel
  QA (headless can't measure pointer jitter/tug-of-war with the magnetic snap). Probe
  measurements in the 2026-07-12 session records. (Drag inertia: still skip.)

## Open — customizability / UX
- **Baseboard fold into FinishPicker — CLOSED as skip (2026-07-18 ruling).** Accent-wall
  *creation* shipped (v0.22.0.5, `materials/roomWalls.ts` + FinishPicker "Add accent wall…").
  Baseboard stays per-wall in the 2D-plan `WallInspector`: `wallBaseboard` is a genuinely
  per-wall `PlanWall` property (mixed heights/colours per room → any per-room control is lossy
  and clobbers variety), and the fixed apartment's 3D `WallSegment` has no per-wall baseboard
  data at all, so a picker control would have nothing to bind to for the default flat. Don't
  re-propose without a per-room aggregation design that handles both.
- **2D-plan finish drag-and-drop — CLOSED, no entry point (2026-07-18 investigation).** The
  proposed plan drop-zones would be dead UI: the ONLY finish drag source is the FinishPicker's
  `SwatchGroup` tiles (`ui/finish/swatches.tsx` → `encodeFinishDrag`), and the FinishPicker never
  mounts in the plan editor (needs `selectedRoomId`; the opaque `.plan-screen` z-30 overlay covers
  the right dock, which has no `z-index` bump like the catalog's `.catalog-in-plan`; and
  `ui/CLAUDE.md` + `editor/inspector/RoomInspector.tsx` deliberately keep finishes OUT of the plan
  editor — "the plan stays a structural/layout view"). Reviving this requires a product decision to
  surface a finish palette inside the plan editor first (contradicting that invariant), not a drop-
  zone implementation; the pure decision layer (`materials/finishDrop.ts` +
  `state/finishDropApply.ts`) is drop-surface-agnostic and would map cleanly if that ever happens.


## Core-loop parity gaps (2026-07-03 audit)
Ranked by value/effort. All pure-client, core-loop (furnish→arrange→finish→view→share) +
discoverability/customizability, desktop **and** mobile; none shipped or tracked above. (Verified
absent this pass; avoids the AI/backend/GPU gaps already logged in `FEATURE_PARITY.md`.)
- [ ] **PLAN-FURNISH — plan-editor furniture placement follow-ups.** Phases 1–3
  (desktop click-to-place `planFurnish` flag; mobile tap/long-press-from-card; window-bound
  fixture snap) have shipped — see `CHANGELOG.md` and
  `docs/research/2026-07-03-plan-furnish-implementation-plan.md` (marked done there). Remaining:
  - [ ] **Phase 4** — HTML5 drag-from-catalog onto the plan SVG. **Recommend keeping deferred
    (2026-07-11 assessment)**: desktop already places via click-to-arm→ghost→click and mobile via
    tap/long-press-drag (Phases 1–2), so this adds a third gesture purely for 3D-drag-habit
    parity; the `<div>`-vs-SVG drop-zone friction remains (workaround: transparent overlay div
    during drag). Revisit only on user demand.

## Process
- Update this file whenever work is planned/deferred; remove items entirely once shipped (they live
  in `CHANGELOG.md`).
