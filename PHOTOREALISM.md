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
- **Backdrops**: walk-mode equirectangular photo as `scene.background` (procedural `city/dusk/park/hills`
  presets + user upload; orbit dollhouse stays clean) — the instanced 3D estates were removed. **No HDRI
  sky/IBL image yet.**

## Shipped (pruned from the roadmap — see `CHANGELOG.md` for detail)
- **PHOTO-BACKDROP** — walk-mode equirectangular photo `scene.background` (procedural `city/dusk/park/hills`
  presets + user upload via `storage/walkBackdrop.ts`; instanced 3D estates removed). Flags `backdrops` +
  `customBackdrop`. *Follow-up still open:* bundle real CC0 equirectangular photos for the presets (see PHOTO-HDRI).
- **PHOTO-EMISSIVE** — HDR emissive + bloom: lamps/sconces/cove/fan/TV/vanity ramp via
  `scene/lighting/fixtureGlow.ts` (`fixtureEmissiveIntensity`), night peaks clear the Bloom threshold.
  *G-tail:* tune the bloom amount on a real GPU.
- **PHOTO-COLORSPACE** — texture colour-management: audited the procedural generators +
  `furnitureMaterials.ts` + upload/GLB paths under three 0.184 (texture default `NoColorSpace`). All
  albedo/colour maps are `SRGBColorSpace`, data maps (normal/rough/metal/AO) stay linear — **except a
  wood-albedo miss now fixed** (it rendered grain with linear-instead-of-sRGB gamma). Locked with a
  `furnitureMaterialColorSpace.test.ts` regression guard (albedo sRGB / data maps linear).
- **PHOTO-PT-TUNE** — interior-tuned path tracer (`hqRenderSession.ts` applies `hqTracerConfig.ts`):
  `bounces 10`, `transmissiveBounces 6` (glass no longer black/opaque), `filterGlossyFactor 0.75`
  (kills sun-through-glass fireflies), `multipleImportanceSampling`. Config is unit-tested; the sample
  count (`HqRenderModal` 64–1024) is the quality dial. *G-tail:* confirm the pixel improvement on a real GPU.

> **Maintenance.** When a roadmap item ships, **delete it** from the bullet list below and add a
> one-line entry here (and to `CHANGELOG.md`); when one is only *partially* done, trim its entry to the
> remaining work — so the list stays an accurate to-do and we never re-audit shipped work. (The
> `PHOTO-*` names are the stable identifiers; the list is unnumbered so nothing needs renumbering.)

## Roadmap — prioritised by impact ÷ effort

