# TODO

Single source of truth for deferred work across this project. Each entry links back to the spec, plan, or file that introduced it. Removed when done.

## Furniture Catalog Expansion

Decomposed into four subsystems, each shipped independently. Brainstormed 2026-05-01.

- **DLC pack URL drift** — Kenney's pack URL contains a content-hash directory; HEAD-validation on `Content-Length` ± 5% catches breakage. Bump the registry entry when the upstream rotates.
- **Subsystem 3: Sketchfab** — REST + OAuth token + runtime fetch. Largest variety gain; auth+ToS friction. Pending.
- **Subsystem 4: Procedural furniture** — runtime mesh generation (parametric shelving, sofas, wardrobes). Largest design surface. Pending.

Dropped 2026-05-02:

- ~~**Quaternius DLC pack support**~~ — skipped. Drive-folder hosting and FBX upstream make every integration path (proxy + `FBXLoader` runtime cost, maintainer-mirrored CDN with offline format conversion, hybrid DLC) too expensive for the marginal catalog gain on top of Poly Haven runtime + Kenney DLC.

## Runtime CC0 Catalog

Plan: [docs/superpowers/plans/2026-05-01-runtime-cc0-catalog.md](docs/superpowers/plans/2026-05-01-runtime-cc0-catalog.md). Spec: [docs/superpowers/specs/2026-05-01-runtime-cc0-catalog-design.md](docs/superpowers/specs/2026-05-01-runtime-cc0-catalog-design.md). Active implementation in progress on this branch.

- **Runtime catalog: production CORS proxy** — ambientCG's API and CDN do not send `Access-Control-Allow-Origin`. Dev uses Vite's reverse proxy ([vite.config.ts](vite.config.ts) `/acg` and `/acg-cdn`); production needs an equivalent proxy (Cloudflare Worker, Vercel edge function, or hosted reverse-proxy) before the build is deployable with the runtime catalog enabled. Poly Haven's API and CDN do send CORS — they work direct.
- **Runtime catalog: Kenney support** — Kenney has no CORS-friendly API and ships single ZIPs. Add a build-time mirror (or proxy worker) before extending the runtime catalog to Kenney.
- **Runtime catalog: Quaternius support** — same rationale as Kenney.
- **Runtime catalog: per-asset bytes estimate** — surface Poly Haven file sizes on cards before clicking so users can avoid 50 MB downloads.
- **Runtime catalog: HDRI environment** — reconsider when scene lighting is exposed.

## Assets

Decision 2026-05-02: build-time bundling of furniture is no longer the canonical path. Poly Haven and ambientCG furniture/materials are reached through the runtime CC0 catalog ([src/catalog/remote/](src/catalog/remote/)); Kenney content is reached through runtime DLC packs ([src/catalog/packs/](src/catalog/packs/)). The build-time asset pipeline still produces the bundled material starter set (floor + wall textures) so the default room renders without network on first launch. The "Standard asset set ~80 assets" target from the original asset-population spec is retired — furniture-by-the-hundreds is provided by the runtime catalog instead.

