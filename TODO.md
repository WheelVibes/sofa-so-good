# TODO

Single source of truth for deferred work across this project. Each entry links back to the spec, plan, or file that introduced it. Removed when done.

## Render fidelity + GLTF hardening (2026-05-31)
Milestone 1 of the IKEA-grade fidelity program. Spec:
[docs/superpowers/specs/2026-05-30-render-fidelity-gltf-hardening-design.md](docs/superpowers/specs/2026-05-30-render-fidelity-gltf-hardening-design.md);
plan: [docs/superpowers/plans/2026-05-30-render-fidelity-gltf-hardening.md](docs/superpowers/plans/2026-05-30-render-fidelity-gltf-hardening.md).

- Follow-ups: verify the runtime Draco CDN fetch behind the prod reverse-proxy
  / CSP.

**Next milestone — slot-based product configurator** (mattress-on-frame,
modular sofa): base + named slots with anchor points, swappable compatible
options, live reprice. Reuses the unit-3 finish-target mechanism
([src/furniture/gltf/finishTargets.ts](src/furniture/gltf/finishTargets.ts)).

## Multi-format import: convert-to-GLB + in-browser optimize (2026-06-04)
Accept OBJ/FBX/STL/PLY/USDZ/DAE/3MF models + TGA/TIFF/BMP/EXR/HDR textures by
converting/re-encoding in-browser, and optimize every imported GLB (converted +
plain uploads). Spec:
[docs/superpowers/specs/2026-06-04-multi-format-import-conversion-design.md](docs/superpowers/specs/2026-06-04-multi-format-import-conversion-design.md);
plan:
[docs/superpowers/plans/2026-06-04-multi-format-import-conversion.md](docs/superpowers/plans/2026-06-04-multi-format-import-conversion.md).

