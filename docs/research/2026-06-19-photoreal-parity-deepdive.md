# Pure-client photorealism + Coohom/SH3D parity — deep-dive dossier (2026-06-19)

Implementer-ready research dossier driving the next several iterations toward the
**primary directive**: ultra-detailed photorealism + feature/visual parity with
**Coohom** and **Sweet Home 3D**, **strictly pure client-side** — no real-GPU
dependency, no network/backend, and **implementable + verifiable headlessly** on
WebGL/SwiftShader.

> Scope discipline. This file does **not** re-list shipped work; it only adds depth
> beyond `PHOTOREALISM.md` / `FEATURE_PARITY.md`. Cross-reference: roadmap items keep
> their stable `PHOTO-*` / `PARITY-*` ids there; the new work items here use `RD-xxx`
> ids the orchestrator can dispatch one-per-agent. When an `RD-xxx` lands, delete it
> here and fold the corresponding bullet into `PHOTOREALISM.md` / `CHANGELOG.md`.

**Audited pipeline state (skim, 2026-06-19 worktree).** Tiers in `scene/quality.ts`
(Performance = flat default: no shadows/IBL/post, DPR1; Medium = 1024 shadow + procedural
Lightformer IBL probe; High = +N8AO/Bloom/SMAA; Maximum = +full-res AO/grain/CA). Sun =
`DirectionalLight` + **`PCFSoftShadowMap`** (`scene/Scene.tsx:78`), radius 4 (`look.ts`
`SOFT_SHADOW`). Post stack `scene/EffectsImpl.tsx` (N8AO→Bloom→HueSat→[CA]→Vignette→
[grain]→SMAA). Materials: `MeshStandardMaterial` (procedural maps) +
`MeshPhysicalMaterial` (sheen/clearcoat/transmission via `materialRealism.ts`). Procedural
generators `materials/procedural/generators.ts` + `patterns/{wood,stone,tile,wall,fabric}.ts`
+ `upholsterySeams.ts`. Contact shadow blobs `scene/ContactShadow.tsx` (all tiers). IBL
probe `scene/lighting/SceneEnvironment.tsx` (Lightformers, no HDRI). Path tracer
`scene/pathtrace/hqRenderSession.ts` + `hqTracerConfig.ts`.

---

## 1. Executive summary — top 5 by impact ÷ effort

