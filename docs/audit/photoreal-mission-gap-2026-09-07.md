# Photoreal mission gap audit — 2026-09-07

Scope: the "Photorealistic 3D Apartment Sandbox Enhancement" brief (Blender bake pipeline,
three.js PBR core, adaptive GPU/CPU dual-mode rendering, verification) checked against what
this repo already ships on `staging` after PR #117 (v0.33.1.16). Purpose: stop re-auditing
shipped work on every iteration; only the **Open** rows are candidates. User steers that bound
the work: default 4-room flat only; shell, fittings and environment, not furniture; measured,
flag-gated changes that build on the existing lightmap/GI work.

| Brief item | Status | Where / evidence |
| --- | --- | --- |
| Headless Blender scripts (`blender -b -P`) | **Shipped** | `python/scripts/blender/` (`bake_material.py`, `render_visibility.py`, `sofa_scene.py`, `hdri.py`, …); Blender 5.2.1 at `/opt/homebrew/bin/blender`; rules in `docs/skills/blender.md`. Lives under `python/scripts/`, not `/scripts/blender/` — repo convention, not a gap. |
| Parametric room shell modelled in Blender | **Rejected by design** | The shell is built by the app (`src/apartment/`) and exported as GLB for baking (`scene-glb.mjs`), so there is one source of truth. A parallel bpy shell would drift. |
| Non-overlapping second UV set for static shell | **Shipped** | Box-atlas on `uv1` (`lightmapUv.ts:computeBoxAtlasUv`, fixtures `lightmapUv.blender.json`); exterior/cut-cap sentinels (`lightmapExterior.ts`). |
| Cycles bake of indirect diffuse + AO | **Shipped (irradiance)** | `bake_material.py --pass irradiance|visibility|ao|diffuse|combined`; the shipped set is an irradiance bake that replaces the ambient term, gain refitted against Cycles (`visibilityLightmap.ts`). Daylight-only by design; lamps stay analytic. |
| KTX2 lightmaps | **Not worth it** | Atlases are 64–256 px PNGs; KTX2 saves nothing measurable. |
| Draco / Meshopt GLB export, KTX2 textures | **Shipped** | `scripts/asset-pipeline/process-glb.ts` (Draco, opt-in KTX2/UASTC via `ktx2-encode.ts`); runtime `furniture/gltf/decoders.ts` wires Draco + Meshopt + KTX2. |
| sRGB output + ACES tone mapping, configurable exposure | **Shipped** | Tone mappers Filmic(ACES)/AgX/Neutral (`toneMappingPost.ts`, `GraphicsSettings.tsx`), auto-exposure + user dial. Default is AgX to match the Cycles references — not ACES; keep. |
| HDR environment via RGBELoader + PMREM | **Shipped** | `scene/lighting/SceneEnvironment.tsx`, `hdriCatalog.ts`; flag `hdriEnvironment` (default on, pro). |
| Directional sun + soft shadows | **Shipped** | VSM on capable tiers (`look.ts:VSM_SHADOW`, `RendererTierController.tsx`); PCSS audited and rejected (PHOTOREALISM.md). |
| Lightmap on static shell via second UV | **Shipped** | `applyVisibilityLightmaps.ts`; gated to `realistic` mode by intent (`VisibilityLightmaps.tsx`). |
| GTAO / N8AO | **Shipped (N8AO)** | GTAO ruled out on a real-GPU A/B (PHOTO-GTAO). |
| SSR on glossy floors | **Deferred** | Gated on PHOTO-WEBGPU; no WebGL SSR path integrates with the pmndrs composer. Not re-proposed. |
| Bloom + vignette | **Shipped** | `EffectsImpl.tsx`; night corridor bloom masked (v0.33.1.2). |
| Hardware detection (`WEBGL_debug_renderer_info`, SwiftShader) | **Shipped** | `quality.ts:deviceClassFor` (software rasteriser → `weak`); primary signal is measured frame cost (`adaptiveTier.ts`). |
| High tier: full post, 4K shadows, DPR 2 | **Shipped** | `QUALITY_PRESETS.realistic.capable`. |
| Fallback tier: no post, no shadow maps, baked light only, DPR 1 | **Shipped** | `softwareRasterFallback` (simple, default on). `isSoftwareRenderer` is read once at boot into the store's `softwareRenderer`; `resolveQuality` layers a floor between the preset and the user's overrides — `shadowMapSize 0`, `postprocessing`/`ao`/`dof`/`cinematic` false, `dprMax 1`, `envResolution 64` — keeping `ibl` and the mode-gated baked visibility lightmaps, so Realistic on a CPU renderer is baked-only rather than flat. Keyed on the renderer NAME, so phones keep `realistic/weak`; a user override still wins. Measured (SwiftShader headless, 1280x800 dpr2, hour 13, default 4-room, 8s warm-up + 45s motion): p50 inside `gl.render` walk 8.7→5.0 ms (-42%), orbit 13.3→10.5 ms (-21%). Caveat recorded with the number: the achieved render RATE did not separate the arms (0.5/s both), because a software rasteriser spends the frame in the GPU process where `gl.render` cannot time it. |
| FPS benchmark, Chrome | **Shipped** | `scripts/perf.mjs`, `perf-orbit.mjs`, `dev-probes/frame-time.mjs` (SwiftShader headless = the CPU path); real GPU via `SHOT_GPU=1`. |
| FPS / parity benchmark, Firefox | **Shipped (smoke only)** | `scripts/dev-probes/firefox-smoke.mjs`, Playwright Firefox 150.0.2 installed. Default flat boots, store/scene ready, both tiers render (screenshots match Chromium in tone/content) — WebGL2 worked in plain headless launch, no `firefoxUserPrefs` fallback needed. One reproducible driver hiccup: a `pageerror` + "WebGL context was lost" around the performance→realistic tier switch, recovered by `ContextLossGuard` (both screenshots still fully rendered) — the probe correctly exits non-zero on it per its own contract. Not a parity suite — no cross-browser pixel diff against Chromium. |
| Clean fallback with hardware acceleration disabled | **Shipped** | `scripts/scenarios/fallback-swiftshader.json` asserts `softwareRenderer`, `deviceClass === 'weak'`, the resolved Realistic settings (shadows/post/AO/DoF/grain off, DPR 1, `ibl` on at `envResolution 64`), zero shadow-casting lights in the scene graph and `gl.getPixelRatio() === 1`, then shoots both modes from the same default orbit pose. |

