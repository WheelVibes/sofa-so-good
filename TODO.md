# TODO

Single source of truth for deferred work across this project. Each entry links back to the spec, plan, or file that introduced it. Removed when done.

## Furniture Catalog Expansion

Decomposed into four subsystems, each shipped independently. Brainstormed 2026-05-01.

- ~~**Subsystem 1: Multi-provider plumbing**~~ — done. Spec: [docs/superpowers/specs/2026-05-01-multi-provider-plumbing-design.md](docs/superpowers/specs/2026-05-01-multi-provider-plumbing-design.md). Plan: [docs/superpowers/plans/2026-05-01-multi-provider-plumbing.md](docs/superpowers/plans/2026-05-01-multi-provider-plumbing.md).
- **Subsystem 2: DLC packs** — opt-in installable CC0 packs (Quaternius Ultimate Interiors v1, Kenney follow-up). Streaming download + in-app notifications + IDB cache + per-entry thumbnail generation. Spec: [docs/superpowers/specs/2026-05-01-dlc-packs-design.md](docs/superpowers/specs/2026-05-01-dlc-packs-design.md). Plan pending.
- **Subsystem 3: Sketchfab** — REST + OAuth token + runtime fetch. Largest variety gain; auth+ToS friction. Pending.
- **Subsystem 4: Procedural furniture** — runtime mesh generation (parametric shelving, sofas, wardrobes). Largest design surface. Pending.

## Runtime CC0 Catalog

Plan: [docs/superpowers/plans/2026-05-01-runtime-cc0-catalog.md](docs/superpowers/plans/2026-05-01-runtime-cc0-catalog.md). Spec: [docs/superpowers/specs/2026-05-01-runtime-cc0-catalog-design.md](docs/superpowers/specs/2026-05-01-runtime-cc0-catalog-design.md). Active implementation in progress on this branch.

- **Runtime catalog: production CORS proxy** — ambientCG's API and CDN do not send `Access-Control-Allow-Origin`. Dev uses Vite's reverse proxy ([vite.config.ts](vite.config.ts) `/acg` and `/acg-cdn`); production needs an equivalent proxy (Cloudflare Worker, Vercel edge function, or hosted reverse-proxy) before the build is deployable with the runtime catalog enabled. Poly Haven's API and CDN do send CORS — they work direct.
- **Runtime catalog: Kenney support** — Kenney has no CORS-friendly API and ships single ZIPs. Add a build-time mirror (or proxy worker) before extending the runtime catalog to Kenney.
- **Runtime catalog: Quaternius support** — same rationale as Kenney.
- **Runtime catalog: per-asset bytes estimate** — surface Poly Haven file sizes on cards before clicking so users can avoid 50 MB downloads.
- **Runtime catalog: HDRI environment** — reconsider when scene lighting is exposed.

## Assets

