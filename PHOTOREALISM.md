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
  **Photo-finish correctness + curation (v0.26.0.0, SHOWROOM-FINISHES / REAL-2 / REAL-3):** the
  textured branch now renders photo albedos sRGB-decoded and UN-multiplied (the placeholder swatch
  used to darken every photo material to ~25% — the single biggest "crude materials" defect), AO
  maps actually load, and a curated Poly Haven "Showroom" strip (one-tap, 1k, IDB-cached, honest
  physical uvScales) puts photo PBR into the core Simple-mode finish loop with reload rehydration.
- **Post** (`Effects.tsx`): N8AO → Bloom → HueSat → (CA) → Vignette → (grain) → SMAA. Tone-mappers
  Filmic(ACES)/AgX/Neutral available; auto-exposure + user dial.
- **Path tracer** (`pathtrace/hqRenderSession.ts`): progressive, tiled, `PhysicalCamera` DoF,
  library `DenoiseMaterial` (edge-blur), interior-tuned bounces/MIS (`hqTracerConfig.ts`,
  PHOTO-PT-TUNE), env = the active HDRI (PHOTO-HDRI-PT) or the gradient fallback. **No OIDN.**
- **Geometry**: `geometryDetail` segment multiplier; `RoundedBox` corners on some primitives; contact
  shadow blobs Medium+. **Realistic mode draws the hero furniture (sofa, armchair, dining chairs,
  coffee/side tables, TV console/sideboard, ottoman, shelves) as photo-scanned Poly Haven CC0 GLBs
  in place of the primitives** (PHOTOREAL-HERO, v0.33.0.0, `furniture/photorealProxies.ts`); beds,
  dining table, desks and lamps remain primitives (no CC0 modern source yet).
- **Backdrops**: walk-mode equirectangular photo as `scene.background` (procedural `city/dusk/park/hills`
  presets + user upload; orbit dollhouse stays clean). **The HDB estate outside the windows is real
  geometry again (ESTATE-SURROUND, v0.33.0.1, `scene/estate/`)** — own block, neighbours, corridor,
  ground, trees, lit windows at night — because the equirect path PMREM-blurs any painted skyline
  (item (r)). **No HDRI sky/IBL image yet.**

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
- **PR4/R-SSAO (soft-shadow upgrade + contact-shadow refinement) — ruling (2026-07-15, real-GPU
  audit): VSM VERIFIED, PCSS REJECTED, no tuning warranted.** The shipped VSM soft-shadow stack
  (PHOTO-SOFTSHADOW, `look.ts:VSM_SHADOW` radius 6 / blurSamples 12 on Medium+; `shadowFilterForTier`)
  was audited on the real GPU (`ANGLE … D3D12 Intel UHD`, `SHOT_GPU=1`) across Medium/High/Maximum
  at late-afternoon sun (hour 15) — a dollhouse overview + a zoomed central-rooms pose per tier,
  each captured in its own fresh session (repeated 4096-map tier switches exhaust this iGPU's WebGL
  context → error boundary; A/B one tier per session). **Findings:** every Medium+ tier renders the
  sun shadows cleanly — **no light bleeding, no boxy blur, no shadow acne, no peter-panning** — and
  grounding is consistent across tiers. Sun shadows are **subtle indoors by design**: the ORBIT-CEILING
  virtual-ceiling occluder gates direct sun to windows, so the dominant grounding cues are the
  contact-shadow blobs (`ContactShadow.tsx`, resolution-independent) + real SSAO on High+ (the
  baked corner-AO strip was removed in v0.23.1.11) — and these do **not** visibly double-darken under the (subtle)
  sun shadows (contact blobs sit under wall-flush furniture the raking sun barely reaches). **PCSS
  REJECTED:** an `onBeforeCompile` distance-dependent-penumbra patch is in scope ONLY if VSM's
  uniform blur is *visibly* wrong; it is not — with sun shadows this subtle and window-gated, the
  uniform penumbra reads correctly, and a per-fragment PCSS kernel would add cost + a shader-recompile
  surface + iGPU context-stability risk (context loss already observed on tier switches) for **no
  visible gain**. **No radius/bias/frustum/contact-opacity tuning shipped** — the audit surfaced no
  defect to fix, and the fixed-texel VSM radius (which makes the top tier's world-space penumbra the
  narrowest) produces no visible "too-sharp/too-soft" artifact at any achievable framing, so a
  resolution-aware radius would be an unshowable speculative change (deliberately skipped; recorded
  here so it is not re-proposed blind). Re-runnable rungs (fresh session per tier, no switching):
  `scripts/scenarios/softshadow-pen-{medium,high,maximum}.json` (decisive A/B) +
  `softshadow-audit.json` (overview + interior). Contact-shadow strength stays full on Performance
  (its sole grounding cue — do not weaken).