1. **RD-401 Anisotropy = device max, applied everywhere (S).** Anisotropy is hardcoded
   `8` (`generators.ts:135,152`, `cache.ts:60`) and `4` (`furnitureMaterials.ts:53`) and
   **never queried from `gl.capabilities.getMaxAnisotropy()`** — so on a 16× device every
   tiled floor/wall is needlessly blurred at grazing angles (the single most visible "not
   photoreal" tell on floors), and there is no single knob. One shared helper + a capped
   value fixes every tiled surface at once. Highest impact ÷ effort in the codebase.

2. **RD-402 Roughness/AO/normal micro-variation per material family (M).** Floors/walls
   read CGI because roughness is near-uniform per pattern. Wood already got an `microRough`
   break-up (`patterns/wood.ts`) and fabric got seams — extend the *same cheap fbm-on-the-
   roughness* trick to **stone, tile, concrete, plaster, metal** and add **brushed-metal
   anisotropy** (three.js `anisotropyMap`/`anisotropyRotation` are shipping API — confirmed).
   Pure procedural, headless-verifiable (pixel-stats on the generated buffers).

3. **RD-403 Baked AO-in-corners contact decal on the flat tier (M).** Performance (the
   default everyone first sees) has no AO and only blob contact shadows. A cheap, prebaked
   **soft gradient "corner darkening" decal** along wall/floor junctions + under furniture
   feet (extend `ContactShadow.tsx` pattern) closes most of the perceived gap to Medium's
   N8AO **with zero shadow-map / SSAO cost**. The earlier RZ1 grounding revert was about a
   different cue; this is corner-contact, the biggest flat-tier weakness.

4. **RD-404 Khronos PBR-Neutral default in finish-preview context + AgX for "photo" (S).**
   `look.ts` already ships all three tone-mappers and a per-mode exposure bias; the only
   change is **defaulting** Neutral when previewing finishes/swatches (true albedo) and AgX
   for the photo/render presets. Pure config, unit-testable, immediate "looks designed not
   rendered" win. (PHOTOREALISM.md already recommends this; nobody has flipped the default.)

5. **RD-405 Cheap window glass realism on every tier (M).** Glass transmission is High/Max
   only (`materialRealism.ts` `transmissionTiers`); the shipped sky-catch emissive (RZ2)
   helps but panes still read flat on Performance/Medium. Add a **screen-door-free fake
   refraction**: a subtle daylight-driven **fresnel rim + gradient sky reflection** baked
   into the cheap glass material (emissive + low-roughness env tint) so windows + glassware
   read as glass with **no transmission pass**. Headless-verifiable (material params).

---

## 2. Photorealism levers (pure-client / WebGL / headless-verifiable)

Legend — Effort S/M/L. Verify: **H** = headless (DOM/scene-graph/unit/pixel-stats on
generated buffers, converges on SwiftShader) · **H◑** = wiring/determinism headless, final
pixel pass nicer on a real GPU but not required. Flag = gate per CLAUDE.md (CC0/pure-code →
prod-safe default `true`; categorise tier simple/pro).

### 2.1 Texture filtering — anisotropy (RD-401, S, H)
**What.** Anisotropic filtering keeps tiled textures sharp at grazing angles (floors seen
down their length, walls in perspective). **Bug:** hardcoded everywhere and never capped to
the device max.
- `materials/procedural/generators.ts:135` (`toTexture`) and `:152` (`rawToTexture`) → `8`.
- `materials/cache.ts:60` (`imageBitmapToTexture`, worker-upgraded maps) → `8`.
- `materials/furnitureMaterials.ts:53` → `4`.
**Integration.** Add `materials/textureAniso.ts` exporting `maxAnisotropy(gl)` =
`gl.capabilities.getMaxAnisotropy()` (cached) and an `applyAniso(tex, gl)` helper. Thread
the renderer's capability into the texture-creation paths (the generators are called from
`cache.ts`/`useMaterial.ts` which run inside the R3F tree, so the `gl` is reachable via a
one-time module init, e.g. set a module-level `MAX_ANISO` from a tiny R3F component on first
frame, default 8 until known). Replace all four literals. Also apply on **GLB/uploaded**
textures in the loader path (search `useGLTF`/`gltf` loaders — they currently never set it).
**Impact.** High — every floor/wall/worktop. **Verify H.** Unit-test the helper clamps to a
mocked cap; assert created textures carry the resolved value.

### 2.2 Procedural micro-detail per material family (RD-402, M, H)
**What.** Per-texel roughness + subtle normal break-up so surfaces aren't dead-flat-sheen.
Wood already does this (`patterns/wood.ts` `microRough` fbm on the roughness map) and fabric
got seam/wrinkle (`upholsterySeams.ts`). Extend the identical cheap technique to the rest:
- **Stone/marble** (`patterns/stone.ts` `marbleFields`/`concreteTerrazzo`): add fine
  roughness mottle so polished marble has wet/dry variation; veins should also perturb the
  normal slightly (currently mostly albedo). Concrete: pinhole-pore darkening in AO/rough.
- **Tile/ceramic** (`patterns/tile.ts`): ✅ **DONE (MAT-002)** — glaze "orange-peel" micro-normal
  on the tile face (not the grout) + an explicit glaze↔grout roughness contrast, via the pure
  `procedural/tileSurface.ts` (`makeGlazePeel`/`glazeRoughness`), aligned with each painter's grout
  grid (tile/hexagon/subway). Tasteful defaults, Path-A all-tier, no flag.
- **Plaster/paint** (`patterns/wall.ts`, shared `getPlasterNormal`): already one shared
  256² normal — add a faint large-scale roughness variation map (roller-nap unevenness).