- **Kenney bundle extraction** — only relevant if we ever want Kenney items pre-installed on first launch without the user installing the runtime DLC pack. Lower priority now that the runtime DLC path exists. See [asset-population plan Task 14](docs/superpowers/plans/2026-04-26-asset-population.md).
- **KTX2 texture compression** — `@gltf-transform/functions`'s `textureCompress` lacks a bundled KTX2 encoder; current pipeline ships JPG/PNG at 2K. To get the KTX2 size/VRAM benefit promised in the spec, integrate `@gltf-transform/cli` (which ships `toktx`) or a standalone `basisu` binary. See [scripts/asset-pipeline/process-texture.ts](scripts/asset-pipeline/process-texture.ts).
- ~~**Drop-folder material auto-detection**~~ — landed 2026-05-02. New `detectMaterialFromFolder` in [sidecar.ts](scripts/asset-pipeline/sidecar.ts) infers channel mapping from filename suffixes (Poly Haven `_diff` / `_nor_gl` / `_rough` / `_ao`, ambientCG `_Color` / `_NormalGL` / `_Roughness` / `_AmbientOcclusion`, plus single-texture albedo fallback). [index-assets.ts](scripts/asset-pipeline/index-assets.ts) now falls back to it when no `material.json` sidecar exists. Wall-flavored slugs (`wall|brick|plaster|paint|tile|wallpaper`) tag as `wall`; everything else `floor`.
- **Per-LOD texture variants** — for performance on lower-end devices. See [asset-population spec — Out of scope](docs/superpowers/specs/2026-04-26-asset-population-design.md#out-of-scope-for-this-spec).
- **`builtinCatalog.ts` solid-swatch entries for floor textures** — once the texture pipeline is exercised end-to-end, the eight solid-swatch entries (`floor-wood-oak`, `floor-wood-walnut`, etc.) can be deleted; the generated catalog will provide textured equivalents under the same ids. See [src/materials/builtinCatalog.ts](src/materials/builtinCatalog.ts).

Dropped 2026-05-02:

- ~~**Poly Haven model fetcher**~~ — superseded by [src/catalog/remote/providers/polyhaven.ts](src/catalog/remote/providers/polyhaven.ts), which already fetches `/files/<slug>` + the `include` map at runtime, caches the bundle in IndexedDB, and resolves it through three's `LoadingManager.URLModifier` at render time. The build-time repacking pipeline duplicates that work for no user-visible win.
- ~~**Quaternius pack inclusion**~~ — skipped per design discussion 2026-05-02. Quaternius's Drive-folder hosting + FBX-format upstream make every integration path (server-side proxy + `FBXLoader`, maintainer-mirrored CDN with offline FBX→GLB conversion, hybrid DLC) too expensive for the catalog gain. The runtime CC0 catalog already exposes thousands of Poly Haven items; Quaternius variety isn't load-bearing.
- ~~**Standard asset set (~80 assets, ~120 MB)**~~ — retired. The original spec's growth target assumed a build-time bundling pipeline as the only catalog. With runtime catalog + runtime DLC packs covering furniture, the bundled-asset count stays small (materials + a handful of accents) and the 120 MB number stops being a meaningful lever.
- ~~**Lazy-loading / streaming individual GLBs**~~ — moot. Build-time furniture bundling has been retired; the only bundled assets are materials (small) and primitives (no GLBs). Generated catalog metadata is currently 175 bytes; runtime catalog assets are already lazy-loaded from IndexedDB / provider CDN on click.

## Editor / Selection

Landed 2026-05-02:

- **Pack-furniture footprint scale² bug** — `def.defaultFootprint` for pack/Kenney items was stored as `rawBbox × scale` while `itemFootprint` then multiplied by `def.scale` again, producing a scale² footprint (e.g. Kenney bench reading 10.75 × 2.93 m and its selection outline rendering several metres past the visible model). [GltfModel.tsx](src/furniture/GltfModel.tsx) now caches the bbox in `cloned`'s local frame so the primitive's `scale` prop is excluded; [install.ts](src/catalog/packs/install.ts) and [hydratePacks.ts](src/state/storage/hydratePacks.ts) write the RAW bbox into `def.defaultFootprint` (`entry.footprint` stays scaled for storage back-compat); [CatalogCard.tsx](src/ui/catalog/CatalogCard.tsx) multiplies by `def.scale` for display; [InspectorPanel.tsx](src/ui/inspector/InspectorPanel.tsx) renames `x` / `z` → `pos.x` / `pos.z` and adds a live `size` (w × d) line via `itemFootprint`.

- **Inspector scale slider semantics** — slider stored `props.scale` as absolute scale on a `[0.5, 1.5]` range, so for a Kenney sofa with `def.scale=2.0` the slider was already pegged off-range and dragging it to "1.0×" actually shrank the sofa to half its intended size. [GltfBody.tsx](src/ui/inspector/GltfBody.tsx) now treats the slider as a multiplier on `def.scale` (1.00× = "catalog's intended size"), with range `[0.5, 2.0]`. Stored `props.scale` remains absolute for back-compat with older saves and the renderer's `<primitive scale={…}>` path.

- **Verified Kenney scaleHeuristic targets against the actual `kenney_furniture-kit.zip`** (2026-05-02): `loungeSofa` 0.98 × 0.41 raw → 1.96 × 0.82 m at scale=2 (correct 3-seat sofa); `bedDouble` 1.62 × 1.91 raw at scale=1 (correct queen); `bench` 0.40 × 0.20 raw → 0.72 × 0.36 m at scale=1.8 (a small low bench, plausibly intentional). `loungeSofaLong` (0.98 × 0.82 raw → 2.16 × 1.80 m at scale=2.2) is suspiciously deep — the model may be a sectional rather than a long bench-style sofa; revisit if users complain about that specific item.

- **L/D modelled as a true L-shape** — earlier `RoomDef.extension?` was a single optional sub-rectangle, and L/D was declared as a 4.00 × 5.40 m main rectangle that swallowed the b3↔L/D wall body up in the bedroom band. A 2.16 m sofa placed in the north arm of L/D therefore left only ~1.29 m of wall-to-wall free space instead of the 1.84 m the "4.00 m wide" label implied. Schema is now `extensions?: Array<{...}>` ([types.ts](src/apartment/types.ts)) with consumers updated ([floorRects.ts](src/apartment/floor/floorRects.ts), [roomGraph.ts](src/apartment/roomGraph.ts), [wallRoomSides.ts](src/apartment/walls/wallRoomSides.ts), [Ceiling.tsx](src/apartment/Ceiling.tsx), [MeasurementOverlay.tsx](src/ui/MeasurementOverlay.tsx)); L/D's main is now its 4.00 × 3.15 m south arm with two extensions — a 3.45 × 2.25 m north arm and the existing 2.45 × 1.10 m SE alcove ([constants.ts](src/apartment/constants.ts)). MeasurementOverlay now shows "L-shape · 23.1 m²" for any room with extensions instead of a misleading W × D label. Total interior drops from ≈ 90.4 m² → ≈ 89.2 m² (the 1.24 m² of wall body that the old model double-counted); area test tolerance updated.

- **Multi-select rotate** — `R` rotates only the primary selection. Decide whether group rotate spins around the group centroid or each item in place, then extend the onKey handler. See [src/App.tsx](src/App.tsx).
- **Inspector for multi-selection** — currently shows the primary item only. Could show a "N items selected" placeholder with bulk actions (delete all, clear). See [src/ui/inspector/InspectorPanel.tsx](src/ui/inspector/InspectorPanel.tsx).
- **Marquee strictness** — selection is membership-by-centre; partial-overlap (Lasso-style) may be preferred for large items. Revisit if users complain. See [src/scene/selection/MarqueeSelector.tsx](src/scene/selection/MarqueeSelector.tsx).

Landed 2026-05-02:

- **Inspector for multi-selection** — `InspectorPanel` now branches on `selectedItemIds.length`: 0 → null, 1 → existing single-item editor, 2+ → a "N items selected" panel with `Delete all` (loop-deletes through the existing coalesced-history path so it's one undo step) and `Clear selection`. Per-item edits intentionally stay routed through the single-item path; bulk multi-edit is out of scope. See [InspectorPanel.tsx](src/ui/inspector/InspectorPanel.tsx).

## UI

Landed 2026-05-02:

- **Finishes browse: filter by category** — `RemoteBrowseTab` now takes an `initialSurface?: 'floor' | 'wall'` prop and renders a category-chip row (`Any surface | Floor | Wall`) below the provider chips when `kind === 'material'`. Filtering uses `entry.category`, which both Poly Haven and ambientCG providers already classify (no extra tag heuristic needed). Furniture browser is unaffected. See [RemoteBrowseTab.tsx](src/ui/catalog/RemoteBrowseTab.tsx).
- **Persist last-edited surface** — `lastSurface: 'floor' | 'wall'` now lives on `finishesSlice` and persists through the schema (defaults to `'floor'`, optional in serialized payload so legacy saves still parse). `setFloorFinish` / `setWallFinish` write it as a side effect; `setLastSurface` is exposed for non-finish consumers. `FinishPicker` reads from the store and passes `initialSurface={lastSurface}` to `RemoteBrowseTab`. See [finishesSlice.ts](src/state/slices/finishesSlice.ts), [schema.ts](src/state/schema.ts), [FinishPicker.tsx](src/ui/FinishPicker.tsx).

## Time of Day

Spec: [docs/superpowers/specs/2026-05-01-time-of-day-design.md](docs/superpowers/specs/2026-05-01-time-of-day-design.md).

Out-of-scope items deferred from the spec:

- **Time-of-day: localized per-room IBL probes** — single global environment used; per-room probes would localize bounce more accurately at the cost of additional cubemap captures. See [time-of-day spec — Out of scope](docs/superpowers/specs/2026-05-01-time-of-day-design.md#out-of-scope).
- **Time-of-day: animated dusk/dawn transitions** faster than the existing 0.6 s tween. See [time-of-day spec — Out of scope](docs/superpowers/specs/2026-05-01-time-of-day-design.md#out-of-scope).
- **Time-of-day: real-time path-traced GI / RTX** — IBL + SSAO is the target; revisit only if WebGPU + path tracing becomes affordable. See [time-of-day spec — Out of scope](docs/superpowers/specs/2026-05-01-time-of-day-design.md#out-of-scope).

### Realistic per-room lighting (window-aware, door-gated)

Spec: [docs/superpowers/specs/2026-05-02-realistic-room-lighting-design.md](docs/superpowers/specs/2026-05-02-realistic-room-lighting-design.md). Plan: [docs/superpowers/plans/2026-05-02-realistic-room-lighting.md](docs/superpowers/plans/2026-05-02-realistic-room-lighting.md). Landed 2026-05-02. New `RoomDaylight` component drives per-room ambient fill from `relaxDaylight` (door-aware) and per-windowed-wall directional injectors from `roomDaylightFactor`, both gated by a new `daylightAdmittance` curve. Global ambient/envIntensity baseline lowered so windowless interiors read dim unless an open door bleeds light from a windowed neighbour.

Pending: visual smoke test in browser at the four time-of-day keypoints × {all doors open, all closed, household-shelter only closed}; tune `AMBIENT_FILL_GAIN` / `WINDOW_INJECTOR_GAIN` in [roomDaylightIntensities.ts](src/scene/lighting/roomDaylightIntensities.ts) or `ADMITTANCE_KEYS` in [altitudeCurve.ts](src/scene/lighting/altitudeCurve.ts) if any reading looks wrong.

### Realism follow-ups (Singapore tropical defaults, 2026-05-02)

Initial pass landed: ACES tone mapping + per-altitude exposure tween, Singapore-zenith key (alt=80°, brighter & cooler), envIntensity attenuation so the drei `night` HDRI no longer over-lights dark rooms, tropics-baseline turbidity, low preset now keeps IBL on, always-on SMAA, Bloom at the high preset. Touched: [qualitySlice.ts](src/state/slices/qualitySlice.ts), [altitudeCurve.ts](src/scene/lighting/altitudeCurve.ts), [Lighting.tsx](src/scene/lighting/Lighting.tsx), [Environment.tsx](src/scene/lighting/Environment.tsx), [Scene.tsx](src/scene/Scene.tsx), [PostFx.tsx](src/scene/lighting/PostFx.tsx).

Follow-up 2026-05-02: reshaped [altitudeCurve.ts](src/scene/lighting/altitudeCurve.ts) to dim/warm earlier — added keyframes at alt=15° (≈1 h before sunset) and alt=6° (golden hour), and dropped the alt=0° direct-sun term so 18:00 in Singapore is no longer noon-bright.

Follow-up 2026-05-02: removed `RoomFillLights` entirely. The per-room ceiling pointLight was a daylight-bounce stand-in that read as a fake installed downlight; with IBL on it's redundant, and at night it glowed without any user-installed fixture. Sun + sky IBL + ambient floor are now the only sources of apartment illumination unless the user installs a fixture. Dead `interRoomBleed` quality toggle removed from presets and the Settings UI; schema field kept as `.optional()` so older saves still parse.

Follow-up 2026-05-02: removed per-window `windowInjector` pointLights from [RoomDaylight.tsx](src/scene/lighting/RoomDaylight.tsx). At ~0.5 m inset with `decay=2`, each injector's inverse-square hot zone landed on the window-wall interior surface and read as a spotlight halo around the window — same failure mode as the earlier `RoomFillLights` removal. The window-bearing dose (`base[id] * 1.4`) is now folded into the centroid `ambientFill` via the renamed `WINDOW_FILL_GAIN` in [roomDaylightIntensities.ts](src/scene/lighting/roomDaylightIntensities.ts), so window-bearing rooms still read brighter than door-bled neighbours but without the per-window point hotspot. `roomWindowedWallInjectors` and `WallInjector` deleted from [roomCentroids.ts](src/scene/lighting/roomCentroids.ts).

- **Verify in-browser at each time-of-day keypoint** (zenith, golden hour, civil twilight, deep night) — the curve looks right by the numbers but the tone-mapping interaction needs a visual smoke test before we treat realism work as done.

Landed 2026-05-02:

- **User-facing exposure slider** — `quality.exposureBias` (0.5–1.5×, default 1.0) in [SettingsPanel.tsx](src/ui/SettingsPanel.tsx); applied as a multiplier on `gl.toneMappingExposure` in [Lighting.tsx](src/scene/lighting/Lighting.tsx).
- **Weather / haze knob** — `quality.weather` ∈ {clear, hazy, overcast} multiplies sky turbidity via `weatherTurbidityMultiplier` in [altitudeCurve.ts](src/scene/lighting/altitudeCurve.ts), consumed by [Sky.tsx](src/scene/lighting/Sky.tsx). Singapore default is `hazy`.
- **Auto-fixtures dusk hand-off** — `quality.fixtures` is now tri-state (`auto` | `on` | `off`); `auto` ramps fixture intensity 0→1 as the sun crosses +5° → −6° via `autoFixtureLevel` in [altitudeCurve.ts](src/scene/lighting/altitudeCurve.ts), applied per-light in [FurnitureLights.tsx](src/scene/furniture/FurnitureLights.tsx). Schema accepts old boolean and migrates.
- **Skyglow window leak at night** — drei's bluish `night` preset removed; sub-horizon altitudes now select `sunset` instead, which is warm-orange and reads more like Bortle-8–9 urban skyglow once attenuated by `envIntensity`. See [Environment.tsx](src/scene/lighting/Environment.tsx).
- **Time-of-day: outdoor environment** — landed 2026-05-02. Spec: [docs/superpowers/specs/2026-05-02-outdoor-environment-design.md](docs/superpowers/specs/2026-05-02-outdoor-environment-design.md). [OutdoorScene.tsx](src/scene/outdoor/OutdoorScene.tsx) renders a 200 m ground disc + procedural ring of 32 deterministic HDB-style boxes ([buildings.ts](src/scene/outdoor/buildings.ts), seeded mulberry32, R 55–110 m, h 22–75 m). Window grid texture from [buildingTexture.ts](src/scene/outdoor/buildingTexture.ts) emissive-glows at night via `autoFixtureLevel`. Gated by new `quality.outdoor` (default true). Photo-textured 360° panoramas + foliage/cars deliberately out of scope.
- **Time-of-day: window glass tinting + curtains** — landed 2026-05-02. Spec: [docs/superpowers/specs/2026-05-02-window-tint-curtains-design.md](docs/superpowers/specs/2026-05-02-window-tint-curtains-design.md). New `windowsSlice` (global tint preset + curtains-closed flag + curtain opacity), curtain mesh as a shadow caster in [Window.tsx](src/apartment/Window.tsx), and [WindowSunbeams.tsx](src/scene/lighting/WindowSunbeams.tsx) projects each window aperture along the light-flow direction onto the floor and additively blends a tinted parallelogram. Approach B (faux tinted floor decals + opaque curtains as shadow casters); custom depth-color shadow shaders deliberately out of scope. Per-window tint + per-window curtain UX deferred — would need window selection plumbing.
- **Time-of-day: directional weighting of door bleed** — landed 2026-05-02. Spec: [docs/superpowers/specs/2026-05-02-directional-door-bleed.md](docs/superpowers/specs/2026-05-02-directional-door-bleed.md). `relaxDaylight` now takes optional `sunDir`; per-edge attenuation is weighted by `dot(doorNormal, -sunDir.xz)` with `W_MIN=0.4`, range `[0.16, 0.40]`. Backwards-compatible when `sunDir` is omitted or below horizon.
- **Time-of-day: auto-advancing in-world clock** — new `accelerated` mode in [timeSlice.ts](src/state/slices/timeSlice.ts) with user-tunable `timeScale` (60×–3600×, default 600×). Driven by [AcceleratedClock.tsx](src/scene/lighting/AcceleratedClock.tsx) inside the Canvas frame loop.

## Risks tracked from specs

- **Asset source URL drift** (Poly Haven / ambientCG slug versioning) — pin to stable per-asset URLs in manifest, audit periodically. See [asset-population spec — Risks](docs/superpowers/specs/2026-04-26-asset-population-design.md#risks).
- **Bbox-derived footprints can be wrong** for off-floor anchors / non-uniform scale — documented in drop-folder README; revisit if it bites users. See [asset-population spec — Risks](docs/superpowers/specs/2026-04-26-asset-population-design.md#risks).

## Process

- Update this file every time a plan is designed or work is implemented (see `MEMORY.md` feedback rule).
