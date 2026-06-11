# TASKS — autonomous improvement backlog (OPEN ITEMS ONLY)

Working branch: `claude/codebase-analysis-optimization-ny3xm9` (previous batches merged via PR #24).
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
shipped is recorded there), then pick the next item (highest priority first). Use parallel worktree
subagents for independent slices (each runs its OWN dev server on a unique port ≥5208, never
`pkill -f vite`); cherry-pick their commits, re-run gates, push.

**Prioritization:** (1) correctness/security → (2) reliability/edge-cases + mobile parity →
(3) performance/memory → (4) realism + high-value features → (5) QOL/aesthetic polish.

---

## Multi-storey remnants (F13 core shipped C221–C235 — see CHANGELOG)

## Competitor research 2026-06 (sources: coohom.com/article Planner5D-alternative · capterra.com
## compare 164022-192882 · spacesbydee.com coohom-vs-planner-5d · plansnapper.com compare)
- [ ] P-720 tail (optional): embed tours in share links/presentation; plan-based stop placement
  UI; persist captured images in IDB to skip re-capture; per-stop initial yaw facing room centre.
- [ ] COLLAB-STRUCT: structured collaboration (projects/teams) is Coohom's enterprise edge —
  backend-dependent; revisit if/when a backend exists.

## Realism & rendering
- [~] F1 (C238/C240/C243): HQ render + DoF + denoise shipped. TAIL: real-GPU convergence/quality
  pass + decide quality-tier gating of the menu entry.
- [ ] F3/R-HDRI [PROD] HDRI environment library (Poly Haven CC0 `.hdr`) for IBL + backdrop.
  Sandbox can't fetch — wire + dev-verify; CC0 so prod-ok.
- [ ] F4 tail: A/B compare between two render presets, and HDRI coupling once F3 lands.
- [ ] F6 [PROD] WebGPU SSGI experimental Maximum-only toggle with WebGL fallback.
- [ ] PR4/R-SSAO Soft-shadow upgrade (PCSS/VSM) + contact-shadow refinement; needs real GPU.
- [ ] R-CURTAIN/L1 Window-glass tint colouring the sun shaft + curtains affecting cast light +
  inter-room light bleed. Perf-sensitive multi-file scene change.
- [~] PR6 tail: default common furniture finishes to local CC0 `mat:<id>` (needs
  `FurnitureMaterialLoader` pre-build + per-furniture UV scale) + optional Performance env hint.

## Content & catalog
- [~] PF1 (TODO.md subsystem 4 v1): parametric furniture generator — dimension-driven
  bookshelf/wardrobe/sideboard with live preview + catalog persistence. (in flight, worktree agent)
- [ ] C-PLANTS/DECOR + F9 [PROD] Curated CC0 decor/plant/styling bundles (Poly Haven/Poly Pizza)
  so designs look styled; ensure category coverage is exhaustive.
- [ ] F11 [DEV] Pluggable brand-catalog importer beyond IKEA (licensing → dev-gate).
- [~] T2 Crown-molding revisit + kitchen/bath template polish.

## Productivity / QOL
- [ ] Q-3DEXPORT Whole-scene glTF/GLB + USDZ (AR) export — needs worker-streamed export + real-GPU
  verify (a previous GLTFExporter prototype was reverted as unverifiable headless).
- [ ] F22 [PROD] Mobile AR "view in your room" (`<model-viewer>` Quick Look/Scene Viewer);
  depends on Q-3DEXPORT for the item GLB/USDZ.
- [~] F21 (C247): WebXR entry + inert provider shipped; controller locomotion + real-headset pass open.
- [ ] Q31 tail (optional): transient drop-target highlight during dragover (skipped in C251 —
  needs an artifact-free approach under frameloop=demand); custom-plan overview wall drops no-op.
- [~] GE3c GLB designer: per-part texture pick. (in flight, worktree agent)
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
- [ ] PERF9 tail: drop procedural textures to 256² where quality allows / OffscreenCanvas worker.
- [~] LP5 tail: 3D lux coverage overlay on the floor. (in flight, worktree agent)

## Process
- Keep CLAUDE.md / README.md / docs current per repo rule after each user-facing change.
- Run `npm test` + `tsc` + `biome` before each commit; visual-verify app-facing changes.
- Keep this file pending-only (see policy above); keep `TODO.md` (legacy deferred-work log) current.

Competitor-research sources: capterra.com/compare Planner-5D-vs-Coohom;
coohom.com/article best-online-room-planner-2026; saasworthy.com Planner-5D.