- Deferred follow-ups (carried from the plan's honest-scope flags):
  - **Real in-browser KTX2/UASTC encoder** — currently the `ktx2` opt-in
    scaffolds the path but falls back to near-lossless WebP (no clean
    browser basis-encoder dep in this stack), mirroring `optimize_glb_lod.mjs`
    falling back when `toktx` is absent ([src/lib/ktx2encode.ts]).
  - **KTX2/DDS standalone-material decode** — needs a WebGL readback; the model
    importer handles embedded KTX2, but standalone KTX2/DDS material uploads are
    not yet decoded ([src/materials/convert/decodeImage.ts]).
  - ~~**Multi-tier `-low`/`-medium` LOD generation for uploads**~~ — **done**
    (C249/T3): `optimize/lodVariants.ts` generates both tiers in the optimize
    worker (meshopt simplify + tier texture caps), stored in IDB under
    `<assetId>:lod-<tier>` keys and tier-routed at render via the
    `gltf/lod.ts` variant registry; default-on opt-out checkbox in the upload
    dialog. KTX2-encoded textures still pass through tier variants
    un-downscaled (blocked on the decoder gap above).

## Layout / placement (2026-05-30)
Done — preset circulation is now regression-tested (`layoutPresets.test.ts`:
no tight pinch below 0.5 m between large circulation pieces; the WFH studio's
sofa↔desk squeeze was re-spaced 0.40 → 0.75 m). The in-app checker still
hints at snug 0.5–0.6 m adjacencies by design.

## Asset realism + structural audit (2026-05-30)
- The curated one-tap furniture finishes shipped (`ui/inspector/QuickFinishes.tsx`
  — oak/walnut/teak/ash/ebony/marble swatch row under the finish dropdown).
  Remaining: verify the runtime remote-material download end-to-end behind the
  prod reverse-proxy (sandbox network allowlist blocks ambientCG/Poly Haven, so
  that path is covered only by mocked unit tests) — needs a prod/staging session.

## Realism & content pass (2026-05-29)
Shipped this iteration — recorded here for follow-up polish:

Deferred follow-ups from this pass:

- **Instanced furniture meshes** — repeated primitives (chairs etc.) are many small draw calls; consider merging/instancing for scenes with hundreds of items. (Tension with per-item picking — would need an instance→item index map.)

## Furniture Catalog Expansion
Decomposed into four subsystems, each shipped independently. Brainstormed 2026-05-01.

- **Quaternius DLC pack support** — deferred from subsystem 2. Their packs are Google-Drive-folder-hosted (no programmatic single-zip download from a browser) and ship FBX/OBJ/Blend rather than GLB. Either (a) build a server-side proxy that exposes a single zip endpoint over a Drive folder + add three's `FBXLoader`, or (b) maintainer-mirror packs to a CC0-redistributable CDN with format conversion. Revisit after subsystem 4.
- **DLC pack URL drift** — Kenney's pack URL contains a content-hash directory; HEAD-validation on `Content-Length` ± 5% catches breakage. Bump the registry entry when the upstream rotates.
- **DLC pack scale curation** — Kenney's furniture-kit is unevenly scaled (most seating/storage/kitchen/lighting/bath items render at ~½ real size at scale=1; beds and the cross dining table are already correct). [src/catalog/packs/scaleHeuristic.ts](src/catalog/packs/scaleHeuristic.ts) ships a curated per-id multiplier table; install + hydrate apply it and existing installs auto-migrate on next boot. New packs need their own measured table or items will render at the wrong size.
- **Subsystem 3: Sketchfab** — REST + OAuth token + runtime fetch. Largest variety gain; auth+ToS friction. Pending.
- **Subsystem 4: Procedural furniture** — runtime mesh generation (parametric shelving, sofas, wardrobes). Largest design surface. Pending.

## Runtime CC0 Catalog
Plan: [docs/superpowers/plans/2026-05-01-runtime-cc0-catalog.md](docs/superpowers/plans/2026-05-01-runtime-cc0-catalog.md). Spec: [docs/superpowers/specs/2026-05-01-runtime-cc0-catalog-design.md](docs/superpowers/specs/2026-05-01-runtime-cc0-catalog-design.md). Active implementation in progress on this branch.

- **Runtime catalog: production CORS proxy** — ambientCG's API and CDN do not send `Access-Control-Allow-Origin` (re-verified 2026-06). Dev uses Vite's reverse proxy ([vite.config.ts](vite.config.ts) `/acg` and `/acg-cdn`); production needs an equivalent proxy (Cloudflare Worker, Vercel edge function, or hosted reverse-proxy) to re-enable ambientCG in prod. Until then ambientCG is **dev-gated** (`catalog/remote/providers/index.ts` `activeProviderIds` / `PROD_PROVIDER_IDS`) so prod only bootstraps Poly Haven, whose API + CDN send CORS and work direct.
- **Runtime catalog: Kenney support** — Kenney has no CORS-friendly API and ships single ZIPs. Add a build-time mirror (or proxy worker) before extending the runtime catalog to Kenney.
- **Runtime catalog: Quaternius support** — same rationale as Kenney.
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

## Time of Day
Spec: [docs/superpowers/specs/2026-05-01-time-of-day-design.md](docs/superpowers/specs/2026-05-01-time-of-day-design.md). Pending implementation plan.

- **Time-of-day rework — Phase 3 (realistic indoor lighting)** — partially done (2026-05-29). Procedural IBL probe ([src/scene/lighting/SceneEnvironment.tsx](src/scene/lighting/SceneEnvironment.tsx)) + real sun shadows through window cutouts shipped. **Still pending:** SSAO (tried via postprocessing but software-renderer-grainy and unverifiable on GPU — deferred) and inter-room light bleed through open doors.

Out-of-scope items deferred from the spec:

- **Time-of-day: auto-advancing in-world clock** — option C from brainstorming (accelerated day/night loop). See [time-of-day spec — Out of scope](docs/superpowers/specs/2026-05-01-time-of-day-design.md#out-of-scope).
- **Time-of-day: window glass tinting / curtains affecting shadow color** — current shadows are clear-glass equivalent. See [time-of-day spec — Out of scope](docs/superpowers/specs/2026-05-01-time-of-day-design.md#out-of-scope).
- **Time-of-day: localized per-room IBL probes** — single global environment used; per-room probes would localize bounce more accurately at the cost of additional cubemap captures. See [time-of-day spec — Out of scope](docs/superpowers/specs/2026-05-01-time-of-day-design.md#out-of-scope).
- **Time-of-day: directional weighting of door bleed** — current attenuation is uniform per traversal; orientation-aware weighting would dim bleed for doors not facing the source room's sunlit walls. See [time-of-day spec — Out of scope](docs/superpowers/specs/2026-05-01-time-of-day-design.md#out-of-scope).
- **Time-of-day: animated dusk/dawn transitions** faster than the existing 0.6 s tween. See [time-of-day spec — Out of scope](docs/superpowers/specs/2026-05-01-time-of-day-design.md#out-of-scope).
- **Time-of-day: outdoor environment beyond apartment shell** — skybox stays stylistic, no terrain/buildings. See [time-of-day spec — Out of scope](docs/superpowers/specs/2026-05-01-time-of-day-design.md#out-of-scope).
- **Time-of-day: real-time path-traced GI / RTX** — IBL + SSAO is the target; revisit only if WebGPU + path tracing becomes affordable. See [time-of-day spec — Out of scope](docs/superpowers/specs/2026-05-01-time-of-day-design.md#out-of-scope).

## Risks tracked from specs
- **Asset source URL drift** (Poly Haven / ambientCG slug versioning) — pin to stable per-asset URLs in manifest, audit periodically. See [asset-population spec — Risks](docs/superpowers/specs/2026-04-26-asset-population-design.md#risks).
- **Bbox-derived footprints can be wrong** for off-floor anchors / non-uniform scale — documented in drop-folder README; revisit if it bites users. See [asset-population spec — Risks](docs/superpowers/specs/2026-04-26-asset-population-design.md#risks).

## Process
- Update this file every time a plan is designed or work is implemented (see `MEMORY.md` feedback rule).

## Floor plan editor (2026-05-30)
Shipped — a data-driven, editable apartment shell + 2D editor. All follow-ups
done: per-room floor+wall finishes for custom plans render live in 3D (C213),
the named plan library (`savedPlans`) persists, and Smart Start / the
auto-arranger / finishes all route through the active plan (C153/C157/C213).
Multi-storey plans are now in progress (F13 / ML phases — see TASKS.md).

## IKEA model import (2026-05-31)
- **Scraper (done)** — `python/scripts/` scrapes IKEA SG products into
  per-variant-group folders (`<group>/metadata.json` + `<finish>.glb`):
  geometry/footprint + per-component GLB palette (`glb_analysis.py`), functional
  category + placement semantics (`categorize.py`), colour/finish variant groups,
  and a category-rule compatibility model + runtime resolver (`compatibility.py`).
- **LOD KTX2 upgrade (wiring done; needs the binary)** — `optimize_glb_lod.mjs`
  now takes an opt-in **`--ktx2`** flag that switches `textureCompress` to
  `targetFormat: 'ktx2'` (ETC1S colour / UASTC data maps); it detects whether
  the `toktx` binary is on PATH and falls back to WebP with a notice if not.
  **Remaining work is just installing the encoder** to actually bake the KTX2
  siblings: KTX-Software (not in apt — use the official `.deb` release or
  `brew install ktx`), **staying on the 4.3.x line** since 4.4+ replaces `toktx`
  with the unified `ktx` CLI (our detector looks for `toktx`). The app already
  decodes KTX2 (drei auto-wires it). Note KTX2/Basis encoding is seconds/texture
  vs ms for WebP — a full `--ktx2` re-run is much slower. Related: the older
  asset-pipeline KTX2 TODO under §Assets.

## Multi-format model + texture import
- **KTX2 in-browser encode (scaffold only)** — the model dialog's *Maximum
  compression (KTX2)* toggle and `optimizeGlb`'s `ktx2` option are wired, but
  `src/lib/ktx2encode.ts` is a stub (`isKtx2EncodeAvailable()` → false) so it
  always falls back to WebP. To actually emit KTX2 in-browser, integrate a
  Basis-Universal WASM encoder (e.g. the KTX-Software `libktx` wasm build or a
  basis_encoder wasm) and have `encodeKtx2` produce UASTC/ETC1S payloads;
  `KHRTextureBasisu` is already added when an encode succeeds.
- **Standalone KTX2/DDS texture upload** — `materials/convert/decodeImage.ts`
  decodes TGA/TIFF/EXR/HDR but not GPU-compressed `.ktx2`/`.dds` (those need a
  WebGL transcode/readback to get RGBA pixels). Add via the drei KTX2 transcoder
  → render-to-canvas readback if users ask for it.

## Competitive-parity upgrade (2026-06-04)
Spec: [docs/superpowers/specs/2026-06-04-competitive-parity-upgrade-design.md](docs/superpowers/specs/2026-06-04-competitive-parity-upgrade-design.md).
Shipped: render-on-demand (A1), bookshelf instancing (A2), 2D furniture layout +
2D⇄3D `P` toggle (G), Smart Start (B), live IKEA SG pricing sidecar (C),
photo-trace backdrop (F), AI floor-plan recognition (E), AI photoreal export (D).
Deferred / follow-ups:
- **Instancing (A2)** — bookshelf books (~48→9 draw calls) and now the **crib**
  (all vertical slats — both long sides + slatted short ends — collapse into one
  `InstancedBoxes` draw call instead of ~36–72 meshes) use
  `primitives/InstancedBoxes.tsx`. Other repeat-geometry primitives can adopt it
  similarly if profiling justifies it; cross-item instancing was intentionally
  avoided (conflicts with per-item material/finish/selection).
- **AI features (D/E) are bring-your-own-key + experimental** — the live calls
  need a real key and may require a CORS proxy depending on provider (handled as
  a clear error). D defaults to Replicate img2img; E to an OpenAI-compatible
  vision endpoint. No key is ever bundled. Consider a dev proxy sidecar if CORS
  blocks common providers.
- **Live pricing (C) is dev-only + IKEA-only** — add more SG retailers
  (Courts/HipVan/Castlery) as `RETAILERS` entries in `price-server.mjs`; the
  name→SKU match is fuzzy (top search hit).