- **Metal — brushed-metal anisotropy (the notable gap).** Appliances use flat
  `{roughness:0.3, metalness:0.88}` for steel (`furnitureMaterials.ts:966`, `applianceFinish`)
  with **no directional brushing**. three.js `MeshPhysicalMaterial.anisotropy` +
  `anisotropyMap` + `anisotropyRotation` are current shipping API (confirmed via three.js
  docs/forum). Add a procedural **brush-direction normal/anisotropy map** (fine 1-D streaks)
  and switch brushed-steel finishes to `MeshPhysicalMaterial` with `anisotropy` set. Big tell
  for fridge/oven/hood realism. Gate the physical upgrade behind the existing realism flag.
**Integration.** New painter helpers in the relevant `patterns/*.ts`, returned through the
existing `Fields` (`fieldKit.ts`) so they ride the worker path (`procedural.worker.ts`) for
free. Metal: extend `furnitureMaterials.ts` `getMetalMaterial`/`applianceFinish` + a new
`patterns/metal.ts`. **Impact.** High (perceived). **Verify H** — extend
`generators.test.ts` with pixel-variance assertions (roughness map std-dev > threshold;
brush map is directional: row-variance ≫ column-variance).

### 2.3 Flat-tier corner AO + contact decals (RD-403, M, H◑)
**What.** Performance tier has no SSAO; rooms read flat. A **prebaked soft darkening** does
80% of AO's job for free: (a) a gradient strip along wall/floor and wall/wall junctions
(ambient-occlusion "dirt" in corners), (b) the existing under-furniture blob already exists —
add a tighter inner core for furniture-on-floor and a vertical gradient where tall items meet
walls.
**Integration.** Mirror `scene/ContactShadow.tsx` (shared `CanvasTexture` gradient, one
transparent plane, `depthWrite:false`, `renderOrder`). Add `scene/CornerAO.tsx` driven by the
floor-plan wall geometry (you already have `apartment/walls/*` + `floorplan/types`); emit thin
darkening quads along each wall base. Gate behind a new `cornerAo` flag (pro? — keep it on for
all tiers since it's cheap; tier simple-safe because it's pure overdraw, but categorise `pro`
if you want Simple truly minimal — recommend **simple-on**, it's a core realism cue). Note:
the **RZ1 revert** was about generic blob grounding being marginal — corner darkening is a
*different, stronger* cue; A/B it but expect a clear win even on SwiftShader.
**Impact.** High on the default tier (what most users see). **Verify H◑** — scene-graph
asserts the quads exist + are positioned at wall bases; visual A/B on the flat tier.

### 2.4 Tone-mapping / exposure / colour-grading defaults (RD-404, S, H)
**What.** Everything is built (`look.ts`: filmic/agx/neutral + `toneExposureBias` +
auto-exposure curve). The lever is **choosing the right default per context**: PBR-Neutral
for finish/swatch preview (no hue shift, true catalogue colour), AgX for "photo" render
presets (gentler highlight roll-off). Also expose a small **white-balance/temperature** dial
distinct from exposure (the `grade().warmth` term already exists — surface it).
**Integration.** `scene/renderPresets.ts` (photo presets → AgX); the finish-preview surfaces
(`ui/inspector/QuickFinishes.tsx`, swatch thumbnails) → Neutral context. Keep user override.
**Impact.** Medium, near-zero risk. **Verify H** — unit-test the preset→tone-mapper mapping;
`look.test.ts` already covers the curves.

### 2.5 Cheap window/glass treatment on every tier (RD-405, M, H)
**What.** Transmission is High/Max only. On the flat default, panes are emissive sky-catch
rectangles (RZ2) but lack reflection/fresnel. Add to the **cheap** glass path
(`materialRealism.ts` `GlassCheap` + `furnitureMaterials.ts` `getGlassMaterial`):
- a **fresnel-rim** brightness (envMap-free: drive `emissiveIntensity` higher toward grazing
  via a cheap radial gradient emissive map, or accept the constant emissive + low roughness),
- a **daylight-driven sky-gradient reflection tint** (reuse `glassSkyCatchIntensity`
  daylight input) so panes read cool-bright by day, dark-reflective by night,
- ensure glassware (vases/cabinet) on the cheap tier uses a faint `envMapIntensity` against
  the IBL probe when present (Medium has IBL but cheap glass; wire the probe reflection in).
For High/Max, the remaining `KHR_materials_volume` work (attenuationColor/thickness) is
tracked under PHOTO-GLASS — not duplicated here.
**Integration.** `materials/materialRealism.ts` (`glassConfig` cheap branch) +
`materials/furnitureMaterials.ts` `getGlassMaterial`. **Impact.** Medium-high (windows are
huge screen area in interiors). **Verify H** — unit-test cheap glass params vs daylight input.

### 2.6 UV / tiling / triplanar improvements (RD-406, M, H)
**What.** World-metre UVs exist (`materials/worldUv.ts`) with per-surface scale/angle. Two
gaps: (1) **visible tile repetition** on large floors — same tile every metre. Add a cheap
**hash-rotation / random-offset per tile** option (UV-domain trick or a low-freq macro-
variation overlay multiplied into albedo) to break the grid. (2) **No triplanar** for
non-planar/extruded geometry (sloped walls, CSG) — UVs stretch. A lightweight triplanar
material variant (or just world-projected planar on the dominant axis) removes stretching on
slanted/curved walls (PARITY-SLOPEWALL/CURVEDWALL already shipped the geometry).
**Integration.** `materials/worldUv.ts` (macro-variation hook), and a `materials/triplanar.ts`
onBeforeCompile injection for the wall/floor materials. **Impact.** Medium (kills the
"obvious tiling" tell). **Verify H** — `worldUv.test.ts` extensions; assert no UV NaNs and
period-breaking offsets.

### 2.7 Edge/corner treatment (RD-407, M, H◑) — finish PHOTO-BEVELS
**What.** Bevels (`furniture/primitives/BeveledBox.tsx`, `safeBevelRadius`) are migrated to
tables/desks/case goods but **not** the panel/shelf-built units (Bookshelf, Wardrobe, cabinet
modules) and appliances (per PHOTOREALISM PHOTO-BEVELS "Remaining"). Hard 90° edges are the
clearest "primitive box" tell. Finish the migration.
**Integration.** `Bookshelf.tsx`, `Wardrobe.tsx`, `CabinetModule.tsx`, `CabinetCorner.tsx`,
appliance primitives — swap inner `boxGeometry` for `BeveledBox`. **Impact.** Medium. **Verify
H◑** — `BeveledBox.test.ts` covers clamp math; structural correctness headless, light-catch
real-GPU-pending (already noted).

### 2.8 Decor density & realism (RD-408, M, H)
**What.** Set-dressing (`furniture/layout/decorStyling.ts`) + auto-styling shipped; the
levers now are **density + variety + placement realism**: more host-surface types, clustered
(not centered) placement with small random offset/rotation (real styling is asymmetric), and
a few **hero props with real silhouettes** (books with varied spine colours, layered
cushions, trailing plants). Empty/under-dressed rooms are the #1 "fake" tell for casual users
(PHOTOREALISM PHOTO-DETAIL-PROPS). Stay procedural/CC0.
**Integration.** `decorStyling.ts` (placement jitter + more host rules), new primitives in
`furniture/primitives/` (e.g. layered cushion stack, stacked-books variant), `furnishPlan.ts`
density. **Impact.** High perceived realism, low GPU. **Verify H** — `decorStyling.test.ts`
asserts counts/host-matching/determinism + non-zero jitter.

### 2.9 Light falloff / temperature realism (RD-409, M, H◑)
**What.** Fixture lights exist (`scene/lighting/FurnitureLights.tsx`, `fixtureGlow.ts`).
Realism levers, all pure-code: (a) **physically-plausible inverse-square falloff + `decay=2`**
on point/spot lights (verify it's set; default three decay is 2 but legacy code sometimes
overrides), (b) **colour temperature per fixture type** (warm 2700K bulbs vs cool 4000K
kitchen/bath vs daylight) mapped to RGB, (c) **per-fixture intensity in lumens→candela**
sanity so a table lamp doesn't blow out a room. This is the cheap cousin of IES (the
`.ies`-import gap stays in FEATURE_PARITY).
**Integration.** `scene/lighting/FurnitureLights.tsx` + a `lighting/colorTemperature.ts`
(Kelvin→RGB). **Impact.** Medium. **Verify H◑** — unit-test Kelvin→RGB + falloff params;
pixel warmth real-GPU-nicer.

