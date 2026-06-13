# Photorealism roadmap

Primary parity goal (user, 2026-06-13): make the app **ultra-detailed and photorealistic** —
matching/surpassing Coohom and Sweet Home 3D on visual fidelity, **fully client-side**. This
file consolidates a multi-stream research pass (render pipelines, real-time WebGL techniques,
in-browser path-tracing + denoising, AA, PBR materials + AO, tone-mapping + post-FX, and an
audit of our own pipeline) into a prioritised, implementable roadmap. See `FEATURE_PARITY.md`
for the broader gap matrix, `TASKS.md` for live tracking, `CHANGELOG.md` for shipped work.

## How the benchmarks achieve photorealism (and our strategy)
- **Coohom** — the photoreal look is the **offline cloud render** (path-traced, 4K–16K, AI-denoised)
  using **HDRI environment lighting** + physically-based area/IES lights + good PBR materials. The
  live WebGL editor is a lower-fidelity preview. The "view out the window" = an **HDRI sky/skyline**
  (no parallax, physically correct for distance) + optional placed 3D exterior models for near-field.
- **Sweet Home 3D** — an **offline path tracer** (SunFlow / YafaRay plugin) with sun-by-date/location
  + placed light sources; window scenery via a sky texture or a photo billboard behind the glass.
- **Our strategy (no backend):** push the **real-time tiers** as far as WebGL2/WebGPU allow AND make
  our **in-browser `three-gpu-pathtracer` HQ still** genuinely photoreal (it's our "cloud render"
  analogue, just local). Both paths get **HDRI lighting**, better materials, and (for the still) a
  **browser OIDN denoiser**. All additions use **CC0** imagery → ship in prod.

## Where we are now (pipeline audit)
- **Tiers** (`scene/quality.ts`): Performance (flat, default — no shadows/IBL/post, DPR1) → Medium
  (1024 sun shadow + procedural IBL probe + contact shadows) → High (2048 + N8AO + Bloom + SMAA) →
  Maximum (4096 + full-res AO + film grain + chromatic aberration).
- **Lighting**: sun `DirectionalLight` + `PCFSoftShadowMap` (radius 4, not PCSS); hemisphere + flat
  ambient; **procedural Lightformer IBL probe** (64–256px) — **no HDRI image IBL**.
- **Materials**: `MeshPhysicalMaterial` with procedural micro-textures (≤512px albedo/normal/rough),
  sheen + clearcoat (all tiers, `materialRealism.ts`), transmission glass (High/Max only). **No
  high-res scanned PBR maps; KTX2 scaffolded but not shipped in prod; no POM/displacement.**
- **Post** (`Effects.tsx`): N8AO → Bloom → HueSat → (CA) → Vignette → (grain) → SMAA. Tone-mappers
  Filmic(ACES)/AgX/Neutral available; auto-exposure + user dial.
- **Path tracer** (`pathtrace/hqRenderSession.ts`): progressive, tiled, `PhysicalCamera` DoF,
  library `DenoiseMaterial` (edge-blur). **Environment is a 2-colour gradient (no HDRI); no OIDN;
  bounce/firefly settings untuned.**
- **Geometry**: `geometryDetail` segment multiplier; `RoundedBox` corners on some primitives; contact
  shadow blobs Medium+. **No edge bevels on hard primitives; few set-dressing props.**
- **Backdrops**: procedural City/Park/Hills/Studio (instanced). **No HDRI sky.**

## Roadmap — prioritised by impact ÷ effort

