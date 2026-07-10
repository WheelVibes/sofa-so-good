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

**Methodology.** Sandbox has no GPU (Maximum never finishes warming under software WebGL), so
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
- [ ] **NEW_BADGES follow-up** — register the next feature that ships a real toolbar/menu row
  (badges are dormant until then by design; see ui/newBadges.ts).
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
- **Fast rasterized "preview render" tier** (Coohom parity) — a local analog to the 10-s cloud
  render. Deferred as an analytics/deliverable, not core design UX.

## Active — toolbar UX program (2026-07-10, user goal)
Full audit (findings P0–P3 with file:line evidence, Figma/modern-app grounding, screenshots):
`docs/research/2026-07-10-toolbar-ux-audit.md`. Work the sequenced list there; delete each
finding from the doc + this list as it ships. Open items, in order:
- [ ] **TB-1 (P0)** Popover containment must accept descendant portals — nested Select drops picks
  and closes the parent menu (= the TASKS.md IXT bug; fixes Scene/Arrange selects).
- [ ] **TB-2 (P0)** Scene-menu "Ceiling fixtures"/"Motion" toggles render as plain text — give
  them a real control affordance (segmented, like Lights).
- [ ] **TB-3 (P0)** Mobile menu-sheet grab pill is decorative — wire swipe-down-to-close or drop it.
- [ ] **TB-4 (P1)** Mobile overview has no Arrange section — whole-flat Smart Start/presets/styles
  unreachable without entering a room (desktop surfaces them in overview).
- [ ] **TB-5 (P1)** Consolidate exports: Tools "Export & document" (~17 rows) merges into File;
  Tools keeps analysis panels/modes only. Group the four scattered cost surfaces under one entry.
- [ ] **TB-6 (P1)** Toolbar island overflow affordance (edge fade/chevrons); no Lights/Scene
  control inside the room editor; plan-editor mobile menu paradigm differs from the main sheet.
- [ ] **TB-7 (P2)** Shortcut discoverability: `kbd` field on the tool-action registry, chips for
  Orbit/Walk (V), Budget (B), time preset (T); Esc from keybindings not hardcoded; mirror `label`
  to `title` on enabled IconButtons for touch.
- [ ] **TB-8 (P2)** "Measurements" vs "Measure" naming/icon collision; cycle-buttons (Lights,
  grid size, mobile cycles) → segmented/Select where 3+ states.
- [ ] **TB-9 (P2)** Consolidate menu primitives (one section-header idiom, Arrange on
  MenuItem/EmptyState); confirmAction on user-set/style deletes; 44px hamburger/brand targets;
  tablist roving focus + sheet focus-trap.
- [ ] **TB-10 (P3)** Label separator convention, desktop↔mobile naming/icon drift, SliderField in
  GraphicsSettings, wall-reveal double naming, shared 640px breakpoint token, History icon.

## Open — core interactions
- **Corner-spread wall fade for custom plans (`PlanShell`).** The angle-graded orbit wall fade
  (WALL-REVEAL-ANGLE-GRADED) + corner spread (WALL-REVEAL-CORNER-SPREAD) landed in the default
  flat (`WallSegment`) and the room editor (`useWallReveal`); `PlanShell`/`PlanDoorLeaf` share the
  same graded curve but not the corner spread — `planGeometry.ts`'s `WallBox` carries no wall id,
  so the per-frame own-strength registry can't be keyed there yet. Plumb the wall id through
  `wallBoxes` and reuse `cornerNeighbors` + `setWallOwnStrength`/`getWallOwnStrength`.
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

## Open — accessibility (very low value, optional)
- **Full focus-trap on the mobile menu sheet** (`MobileToolbar`) — Escape-close + `useModalGuard`
  ship; a Tab focus-trap remains, but keyboard-on-touch is rare.

## Core-loop parity gaps (2026-07-03 audit)
Ranked by value/effort. All pure-client, core-loop (furnish→arrange→finish→view→share) +
discoverability/customizability, desktop **and** mobile; none shipped or tracked above. (Verified
absent this pass; avoids the AI/backend/GPU gaps already logged in `FEATURE_PARITY.md`.)
- [ ] **PLAN-FURNISH Phases 2–4 — plan-editor furniture placement follow-ups.** Phase 1
  (desktop click-to-place; `planFurnish` flag) has shipped — see `CHANGELOG.md` and
  `docs/research/2026-07-03-plan-furnish-implementation-plan.md` (marked done there). Remaining:
  - [ ] **Phase 2** — mobile tap-to-place + long-press-from-card, stamp-mode reuse for repeat drops.
    **ATTEMPTED + DEFERRED (2026-07-04)** — reached 54/64 scenario steps green (catalog sheet
    surfaces on mobile, tap-to-place + long-press-drag commit both work) but not shipped. Work
    archived on branch `wip/plan-furnish-mobile-phase2` (resume from there). Blockers for a future
    focused effort: (a) the mobile catalog bottom-sheet covers ~72% of a 390×844 viewport, so
    tap-to-place needs the sheet to **auto-collapse on arm** (or dock smaller) — decide the
    catalog-vs-plan mobile layout first; (b) verify the stamp-in-plan touch-commit (scenario step 55)
    + drop the unverified desktop stamp-in-plan tweak that snuck into that WIP; (c) SwiftShader
    harness flakiness (Page.captureScreenshot timeouts) needs the lazy-plan-editor-mount waits.
  - [ ] **Phase 3** — window-bound fixtures (curtains/blinds/grilles) via `snapToNearestWindow` in
    the plan (Phase 1 excludes them with a toast pointing to the 3D room editor).
  - [ ] **Phase 4** — HTML5 drag-from-catalog onto the plan SVG (deferred pending the logged
    `<div>`-vs-SVG drop-zone friction).
  - [ ] *(Polish, not phase-gated)* the docked catalog currently floats over the plan rather than
    shrinking its viewport like `.stage-area` does in 3D (`--left-rail` doesn't apply to
    `.plan-screen`) — low-risk follow-up.