### 2.10 Soft shadows via VSM (RD-410, M, H◑)
**What.** PHOTOREALISM PHOTO-SOFTSHADOW: do **NOT** use drei `<SoftShadows>`/PCSS (broken on
three r182+). Switch `renderer.shadowMap.type` from `PCFSoftShadowMap`
(`scene/Scene.tsx:78`) to **`VSMShadowMap`** and tune `light.shadow.radius`/`blurSamples`
(`look.ts` `SOFT_SHADOW`) for penumbra that widens with distance — softer, more realistic
contact-hardening than fixed-radius PCF.
**Integration.** `scene/Scene.tsx` (shadow type), `scene/lighting/Lighting.tsx` +
`look.ts` (radius/blurSamples/bias — VSM needs different bias than PCF; expect to retune to
avoid light-bleed). **Impact.** Medium (Medium+ tiers). **Verify H◑** — shadow-map type assert
headless; penumbra quality real-GPU. Conflicts with RD-403 only if both touch `Scene.tsx`.

### 2.11 SSAA on the export/snapshot path (RD-411, S, H◑) — PHOTO-SSAA-EXPORT
**What.** Render the still/export larger then downsample for reference-quality edges,
independent of live SMAA. Cheap, big quality lift on shared images.
**Integration.** `scene/ScreenshotController.tsx` / `captureCanvas.ts` / the HQ/export path —
render at 2× then box-downsample to target. **Impact.** Medium on exports. **Verify H◑** —
assert output dimensions + a downsample step ran headless.

