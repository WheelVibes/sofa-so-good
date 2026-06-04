# Competitive-parity upgrade — design

**Date:** 2026-06-04
**Branch:** `feat/competitive-parity-upgrade`
**Status:** approved (design), pending implementation plan

## Motivation

A deep-research pass over the interior-design app landscape (IKEA Kreativ/Place,
Planner 5D, Coohom, RoomSketcher, Houzz Pro, Interior AI, ReimagineHome) plus the
authoritative R3F/Three.js performance guidance surfaced a small set of
high-leverage gaps for this HDB 3D sandbox. The engine, theming, daylight
simulation, and catalog are already strong; the gaps cluster in **idle
performance**, **AI/photo-driven onboarding**, **shoppable real-product
pricing**, and **friction-free 2D⇄3D editing**.

Verified guardrails from the research:
- Do **not** promise fast AI turnaround (Planner 5D floor-plan conversion is
  10 min–24 hr; photo-to-design is not instant). AI flows must be async with no
  "instant" copy.
- `instancedMesh` can occasionally be *slower* than plain meshes — profile before
  mass-applying (GitHub three.js #30352).
- The 4K-HDR IBL memory warning does **not** apply here — `SceneEnvironment`
  already uses a procedural Lightformer probe at `resolution={64}`.

## Scope

Seven workstreams, delivered in waves on one branch. Each wave is visually
verified (screenshots + review) per the CLAUDE.md visual-verification rule, and
`CLAUDE.md` / `README.md` / `TODO.md` are kept current.

External-dependency workstreams (C/D/E) ship their adapters behind clean
interfaces with graceful fallback: the app must behave correctly with **no
sidecar running and no API key set**.

---

### Workstream A — Performance hardening *(Wave 1)*

**A1. `frameloop="demand"` on the main `<Canvas>` ([src/scene/Scene.tsx]).**
The biggest idle-power win for the stated GPU-less-laptop target. The scene has
~10 `useFrame` loops (sun grading in `lighting/Lighting.tsx`,
`SceneEnvironment` intensity, `FurnitureLights`, `QualityController`,
`SceneReadySignal`, camera damping, contact shadows, showcase/turntable,
record, drag) that only tick when a frame is requested in demand mode.

- New `src/scene/RenderPump.tsx`: a ref-counted continuous-render driver. While
  any *animated* source is active it runs a `requestAnimationFrame` loop calling
  `invalidate()`; otherwise the scene renders only on discrete change.
  - **Continuous sources** (register/unregister via a small store-backed
    registry or prop flags): walk mode, time-of-day auto-play, sun study,
    turntable/walkthrough showcase, recording, active drag, OrbitControls
    inertial damping.
  - **Discrete invalidation**: a single store subscription calls `invalidate()`
    on any change to items / finishes / selection / doors / time-scrub /
    theme / quality / plan. drei `OrbitControls` already calls `invalidate()`
    on its `change` event.
- **Walk mode stays continuous** (first-person camera needs every frame).
- Interface: `RenderPump` reads the same store flags the camera/showcase/record
  systems already set; no new cross-module coupling beyond reading those flags.
- **Risk:** highest in the project. Acceptance = orbit-idle CPU/GPU drops to
  ~0 redraws while every animation path (drag, walk, sun study, turntable,
  record, time-play, finish change, selection outline) still updates correctly,
  verified by screenshots + the perf harness. **Fallback** if regressions
  prove intractable: hybrid mode — keep continuous frameloop but throttle to a
  lower DPR / paused redraw only when provably idle.

**A2. Instancing — scoped + profiled.** Broad cross-item instancing fights the
per-item-material architecture, so this is bounded to high-count *repeated
geometry inside individual primitives* (e.g. books on a shelf, balusters/slats,
cube-shelf grids) where it is self-contained. Gated on a `scripts/perf.mjs`
before/after measurement: ship only if there is a measurable win; otherwise
drop and record the negative result in `TODO.md`.

**A3.** IBL per-tier — no change (already `resolution={64}`).

---

### Workstream G — Seamless 2D⇄3D toggle *(Wave 2)*

A persistent toggle between the 3D scene and the 2D floor-plan editor that
**preserves the current selection**, and on 2D→3D **frames the selected item**.
Tightens the existing separate-mode switch into the friction-free flow Planner
5D is known for. No new state model beyond a toggle entry point + carrying the
existing `selection` across the switch and a one-shot "frame this item" camera
intent the existing `OrbitCamera` already supports.

---

### Workstream B — Smart Start wizard *(Wave 2)*

Reframe the existing `layout/autoArrange.ts` (`arrangeAllRooms`/`arrangeRoom`)
as guided onboarding rather than a buried "Tidy up" button.

- New `src/ui/wizard/SmartStartWizard.tsx`, built on the existing `Modal`
  primitive + `flows.css` vocabulary.
- Steps: pick **household / room-use** + **style**. Output: seed a default
  layout, apply a curated finish + theme palette, drop matching Sets
  (`furniture/furnitureSets.ts`), then run `arrangeAllRooms`.
- Wired through `featuresSlice`; launchable from Onboarding, the ⌘K command
  palette, and the toolbar **Arrange** menu.
- Honestly labelled **"Smart Start"** — heuristic, not AI.

---

### Workstream C — Live SG retailer pricing *(Wave 3, dev-only sidecar)*

- New sidecar endpoint (sibling of `scripts/scraper-server.mjs`):
  `GET /price?q=<item name>&retailer=<id>` → `{ price, currency, url, retailer,
  title }`, with on-disk/in-memory caching. Local/dev-only.
- App side: a `priceProvider` resolving catalog-item → live price. `BudgetPanel`
  async-loads + caches results in the store, showing **retailer + buy link +
  a "live" badge**, with the matched product title shown so the (fuzzy)
  item→SKU match is auditable.
- **Fallback:** the existing static estimate in `furniture/furniturePrices.ts`
  whenever the sidecar is unreachable; production always uses the estimate.
- Gated `devOnly` consistent with the `ikea-live` pack convention.

---

### Workstream F — Photo-trace floor-plan backdrop *(Wave 4, no-ML)*

The robust, key-free core that E builds on. The 2D floor-plan editor
(`ui/floorplan/`) gains a **reference-image layer**:

- Drop an image → it renders as a backdrop in the editor.
- **Set scale**: drag along a known real-world dimension and type its length;
  the editor computes px→metre scale.
- **Opacity** slider; toggle visibility.
- Trace walls over it with the existing wall tools.
- Persisted with the plan (image stored in IDB like other user blobs; scale +
  opacity + transform in the plan/editor state).

---

### Workstream E — AI floor-plan recognition *(Wave 4, bring-your-own-key)*

Layered on F. Drop a floor-plan image → send to a vision model via the shared
AI provider (Workstream D) → receive structured wall/opening coordinates →
seed an **editable draft** `FloorPlan` the user then corrects. Clearly framed
as "AI draft → edit", async, no instant promise. Falls back to pure photo-trace
(F) when no key is set.

---

### Workstream D — AI photoreal export *(Wave 5, bring-your-own-key)*

- New `src/ai/imageProvider.ts`: a provider-adapter interface plus a
  **Replicate img2img / ControlNet** adapter (structure-preserving). The
  interface is the integration seam E also consumes.
- API key pasted by the user, persisted like pack keys
  (`localStorage`, e.g. `hdb_ai_key`); **never bundled**.
- Flow: ShareModal / Export gains **"Make photoreal"** → grabs the existing
  `sofa:export` PNG → provider call with a prompt built from room-type + active
  style + structure-preserving conditioning → async result with download.
- **Async UX, no fast-turnaround promise.** Graceful, explanatory error states
  (no key, provider error, timeout).

---

## Sequencing

1. **Wave 1 (perf):** A1 → A2
2. **Wave 2 (UX):** G → B
3. **Wave 3 (shopping):** C
4. **Wave 4 (floor-plan):** F → E
5. **Wave 5 (export):** D

## Cross-cutting requirements

- **No-dependency safety:** C/D/E must degrade gracefully with no sidecar / no
  key — never break the core app.
- **Visual verification** after every wave (CLAUDE.md rule): run the app,
  exercise the changed paths via `window.__store` + `scripts/shot.mjs`, capture
  and review screenshots, report what was seen.
- **Docs:** update `CLAUDE.md` + `README.md` in the same change that reshapes a
  system; keep `TODO.md` current for deferred items (incl. a negative A2 result
  if instancing is dropped).
- **Tests:** unit-test pure logic (RenderPump source registry, priceProvider
  resolution + fallback, photo-trace scale math, provider adapter request
  shaping, FloorPlan draft mapping). Keep `npm run build` (tsc) + `npm test`
  green; Biome format clean (pre-commit hook).

## Out of scope

- On-device room-scan ML / WebXR depth capture (the manual photo-trace covers
  the value without native LiDAR).
- Real-time multi-user collaboration.
- Bundling any API key or hosting a production AI/pricing proxy.
