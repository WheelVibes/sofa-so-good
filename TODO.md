# TODO

Single source of truth for deferred work across this project. Each entry links back to the spec, plan, or file that introduced it. Removed when done.

## Layout / placement (2026-05-30)

- ~~**Interior-design rules baked in**~~ — clearances in
  [src/layout/designRules.ts](src/layout/designRules.ts), guidance in
  [docs/interior-design-guidelines.md](docs/interior-design-guidelines.md),
  CLAUDE.md convention. Authoring layouts/presets must follow them.
- ~~**Per-room auto-arranger ("Tidy up room")**~~ —
  [src/layout/autoArrange.ts](src/layout/autoArrange.ts), living/bedroom/
  generic strategies, Finish-picker button. ~~Asset mirror-flip~~ (F / Shift+F).
- ~~**Default lounge re-oriented**~~ — sofa faces the (windowless) east TV
  wall; coffee table long-side parallel to the sofa.
- Follow-up: extend the arranger with kitchen/bath-specific templates (work
  triangle / fixture order); run it over the researched presets so their
  bedrooms are auto-spaced; add a desk-chair-at-desk rule.

## Catalogue configurability pass (2026-05-29)

Goal: make every catalogue item as configurable as possible (colour ×
material × texture × shine × **form/shape/size**) grounded in real
references. Shipped form/style variants (each combines with existing
colour/finish/material/sheen controls):

- ~~Dining chair~~ wood / upholstered; ~~Coffee table~~ rect / round / oval;
  ~~Side table~~ round-3leg / square / drum; ~~Area rug~~ rect / round / oval;
  ~~Armchair~~ lounge / wingback / tub; ~~Bookshelf~~ open / closed-base-cabinet
  + plinth; ~~TV console~~ base (block/plinth/legs) × front (drawers/doors).
- ~~Ceiling pendant~~ dome / globe / cone / drum shades; ~~Table + floor lamp~~
  empire / drum / cone shades, floor lamp disc / tripod base; ~~Nightstand~~
  drawers / drawer-shelf / open; ~~Potted plant~~ + fiddle-leaf type, tapered /
  cylinder / square planter; ~~Desk~~ panel / four-leg / hairpin.
- ~~Bar stool~~ splayed / pedestal / backed; ~~Dresser~~ knob/bar/recessed
  handles × legs/plinth; ~~Wall art~~ thin / gallery / box / frameless;
  ~~Curtains~~ drawn / tied-back; ~~Office chair~~ task / executive / mesh +
  material/sheen; ~~Floor mirror~~ rect-leaning / round-cheval; ~~Wall clock~~
  round / square + quarter / all-hour markers.

Follow-up shape/size variants — ~~dining table oval (twin-pedestal)~~,
~~shoe cabinet open rack~~, ~~wall shelf floating / two-tier~~, ~~bed base
platform / storage~~, ~~wardrobe open interior (rail + clothes + shelves)~~,
~~bathroom basin pedestal/vanity/wall-hung~~, ~~appliance finish matte/steel/
gloss (fridge, washer, stove, microwave, hood)~~ — all shipped (2026-05-29).

Shipped since: ~~tone-on-tone weave patterns (plain/striped/herringbone/
checkered) on sofa, armchair, dining + office chair, rug, curtains, bedding~~;
~~appliance finish~~; ~~bathroom basin styles~~; ~~toilet wall-hung~~;
~~kitchen counter worktop colour + slab/shaker/drawer fronts~~; ~~bathroom
mirror rect/round/frameless~~; ~~walk-in shower~~.

The catalogue is now broadly configurable across colour × material × finish ×
sheen × form/shape × weave. ~~Custom wall/floor/accent colour picker~~ (any
hex, no catalog entry, persists as a free string) and an expanded curated
palette shipped; ~~plaid + dots weave motifs~~; ~~per-cushion accent pillow
weave~~. Furniture colours were already free (inspector colour inputs).

~~Layout presets~~ shipped — full-flat furnished+finished presets via a
Presets toolbar menu + applyLayoutPreset(); collision-valid + tested. Two
kinds: restyle-in-place (Move-in Default, Scandi, Warm Industrial, Cozy
Tropical, Japandi, Coastal, Modern Mono) and **researched re-modelled L/D
arrangements** (Open-Concept Lounge, Work-From-Home) via an explicit
`livingDining` array, plus an `extraItems` layer for add-on pieces (feature
walls). Researched layouts: Open-Concept Lounge, Work-From-Home, Social
Lounge. New assets for these: an **L-shaped sectional sofa** (sofa-lshape)
and a **fluted/slat feature wall** (feature-wall / FeatureWall), used as
media walls in several presets. To add a researched layout: author
`livingDining` entries + run the preset collision test. ~~Venetian blind~~,
~~bulb temperature~~, ~~TV/monitor screen content~~, ~~room area in Finish
picker~~, ~~kitchen wall-cabinet shaker fronts~~ also shipped.

