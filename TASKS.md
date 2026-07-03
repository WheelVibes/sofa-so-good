# TASKS — autonomous improvement backlog (OPEN ITEMS ONLY)

Each task = its own commit; log every shipped task in `CHANGELOG.md` (the source of truth).
**Policy:** when an item ships it is **removed from this file entirely** (its record lives in
`CHANGELOG.md`) — only genuinely-open work stays here, one terse entry each. Licensed/
non-redistributable additions ship dev-gated; CC0/unlicensed ship in prod too. Run
`npm test` + `tsc` + `biome` before each commit; visually verify any app-facing change.

**Prioritization:** correctness/security → reliability/edge-cases + mobile parity →
performance/memory → realism + high-value features → QOL/aesthetic polish.

## ⛔ Environment-blocked — cannot be done in a pure-client repo (leave as-is)
These need infrastructure/hardware this app doesn't have (a GPU + network don't help):
- **COLLAB-STRUCT / F24** — structured collaboration + live multi-user presence/sync: need a
  persistent real-time backend (auth, DB, websockets).
- **F22 (Android Scene Viewer)** — needs an https-hosted GLB (public URL + upload backend); iOS
  AR Quick Look already ships.
- **F21 (real-headset WebXR)** — controller-locomotion pass needs a physical VR headset to verify;
  the inert WebXR entry + provider already ship.

## Open — client-doable
- [ ] MOD-FPE-SPLIT (optional tail): `FloorPlanEditor.tsx` is now **~2728 lines** (was 4271, −36%).
  Done: state/effect hooks `usePlanBackdrop` (v.46), `usePlanAiWalls` (v.47), `usePlanViewport` (v.49),
  `usePlanLevel` (v.50); and **all 11 SVG render layers** in `editor/layers/*` — `WallsLayer`,
  `RoomsLayer`, `OpeningsLayer`, `DimensionsLayer`, `NotesLayer`, `PolylinesLayer`, `TourStopsLayer`,
  `FurnitureLayer`, `FurnitureRotateHandle`, `WallHandlesLayer`, `DraftOverlayLayer` (v.51–.60), each
  behaviour-preserving + interactively verified. Pure tool math/decisions were already modularised
  (`toolDraftReducer`, `*Commit`, `snap*`, `floorPlanGeometry`, `marqueeSelect`). What remains is
  **intentionally kept in the component** per `editor/CLAUDE.md`: the pointer-tool **dispatcher**
  (`onDown/onMove/onUp`, ~730 lines) is a thin dispatch over those pure helpers + store writes and
  should stay. The only further *shell* reduction available is lifting the toolbar/control JSX
  fragments (`viewToggle`/`toolPalette`/`fileActions`/… ~620 lines) into a presentational
  `PlanToolbar` — deferred because it needs a 40+ prop bundle (passing the whole store-action
  snapshot), which would hurt readability more than the current named-fragment consts. Revisit only
  if the toolbar grows its own logic.
- [ ] SLOT-203 (configurator GLB-sub-asset options): needs a **bundled CC0 GLB** asset + the load
  path (load → reparent at the slot anchor → per-slot `listFinishTargets` namespacing). The v1
  products are all-procedural, so this is gated on sourcing a suitable CC0 GLB option to bundle.
- [ ] IXT-SUITES: remaining interaction-test scenarios (C267 harness) — AI surfaces, GLB-designer
  re-rung, crown-molding, ceilingDesign (needs walk-mode look-up), livePrices, first-run re-rungs,
  backdrop-upload + furnlight re-rungs.
  - model-upload: **simple rung landed** (`model-upload-simple.json` — Upload entry gating + 60-group
    detection via the `__detectGroups` dev hook). A full journey rung is blocked on the dialog being
    `React.lazy` (won't mount headless); the paginated-list render is instead covered by
    `GroupPanel.test.tsx` + `pageWindow.test.ts` and a temporary `?__pagerdemo` `main.tsx` mount.
- [ ] PARITY-VIDEO tail: MP4 transcode of the walkthrough `.webm` + a duration modal.
- [ ] PARITY-TILT tail: a draggable 3D pitch/roll tilt gizmo handle (tilt is otherwise editable via
  the inspector sliders).
- [ ] Q-3DEXPORT tail: worker-streamed whole-scene export for very large scenes.
- [ ] C-PLANTS/DECOR tail: curated CC0 set-dressing bundles from Poly Haven / Poly Pizza.
- [ ] F11 [DEV] Pluggable brand-catalog importer beyond IKEA (licensing → dev-gate).
- [ ] F26 [DEV] Photo-to-3D room replica (vision/photogrammetry, BYO-key cloud).
- [ ] GE4 tail: "Update original" full export round-trip needs a real-env verification pass.
- [ ] X-SHOP: verify Courts/HipVan/Castlery price adapters against the live sites (built offline).

## Open — real-GPU / frontier (need a real GPU to implement+verify the pixel pass)
- [ ] F6 [PROD] WebGPU SSGI experimental Maximum-only toggle with WebGL fallback.
- [ ] PR4/R-SSAO: soft-shadow upgrade (PCSS/VSM) + contact-shadow refinement.
- [ ] R-BLEED: inter-room light-bleed directional weighting (needs geometry raycasting).
- [ ] PHOTO-* frontier: PHOTO-GLASS, PHOTO-GTAO, PHOTO-SOFTSHADOW (VSM — drei PCSS broken r182+),
  PHOTO-POM, PHOTO-SSGI-SSR (WebGPU), PHOTO-WEBGPU. See `PHOTOREALISM.md`.
- [ ] PHOTO-DENOISE nicety: swap in browser OIDN (`DennisSmolek/Denoiser`) + albedo/normal AOV.
- [ ] F1 tail: real-GPU convergence/quality pass + decide quality-tier gating of the menu entry.
- [ ] C275 tail: real-GPU check that curtain-dim frames present immediately (scene-graph intensity
  provably updates instantly; headless presents one render-burst late).
- [ ] RZ tails (real-GPU light-catch verify): RZ2 room-editor glass (`PlanRoomShell`), RZ3 edge
  bevels, RZ5 skirting-floor seam AO + painted-trim wear.

## Open — performance (need real-hardware profiling to justify)
- [ ] P2: memoization audit of hot R3F components/selectors.
- [ ] P3 tail: rotation-capable instancing for venetian-blind / drying-rack slats.
- [ ] PERF6 tail: `antialias`/`preserveDrawingBuffer` toggle needs a context recreate (flash) +
  real-GPU verify.

## Discovered — dead-code audits (2026-07-03 cycle 2)
- [ ] **`.help-list` CSS block + `helpOpen` state are orphaned**: `parts.css` `.help-list`/
  `.help-list li`/`.help-list li .icn` have zero TSX consumers, and `featuresSlice.helpOpen`/
  `setHelpOpen` have no renderer — the help/shortcuts modal they served appears removed. Verify
  nothing constructs the class dynamically, then prune CSS + state + the `lineHeight.test.ts`
  guard line for `.help-list li`.
- [ ] **`.preset-*` family in `flows.css` (22 rules) has no direct TSX consumer** — but
  `src/ui/CLAUDE.md` references `.preset-card` as live (ambient pointer-glow). Determine whether
  the classes are built dynamically or the docs are stale; prune or fix docs accordingly
  (`.preset-desc` is one of the four rules just switched to `--lh-body`).

## Process
- Keep CLAUDE.md / README.md / docs current per repo rule after each user-facing change.
- Keep this file pending-only; keep `TODO.md` (legacy deferred-work log) current.
