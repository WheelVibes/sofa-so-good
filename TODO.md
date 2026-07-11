# TODO

Deferred-work log — **open items only**. `CHANGELOG.md` is the source of truth for what shipped;
when an item ships it is **removed from this file entirely**. Maintainability refactors live in
`TASKS.md`.

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
  finalized tiering in the plan doc. Next: run Tier-1 CC0 scrapers into `local-assets/` (pairs with
  Part 1), then surface Poly Haven models in prod (`remoteFurniture` flag).

## UI/UX polish program — remaining follow-ups (2026-07-02 program, completed 2026-07-03)
The 39-item Vi-develop-derived program shipped (see CHANGELOG); only these follow-ups remain:
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
- **Poly Haven model fetcher / Kenney zip extraction** — Poly Haven serves multi-file gltf+bin+tex
  bundles (not single GLBs); need a pipeline that downloads + repacks to a self-contained `.glb`.

## Assets — open pipeline deferrals
- **KTX2/DDS standalone-material decode** — needs a WebGL readback; the model importer handles
  embedded KTX2, but standalone KTX2/DDS material uploads aren't decoded yet
  (`src/materials/convert/decodeImage.ts`).
- **Drop-folder material auto-detection** — infer channels from filenames (`*_diff.*`, `*_nor.*`,
  …) for material folders lacking a sidecar (`scripts/asset-pipeline/index-assets.ts`).
- **Build-time KTX2 in the offline asset pipeline** — `@gltf-transform/functions` lacks a bundled
  KTX2 encoder; integrate `@gltf-transform/cli` (`toktx`) or `basisu` for the offline pipeline
  (`scripts/asset-pipeline/process-texture.ts`). (The *in-browser* encoder already ships.)
- **Standard asset set expansion** (~80 assets) + **per-LOD texture variants** + **lazy/streaming
  GLB loading** — manifest schema already supports these; expand when bundle size justifies it.

## Risks tracked from specs
- **Asset source URL drift** (Poly Haven / ambientCG slug versioning) — pin stable per-asset URLs,
  audit periodically.
- **Bbox-derived footprints** can be wrong for off-floor anchors / non-uniform scale — revisit if
  it bites users.

## Time-of-day — out-of-scope deferrals (from the spec)
Auto-advancing in-world clock; window-glass tinting affecting shadow colour; localized per-room IBL
probes; directional door-bleed weighting; real-time path-traced GI/RTX (revisit only with affordable
WebGPU path tracing).

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

## Toolbar UX program (2026-07-10, user goal) — COMPLETE 2026-07-11
All sequenced findings (TB-1 … TB-10 + tails) shipped; records live in `CHANGELOG.md`
(v0.18.6.x … v0.20.0.5) and the audit doc `docs/research/2026-07-10-toolbar-ux-audit.md`
is retained as the methodology/grounding reference.

## Open — core interactions
- **Cabinet drawer/door open-close.** Cabinet fronts are static; opening them (with eased motion)
  would be a new interaction. Doors already animate (could ease the linear swing curve — low value).
- **Live slide during drag** (optional, higher-risk) — item hugs walls/furniture in real time, not
  just on release; more invasive in `DragController`'s per-move snapping. (Drag inertia: skip —
  hurts placement precision.)

## Open — customizability / UX
- **Fold baseboard + accent-wall *creation* into the FinishPicker.** The FinishPicker now covers
  floor + wall + ceiling and *manages* a room's existing accent walls (v0.9.0.45 — list + clear +
  hint). Remaining: (a) *create* an accent from the panel by picking a wall (needs a room→walls
  enumeration that works for both the fixed apartment `wallRoomSides` and custom plans); (b) fold
  baseboard (2D-plan-inspector only, `wallBaseboard`, keyed per-wall → needs a per-room aggregation
  decision). Medium effort, lower incremental value.