Possible further polish: heated-ladder towel rail; user-saved style presets;
researched bedroom layout (feature-wall headboard); bar-cart asset.
~~Console-table~~ + ~~sideboard / credenza~~ (doors / drawers / mixed fronts ×
tapered / hairpin / plinth base × bar / knob / recessed / push handles)
shipped — see [src/furniture/primitives/Sideboard.tsx](src/furniture/primitives/Sideboard.tsx).

## Realism & content pass (2026-05-29)

Shipped this iteration — recorded here for follow-up polish:

- ~~**Rendering quality**~~ — ACES tone mapping, time-of-day hemisphere fill, 2048 sun shadows with normal-bias + apartment-centred frustum, MSAA. See [src/scene/Scene.tsx](src/scene/Scene.tsx), [src/scene/lighting/Lighting.tsx](src/scene/lighting/Lighting.tsx).
- ~~**Procedural PBR finishes**~~ — runtime wood/tile/marble/carpet/concrete/plaster maps (albedo+normal+roughness) from seeded noise, world-space UVs, per-room defaults. See [src/materials/procedural/](src/materials/procedural/).
- ~~**Furniture content**~~ — 17 new primitives (chairs, armchair, coffee table, nightstand, rug, plant, TV, aircon, fridge, lamps, ceiling light, toilet, basin, ceiling fan, stove, washing machine, curtains) + `bathroom`/`appliances` categories.
- ~~**Auto wall reveal**~~ — exterior walls between camera and interior fade in orbit mode. See [src/apartment/walls/WallSegment.tsx](src/apartment/walls/WallSegment.tsx).
- ~~**Fixture lighting**~~ — lamps/pendants emit real point lights at night, capped + day-gated. See [src/scene/lighting/FurnitureLights.tsx](src/scene/lighting/FurnitureLights.tsx).
- ~~**Height-aware collision**~~ — vertical spans + `mounted`/`noClip` flags. See [src/collision/placement.ts](src/collision/placement.ts).

Deferred follow-ups from this pass:

- ~~**Wall reveal: couple windows & doors to their wall's fade**~~ — done. Shared per-wall opacity registry ([src/apartment/walls/wallReveal.ts](src/apartment/walls/wallReveal.ts)); windows/doors hide once their wall fades ~65%.
- ~~**Procedural finish thumbnails**~~ — done. The picker renders a 64px albedo tile per procedural material. See [src/ui/FinishPicker.tsx](src/ui/FinishPicker.tsx).
- ~~**Procedural terrazzo**~~ — done. Dedicated speckled-chip generator (cement matrix + scattered polished chips, seamless wrap). See `terrazzoFields` in [generators.ts](src/materials/procedural/generators.ts).
- ~~**Dispose cloned wall-face materials**~~ — done. [WallSegment.tsx](src/apartment/walls/WallSegment.tsx) clones the finish material via `useMemo` and disposes it on unmount/change via a `useEffect` cleanup.
- **Instanced furniture meshes** — repeated primitives (chairs etc.) are many small draw calls; consider merging/instancing for scenes with hundreds of items. (Tension with per-item picking — would need an instance→item index map.)

## Configurable materials (2026-05-29)

Shipped — assets configurable with realistic colours, gradients, textures, materials:

- ~~**Upholstery materials**~~ — fabric / leather / velvet on sofas + armchair. `getUpholsteryMaterial` in [furnitureMaterials.ts](src/materials/furnitureMaterials.ts).
- ~~**Hard-surface finishes**~~ — wood / painted / gloss across ~21 items (tables, storage, desk, kitchen cabinets, beds, mirror frame, chairs). `getSurfaceMaterial`.
- ~~**Gradients**~~ — ombre rug + gradient wall-art print. `getGradientFabricMaterial` / `getGradientMaterial`.
- ~~**Per-wall accent finish**~~ — done. Click a wall in orbit mode → `selectWall` → [WallAccentPicker](src/ui/WallAccentPicker.tsx); `wallAccents` map (keyed `wallId:roomId`) overrides the per-face room finish in [WallSegment.tsx](src/apartment/walls/WallSegment.tsx). Schema-persisted (backward-compatible).

## Furniture Catalog Expansion

Decomposed into four subsystems, each shipped independently. Brainstormed 2026-05-01.

