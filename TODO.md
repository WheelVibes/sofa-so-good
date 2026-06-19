# TODO

Single source of truth for deferred work across this project. Each entry links back to the spec, plan, or file that introduced it. Removed when done.


## Render fidelity + GLTF hardening (2026-05-31)
Milestone 1 of the IKEA-grade fidelity program. Spec:
[docs/superpowers/specs/2026-05-30-render-fidelity-gltf-hardening-design.md](docs/superpowers/specs/2026-05-30-render-fidelity-gltf-hardening-design.md);
plan: [docs/superpowers/plans/2026-05-30-render-fidelity-gltf-hardening.md](docs/superpowers/plans/2026-05-30-render-fidelity-gltf-hardening.md).

- ~~Follow-ups: verify the runtime Draco CDN fetch behind the prod reverse-proxy
  / CSP.~~ **Done** — the Draco decoder is now self-hosted under `public/draco/`
  (`scripts/copy-decoders.mjs`, base-aware `withBase('/draco/')`), so there is no
  runtime CDN fetch to proxy. See the offline/PWA work below.

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
- **Subsystem 4: Procedural furniture** — **shipped v1+v2+kitchen-run** (C257/C258/C270:
  dimension-driven bookshelf/wardrobe/sideboard/desk/kitchen-run generator with drawers,
  per-compartment config, toe-kick, worktop slab, optional uppers, `src/furniture/parametric/`). Complete.

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
- **Standalone KTX2/DDS texture upload** ✓ SHIPPED (C274) — `decodeGpuTexture.ts`
  handles both formats: uncompressed KTX2 via pure-JS `ktx-parse`, Basis-compressed
  KTX2 via `KTX2Loader` + GPU readback, DDS via `DDSLoader` + GPU readback for
  compressed formats. Pipeline: `decodeImage` → `normalizeTextureFile` → WebP.

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
- **Live pricing (C) is dev-only** — Courts/HipVan/Castlery now join IKEA SG as
  `RETAILERS` entries in `price-server.mjs` (fuzzy top-hit name match, offers
  shown cheapest-first in the Shopping panel). **Deferred:** the Courts/HipVan/
  Castlery adapters were written offline against best-effort fixtures of each
  site's plausible search-response shape — they need a real-network verification
  pass (run `npm run price-server` on a connected machine, confirm/fix the URL +
  response shapes, refresh the fixtures in `price-server.test.mjs`).

## Pure-client improvement pipeline (2026-06-19 audit)

Refreshed backlog of high-value items that are **100% client-side** — no real GPU, no
network/backend dependency — so each is implementable AND verifiable headlessly in this
sandbox. Audited against `CHANGELOG.md` (latest: edge bevels, set-dressing decor pack,
auto-styling, drawing-set callouts, quote templates, parametric kitchen-run) +
`FEATURE_PARITY.md` + `FEATURE_FLAGS`; nothing here duplicates shipped work. Prioritised:
correctness/reliability first, then QOL/UX, then polish. Effort: S/M/L. Each item names the
files/areas it touches and the parity gap it fills.

### Correctness / reliability
- **PC-ARRAY-GAP** (M) — The array tool (`InspectorPanel.tsx` `duplicateRow`,
  `arrayPlacement.ts` `arrayOffsets`) only emits a single **row to the right** at a hardcoded
  step (`w + 0.12`, axis `'right'`) and silently drops any copy that fails `canPlace` — so a
  user asking for 6 chairs can get 3 with no feedback. Surface a count/got toast and expose the
  already-supported `axis` ('right'/'forward') + a spacing field; also add a 2D **grid array**
  (rows × cols) since `arrayOffsets` is row-only. Touches `furniture/arrayPlacement.ts`,
  `ui/inspector/InspectorPanel.tsx`. Gap: Coohom/SH3D step-and-repeat; current row-only tool is
  a partial. Verify via unit tests on offsets + a scenario asserting placed-count.
- **PC-DISTRIBUTE-OVERLAP** (S) — `distributeEvenGaps` (`layout/alignDistribute.ts`) computes
  `gap = (hi - lo - totalWidth)/(n-1)`; when the selection's combined footprint exceeds the
  span the gap goes **negative** and items are packed into overlaps with no guard. Clamp to ≥0
  (or fall back to even-centre spacing) and add a "won't fit" signal. Touches
  `layout/alignDistribute.ts` (+ test). Reliability/edge-case bug found during audit.
