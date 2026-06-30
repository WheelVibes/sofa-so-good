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
- ~~In-engine one-tap style transfer~~ — **shipped v0.9.0.5** (`styleTransfer` flag; pure
  `ui/styling/styleTransfer.ts` 5 presets + `finishesSlice.applyHomeStyle`; `ui/StyleTransferModal.tsx`).
  See `CHANGELOG.md`. **Next up: style/personality quiz onboarding.**
- **Style/personality quiz onboarding** (consumer-parity) — a short 3–4 question quiz → a style preset
  that seeds Smart Start. Builds on the style defs above. Pure scoring fn (answers → style) is
  unit-testable; scenario drives the quiz → asserts the seeded style. M.
- **Fast rasterized "preview render" tier** (Coohom M) — a high-quality single-frame raster capture as
  the local analog to the 10-s cloud render (reuses `scene/captureCanvas`). Mostly a quality/post
  preset + export; GPU-look fidelity is only partly verifiable headless, so verify the capture/export
  wiring + flag gating. M.

## Process
- Update this file every time a plan is designed or work is implemented (MEMORY.md feedback rule).