- **Poly Haven model fetcher** — Poly Haven serves models as multi-file gltf+bin+textures bundles, not single GLBs. Need a pipeline path that downloads the .gltf + .bin + referenced textures, then repacks via gltf-transform's `NodeIO` into a self-contained .glb. v1 furniture manifest ships empty until this lands. See [asset-population plan Task 14](docs/superpowers/plans/2026-04-26-asset-population.md).
- **Kenney bundle extraction** — Kenney's furniture kit ships as a single archive, not per-file GLBs. Add an extract-from-zip step (or host per-file mirrors) before adding Kenney entries to the manifest. See [asset-population plan Task 14](docs/superpowers/plans/2026-04-26-asset-population.md).
- **KTX2 texture compression** — `@gltf-transform/functions`'s `textureCompress` lacks a bundled KTX2 encoder; current pipeline ships JPG/PNG at 2K. To get the KTX2 size/VRAM benefit promised in the spec, integrate `@gltf-transform/cli` (which ships `toktx`) or a standalone `basisu` binary. See [scripts/asset-pipeline/process-texture.ts](scripts/asset-pipeline/process-texture.ts).
- **Drop-folder material auto-detection** — current indexer skips material folders without a sidecar. A future improvement could infer channels from filenames (`*_diff.*`, `*_nor.*`, etc.) like the Poly Haven naming convention. See [scripts/asset-pipeline/index-assets.ts](scripts/asset-pipeline/index-assets.ts).
- **Standard asset set (~80 assets, ~120 MB)** — manifest schema already supports it; expand when v1 Starter set is in production. See [asset-population spec](docs/superpowers/specs/2026-04-26-asset-population-design.md#v1-contents-starter-25-assets-30-mb-target).
- **Per-LOD texture variants** — for performance on lower-end devices. See [asset-population spec — Out of scope](docs/superpowers/specs/2026-04-26-asset-population-design.md#out-of-scope-for-this-spec).
- **Lazy-loading / streaming individual GLBs** — current approach bundles refs at build; revisit if total bundle size becomes a problem. See [asset-population spec — Out of scope](docs/superpowers/specs/2026-04-26-asset-population-design.md#out-of-scope-for-this-spec).
- **Quaternius pack inclusion** — manifest source enum already admits `quaternius`; add concrete entries when expanding past Starter.
- **`builtinCatalog.ts` solid-swatch entries for floor textures** — once the texture pipeline is exercised end-to-end, the eight solid-swatch entries (`floor-wood-oak`, `floor-wood-walnut`, etc.) can be deleted; the generated catalog will provide textured equivalents under the same ids. See [src/materials/builtinCatalog.ts](src/materials/builtinCatalog.ts).

## Editor / Selection

- **Multi-select rotate** — `R` rotates only the primary selection. Decide whether group rotate spins around the group centroid or each item in place, then extend the onKey handler. See [src/App.tsx](src/App.tsx).
- **Inspector for multi-selection** — currently shows the primary item only. Could show a "N items selected" placeholder with bulk actions (delete all, clear). See [src/ui/inspector/InspectorPanel.tsx](src/ui/inspector/InspectorPanel.tsx).
- **Marquee strictness** — selection is membership-by-centre; partial-overlap (Lasso-style) may be preferred for large items. Revisit if users complain. See [src/scene/selection/MarqueeSelector.tsx](src/scene/selection/MarqueeSelector.tsx).

## UI

- **Finishes browse: filter by category** — `RemoteBrowseTab` shows all materials; could narrow by floor-vs-wall heuristics from tags. See [src/ui/FinishPicker.tsx](src/ui/FinishPicker.tsx) and [finishes-browse spec](docs/superpowers/specs/2026-05-01-finishes-browse-design.md).
- **Persist last-edited surface** across sessions for the finishes browse → resolve flow. See [finishes-browse spec — Out of scope](docs/superpowers/specs/2026-05-01-finishes-browse-design.md#out-of-scope).

## Time of Day

Spec: [docs/superpowers/specs/2026-05-01-time-of-day-design.md](docs/superpowers/specs/2026-05-01-time-of-day-design.md). Pending implementation plan.

- **Time-of-day rework** — replace the discrete `day/dusk/night` enum with a `system | manual` mode + fractional `manualHour`, four named presets (Morning/Noon/Dusk/Night), and a Custom time input in a new toolbar dropdown. Lighting and Sky interpolate between hour-keyed keyframes. Includes save-format migration.

## Risks tracked from specs

- **Asset source URL drift** (Poly Haven / ambientCG slug versioning) — pin to stable per-asset URLs in manifest, audit periodically. See [asset-population spec — Risks](docs/superpowers/specs/2026-04-26-asset-population-design.md#risks).
- **Bbox-derived footprints can be wrong** for off-floor anchors / non-uniform scale — documented in drop-folder README; revisit if it bites users. See [asset-population spec — Risks](docs/superpowers/specs/2026-04-26-asset-population-design.md#risks).

## Process

- Update this file every time a plan is designed or work is implemented (see `MEMORY.md` feedback rule).
