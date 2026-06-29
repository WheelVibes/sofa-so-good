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
- [ ] **MOD-PLANINSPECTOR-SPLIT** — split `ui/floorplan/PlanInspector.tsx` (~1441 ln) into sibling
  `editor/inspector/<Branch>.tsx` panels; thin dispatcher. Behaviour-preserving.
- [ ] **MOD-MOBILETOOLBAR-SPLIT** — split `ui/toolbar/MobileToolbar.tsx` (~1140 ln) into
  `toolbar/mobile/<Section>.tsx`; thin shell. Behaviour-preserving.
- [ ] RD-408 decor tail: wall-art / gallery-cluster placement (RD408-008) — the per-surface budget,
  spread/jitter, weighted variety, and hero props already ship; the wall pass is the remaining gap.
  Source: `docs/research/2026-06-19-rd408-decor-density-plan.md`.
- [ ] IO-pipeline robustness (`…import-export-pipeline-audit.md`): IO-002 (check converted GLB size
  before the optimize/LOD pass), IO-004/005 (GLB-persist blob-URL + three-object disposal on error),
  IO-006 (zip-bomb guard on decompressed payload), IO-008 (worker `messageerror`). (Shipped: IO-001
  source-size-before-decode + IO-003 revoke-in-finally v0.8.0.32; IO-009 ASCII-FBX magic + IO-010
  multi-MTL v0.8.0.33; IO-007 NaN + IO-011 CSV injection already handled.)
- [ ] SLOT configurator (`…slot-configurator-design.md`): base + named anchor slots, swappable
  compatible options, live reprice (mattress-on-frame, modular sofa).
- [ ] IXT-SUITES: remaining interaction-test scenarios (C267 harness) — AI surfaces, GLB-designer
  re-rung, crown-molding, ceilingDesign (needs walk-mode look-up), livePrices, first-run re-rungs,
  backdrop-upload + furnlight re-rungs.
- [ ] PARITY-VIDEO tail: MP4 transcode of the walkthrough `.webm` + a duration modal.
- [ ] PARITY-AILAYOUT tail: a key/brief panel beyond the ⌘K prompt + route through autoArrange for
  tidier spacing.
- [ ] PARITY-TILT tail: a 3D tilt gizmo handle + the SH3D 2D-plan tilt indicator.
- [ ] Q-3DEXPORT tail: worker-streamed whole-scene export for very large scenes.
- [ ] F4 tail: wire the HDRI selector into `capturePreset` + the A/B compare modal.
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

## Process
- Keep CLAUDE.md / README.md / docs current per repo rule after each user-facing change.
- Keep this file pending-only; keep `TODO.md` (legacy deferred-work log) current.
