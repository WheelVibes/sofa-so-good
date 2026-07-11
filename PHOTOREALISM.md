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
- **Lighting**: sun `DirectionalLight` + **`VSMShadowMap` soft shadows on Medium+** (radius 6 /
  blurSamples 12, `look.ts:VSM_SHADOW`; Performance keeps PCF and is shadowless anyway; filter is
  tier-driven via the Canvas `shadows` prop + `RendererTierController` — NOT drei PCSS, broken on
  three r182+; note three r184 deprecated `PCFSoftShadowMap` → plain PCF); hemisphere + flat
  ambient; **procedural Lightformer IBL probe** (64–256px) by default, **with an opt-in captured CC0
  HDRI IBL** (`hdriEnvironment`, Medium+) — the HQ path tracer is lit by the same HDRI when one
  is active (PHOTO-HDRI-PT; gradient fallback otherwise).
- **Materials**: `MeshPhysicalMaterial` with procedural micro-textures (≤512px albedo/normal/rough),
  sheen + clearcoat (all tiers, `materialRealism.ts`), transmission glass (High/Max only —
  glassware AND window panes, with `attenuationColor` volume tint + a tier-bounded
  `transmissionResolutionScale`; Performance/Medium panes keep the cheap transparent+sky-catch
  look byte-identical). **Bundled +
  runtime Poly Haven 2K PBR finishes ship; in-browser KTX2/UASTC encode ships (opt-in); no POM/displacement.**
- **Post** (`Effects.tsx`): N8AO → Bloom → HueSat → (CA) → Vignette → (grain) → SMAA. Tone-mappers
  Filmic(ACES)/AgX/Neutral available; auto-exposure + user dial.
- **Path tracer** (`pathtrace/hqRenderSession.ts`): progressive, tiled, `PhysicalCamera` DoF,
  library `DenoiseMaterial` (edge-blur), interior-tuned bounces/MIS (`hqTracerConfig.ts`,
  PHOTO-PT-TUNE), env = the active HDRI (PHOTO-HDRI-PT) or the gradient fallback. **No OIDN.**
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
- **PHOTO-DETAIL-PROPS — more CC0 set-dressing** ◑ (M, all tiers; Verify H).
  The set-dressing pack + one-tap auto-styling already ship (C276–C278, `decorStyling.ts`). **Remaining:**
  more curated CC0 decor/prop bundles from Poly Haven / Poly Pizza (networked assets). Overlaps
  C-PLANTS/DECOR in TASKS.

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
- **PHOTO-GLASS — remaining ruling:** window-pane transmission shipped on High/Max (see audit
  above); **extending transmission down to Medium is REJECTED for now** — the transmissive pass
  renders the whole opaque scene to an extra render target, which is exactly the cost class the
  Medium tier exists to avoid (Medium panes keep the cheap transparent + fresnel + sky-catch look).
  Revisit only with a measured budget win (e.g. `transmissionResolutionScale` ≤ 0.5 profiling).

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

## Verification posture
**UPDATE 2026-07-11: the dev environment now has a real GPU** (`SHOT_GPU=1` → ANGLE D3D12 /
Intel UHD via WSL passthrough) — the "pending real-GPU" queue is unblocked; PT convergence, OIDN,
SSR/SSGI/VSM/POM pixel passes are all verifiable in-session (Maximum tier converges; first
verification sweep cleared PHOTO-BEVELS/RZ2/RZ5/C275). Real-time DOM/scene-graph/flag changes
remain headless-verifiable as before.

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