### 2.12 Procedural sky/IBL gradient upgrade (RD-412, S, H)
**What.** The IBL probe is a hand-placed Lightformer rig (`SceneEnvironment.tsx`) and walk
backdrop is a procedural equirect (`scene/backdropEquirect.ts`). Until CC0 HDRIs are bundled
(PHOTO-HDRI, needs a connected session), improve the **procedural** sky: a physically-shaped
**Preetham/Hosek-style gradient** (horizon glow + sun disc + altitude-driven colour) feeding
both the backdrop and a PMREM-prefiltered env so reflections get a believable sky without any
asset fetch. Pure-code, ships in prod now.
**Integration.** `scene/backdropEquirect.ts` (sky model) + feed into `SceneEnvironment.tsx`
as an alternative to the Lightformer rig. **Impact.** Medium. **Verify H** — unit-test the
gradient is monotonic horizon→zenith and sun-position-driven.

---

## 3. Feature / UX parity gaps (pure-client, not GPU/backend)

These are *not* in the photoreal track but are pure-client Coohom/SH3D parity gaps still open
in `FEATURE_PARITY.md` (don't re-derive — these are the highest-value remaining ones, with
fresh integration notes). Sequencing IDs continue the RD series.

- **RD-420 Keyboard wall-length/angle entry while drawing (M, H).** SH3D parity + matches
  **Arcadium 3D**'s precision pitch (REFERENCES.md). `ui/floorplan/editor/WallNumericEntry.tsx`
  already exists (just shipped) — extend it to **live entry mid-draw** (type length+angle, lock
  axis). Touches the floorplan editor draw loop. Verify H (numeric→coords unit tests).