- **PHOTO-POM (parallax-occlusion floors) — ruling (2026-07-15, real-GPU pixel A/B): VERIFIED,
  ships as-is.** The shipped POM stack (`materials/pomFloor.ts`, `onBeforeCompile` steep-parallax +
  occlusion ray-march over the procedural height field, wired at the floor sites via
  `useFloorProceduralMaterial`; flag `pomFloors`, pro tier default-on) was pixel-verified on the real
  GPU (`ANGLE … D3D12 (Intel(R) UHD Graphics)`, `SHOT_GPU=1`) for the first time — SwiftShader was the
  only renderer before. Method: walk mode, low eye (1.2 m) + grazing downward pitch (via the dev
  `__walkLook` lever) over an unfurnished grey-porcelain-tile floor (`floor-tile-grey`, procedural
  `tile`), one tier per fresh session (no tier switching — iGPU context gotcha), capturing `pomFloors`
  ON vs OFF at the identical pose (flag toggle only). **Findings:** at Maximum (32 steps) and High (16
  steps) the grout/joints **genuinely recede and occlude** the tile faces at grazing angle — decisive
  vs the flat normal-map OFF frame (mean pixel Δ ≈ 15/255 whole-frame, ≈ 24–34/255 over the floor
  region; the OFF grout is a flat drawn line, the ON grout a carved channel with a proud tile edge).
  The grazing-angle clamp (`nz = max(|vts.z|, 0.15)`) holds: **no smear/explosion** at the extreme far
  grazing band near the wall, **no UV bleed past the floor silhouette** onto the skirting (POM offsets
  only the floor UV — the floor/wall edge is byte-identical ON/OFF), and VSM sun shadows + the skirting
  compose unchanged. Only minor near-field grout-edge waviness/stepping inherent to the finite step
  count (smoother at 32 than 16, acceptable at both — reads as physical tile edges). **No perf
  collapse / context loss / error-boundary** on this iGPU at 32 steps (frames captured ~1.7 s each).
  **Medium control: no POM** — `pomStepsForTier` returns 0, the floor keeps the plain shared
  procedural material and renders cleanly (the flat path, as gated). **Reach note (recorded so it is
  not mistaken for a bug):** POM only fires on *procedural* eligible-pattern floor defs, so the builtin
  ids that `GENERATED_MATERIALS` shadows with a **textured** Poly Haven photo of the same id
  (`floor-tile-white`, `floor-tile-marble`, `floor-parquet`, `floor-concrete`, `floor-wood-oak/walnut`)
  dispatch to `TexturedRoomFloor` and never reach the POM hook — by design (the CC0 photo is the
  higher-fidelity path there). POM's reachable surface is the many *un-shadowed* procedural finishes
  (`floor-tile-grey/charcoal/sand`, `floor-tile-hex(-charcoal)`, `floor-parquet-oak/walnut`,
  `floor-herringbone-oak/walnut`) + composed procedural finishes (`compose:<pattern>:<#hex>`). No code
  changed — the shader, gating, and tier steps are correct. Re-runnable rungs (fresh session per tier):
  `scripts/scenarios/pom-{maximum,high,medium}.json` (decisive A/B) + `pom-probe.json` (scene-graph
  proof that `buildPomFloorMaterial` actually lands on the floor meshes — 16/16 carry the
  `pom-floor-32-0.03` program key).
- **PHOTO-GLASS — the pane's own material, corrected once there was a real view behind it
  (GLASS-CLARITY, v0.33.0.10):** the transmission-tier pane now renders clear glass at
  `roughness 0.05` (the physical baseline in `windowGlassPhysical`, was `Math.max(…, 0.1)`) with
  body colour `#f2f5f7` (was the cheap tier's `#bcd4e6`), both via new transmission-tier-only
  fields on `windowGlassKindParams` (`transmissionRoughness`, `transmissionColor`). On this path
  roughness is real mip blur of the view (three's `getTransmissionSample`) and the colour is the
  shader's transmittance, so the old pair was costing ~1.1 mip levels of blur and ~20 % of the
  estate's luminance with a blue cast. Measured at the default flat's living-room window, 13:00,
  `realistic`: pane micro-contrast +9 % at a fixed colour, R−B −13.3 → −0.9, frame cost
  unchanged (p50 8.3 → 8.2 ms). The CHEAP tiers are byte-identical — there the same hex is an
  opacity-blended tint over the wall, which reads correctly — and frosted/textured/glass-block
  keep their higher roughness through the same `Math.max`. Full table + the refuted
  estate-speckle diagnosis in `docs/open-graphics-decisions.md` item (l).
- **PHOTO-GLASS — remaining ruling:** window-pane transmission shipped on High/Max (see audit
  above); **extending transmission down to Medium is REJECTED for now** — the transmissive pass
  renders the whole opaque scene to an extra render target, which is exactly the cost class the
  Medium tier exists to avoid (Medium panes keep the cheap transparent + fresnel + sky-catch look).
  Revisit only with a measured budget win (e.g. `transmissionResolutionScale` ≤ 0.5 profiling).

### Tier 3 — ultra-detail materials/assets (memory-bound, mostly verifiable)
- **PHOTO-CUSHION — cushion-deformation ruling (2026-07-16, Asset Studio Stage 5): SHIPPED
  option (b) — procedural vertex "plump".** Real upholstery reads soft because cushions crown and
  bow; a flat box/capsule reads CAD-hard. The honest browser-side option set was: **(a)** offline-baked
  cloth-sim GLB cushion variants shipped as designer components — highest fidelity but **needs asset
  production** (a DCC cloth bake per shape/size), out of scope for a pure-code stage and a payload cost;
  **(b)** a procedural approximation — a sine-falloff vertex displacement on a tessellated
  box/capsule (top/bottom crown, sides bow, corners pinned = the seam line, normals recomputed);
  **(c)** skip. **Shipped (b)** (`glbEdit/plump.ts`, a `plump` 0…1 part param): it reads convincingly
  as a stuffed cushion at real-GPU (Stage-5 scenario `02-cushion-plump`) for **zero** asset production
  and a resolution-independent, export-safe geometry tweak (it's just displaced vertices in the GLB).
  Live cloth SIMULATION stays ruled out for the editor (offline-bake territory, per the plan's paradigm
  decision). Revisit (a) only if a curated pre-baked cushion pack is produced externally — it would drop
  in as ordinary designer components with no new code.

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
verification sweep cleared PHOTO-BEVELS/RZ2/RZ5/C275; **PHOTO-POM VERIFIED 2026-07-15** — grout
recession/occlusion real-GPU-confirmed at High/Max, see the Tier 2 ruling). Real-time
DOM/scene-graph/flag changes remain headless-verifiable as before.

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