- **PC-MEASURE-UNITS** (S) — Confirm the tape/measure overlay (`ui/MeasurementOverlay.tsx`,
  `state/slices/measurementsSlice.ts`) renders its distance label through `formatLength(…, units)`
  (imperial support exists in `utils/measurement.ts` but several overlays may hardcode metres).
  Audit every distance/area readout (measure, drag HUD, wall dimension, room labels) for the unit
  toggle; fix any that bypass it. Touches `ui/MeasurementOverlay.tsx`, `ui/DragHud.tsx`,
  `ui/floorplan/editor/WallDimension.tsx`. Gap: SH3D metric+imperial everywhere.

### High-value QOL / UX
- **PC-WALL-NUMERIC** (M) — Live numeric **length + angle entry while drawing a wall** in the 2D
  editor (type "3.6" + Tab → angle, commit). FEATURE_PARITY flags this as a partial vs SH3D.
  Touches `ui/floorplan/FloorPlanEditor.tsx` (draw state), a small numeric-entry overlay, and the
  wall-commit path. Pure geometry + DOM input; verify via scenario typing a length.
- **PC-ARRAY-RADIAL** (M) — Add a **radial/polar array** (N copies around a centre at radius R,
  angular step) alongside the linear/grid array — common for dining chairs around a round table.
  Pure trig in `furniture/arrayPlacement.ts` (`radialOffsets`) + inspector controls; collision-
  checked per copy. Gap: Coohom/CAD-style array tooling. Unit-test the offsets.
- **PC-IES-LIGHT** (M) — Parse `.ies` photometric files into a spotlight intensity/cone profile
  for placed light fixtures (no GPU needed for the parse + cone-angle/intensity mapping; the
  visual is just standard three lights). FEATURE_PARITY lists IES import as a client-feasible
  Coohom gap. New `scene/lighting/iesParse.ts` (pure, unit-testable) + a fixture upload in the
  light inspector; gate behind a new `iesLights` pro flag. Verify parse with a sample `.ies`.
- **PC-GUIDE-SPACING** (S/M) — Extend `AlignmentGuides.tsx` (currently constant-X/Z centre lines)
  with **equal-spacing badges**: when the dragged item sits between two others, draw the two gaps
  and flag when they're equal (smart-guide "equal distance" cue). Pure 2D math from existing
  footprint OBBs; touches `scene/AlignmentGuides.tsx` + the drag-guide producer in
  `scene/DragController.tsx`. Gap: Figma/Coohom-grade smart guides. Verify via screenshot.
- **PC-NUDGE-UNDO** (S) — Audit that every furniture **nudge/array/align/distribute/mirror**
  pushes exactly one coalesced undo entry (rapid arrow-key nudges should collapse, not flood the
  history). Check `layout/selectionActions.ts` + `state/slices/historySlice.ts` interplay and add
  nudge-coalescing if missing. Reliability/QOL; unit-test the history depth after a nudge burst.
- **PC-CATALOG-FAVOURITES** (S) — A persisted **favourites/star** list in the catalog (separate
  from `recentSlice`) so users can pin go-to pieces. Touches `ui/catalog/*`, a small
  `favouritesSlice` + save schema field; `simple`-tier. Gap: every consumer planner has favourites;
  we only have "recent". Unit-test the slice + persistence.
- **PC-ROOM-AREA-ONPLAN** (S) — Verify the 2D plan shows each room's **live area + perimeter**
  label (SH3D shows area on-plan); if only dimensions show, add area via `roomCentroid.ts` +
  `floorplan/roomDetect.ts` polygon area, respecting the unit toggle. Touches
  `ui/floorplan/editor/*` room-label rendering. Quick, high-perceived-value.

### Aesthetic / polish
- **PC-RZ6-SEAMS** (M) — Carry the open RZ6 item: procedural **upholstery seam stitching +
  seeded fabric-wrinkle** normal variation on sofas/chairs (pure procedural geometry/normal map,
  no GPU tier needed for the base read on Performance). Touches `furniture/primitives/Sofa*.tsx`
  + a shared seam helper in `materials/`. Gap: photoreal soft goods. Verify via screenshot.
- **PC-DRAG-DIM** (S) — While dragging furniture, show a **live distance-to-nearest-wall** readout
  (the FFE/clearance value) in `DragHud.tsx`, not just position — turns the existing clearance
  data into an at-a-glance placement aid. Pure DOM overlay off existing collision distances.
- **PC-EMPTY-STATES** (S) — Polish empty/edge states across panels (no saved views, empty BOQ, no
  comments, empty room): consistent illustrative empty-state copy + a primary CTA, instead of blank
  panels. Touches the various `*Panel.tsx`. Aesthetic/onboarding polish; verify Simple + Pro modes.