- **RD-421 Fisheye / DoF lens options on the render camera (M, H◑).** SH3D. DoF partly exists
  in the HQ path (`PhysicalCamera`); add lens-type (fisheye/wide/normal) + aperture controls to
  the render camera UI. `scene/cameras/*` + render modal. Verify wiring H, bokeh real-GPU.
- **RD-422 8K tiled still + fast rasterized "preview render" tier (M, H◑).** Coohom analog.
  Tiled offscreen render to 8K (reuse the path-tracer tiling concept for the raster path) +
  a one-frame high-quality raster capture as the local "10-second render". `pathtrace/` + a new
  raster capture path. Verify dimensions H, quality real-GPU.
- **RD-423 Day-to-night animated render clip (M, H).** Coohom. Animate the time-of-day slider
  along the existing saved-views video path (`RecordController.tsx` + `viewTour.ts`). Verify the
  hour interpolation H.
- **RD-424 In-engine one-tap style transfer (no API key) (M, H).** FEATURE_PARITY consumer
  cluster + REFERENCES (Spacely/Decor8 magic-recolor). Swap palette/materials/finishes to a
  named style using existing procedural + CC0 assets + `materials/stylePresets.ts`. Pure-client,
  high "wow", complements decor styling. Verify deterministic palette swap H.
- **RD-425 Before/after reveal slider + shareable design card (S, H).** Consumer front-of-funnel
  edge; pure-client. Reuse `ScreenshotController` for two captures + a slider UI. Verify H.

(Out-of-this-track but tracked in FEATURE_PARITY and still pure-client: curved-wall already
shipped; SH3D/SH3F import (L); i18n (L); plugin API (L) — left there, not pulled forward.)

---

## 4. Explicitly out of scope (need a real GPU or a backend — do NOT dispatch agents)

These genuinely cannot be implemented + verified headlessly on SwiftShader, or need
network/backend — keep them off the parallel agent queue:

- **Real path-trace pixel tuning / convergence** (PHOTO-PT-TUNE g-tail) — SwiftShader won't
  converge; needs a real-GPU session.
- **Browser OIDN denoise on the HQ still** (PHOTO-DENOISE) — tfjs/WebGL U-Net; verifiable only
  on a real GPU; ship-behind-flag work, not a headless agent task.
- **SSGI / SSR / WebGPU path** (PHOTO-SSGI-SSR, PHOTO-WEBGPU, `realism-effects`) — WebGPU
  maturity + real-GPU verification.
