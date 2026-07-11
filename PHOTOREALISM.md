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
(all shipped — records in `CHANGELOG.md`)

### Tier 2 — high impact, needs real-GPU verification
- **PHOTO-GTAO — ruling (2026-07-11, real-GPU A/B): REJECTED, N8AO stays as-is.** A literal GTAO
  cannot integrate cleanly: `GTAONode` is WebGPU/TSL-`RenderPipeline`-only, `GTAOPass` targets
  three's own WebGL `EffectComposer` (incompatible Pass hierarchy with the pmndrs composer), and
  `realism-effects` is discontinued/uninstalled. The shipped N8AO already composites
  radiometrically correctly (linear-space; `autosetGamma` only gammas when `renderToScreen`).
  Bumping the quality presets (High `medium→high`, Max `high→ultra`) was A/B'd on a real GPU with
  AO-buffer (`renderMode 1`) captures at a furnished contact pose: contact-region crops differ by
  RMSE ≤ 3.4/255 (mean Δ ≤ 0.5/255) — invisible, so the 4× aoSamples cost is rejected.
  **Medium cheap AO: REJECTED** — N8AO needs the pmndrs composer's extra full-scene render pass,
  the exact cost class Medium's `postprocessing: false` boundary exists to avoid (baked corner
  strips + contact decals remain Medium's AO). **Flat-tier contact grounding: re-evaluated, still
  marginal** — RZ1 blobs + RD-403 corner strips already ground the evidence pose; no cheap
  candidate beat them without RD-410-class risk. Re-runnable A/B rungs:
  `scripts/scenarios/photo-gtao-ab.json` (beauty, 3 tiers) + `photo-gtao-ab-ao.json` (High/Max,
  pair with a temporary `renderMode={1}` on the `<N8AO>` in `EffectsImpl.tsx`).
- **PHOTO-GLASS — remaining ruling:** window-pane transmission shipped on High/Max (see audit
  above); **extending transmission down to Medium is REJECTED for now** — the transmissive pass
  renders the whole opaque scene to an extra render target, which is exactly the cost class the
  Medium tier exists to avoid (Medium panes keep the cheap transparent + fresnel + sky-catch look).
  Revisit only with a measured budget win (e.g. `transmissionResolutionScale` ≤ 0.5 profiling).

### Tier 3 — ultra-detail materials/assets (memory-bound, mostly verifiable)

### Tier 4 — frontier (WebGPU / large)
- **PHOTO-WEBGPU — ruling (2026-07-12): REJECTED-FOR-NOW, revisit on triggers below.** three.js
  `WebGPURenderer`/TSL is real (r184: TSL lowers to WGSL/GLSL; `SSGINode`/`GTAONode`/`TRAANode`
  exist; r3f v9 supports an async `gl` factory + auto WebGL2 fallback), but adoption is a large
  dual-renderer migration for us, not a swap: (a) the whole post stack is `@react-three/postprocessing`
  = **WebGL `EffectComposer`, no WebGPU migration path** — N8AO/Bloom/SMAA/DoF must be rewritten as
  TSL `RenderPipeline` nodes; (b) **`three-gpu-pathtracer` is WebGL2-only**, so `hqRenderSession`
  stays WebGL and the app becomes multi-renderer; (c) **`pomFloor.ts` uses `onBeforeCompile` GLSL,
  which TSL cannot express** — needs a NodeMaterial rewrite; (d) VSM/transmission/anisotropy/context-loss
  controllers are all renderer-coupled (≈20+ files / 6 subsystems). **Verification is blocked:** the
  sandbox's real-GPU passthrough is ANGLE-D3D12 (WebGL only); WebGPU resolves **only a SwiftShader
  software adapter** (probed 2026-07-12 via `scripts/scenarios/webgpu-probe.json` + flags), so a WebGPU
  SSGI/SSR pixel pass can't converge or be A/B'd here. **Revisit when ALL hold:** r3f v9 WebGPU Canvas
  is documented-stable (not "edge cases persist"); `GTAONode` reaches N8AO parity AND a TSL Bloom/SMAA
  replacement lands so the post stack can port; the sandbox gains a real WebGPU adapter (Dawn→Vulkan→GPU,
  or a device with native WebGPU) so `SSGINode` is real-GPU-verifiable; Safari-on-iOS WebGPU is
  confirmed on the app's min OS (iOS 26 already ships it — near-met). Browser matrix mid-2026:
  Chrome/Edge stable, Safari 26 (iOS/macOS) on by default, Firefox partial (macOS-ARM only), Chrome-Linux
  Gen12+ beta only.
- **PHOTO-SSGI-SSR — gated on PHOTO-WEBGPU (deferred with it).** Screen-space GI + glossy reflections
  are the main prize (colour bounce + reflections beyond the IBL probe), and `SSGINode`/SSR ship in the
  WebGPU node pipeline — but they require the WebGPU renderer + TSL post pipeline above, and are a "G"
  real-GPU item that is currently **unverifiable in-sandbox** (software Dawn only). Do not attempt a
  WebGL `realism-effects` SSGI in the interim: `realism-effects` is discontinued/uninstalled (per the
  PHOTO-GTAO ruling) and would fight the pmndrs composer. Revisit exactly when PHOTO-WEBGPU's triggers clear.

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
