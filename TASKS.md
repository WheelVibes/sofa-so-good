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
- [ ] PHOTO-DETAIL: set-dressing prop pack (books/cushions/plants — biggest perceived-realism lever)
  + edge bevels (RoundedBox) on hard primitives.
- [ ] PHOTO-EMISSIVE tail: real-GPU pass to tune the bloom look on High/Max for the boosted fixtures
  (intensities now clear the 1.05 threshold; the flat-tier self-lit read is verified, the bloom amount
  needs a GPU eye). Base wiring shipped — see CHANGELOG.
- [ ] PHOTO-GLASS / PHOTO-GTAO / PHOTO-SOFTSHADOW (VSM, NOT drei PCSS — broken r182+) / PHOTO-POM /
  PHOTO-SSGI-SSR (WebGPU) / PHOTO-WEBGPU — see PHOTOREALISM.md (mostly real-GPU/frontier).

### Pending — quick wins (S)
- [ ] PARITY-NORTH: SH3D North/compass widget on the canvas (rotatable, tied to sun azimuth). (Walk
  FOV/eye-height controls shipped — see CHANGELOG PARITY-WALKCAM.)
- [ ] PARITY-BATCHRENDER: SH3D batch-render all saved views.
- [ ] PARITY-PLUMBING: Coohom plumbing plan layer (mirror `electricalPlan`).
- [ ] PARITY-WALLOPS: SH3D wall split/join/reverse commands in the 2D editor.
- [~] PARITY-LEVELOPS: **duplicate-level shipped** (`duplicateLevel` clones a storey's geometry +
  furniture + finishes with fresh ids; ⧉ Duplicate in LevelTabs). Remaining: SH3D "show all levels
  (dimmed)" underlay in the 2D editor.
- [ ] PARITY-LIGHTINGTEMPLATE-TEXT: Coohom drawing text/material callouts + layer toggles.

### Pending — high value (M)
- [ ] PARITY-SEARCH: Coohom smart/semantic catalog search (tag/fuzzy over catalog + packs).
- [ ] PARITY-AR: Coohom AR "view in your room" (`<model-viewer>`/WebXR on a GLB export; needs Q-3DEXPORT).
- [ ] PARITY-DENOISE: Coohom render denoiser (OIDN-wasm/bilateral post-pass on HQ render). [real-GPU verify]
- [ ] PARITY-8K: Coohom 8K+ tiled still render.
- [ ] PARITY-SLOPECEIL: SH3D sloping ceilings (per-room ceiling slope).
- [ ] PARITY-SLANTWALL: SH3D slanting walls (per-endpoint top heights).
- [ ] PARITY-BASEBOARD: SH3D per-wall baseboard params + finish.
- [ ] PARITY-FURNLIGHT: SH3D furniture-as-light-source params feeding the render.
- [ ] PARITY-QUOTE-XLSX: Coohom quote Excel/CSV export + editable templates.
- [ ] PARITY-DIMTEXT: SH3D first-class dimension-line + on-plan text objects.

### Pending — marquee (L)
- [ ] PARITY-VIDEO: video flythrough export (camera path → WebM/MP4 via MediaRecorder). [real-GPU verify]
- [ ] PARITY-CURVEDWALL: SH3D curved/arc walls.
- [ ] PARITY-AILAYOUT: Coohom AI auto-layout/auto-furnish (LLM → autoArrange). [BYO-key]
- [ ] PARITY-3DEXPORT: whole-scene OBJ/glTF/STL export (Q-3DEXPORT).

## Codebase analysis batch (2026-06-13, branch …-4ijn0x) — verified findings

### Reliability / data-integrity
- REL1 — RESOLVED as already-covered: `schema.applySerialized` drops non-finite transforms on
  BOTH share-link and `.sofa.json` load, and `parametric/spec.ts clampSpec` (`num()`+`clamp`)
  sanitizes NaN props → defaults → envelopes. Placed parametric items bake to GLB defs, so no
  runtime numeric-prop NaN path. No redundant guards added (would mask real bugs).

### Realism (pure-code, prod-safe — most users see the flat Performance tier)
- [ ] RZ1: always-on cheap contact shadows on Performance tier (grounding) — highest visual
  payoff; one shared blob texture + plane-per-item, transparent overdraw only.
- [~] RZ2: window glass realism — **emissive sky-catch shipped** (all tiers; `glassSkyCatchIntensity`
  in `materialRealism.ts`, wired into `apartment/Window.tsx`). Tail: apply to `PlanRoomShell` glass
  (custom plans, needs the daylight signal) + wire `getGlassMaterial`/`glassConfig` transmission on
  High+ (real-GPU verify).
- [~] RZ3/PHOTO-BEVELS: beveled edges via shared `BeveledBox` helper — tables/desk +
  freestanding case goods done (CoffeeTable/DiningTable/ConsoleTable/Desk/Sideboard/Dresser/TVConsole/
  Nightstand). Remaining: panel/shelf-built units (Bookshelf/Wardrobe/cabinet modules) + appliances;
  edge light-catch real-GPU-pending.
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
