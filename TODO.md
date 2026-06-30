# TODO

Legacy deferred-work log. **`CHANGELOG.md` is the source of truth for what shipped** — when an
item ships it is removed from here entirely. Only genuinely-open work remains below; the bulk of
this file's historical audit-wave / reconciliation content has been pruned (it all shipped).

> **Maintainability refactors** (MOD-PLANINSPECTOR-SPLIT, MOD-MOBILETOOLBAR-SPLIT) are tracked in
> `TASKS.md` under "Open — client-doable".

## ⛔ Production-infra-blocked — need a DEPLOYED host/backend, not app code
The dev paths already work (Vite reverse proxy, dev-gated providers); only the *production*
proxy/mirror/host is missing, and standing one up is a deployment task, not a code change here:
- **Runtime catalog CORS proxy** (ambientCG prod) — ambientCG's API/CDN send no CORS headers; prod
  needs a Cloudflare Worker / Vercel edge / hosted reverse-proxy. Until then ambientCG is dev-gated
  (Poly Haven works direct in prod).
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

## Proactive-research candidates — client-feasible + headless-verifiable (2026-06-30 audit)
Vetted next-iteration targets surfaced when the active backlog proved thin/GPU-or-backend-blocked.
Each is pure-client, unit/scenario-verifiable without a real GPU or network, and value-ranked.
Confirmed NOT already shipped at audit time (grep-checked); re-confirm before starting.
- **Toast auto-dismiss pause-on-hover/focus** (a11y, WCAG 2.2.1 "enough time"): `NotificationContainer`
  currently schedules dismissal purely from `createdAt`, so a toast can vanish mid-read. Track a
  paused-id set + per-toast remaining-ms ref; clear on `mouseenter`/`focusin`, resume on
  `mouseleave`/`focusout`. Unit-test with fake timers (pause stops the clock; resume uses remaining).
- **`livePrices` IXT scenario** — **DEFERRED (user, 2026-06-30).** The feature is dev-only +
  network/sidecar-bound (lower user value), and a headless scenario would need a new dev-only
  `window.__priceSidecarStub` lever in `livePrice.ts` purely for the test. The unit-level coverage
  added in v0.9.0.2 already exercises the client logic; revisit only if the sidecar path regresses.
- ~~Shareable "design card"~~ — **already shipped** as the **moodboard** (F19, `ui/moodboard.ts` +
  `openMoodboard.ts`; flag `moodboard` "Shareable style-board export"): hero snapshot + palette +
  materials strip + furniture tiles → print/share HTML. Not a gap.
- ~~Before/after staging reveal~~ — **shipped v0.9.0.4** (`stagingReveal` flag; `ui/staging/stagingReveal.ts`
  + `ui/StagingRevealModal.tsx`; empty room vs furnished on a divider slider). See `CHANGELOG.md`.

_First 2026-06-30 batch resolved (2 shipped, 1 deferred, 1 was already-shipped)._

### Next batch (2026-06-30, grep-confirmed unbuilt; value-ranked)
- ~~In-engine one-tap style transfer~~ — **shipped v0.9.0.5** (`styleTransfer`). See `CHANGELOG.md`.
- ~~Style/personality quiz~~ — **shipped v0.9.0.6** (`styleQuiz` flag; pure `ui/styling/styleQuiz.ts`
  `scoreQuiz` + `ui/StyleQuizModal.tsx`; recommends + applies a `STYLE_PRESETS` look). _Tail: deeper
  Smart Start integration (seed the wizard from the quiz result) remains optional._ See `CHANGELOG.md`.
- ~~Configurable price-rule library~~ — **shipped v0.9.0.8** (`priceRules` flag;
  `analysis/renovationCost.ts` `PriceRules`; editor in `QuoteTemplateModal`). Closed parity gap M#2.
- **Fast rasterized "preview render" tier** (Coohom M) — local analog to the 10-s cloud render.
  Deferred under the direction change below (it's an analytics/deliverable, not core design UX).

## ⭐ DIRECTION CHANGE (2026-07-01, user) — focus on CORE INTERIOR-DESIGN UX
> "Instead of price and quotes, focus **solely on the core interior-design aspects and interactions**
> that make a good interior-design tool. Make it more **user-friendly, intuitive, easy to use,
> discoverable, customizable**, following modern UI/UX & design principles, curated for **both desktop
> and mobile**. Research the tools in `REFERENCES.md` for inspiration + best practices."

Next iterations target **the core design loop + its UX/discoverability/customizability** (furnish,
arrange, finish, view) on desktop **and** mobile — NOT pricing/quotes/analytics deliverables. Research
`REFERENCES.md` (Coohom, Planner 5D, IKEA Kreativ, Sweet Home 3D, …) before designing each change.

### Deeper core interactions (user 2026-07-01 #2: "granular collision, animations, realistic physics")
- ~~Granular shape-aware collision~~ — **shipped v0.9.0.9** (`footprintParts` convex decomposition +
  `itemFootprintParts`; any-part-vs-any-part SAT; L-sofa main-run+chaise). Infra reusable.
- **More composite footprints** — apply `footprintParts` to other non-rectangular pieces.
  Done: L-sofa (v0.9.0.9), corner base cabinet (v0.9.0.10). Remaining candidates: round/oval
  tables (octagon approximation — convex, low priority), and any future U-sofa / corner desk /
  peninsula (none in the catalog today). Each just needs a decomposition + a test. S (incremental).
- **Animations** — door/drawer open-close easing (some exists: curtains/blinds ease in demand mode),
  smooth placement "drop-in" + selection transitions, eased camera moves between saved views. Mostly
  pure state→transition; verify state transitions headless, smoothness by eye. M.
- **Realistic physics (light touch)** — gravity-settle on drop (rest on the surface below — partial via
  `surfaceDrop.ts`), drag inertia/easing, soft collision nudge (push-apart) rather than hard block.
  Scope carefully: a design tool wants *predictable* placement, so physics must aid, not fight, the
  user. Pure math core = verifiable; keep it opt-in/subtle. L.

> Audit note (2026-07-01): the core loop is already mature — align/distribute, apply-finish-to-all-rooms,
> numeric+90° rotate, saved cameras, smart-guides, height-aware collision all exist. The remaining soft
> spot is **discoverability** (silent synonym search, no keyboard/gesture cheat-sheet, one-time-only
> onboarding). Candidates for a later UX pass, lower priority than the deeper-interaction work above.

## Process
- Update this file every time a plan is designed or work is implemented (MEMORY.md feedback rule).
