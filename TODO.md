# TODO

Deferred-work log — **open items only**. `CHANGELOG.md` is the source of truth for what shipped;
when an item ships it is **removed from this file entirely**. Maintainability refactors live in
`TASKS.md`.

> Direction (user, 2026-07-01): prioritise the **core interior-design loop + its UX,
> discoverability, customizability** (furnish, arrange, finish, view) on desktop **and** mobile,
> researching `REFERENCES.md`; then reliability/edge-cases, a11y, and test-coverage hardening.
> Avoid pricing/quotes/analytics deliverables unless asked.

## Active — asset pipeline (2026-07-02, user goal)
See `docs/research/2026-07-02-local-asset-db-and-scraper-plan.md` for the full design.
- **Local dev asset DB (Part 1, in progress).** Drop GLBs in `local-assets/` → auto-loaded into
  the catalog with NO upload pipeline (convert/optimize/IDB). Dev-only Vite plugin
  (`scripts/vite-local-assets.mjs`) serving `/@local-assets/*`, `localAssets` devOnly flag,
  `localAssetsSlice` (`bootstrapLocalAssets`), `LocalGltfDef` source, merged in `catalog.ts`.
- **Upload parallelization (Part 1b).** Replace the single optimize Worker
  (`optimize/runOptimize.ts`) with a worker POOL (biggest bulk-import win); then move `convertModel`
  off the main thread; early GLB size-cap check before optimize (IO-002).
- **Scrapers (Part 3).** `research/scrapers/` has 35 working scrapers with complete enumeration;
  finalized tiering in the plan doc. Next: run Tier-1 CC0 scrapers into `local-assets/` (pairs with
  Part 1), then surface Poly Haven models in prod (`remoteFurniture` flag).

## Active — UI/UX polish program (2026-07-02, user goal; from Vi-develop comparative analysis)
39 improvements identified by a systematic analysis of `~/projects/datature/Vi-develop` (motion,
magicui, Tailwind spacing, readability, discoverability) mapped onto our token system. Strategy:
graft Vi's motion vocabulary + micro-interaction polish + feedback patterns onto the existing
OKLch token system (NOT a Tailwind/Blueprint migration). Remove items as they ship (→ CHANGELOG).
- [ ] **P31 Determinate upload progress bar** — deferred: blocked on the upload-progress branch
  merging; then add a regression test locking that startBackgroundImport feeds the toast's 0-1 bar
  and the "X / Y" text from one coalesced counter.

### Batch 2 — medium (1–3 days each)

- [ ] **P3 Desktop panel slide animation** — animate `--right-rail` width + panel slide-in
  (240–300ms easeOutExpo) to match mobile `sheetUp` parity.

- [ ] **P9 Purge hardcoded px from React inline styles** — map `padding:'2px 6px'`, `fontSize:16`
  etc. (ElevationPanel, RenderCompareModal, LocationPrompt, FinishPicker, …) to `--s-N`/`--t-N`;
  add a grep/lint script to block regressions.
- [ ] **P10 Panel width tokens** — `--panel-w`/`--panel-w-compact` replacing 326/300/312px +
  hand-tuned tablet variants.

- [ ] **P15 `<Button>` primitive** — typed component (variant/size/icon/loading) over the existing
  `.btn-*` vocabulary (CVA-style, kills padding/size drift).
- [ ] **P16 Button pending state** — `loading` prop: inline spinner, pointer-events none, dimmed.
- [ ] **P17 Skeleton loader primitive** — `.skeleton` shimmer (reduced-motion → static pulse) that
  mirrors final layout; catalog images, inspector thumbs, version/preset cards.

- [ ] **P28 Empty-state CTA sweep** — every empty state gets icon + title + description + one CTA
  (no dead ends).

- [ ] **P5 Success/confirm micro-animations** — toast checkmark scale-in, EditConfirmBar dismiss
  slide/shake, SVG stroke-draw checks.
- [ ] **P34 Optimistic placement feedback** — immediate ghost placement + reconcile for drops/AI
  arrange.
- [ ] **P35 Destructive confirmation policy** — reversible → Undo-toast; irreversible → confirm
  modal; document + enforce.

### Batch 3 — larger (~1 week each)
- [ ] **P6 Screen-transition crossfade** — 200–300ms fade between 3D view ↔ floor plan ↔ walk mode.
- [ ] **P7 Token-based magicui adaptations** (flag-gated, GPU-tier-gated, reduced-motion-safe):
  shine/border-beam on in-progress HQ-render card (CSS `offset-path`); mouse-follow radial
  gradient on catalog/preset cards (CSS vars + pointermove); richer staggered multi-circle pulse
  for edit-room hotspot; toolbar dock magnification (spring mass .1 / stiffness 150 / damping 12).
- [ ] **P18 Missing primitives** — Accordion/Disclosure (unify layers groups + FinishPicker
  `<details>`), Slider-with-value, tonal/dot Badge variants, Breadcrumb (Room → Wall → Surface),
  ButtonGroup for modal footers.
- [ ] **P25 Progressive-disclosure info callouts** — dismissible, localStorage-persisted hint
  banners for edit-room / floor-plan editor / walk mode.
- [ ] **P26 Simple→Pro upsell affordance** — flag-gated dimmed entries + Pro badge / ⌘K hint so
  casual users learn Pro exists (test both modes).
- [ ] **P27 "New" feature badges** — `.nub` pulsing dot on newly shipped toolbar/menu entries,
  dismissed on first use, per-flag.
- [ ] **P29 In-panel search** — layers + history search fields (catalog already has one).
- [ ] **P32 Live notification cards** — progress toast clickable to jump to result, updates
  in place, error state swaps in with Retry.
- [ ] **P37 List virtualization** — history/layers/catalog results >100 items
  (`@tanstack/react-virtual`).
- [ ] **P38 Density mode** — `data-density` comfortable/compact scaling row paddings via tokens
  (Pro-tier flag).
- [ ] **P39 Persisted panel state** — open panels/dock sides/collapsed layer groups survive reload.

Rules: every user-facing feature above needs a `FEATURE_FLAGS` entry + tier + both-modes tests;
pure-CSS polish (focus ring, spacing, typography) is not a feature. Ambient loops must be
tier-gated/paused off-screen. No hardcoded colours — all effects rebuilt on tokens.

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
- **`livePrices` IXT scenario** — deferred (user, 2026-06-30): dev-only + network/sidecar-bound
  (lower value), and a headless scenario would need a new dev-only `window.__priceSidecarStub` lever
  in `livePrice.ts` purely for the test. Unit coverage already exercises the client logic; revisit
  only if the sidecar path regresses.
- **Fast rasterized "preview render" tier** (Coohom parity) — a local analog to the 10-s cloud
  render. Deferred as an analytics/deliverable, not core design UX.

## Open — core interactions
- **More composite footprints (round/oval tables).** `footprintParts` is a **union** of OBBs (can
  only *add* area), so it can't carve corners off a square to make an octagon/disc. A round-table
  approx needs either a new *intersection*/polygon footprint primitive, or a coarse cross of
  inscribed rects (leaves diagonal gaps). Low priority + needs a design decision. (No U-sofa /
  corner desk / peninsula in the catalog today.)
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

## Process
- Update this file whenever work is planned/deferred; remove items entirely once shipped (they live
  in `CHANGELOG.md`).
