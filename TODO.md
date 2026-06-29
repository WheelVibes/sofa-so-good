# TODO

Legacy deferred-work log. **`CHANGELOG.md` is the source of truth for what shipped** — when an
item ships it is removed from here entirely. Only genuinely-open work remains below; the bulk of
this file's historical audit-wave / reconciliation content has been pruned (it all shipped).

## Maintainability (debt — CLAUDE.md "no monolithic files")
- [ ] **MOD-PLANINSPECTOR-SPLIT** — `ui/floorplan/PlanInspector.tsx` (~1348 lines). Extract
  wall/room/opening/notes-dimension branches into sibling `editor/inspector/<Branch>.tsx` panels;
  keep `PlanInspector` a thin dispatcher (proven `PathArraySection`/`PlanFurnitureInspector`
  pattern). Behaviour-preserving — existing scenarios green + tsc/biome.
- [ ] **MOD-MOBILETOOLBAR-SPLIT** — `ui/toolbar/MobileToolbar.tsx` (~1204 lines). Extract
  per-section detail-pane renderers into `toolbar/mobile/<Section>.tsx`; keep the rail/sheet shell
  thin. Behaviour-preserving — mobile scenario parity + tsc/biome.

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

## Process
- Update this file every time a plan is designed or work is implemented (MEMORY.md feedback rule).