- **GTAO pixel quality** (PHOTO-GTAO) — wiring is headless but the A/B-vs-N8AO win needs a GPU.
- **POM / parallax-occlusion on floors** (PHOTO-POM) — shader ray-march, real-GPU only.
- **HDRI fetch + image-based IBL** (PHOTO-HDRI) — needs a connected session to add the `.hdr`
  CC0 assets (sandbox can't fetch); the *procedural* sky upgrade RD-412 is the headless stand-in.
- **PBR-MAPS / KTX2 prod** (PHOTO-PBR-MAPS, PHOTO-KTX2) — need fetched CC0 texture sets +
  a connected session; KTX2 encoder dep gap (see `TODO.md`).
- **Bloom / emissive amount final tuning, soft-shadow penumbra final look** — wire headless,
  flag the pixel pass real-GPU-pending (consistent with the existing F1/G-tail posture).
- **Cloud accounts, collab/CRDT, hosted 60k–1M model library, branded catalogs, e-commerce/CNC,
  Android Scene-Viewer AR (needs https-hosted model)** — backend/licensing (FEATURE_PARITY §4).

---

## 5. Recommended sequencing (ordered by impact ÷ effort; one item per agent)

Dependencies/conflicts flagged so the orchestrator avoids parallel edits to the same file.

| # | ID | One-line | Effort | Files / conflict notes |
|---|----|----------|--------|------------------------|
| 1 | **RD-401** | Anisotropy = `getMaxAnisotropy()`, one helper, applied to all tiled + GLB textures | S | `materials/textureAniso.ts` (new), `procedural/generators.ts`, `materials/cache.ts`, `furnitureMaterials.ts`, GLB loader path. **Touches `generators.ts`+`cache.ts` — do NOT run parallel with RD-402.** |
| 2 | **RD-404** | PBR-Neutral default for finish preview, AgX for photo presets + temperature dial | S | `scene/renderPresets.ts`, `ui/inspector/QuickFinishes.tsx`, `look.ts` (read-only). Independent. |
| 3 | **RD-405** | Cheap window/glass fresnel + sky-reflection on every tier | M | `materials/materialRealism.ts`, `furnitureMaterials.ts` (getGlassMaterial). **Shares `furnitureMaterials.ts` with RD-401/402 — sequence after them.** |
| 4 | **RD-403** | Flat-tier corner-AO + contact darkening decals | M | `scene/CornerAO.tsx` (new), `scene/ContactShadow.tsx`. **Shares `Scene.tsx` mount with RD-410 — sequence vs RD-410.** |
| 5 | **RD-402** | Roughness/AO micro-variation for stone/tile/concrete/plaster + brushed-metal anisotropy | M | `procedural/patterns/{stone,tile,wall}.ts`, `patterns/metal.ts` (new), `furnitureMaterials.ts`, `generators.test.ts`. **Conflicts RD-401 (generators), RD-405 (furnitureMaterials) — serialize.** |
| 6 | **RD-408** | Decor density/variety + asymmetric placement jitter + hero props | M | `furniture/layout/decorStyling.ts`, `furnishPlan.ts`, new primitives. Independent of the material track. |
| 7 | **RD-407** | Finish PHOTO-BEVELS: bevel shelf/cabinet/appliance primitives | M | `furniture/primitives/{Bookshelf,Wardrobe,CabinetModule,CabinetCorner}.tsx` + appliances. Independent (per-primitive). |
| 8 | **RD-412** | Procedural Preetham/Hosek sky gradient → backdrop + procedural IBL | S | `scene/backdropEquirect.ts`, `scene/lighting/SceneEnvironment.tsx`. Independent. |
| 9 | **RD-406** | Tile-repetition break-up (UV hash/macro-variation) + triplanar for sloped/curved walls | M | `materials/worldUv.ts`, `materials/triplanar.ts` (new). Independent. |
| 10 | **RD-409** | Light colour-temperature (Kelvin→RGB) + inverse-square falloff per fixture | M | `scene/lighting/FurnitureLights.tsx`, `lighting/colorTemperature.ts` (new). Independent. |
| 11 | **RD-410** | VSM soft shadows (replace PCFSoft) + retune radius/bias | M | `scene/Scene.tsx`, `scene/lighting/Lighting.tsx`, `look.ts`. **Shares `Scene.tsx` with RD-403 — serialize.** |
| 12 | **RD-411** | SSAA (2× render → downsample) on snapshot/export path | S | `scene/ScreenshotController.tsx`, `scene/captureCanvas.ts`. Independent. |

**Parallelism guidance.** Safe parallel batches (no shared files):
`{RD-404, RD-408, RD-407, RD-412}` then `{RD-406, RD-409, RD-411}`.
Serialize the **materials chain** `RD-401 → RD-402 → RD-405` (all touch
`generators.ts`/`cache.ts`/`furnitureMaterials.ts`). Serialize the **Scene.tsx pair**
`RD-403` vs `RD-410`. The parity items `RD-420…RD-425` are an independent track (floorplan
editor / cameras / styling UI) and don't conflict with the photoreal material/scene files —
dispatch them in their own lane.

> Every `RD-xxx` ships behind a `FEATURE_FLAGS` entry with a `tier` (most photoreal
> material/lighting upgrades are core-loop → `simple`-safe and prod default `true` since
> they're pure-code/CC0; analytical/pro extras → `pro`), and must be **unit-tested in both
> Simple and Pro** where visibility depends on a `pro` flag (CLAUDE.md hard rule).
