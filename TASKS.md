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
shipped is recorded there), then pick the next item (highest priority first). Use parallel worktree
subagents for independent slices (each runs its OWN dev server on a unique port ≥5208, never
`pkill -f vite`); cherry-pick their commits, re-run gates, push.

**Prioritization:** (1) correctness/security → (2) reliability/edge-cases + mobile parity →
(3) performance/memory → (4) realism + high-value features → (5) QOL/aesthetic polish.

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
- [ ] C-PLANTS/DECOR + F9 [PROD] Curated CC0 decor/plant/styling bundles (Poly Haven/Poly Pizza)
  so designs look styled; ensure category coverage is exhaustive.
- [ ] F11 [DEV] Pluggable brand-catalog importer beyond IKEA (licensing → dev-gate).

## Productivity / QOL
- [~] IXT-SUITES (user rule, 2026-06-12): build interaction-test scenarios (simple → complex per
  feature, incl. cross-feature journeys like onboarding→tour→location) for every EXISTING feature
  using the C267 harness; work down the `FEATURE_FLAGS` list in priority order.
  Covered: batch 1 (C269) Simple core loop — catalog/furnish, finishes, budget, share,
  view-modes; batch 2 (C272) pro analytical — drawings/lighting, versions, history, panoTour,
  renderCompare. Remaining: measure, clearanceChecks, smartStart, AI surfaces, roomEditor,
  multiStorey, GLB designer/parametric re-rungs, crown-molding, livePrices, first-run re-rungs.
- [ ] Q-3DEXPORT Whole-scene glTF/GLB + USDZ (AR) export — needs worker-streamed export + real-GPU
  verify (a previous GLTFExporter prototype was reverted as unverifiable headless).
- [ ] F22 [PROD] Mobile AR "view in your room" (`<model-viewer>` Quick Look/Scene Viewer);
  depends on Q-3DEXPORT for the item GLB/USDZ.
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

## Codebase analysis batch (2026-06-13, branch …-4ijn0x) — verified findings

### Security (verified real)
- [ ] SEC1: pre-decode pixel-dimension cap in `materials/convert/decodeImage.ts` — the
  `MAX_IMAGE_DIM` check runs AFTER full RGBA decode, so a small file declaring 30000² OOM-
  crashes the tab (decompression-bomb DoS). Reject `w*h > cap²` before alloc for TGA/TIFF/
  EXR/HDR + native bitmap.
- [ ] SEC2: `ui/report.ts` `heroDataUrl` interpolated into `<img src>` with no `^data:image/`
  prefix check (defense-in-depth; mirror `moodboard.ts` `renderHero`).

### Reliability / data-integrity (verified real)
- [ ] REL1: guard non-finite (NaN/Infinity) transforms+numeric props on `.sofa.json` import
  (`storage/designFile.ts` — zod `z.number()` admits NaN) and on `addItem`/`moveItem`/
  `updateItemProps`; `schema.applySerialized` already drops them on share-link load.

### Realism (pure-code, prod-safe — most users see the flat Performance tier)
- [ ] RZ1: always-on cheap contact shadows on Performance tier (grounding) — highest visual
  payoff; one shared blob texture + plane-per-item, transparent overdraw only.
- [ ] RZ2: window glass realism — emissive sky-catch on Perf/Medium, `getGlassMaterial`
  transmission on High+ (`apartment/Window.tsx`, half-built in `materialRealism.ts`).
- [ ] RZ3: beveled edges (`RoundedBox`) on hard furniture primitives (tables/cabinets/shelves).
- [ ] RZ4: procedural roughness micro-detail + grout aging on wood/tile/marble generators.
- [ ] RZ5: skirting/baseboard seam AO + painted-trim wear (close-up/walk realism).
- [ ] RZ6: upholstery seam stitching + seeded fabric-wrinkle variation on sofas/chairs.
- [ ] RZ7: PCF/penumbra shadow softening on Medium+ tiers.

### Code quality
- [~] CQ1: dead-code sweep (autoArrange chair `half` removed this batch — keep scanning).

## Process
- Keep CLAUDE.md / README.md / docs current per repo rule after each user-facing change.
- Run `npm test` + `tsc` + `biome` before each commit; visual-verify app-facing changes.
- Keep this file pending-only (see policy above); keep `TODO.md` (legacy deferred-work log) current.

Competitor-research sources: capterra.com/compare Planner-5D-vs-Coohom;
coohom.com/article best-online-room-planner-2026; saasworthy.com Planner-5D.