Legend — Verify: `H` headless-verifiable (DOM/scene-graph/unit) · `G` needs a real-GPU pixel pass
(SwiftShader headless won't converge — flag pending, like the existing F1 tail). Tier = where it
belongs. Flag = gate per CLAUDE.md (CC0 → prod-safe).

### Tier 1 — highest impact, mostly verifiable, do first
- **PHOTO-HDRI — HDRI environment lighting (IBL)** (M, real-time Medium+ **and** path tracer; Verify G/H).
  The *lighting* counterpart to the shipped photo backdrop: bundle a few **CC0 Poly Haven** HDRIs (1–2K
  `.hdr`); add an HDRI mode to `SceneEnvironment` (drei `<Environment>` → PMREM) as `scene.environment`
  (IBL) and feed the **same env into the path tracer** (`root.environment`, importance-sampled). The HDRI
  may also serve as the photo background when present. New `hdriEnvironment` flag (pro, prod-safe). Needs
  the `.hdr` asset added in a connected session (sandbox can't fetch).
- **PHOTO-DETAIL-PROPS — set-dressing prop bundle** (M, all tiers; Verify H).
  Curated CC0 decor/styling props (books, trays, cushions, vases, plants, rugs, bowls) — the single
  biggest *perceived*-realism lever for casual users (empty rooms read fake). Overlaps C-PLANTS/DECOR
  in TASKS; ship as a prod CC0 pack + one-tap "style this room" placement.
- **PHOTO-BEVELS — edge bevels on hard primitives** ◑ **IN PROGRESS** (M, all tiers incl. flat; Verify G).
  Shared `furniture/primitives/BeveledBox.tsx` (drei `RoundedBox` + auto-clamped ~7 mm chamfer, pure
  tested `safeBevelRadius`) already migrated tables/desk + freestanding case goods. **Remaining:**
  panel/shelf-built units (Bookshelf, Wardrobe, cabinet modules) + appliances. Edge light-catch is
  real-GPU-pending; structural correctness verified.

### Tier 2 — high impact, needs real-GPU verification
- **PHOTO-DENOISE — browser OIDN on the HQ still** (M–L, HQ still; Verify G).
  Replace the edge-blur with an OIDN U-Net on the final accumulated frame: `DennisSmolek/Denoiser`
  (tfjs, runs on WebGL2) with WebGPU `oidn-web` when available; render cheap **albedo + normal AOV**
  passes from the snapshot scene to guide it (near-offline quality at 64–128 samples). New flag,
  prod-safe (Apache-2.0 weights). Fallback to current `DenoiseMaterial`.
- **PHOTO-GTAO — GTAO option + AO on more tiers** (M, real-time High/Max; Verify G).
  Offer three.js `GTAONode`/GTAO alongside N8AO (more radiometrically correct); consider a cheap AO
  on Medium. Re-evaluate cheap contact-grounding on the flat tier (the earlier RZ1 attempt was
  reverted as marginal — revisit only with a clear A/B win on a real GPU).
- **PHOTO-SOFTSHADOW — softer sun shadows** (M, real-time Medium+; Verify G).
  ⚠️ **Do NOT use drei `<SoftShadows>`/PCSS** — broken on three r182+ (drei #2583, calls removed
  `unpackRGBAToDepth`). Instead use **`VSMShadowMap`** (`renderer.shadowMap.type`, soft via
  `light.shadow.radius`/`blurSamples`) and/or extend the existing `<AccumulativeShadows>` showcase
  path (already used Medium+) to more parked views. Tune `look.ts` shadow params. Re-evaluate PCSS
  once drei patches it.
- **PHOTO-GLASS — transmission + volume + IOR fidelity** ◑ (M, materials; Verify G).
  Window **sky-catch** shipped (RZ2): glass carries a daylight-ramped emissive sky tint
  (`glassSkyCatchIntensity`) so panes read as lit glass on every tier (not flat dark rectangles).
  **Remaining:** ensure windows/glassware use real `transmission`+`ior`(1.5)+`thickness`+`attenuationColor`
  (`KHR_materials_volume`); add `transmissionResolutionScale` to bound real-time cost. Extend down to
  Medium where affordable.

### Tier 3 — ultra-detail materials/assets (memory-bound, mostly verifiable)
- **PHOTO-PBR-MAPS — real 2K CC0 PBR textures over procedural** (L, materials; Verify H/G).
  Bundle curated **Poly Haven / ambientCG** CC0 PBR sets (wood/marble/tile/concrete/fabric/leather/
  metal: albedo+normal+rough+AO) as higher-fidelity finishes over the procedural fallback, world-UV
  tiled. The procedural generators stay as the always-available base.
- **PHOTO-KTX2 — KTX2/Basis compression in prod** (M; Verify H).
  Ship bundled + uploaded textures as KTX2 (ETC1S/UASTC) to cut VRAM ~4–6× so we can afford 2K maps
  (clears the TODO "real in-browser KTX2 encoder" gap; offline `compress:glb-textures` already
  exists for bundled assets).
- **PHOTO-POM — parallax-occlusion mapping on hero floors** (M, High/Max; Verify G).
  POM on tile/brick/parquet floors for real recessed grout/relief as the camera moves — big step up
  from normal maps; gate to High+ (shader ray-march cost).

### Tier 4 — frontier (WebGPU / large)
- **PHOTO-SSGI-SSR** (L, WebGPU/High-end; Verify G). Screen-space GI + reflections via
  `realism-effects` (0beqz) or the three.js WebGPU path; colour bounce + glossy reflections beyond
  the IBL probe + planar mirrors. WebGPU-gated with WebGL fallback.
- **PHOTO-WEBGPU** (L). Evaluate three.js `WebGPURenderer`/TSL maturity (2026) for true SSGI,
  better lights, compute denoise; capability-detect with WebGL2 fallback.
- **PHOTO-SSAA-EXPORT** (S, export; Verify G). Supersample the snapshot/export path (render large →
  downsample) for reference-quality stills, separate from the live SMAA.

## Verification posture
Real-time DOM/scene-graph/flag changes are headless-verifiable. **Path-traced + post-heavy pixel
quality (PT tuning, OIDN, SSR/SSGI/PCSS/POM) needs a real-GPU session** — SwiftShader headless won't
converge or present these faithfully (documented under the F1 tail). For those, verify wiring +
determinism + no-crash headless, ship behind flags, and mark the pixel pass **pending real-GPU**.

## Tone-mapping note (context-aware default shipped — RD-404)
We expose ACES(Filmic)/AgX/**Neutral**, plus an **Auto** setting (now the default). The selection
rule lives in `src/scene/toneContext.ts` (pure, unit-tested): an explicit user pick always wins;
`'auto'` resolves to **Khronos PBR Neutral while the FinishPicker is open** (`selectedRoomId != null`
— no hue shift, accurate base colours for product decisions), to **AgX** for a photo/render context,
and to **filmic** otherwise (no regression from the historical look). `Lighting.tsx` calls
`resolveToneMapping(st.toneMapping, { finishPreview, photoMode })` each frame and feeds the resolved
operator to both `gl.toneMapping` and `toneExposureBias` so brightness stays steady across a context
switch. One-tap render presets still set an *explicit* operator (so they read as a deliberate user
choice), and the HQ path tracer keeps its own ACES blit. **Possible follow-up (deferred):** a light
colour-temperature / exposure dial — see the dossier; left out of RD-404 to avoid scope creep.

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