## Open items, in order
1. ~~**REALISTIC-SOFTWARE-FALLBACK.**~~ Done — see the two table rows above. The override arm
   won on p50 render cost (-42% walk, -21% orbit) and the floor shipped behind
   `softwareRasterFallback`. The one thread it leaves open, worth a look before anyone quotes
   the number as a frame-rate gain: `frame-time.mjs` measures CPU time inside `gl.render`, and
   under a software rasteriser that is <1% of the frame — the achieved render rate was 0.5/s in
   BOTH arms, while flat `performance/weak` held 1.1-1.3/s. So the fallback provably costs the
   CPU less per frame, but nothing in this harness proves a CPU-renderer user *sees* a faster
   scene, and the flat mode is still ~2x the rate. An instrument that can see the GPU process
   (or a real GPU-disabled Chrome with `chrome://tracing`) is what would settle it.
2. ~~**FIREFOX-SMOKE.**~~ Done — see the table row above. The one open thread it leaves: the
   context-loss/pageerror hiccup at the tier switch is reproduced twice but not root-caused: it
   may be worth a real (non-headless) Firefox check before concluding it's headless-only noise.
3. **FIREFOX-TIER-SWITCH (new, from the smoke run).** Two things the orchestrator saw in the
   frames that need root-causing, not a re-run: (a) the `performance → realistic` switch loses
   the WebGL context and throws `properties.get(...).currentProgram is undefined` from inside
   three (a material recompiled or disposed while the context was gone; `ContextLossGuard`
   recovers the frame); (b) the recovered `realistic` frame is uniformly SOFTER than the
   `performance` frame at the same pose — the DOM is crisp, the canvas is not — which points at
   a pixel-ratio drop that never came back (`interactiveDegrade`, or the ladder demoting
   `deviceClass` to `weak` mid-run — the smoke read `capable` before the switch and `weak`
   after) rather than at DoF. Reproduce with `MODES=realistic` alone first: if the softness
   goes away when Realistic is the FIRST mode, it is the switch, not the mode.