## Pure-client improvement pipeline (2026-06-19 refresh #2)

Second refreshed backlog of high-value items that are **100% client-side** — no real GPU, no
network/backend dependency — so each is implementable AND headlessly verifiable in this sandbox
(SwiftShader WebGL works; a real GPU does not). Audited against `CHANGELOG.md` (top ~25: edge
bevels, set-dressing decor, auto-styling, drawing-set callouts, quote templates, parametric
kitchen-run, distribute-overlap fix, measure-unit audit, catalog favourites, numeric wall entry,
radial/linear/grid arrays, room area+perimeter labels, drag-HUD distance, undo coalescing,
equal-spacing guides, upholstery seams, shared EmptyState), plus `FEATURE_PARITY.md`,
`PHOTOREALISM.md`, and `FEATURE_FLAGS`. The prior audit's items (`## Pure-client improvement
pipeline (2026-06-19 audit)`) are all shipped except **PC-IES-LIGHT** (still in flight — do not
re-take here). Nothing below duplicates shipped or open work. Prioritised: correctness/reliability
→ photorealism levers → QOL/UX → polish. Effort: S/M/L. Each names the files/areas + the parity gap.

### Correctness / reliability (do first)
- **PC2-ANISO-MAX** (S) — Texture anisotropy is **hardcoded** (`furnitureMaterials.ts` line ~53
  `t.anisotropy = 4`; `materials/cache.ts` line ~60 `tex.anisotropy = 8`) instead of clamped to the
  device cap via `renderer.capabilities.getMaxAnisotropy()` (commonly 16). Grazing-angle floors/wood
  read blurry. Thread the renderer's max through a shared helper and clamp per texture. Touches
  `materials/furnitureMaterials.ts`, `materials/cache.ts` (+ a small pure clamp test). Photoreal
  sharpness win at near-zero cost; reliability because the value silently ignores the GPU cap.
- **PC2-SURFACE-DROP** (M) — When dropping a surface item (lamp/vase/monitor — anything with the
  `surfaceHeight` prop the collision span in `collision/placement.ts` already honours) onto a table/
  shelf top, auto-snap its base elevation to that surface's top (SH3D shelf-magnetism). Today drop Y
  is floor-anchored, so decor visually floats or clips. Compute the support surface height in the
  drop path and set the item elevation. Touches `scene/DragController.tsx`, `collision/placement.ts`,
  the placement/elevation slice. Gap: SH3D `shelfElevations` magnetism. Verify with a unit test on
  the support-height resolver + a drop scenario.
- **PC2-DISTRIBUTE-AXIS** (S) — `layout/alignDistribute.ts` `distributeEvenGaps` distributes along a
  single inferred axis; confirm it picks the dominant spread axis correctly for a diagonal selection
  and that align-edge ops handle rotated footprints (OBB, not AABB). Audit + add a rotated-item test;
  fall back gracefully when n<3. Reliability follow-on to the shipped overlap clamp. Touches
  `layout/alignDistribute.ts` (+ test).

### Photorealism levers (pure-code / headless-verifiable wiring)
- **PC2-CONTACT-AO-DECOR** (S/M) — Small surface decor (vases, bowls, books, trays) gets no contact
  grounding, so it reads pasted-on. Add a tiny baked radial-gradient **contact-shadow decal** under
  small props (a cheap alpha texture quad, not a render pass — works on the flat Performance tier).
  Reuse/extend `scene/ContactShadow.tsx` patterns into a per-prop decal helper. Touches
  `scene/ContactShadow.tsx` (or new `scene/PropContactDecal.tsx`), decor primitives. Biggest cheap
  "is-it-really-sitting-there" realism lever on the default tier. Verify via screenshot + a present-
  in-graph unit check.
- **PC2-TONEMAP-EXPOSURE-CTX** (S) — `PHOTOREALISM.md` recommends **Neutral as the default tone-map
  in the finish-preview context** (accurate base colours) and AgX for "photo" presets, but the app
  uses one global tone-mapper. Make tone-mapping context-aware: Neutral while a finish/material swatch
  is being previewed/dragged, the user's choice (or AgX) otherwise. Pure config in `scene/look.ts` +
  `scene/toneMappingThree.ts` + the finish-drag signal. Headless-verifiable (renderer constant +
  unit test on the resolver). Gap: fidelity-correct previewing per `PHOTOREALISM.md` tone note.
- **PC2-WOOD-GRAIN-FLOW** (M) — Wood procedural grain (`materials/procedural/`) tiles uniformly with
  no plank-to-plank variation or directional flow, so parquet/flooring reads repetitive. Add seeded
  per-plank hue/value jitter + grain-direction rotation per plank (pure field math, deterministic,
  unit-testable like `upholsterySeams.ts`). Touches `materials/procedural/generators.ts` (or a new
  `procedural/woodPlank.ts`) + a test asserting determinism + per-plank variation. Photoreal flooring
  lever; Coohom's "jaw-dropping wood grain" is the bar. No GPU needed for the base read.
- **PC2-SSAA-EXPORT** (S) — Carry `PHOTO-SSAA-EXPORT` from `PHOTOREALISM.md`: supersample the
  snapshot/PNG export path (render at 2×–3× then box-downsample) for crisp reference stills, separate
  from live SMAA. Pure offscreen-canvas resize math in the capture path; **headless-verifiable**
  (assert output dimensions + that downsample runs), unlike GPU-pixel items. Touches
  `scene/captureCanvas.ts` / `scene/ScreenshotController.tsx` / `ui/floorplan/exportPlanPng.ts`. Gap:
  reference-quality stills without a cloud render.

### High-value QOL / UX
- **PC2-FURN-GROUP** (M) — First-class **furniture grouping**: select N items → "Group" so they
  move/rotate/duplicate/delete as one (SH3D + Coohom core). Collision already has a `group-mate`
  concept (`collision/placement.ts` exempts group-mates) — surface user-facing grouping on top of it:
  a `groupId` on placed items, group-aware transforms in `layout/selectionActions.ts`, and a Group/
  Ungroup ⌘K command + toolbar entry (flag-gated, pro). Touches the placement slice,
  `layout/selectionActions.ts`, `features/featureFlags.ts`. Test both Simple/Pro. Gap explicitly
  named in `FEATURE_PARITY` (furniture groups) — confirm not already wired before building.
- **PC2-MULTI-DUP-PASTE** (S) — Copy/paste + duplicate-in-place for the current selection with a small
  offset (Coohom/SH3D Ctrl+C/Ctrl+V). Verify the existing duplicate path handles a multi-selection and
  pushes one coalesced undo entry; add clipboard-style paste if missing. Touches
  `layout/selectionActions.ts`, the keymap/⌘K commands. QOL parity; unit-test history depth + count.
- **PC2-CAM-DOF-LENS** (M) — Add **lens type + depth-of-field** controls to the render/snapshot camera
  (focal length / f-stop / focus distance). DoF partly exists in the HQ path tracer (`PhysicalCamera`);
  expose it as UI and apply a cheap post DoF on the High/Max raster tiers too. Touches the render-
  settings UI + `scene/pathtrace/*` + `scene/Effects.tsx`. Gap: SH3D fisheye/DoF lens row in
  `FEATURE_PARITY`. Wiring is headless-verifiable; the pixel pass is real-GPU-pending (mark it).
- **PC2-PLAN-ANGLE-SNAP** (S/M) — In the 2D editor, snap wall-draw + furniture-rotate to common
  angles (15°/30°/45°/90°) with a modifier-free default + a Shift/Alt override, mirroring Arcadium 3D /
  SH3D precision snapping. Complements the shipped numeric wall entry. Touches
  `ui/floorplan/FloorPlanEditor.tsx`, `ui/floorplan/editor/snapToWalls.ts` (+ a pure angle-snap test).
  Gap: precision drafting (Arcadium 3D, new ref).

### Polish
- **PC2-PLAN-FURN-ICONS** (M) — The 2D plan draws furniture as plain footprint rectangles; SH3D draws
  recognisable top-down **furniture icons** (bed, sofa, toilet, sink…). Add simple per-category SVG
  glyphs keyed off the furniture role/category so the plan reads at a glance. Touches the 2D plan
  furniture renderer (`ui/floorplan/editor/*`, `ui/floorplan/planLabels.ts`) + a category→glyph map.
  Pure SVG; verify via plan-PNG screenshot. Gap: SH3D plan legibility.
- **PC2-FAVOURITE-MATERIALS** (S) — Extend the shipped catalog-favourites pattern to **finishes/
  materials** (star a finish, a "Favourites" group in the material picker), so users can pin go-to
  surfaces. Reuse the favourites slice/schema. Touches `ui/` material-picker components + the
  favourites slice. QOL parity with the model favourites just shipped; unit-test the slice path.