Legend — Verify: `H` headless-verifiable (DOM/scene-graph/unit) · `G` needs a real-GPU pixel pass
(SwiftShader headless won't converge — flag pending, like the existing F1 tail). Tier = where it
belongs. Flag = gate per CLAUDE.md (CC0 → prod-safe).

### Tier 1 — highest impact, mostly verifiable, do first
0. **PHOTO-COLORSPACE — texture colour-management audit** (S, all tiers; Verify H — unit-testable).
   The #1 cause of "looks flat/wrong vs reference": albedo/emissive textures must be `SRGBColorSpace`;
   data maps (normal/roughness/metalness/AO) must be `NoColorSpace` (linear). Audit the procedural
   generators (`materials/procedural/generators.ts` CanvasTextures) + `furnitureMaterials.ts` + upload
   path and assert correct `colorSpace` per map role. Cheap, high-certainty, headless-verifiable.
1. **PHOTO-BACKDROP — flat photo / equirectangular backdrop** ✓ **SHIPPED** (M, all tiers; Verify H/G).
   The surroundings are now a flat equirectangular photo as `scene.background` shown **in walk mode only**
   (orbit dollhouse stays clean) — the legacy instanced 3D City/Park/Hills/Studio estates were removed
   per product decision. Presets `city/dusk/park/hills` bake procedurally (`backdropEquirect.ts` + pure
   `backdropHorizon.ts`); **users can upload their own photo** (`custom`, persisted in IDB via
   `storage/walkBackdrop.ts`, `customBackdrop` flag); `none` = plain sky. Flags `backdrops` +
   `customBackdrop` (Simple tier, prod-safe). **Follow-up:** bundle real CC0 equirectangular photos for the
   presets (connected session); pairs with #1b.
   **PRODUCT DECISION (user, 2026-06-13): prefer the cheap "budget trick" photo backdrop over the
   procedural 3D City/Park/Hills geometry — it saves compute + memory and drives performance.** In
   WebGL the optimal form is a **single equirectangular photo as `scene.background`** (a skybox): one
   texture, ZERO per-frame geometry/draw-calls (vs the instanced estates), no per-window placement,
   doesn't block sunlight, seen correctly through every window; its lack of parallax is physically
   correct for distant scenery. Add a `photo`/`skyline` `BackdropKind` in `SceneBackdrop` that sets
   `scene.background` to an LDR equirectangular image and **skips the instanced 3D backdrop entirely**;
   make the procedural 3D backdrops optional/legacy. Asset-free default = a procedurally-baked
   sky+skyline equirectangular canvas (reuse `CityBackdrop`'s façade art) so it ships with no fetch;
   designed to accept a real CC0 photo later. New `photoBackdrop` flag (prod-safe). Pairs with #1b.
1b. **PHOTO-HDRI — HDRI environment lighting (IBL)** (M, real-time Medium+ **and** path tracer; Verify G/H).
   The *lighting* counterpart to #1: bundle a few **CC0 Poly Haven** HDRIs (1–2K `.hdr`); add an HDRI
   mode to `SceneEnvironment` (drei `<Environment>` → PMREM) as `scene.environment` (IBL) and feed the
   **same env into the path tracer** (`root.environment`, importance-sampled). The HDRI may also serve
   as the photo background (#1) when present. New `hdriEnvironment` flag (pro, prod-safe). Needs the
   `.hdr` asset added in a connected session (sandbox can't fetch).
2. **PHOTO-PT-TUNE — path-tracer quality settings** (S, HQ still; Verify G).
   In `hqRenderSession.ts`: `bounces≈10`, `transmissiveBounces≈6` (fixes black/opaque glass),
   `filterGlossyFactor≈0.75` (kills sun-through-glass fireflies), `multipleImportanceSampling=true`,
   `stableNoise=true`, `minSamples≈5`; add a quality preset (Draft 64 / Standard 256 / Max 1024).
   Pure config, low risk; pixel pass needs real GPU.
3. **PHOTO-EMISSIVE — HDR emissive + bloom** ✓ **SHIPPED** (S, all tiers; Verify H + G-tail).
   Lamps/sconces/cove strips/ceiling fans now ramp emissive via a centralised tuned helper
   (`scene/lighting/fixtureGlow.ts` `fixtureEmissiveIntensity`) whose night peaks clear the Bloom
   threshold (~1.05) so they bloom on High/Max AND read self-lit on the flat tier; TV/monitor screens +
   vanity bulbs bumped >1. Flat-tier self-lit verified headless; **G-tail:** tune the bloom amount on a
   real GPU.
4. **PHOTO-DETAIL-PROPS — set-dressing prop bundle** (M, all tiers; Verify H).
   Curated CC0 decor/styling props (books, trays, cushions, vases, plants, rugs, bowls) — the single
   biggest *perceived*-realism lever for casual users (empty rooms read fake). Overlaps C-PLANTS/DECOR
   in TASKS; ship as a prod CC0 pack + one-tap "style this room" placement.
5. **PHOTO-BEVELS — edge bevels on hard primitives** ◑ **IN PROGRESS** (M, all tiers incl. flat; Verify G).
   New shared `furniture/primitives/BeveledBox.tsx` (drei `RoundedBox` + auto-clamped ~7 mm chamfer,
   detail-scaled smoothness; pure tested `safeBevelRadius`) replaces sharp `boxGeometry` slabs. Migrated:
   tables + desk (CoffeeTable, DiningTable, ConsoleTable, Desk) and freestanding case goods (Sideboard,
   Dresser, TVConsole, Nightstand — carcass boxes, drawer/door fronts, plinths/legs; panel-built frames
   left sharp to avoid join notches). **Remaining:** panel/shelf-built units (Bookshelf, Wardrobe,
   cabinet modules) + appliances. Edge light-catch is real-GPU-pending; structural correctness verified.

### Tier 2 — high impact, needs real-GPU verification
6. **PHOTO-DENOISE — browser OIDN on the HQ still** (M–L, HQ still; Verify G).
   Replace the edge-blur with an OIDN U-Net on the final accumulated frame: `DennisSmolek/Denoiser`
   (tfjs, runs on WebGL2) with WebGPU `oidn-web` when available; render cheap **albedo + normal AOV**
   passes from the snapshot scene to guide it (near-offline quality at 64–128 samples). New flag,
   prod-safe (Apache-2.0 weights). Fallback to current `DenoiseMaterial`.
7. **PHOTO-GTAO — GTAO option + AO on more tiers** (M, real-time High/Max; Verify G).
   Offer three.js `GTAONode`/GTAO alongside N8AO (more radiometrically correct); consider a cheap AO
   on Medium. Re-evaluate cheap contact-grounding on the flat tier (the earlier RZ1 attempt was
   reverted as marginal — revisit only with a clear A/B win on a real GPU).
8. **PHOTO-SOFTSHADOW — softer sun shadows** (M, real-time Medium+; Verify G).
   ⚠️ **Do NOT use drei `<SoftShadows>`/PCSS** — broken on three r182+ (drei #2583, calls removed
   `unpackRGBAToDepth`). Instead use **`VSMShadowMap`** (`renderer.shadowMap.type`, soft via
   `light.shadow.radius`/`blurSamples`) and/or extend the existing `<AccumulativeShadows>` showcase
   path (already used Medium+) to more parked views. Tune `look.ts` shadow params. Re-evaluate PCSS
   once drei patches it.
9. **PHOTO-GLASS — transmission + volume + IOR fidelity** (M, materials; Verify G).
   Ensure windows/glassware use real `transmission`+`ior`(1.5)+`thickness`+`attenuationColor`
   (`KHR_materials_volume`); add `transmissionResolutionScale` to bound real-time cost. Extend down to
   Medium where affordable.

### Tier 3 — ultra-detail materials/assets (memory-bound, mostly verifiable)
10. **PHOTO-PBR-MAPS — real 2K CC0 PBR textures over procedural** (L, materials; Verify H/G).
    Bundle curated **Poly Haven / ambientCG** CC0 PBR sets (wood/marble/tile/concrete/fabric/leather/
    metal: albedo+normal+rough+AO) as higher-fidelity finishes over the procedural fallback, world-UV
    tiled. The procedural generators stay as the always-available base.
11. **PHOTO-KTX2 — KTX2/Basis compression in prod** (M; Verify H).
    Ship bundled + uploaded textures as KTX2 (ETC1S/UASTC) to cut VRAM ~4–6× so we can afford 2K maps
    (clears the TODO "real in-browser KTX2 encoder" gap; offline `compress:glb-textures` already
    exists for bundled assets).
12. **PHOTO-POM — parallax-occlusion mapping on hero floors** (M, High/Max; Verify G).
    POM on tile/brick/parquet floors for real recessed grout/relief as the camera moves — big step up
    from normal maps; gate to High+ (shader ray-march cost).

### Tier 4 — frontier (WebGPU / large)
13. **PHOTO-SSGI-SSR** (L, WebGPU/High-end; Verify G). Screen-space GI + reflections via
    `realism-effects` (0beqz) or the three.js WebGPU path; colour bounce + glossy reflections beyond
    the IBL probe + planar mirrors. WebGPU-gated with WebGL fallback.
14. **PHOTO-WEBGPU** (L). Evaluate three.js `WebGPURenderer`/TSL maturity (2026) for true SSGI,
    better lights, compute denoise; capability-detect with WebGL2 fallback.
15. **PHOTO-SSAA-EXPORT** (S, export; Verify G). Supersample the snapshot/export path (render large →
    downsample) for reference-quality stills, separate from the live SMAA.

## Verification posture
Real-time DOM/scene-graph/flag changes are headless-verifiable. **Path-traced + post-heavy pixel
quality (PT tuning, OIDN, SSR/SSGI/PCSS/POM) needs a real-GPU session** — SwiftShader headless won't
converge or present these faithfully (documented under the F1 tail). For those, verify wiring +
determinism + no-crash headless, ship behind flags, and mark the pixel pass **pending real-GPU**.

## Tone-mapping note (already shipped, keep)
We already expose ACES(Filmic)/AgX/**Neutral**. **Khronos PBR Neutral** is the fidelity-correct
default for a material/finish previewer (no hue shift, accurate base colours); AgX/ACES are the
photographic-mood options. Keep Neutral selectable; consider it the default for the finish-preview
context and AgX for "photo" presets.

## Key CC0 sources
- **HDRI**: Poly Haven (indoor: `studio_small_08`, `hotel_room`; urban/skyline: `urban_street_01`,
  `hotel_rooftop_balcony`, `rooftop_day`/`rooftop_night`). CC0, no attribution.
- **PBR textures**: Poly Haven, ambientCG, cc0textures — CC0.
- **Props/models**: Poly Haven models, Poly Pizza, ambientCG, Quaternius — CC0/CC-BY (CC-BY needs
  attribution in `CREDITS.json`).
- **Denoiser**: Intel OIDN weights (Apache-2.0) via `DennisSmolek/Denoiser` (tfjs/WebGL) or
  `oidn-web` (WebGPU).

## Sources (research pass, 2026-06-13)
three-gpu-pathtracer (gkjohnson) · Intel OIDN / oidn-web / DennisSmolek/Denoiser · NVIDIA SVGF ·
Khronos glTF PBR extensions + PBR Neutral tone mapper · three.js docs (MeshPhysicalMaterial,
toneMapping, GTAONode, Environment) · N8AO / XeGTAO · drei (`Environment`, `SoftShadows`,
`AccumulativeShadows`) · @react-three/postprocessing · Poly Haven (CC0 HDRIs/textures) ·
Coohom/Enscape/D5/Sweet Home 3D/Live Home 3D/Foyr render docs · LearnOpenGL (parallax/bloom) ·
Blender 4.0 AgX color management. (Full URLs captured in the session research transcripts.)