## Open — round-2 audit backlog (2026-07-04)
Open, client-doable items from `docs/research/2026-07-04-audit-round2-tests-mobile-features.md`
(full detail + code refs there). Shipped from this audit — MOBILE-1/2/3, TEST-3/4/5/6/7/8,
FEAT-A/B/C/D — are in `CHANGELOG.md`. Still open:
- [ ] **FEAT-E — grid-snap for furniture placement in 3D** (S–M, low risk). Deprioritized: the
  alignment guides + neighbour snap already deliver most of the "tidy placement" value; revisit as
  complementary polish (a `gridSnap3d` toggle quantizing `dragControllerHandlers.onMove`, reusing
  `floorplan/gridSnap.ts`, neighbour-snap wins within threshold else grid). Pro tier.
- New reference: **Home Planner** (backend/licensed-asset-led — informs the tracked catalog-expansion/
  F11 work, not a client-doable feature). Added to `REFERENCES.md`.

## Open — round-3 audit backlog (2026-07-04)
Open, client-doable items from `docs/research/2026-07-04-audit-round3-backlog-refill.md`
(full detail + code refs there). This pass confirmed the app is near-saturated — a wide
competitor sweep found history-panel/shortcut-help/room-area/favourites/copy-paste/nudge/
room-palette/lock/align-distribute all already shipped — so the list is short + evidence-based,
ranked by value ÷ effort:
- [ ] **R3-TEST-1 — `floorplan/templates/shared.ts` geometry helpers (0 tests).** `perimeter`/
  `room`/`door`/`window`/`parapet`/`iwall` seed the shell of **every** starter plan (18+ HDB/condo
  templates); area `CLAUDE.md` mandates "Geometry stays pure + unit-tested here." (S · HIGH)
- [ ] **R3-TEST-2 — `state/slices/orientationSlice.ts` `normalize`/`setOrientationDeg` (0 tests).**
  Home compass rotation driving sun/sky orientation + compass HUD; a bad wrap silently mis-rotates
  the sun. Assert `-90→270`, `450→90`, `360→0`. (S · MED-HIGH)
- [ ] **R3-FEAT-1 — Persistent / cross-plan clipboard paste.** `clipboardSlice` is session-only;
  self-persist to localStorage (mirror `favouritesSlice`) so paste survives reload + works across
  designs. Coohom/Planner 5D "my items". Pro tier. (S · MED)
- [ ] **R3-FEAT-2 — Curated colour-palette preset gallery.** Palette *mechanism* exists
  (`colorPaletteSlice`) but no one-click curated theme; add a static preset list + picker calling
  `setMasterPalette`/`setRoomPalette`. Coohom/Planner 5D themes. Pro tier. (S · MED)
- [ ] **R3-REFAC-1 — `App.tsx` (1163 lines) has ~487 lines of inline keyboard orchestration.**
  Extract the three blocks (`:225-362` global ⌘K/undo, `:586-800` editor `onKey`, `:811-947` nudge)
  into `controls/useAppHotkeys.ts` + `useNudge.ts`; makes hotkeys unit-testable. (M · MED)
- [ ] **R3-FEAT-3 — Orthographic / isometric camera view.** `OrbitCamera.tsx:491` has an unused
  ortho fallback; expose a parallel-projection/iso "dollhouse" toggle (SketchUp/Sweet Home 3D/
  Planner 5D). Pro tier; needs a visual-verification pass (raycast/shadow/zoom differ). (M · MED)
- [ ] **R3-TEST-3 — `calloutsSlice.ts`/`badgesSlice.ts` localStorage guards (0 tests).** Corrupt-
  storage parse + dedup resilience for onboarding callouts / NEW badges. (S · MED-LOW)

## Process
- Update this file whenever work is planned/deferred; remove items entirely once shipped (they live
  in `CHANGELOG.md`).