- **2D-plan finish drag-and-drop** (S–M) — `finishDnd` drag-to-apply works in 3D
  (`scene/FinishDropSurface`) but not the 2D plan editor. Add plan drop-zones reusing `finishDrop`
  + `setRoomFinish`/`setWallFinish` (reuses the `finishDnd` flag). Lower reach (many users never
  open the 2D editor); drag-drop is fiddly to verify headlessly. Note: 2D room polygons are SVG, so
  the `ui/CLAUDE.md` "drop zones must be `<div>`" rule needs a workaround.


## Core-loop parity gaps (2026-07-03 audit)
Ranked by value/effort. All pure-client, core-loop (furnish→arrange→finish→view→share) +
discoverability/customizability, desktop **and** mobile; none shipped or tracked above. (Verified
absent this pass; avoids the AI/backend/GPU gaps already logged in `FEATURE_PARITY.md`.)
- [ ] **PLAN-FURNISH Phases 2–4 — plan-editor furniture placement follow-ups.** Phase 1
  (desktop click-to-place; `planFurnish` flag) has shipped — see `CHANGELOG.md` and
  `docs/research/2026-07-03-plan-furnish-implementation-plan.md` (marked done there). Remaining:
  - Phase 2 (mobile tap-to-place + long-press-from-card + stamp reuse) **SHIPPED v0.18.6.19**
    (user decision 2026-07-10: arm auto-closes the catalog sheet, mirroring 3D `placeConfirm`).
  - Phase 3 (window-bound fixtures snap in the plan) **SHIPPED v0.18.6.20**.
  - [ ] **Phase 4** — HTML5 drag-from-catalog onto the plan SVG. **Recommend keeping deferred
    (2026-07-11 assessment)**: desktop already places via click-to-arm→ghost→click and mobile via
    tap/long-press-drag (Phases 1–2), so this adds a third gesture purely for 3D-drag-habit
    parity; the `<div>`-vs-SVG drop-zone friction remains (workaround: transparent overlay div
    during drag). Revisit only on user demand.
  - [ ] *(Polish, not phase-gated)* the docked catalog currently floats over the plan rather than
    shrinking its viewport like `.stage-area` does in 3D (`--left-rail` doesn't apply to
    `.plan-screen`) — low-risk follow-up.

## Open — round-2 audit backlog (2026-07-04)
Open, client-doable items from `docs/research/2026-07-04-audit-round2-tests-mobile-features.md`
(full detail + code refs there). Shipped from this audit — MOBILE-1/2/3, TEST-3/4/5/6/7/8,
FEAT-A/B/C/D — are in `CHANGELOG.md`. Still open:
- ~~FEAT-E — grid-snap for furniture placement in 3D~~ **STALE, struck 2026-07-10**: already
  shipped since v0.7.0.0 — the room-editor toolbar's "Snap to grid" toggle (`snapEnabled` +
  `gridSize`/`cycleGridSize`) quantizes `dragControllerHandlers.onMove:107` via `snapToGrid`, the
  `PlacementGhost` snaps too, and `GridOverlay` renders the live grid. The only unshipped nuance
  is neighbour-snap composing WITH grid snap (guides are skipped while grid snap is on —
  deliberate); not worth a separate item.
- New reference: **Home Planner** (backend/licensed-asset-led — informs the tracked catalog-expansion/
  F11 work, not a client-doable feature). Added to `REFERENCES.md`.

## Open — round-3 audit backlog (2026-07-04)
Open, client-doable items from `docs/research/2026-07-04-audit-round3-backlog-refill.md`
(full detail + code refs there). This pass confirmed the app is near-saturated — a wide
competitor sweep found history-panel/shortcut-help/room-area/favourites/copy-paste/nudge/
room-palette/lock/align-distribute all already shipped — so the list is short + evidence-based,
ranked by value ÷ effort:

## Process
- Update this file whenever work is planned/deferred; remove items entirely once shipped (they live
  in `CHANGELOG.md`).
