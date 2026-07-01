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
  ambient; **procedural Lightformer IBL probe** (64–256px) by default, **with an opt-in captured CC0
  HDRI IBL** (`hdriEnvironment`, Medium+) — the path-tracer env is still the 2-colour gradient.
- **Materials**: `MeshPhysicalMaterial` with procedural micro-textures (≤512px albedo/normal/rough),
  sheen + clearcoat (all tiers, `materialRealism.ts`), transmission glass (High/Max only). **Bundled +
  runtime Poly Haven 2K PBR finishes ship; in-browser KTX2/UASTC encode ships (opt-in); no POM/displacement.**
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

> **Maintenance.** When a roadmap item ships, **delete it** from the bullet list below (its record
> lives in `CHANGELOG.md`); when one is only *partially* done, trim its entry to the remaining work —
> so the list stays an accurate to-do and we never re-audit shipped work. (The `PHOTO-*` names are the
> stable identifiers; the list is unnumbered so nothing needs renumbering.)

## Roadmap — prioritised by impact ÷ effort

Legend — Verify: `H` headless-verifiable (DOM/scene-graph/unit) · `G` needs a real-GPU pixel pass
(SwiftShader headless won't converge — flag pending, like the existing F1 tail). Tier = where it
belongs. Flag = gate per CLAUDE.md (CC0 → prod-safe).

### Tier 1 — highest impact, mostly verifiable, do first
- **PHOTO-HDRI-PT — feed the HDRI env into the path tracer** (M, HQ still; Verify G).
  HDRI IBL ships for the real-time tiers (`hdriEnvironment`); the remaining piece is feeding the same
  `scene.environment` into `three-gpu-pathtracer` (`root.environment`, importance-sampled) so the HQ
  still uses the captured HDRI instead of its 2-colour gradient. (Real-time HDRI IBL itself is shipped.)
- **PHOTO-DETAIL-PROPS — more CC0 set-dressing** ◑ (M, all tiers; Verify H).
  The set-dressing pack + one-tap auto-styling already ship (C276–C278, `decorStyling.ts`). **Remaining:**
  more curated CC0 decor/prop bundles from Poly Haven / Poly Pizza (networked assets). Overlaps
  C-PLANTS/DECOR in TASKS.
- **PHOTO-BEVELS — edge-bevel light-catch verify** ◑ (real-GPU tail; Verify G).
  The shared `furniture/primitives/BeveledBox.tsx` (~7 mm chamfer) rollout is **complete** across case
  goods, panel/shelf units, and appliances; structural correctness verified. **Remaining:** the edge
  light-catch real-GPU pixel pass (RZ3 tail).

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
- **PHOTO-PBR-MAPS — extend CC0 PBR coverage** ◑ (L, materials; Verify H/G).
  Core shipped (the 12 bundled finishes are full-PBR + runtime Poly Haven fetch — v0.8.0.27).
  **Remaining:** bundle curated **Poly Haven / ambientCG** sets for the still-procedural-only tokens
  (fabric/leather/metal + more wood/tile/concrete variants: albedo+normal+rough+AO), world-UV tiled,
  with the procedural generators as the always-available base.
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