- ~~**Subsystem 1: Multi-provider plumbing**~~ — done. Spec: [docs/superpowers/specs/2026-05-01-multi-provider-plumbing-design.md](docs/superpowers/specs/2026-05-01-multi-provider-plumbing-design.md). Plan: [docs/superpowers/plans/2026-05-01-multi-provider-plumbing.md](docs/superpowers/plans/2026-05-01-multi-provider-plumbing.md).
- ~~**Subsystem 2: DLC packs**~~ — done (v1: Kenney Furniture Kit). Spec: [docs/superpowers/specs/2026-05-01-dlc-packs-design.md](docs/superpowers/specs/2026-05-01-dlc-packs-design.md). Plan: [docs/superpowers/plans/2026-05-01-dlc-packs.md](docs/superpowers/plans/2026-05-01-dlc-packs.md). Production proxy for `/kenney` rolls into the existing CORS-proxy TODO.
- **Quaternius DLC pack support** — deferred from subsystem 2. Their packs are Google-Drive-folder-hosted (no programmatic single-zip download from a browser) and ship FBX/OBJ/Blend rather than GLB. Either (a) build a server-side proxy that exposes a single zip endpoint over a Drive folder + add three's `FBXLoader`, or (b) maintainer-mirror packs to a CC0-redistributable CDN with format conversion. Revisit after subsystem 4.
- **DLC pack URL drift** — Kenney's pack URL contains a content-hash directory; HEAD-validation on `Content-Length` ± 5% catches breakage. Bump the registry entry when the upstream rotates.
- **DLC pack scale curation** — Kenney's furniture-kit is unevenly scaled (most seating/storage/kitchen/lighting/bath items render at ~½ real size at scale=1; beds and the cross dining table are already correct). [src/catalog/packs/scaleHeuristic.ts](src/catalog/packs/scaleHeuristic.ts) ships a curated per-id multiplier table; install + hydrate apply it and existing installs auto-migrate on next boot. New packs need their own measured table or items will render at the wrong size.
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

- ~~**Multi-select rotate**~~ — done. `R` rotates a multi-selection rigidly around the group centroid (positions orbit the centroid, each item's rotation advances), applied only if all rotated items still fit. See [src/App.tsx](src/App.tsx).
- **Inspector for multi-selection** — currently shows the primary item only. Could show a "N items selected" placeholder with bulk actions (delete all, clear). See [src/ui/inspector/InspectorPanel.tsx](src/ui/inspector/InspectorPanel.tsx).
- **Marquee strictness** — selection is membership-by-centre; partial-overlap (Lasso-style) may be preferred for large items. Revisit if users complain. See [src/scene/selection/MarqueeSelector.tsx](src/scene/selection/MarqueeSelector.tsx).

## UI

- **Finishes browse: filter by category** — `RemoteBrowseTab` shows all materials; could narrow by floor-vs-wall heuristics from tags. See [src/ui/FinishPicker.tsx](src/ui/FinishPicker.tsx) and [finishes-browse spec](docs/superpowers/specs/2026-05-01-finishes-browse-design.md).
- **Persist last-edited surface** across sessions for the finishes browse → resolve flow. See [finishes-browse spec — Out of scope](docs/superpowers/specs/2026-05-01-finishes-browse-design.md#out-of-scope).

## Time of Day

Spec: [docs/superpowers/specs/2026-05-01-time-of-day-design.md](docs/superpowers/specs/2026-05-01-time-of-day-design.md). Pending implementation plan.

- ~~**Time-of-day rework — Phase 1 (time model)**~~ — done. Plan: [docs/superpowers/plans/2026-05-01-time-of-day-phase1-time-model.md](docs/superpowers/plans/2026-05-01-time-of-day-phase1-time-model.md). System / Morning / Noon / Dusk / Night / Custom dropdown, schema migration from legacy timeOfDay. Lighting still uses the old 3-preset visuals via a temporary hour→preset shim — Phase 2 replaces them.
- ~~**Time-of-day rework — Phase 2 (astronomy + geocoding)**~~ — done. Plan: [docs/superpowers/plans/2026-05-01-time-of-day-phase2-astronomy.md](docs/superpowers/plans/2026-05-01-time-of-day-phase2-astronomy.md). SunCalc-driven sun position, location prompt with geolocation/Nominatim/manual entry, altitude-driven lighting and sky.
- **Time-of-day rework — Phase 3 (realistic indoor lighting)** — partially done (2026-05-29). Procedural IBL probe ([src/scene/lighting/SceneEnvironment.tsx](src/scene/lighting/SceneEnvironment.tsx)) + real sun shadows through window cutouts shipped. **Still pending:** SSAO (tried via postprocessing but software-renderer-grainy and unverifiable on GPU — deferred) and inter-room light bleed through open doors.
- ~~**Time-of-day rework — Phase 4 (light fixtures)**~~ — done (2026-05-29). Floor lamps / ceiling lights emit real, day-gated, proximity-capped point lights ([src/scene/lighting/FurnitureLights.tsx](src/scene/lighting/FurnitureLights.tsx)); emitter registry in [src/furniture/lightEmitters.ts](src/furniture/lightEmitters.ts). Inspector controls via the standard param schema.
- ~~**Time-of-day rework — Phase 5 (quality settings)**~~ — done (2026-05-29). Low/Medium/High tiers + per-setting overrides (shadows / IBL / postprocessing / fixture cap / DPR / wall-reveal) with device-tier auto-detect, an adaptive 30fps guard, and persistence. See [src/scene/quality.ts](src/scene/quality.ts), [src/ui/GraphicsSettings.tsx](src/ui/GraphicsSettings.tsx).

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
