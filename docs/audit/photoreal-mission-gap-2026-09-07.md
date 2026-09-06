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
3. ~~**FIREFOX-TIER-SWITCH.**~~ **Root-caused. (a) is fixed in code; (b) is NOT a defect.**
   Isolation table — `scripts/dev-probes/firefox-smoke.mjs` (extended in this round to dump
   `gl.getPixelRatio()`, drawing-buffer px vs CSS px, `qualityOverrides`, the resolved settings via
   the same `/src/scene/quality.ts` dev-server import `fallback-swiftshader.json` uses, and the
   `interactiveDegrade` decision inputs, before and after every switch). Playwright Firefox 150.0.2
   headless, macOS/arm64, 1280x800 @ DPR 1, hour 13, default 4-room:

   | run / step | scene ctx lost? | pageerror | pixelRatio | canvas px vs CSS px | deviceClass | resolved shadowMapSize / post / dof |
   | --- | --- | --- | --- | --- | --- | --- |
   | `MODES=realistic`, boot (`performance`) | no | — | 1 | 1280x800 = 1280x800 | capable | 1024 / false / false |
   | `MODES=realistic`, after switch | **no** | **yes (1)** | **0.5** | **640x400** vs 1280x800 | **capable** | 4096 / true / true |
   | `p,r,p` step 1 `performance` | no | — | 1 | 1280x800 = 1280x800 | capable | 1024 / false / false |
   | `p,r,p` step 2 `realistic` | **no** | **yes (2 total)** | **0.5** | **640x400** vs 1280x800 | **capable** | 4096 / true / true |
   | `p,r,p` step 3 `performance` | no | — | 1 (healed) | 1280x800 = 1280x800 | weak (`autoMaxDevice: weak`) | 0 / false / false |
   | Chromium control (`fallback-swiftshader.json`, SwiftShader) | no | **yes** | 1 | — | weak | 0 / false / false |

   **(a) The pageerror is NOT a context loss, and NOT Firefox-specific.** `gl.getContext()
   .isContextLost()` reads `false` at every snapshot and `ContextLossGuard` never logs — so nothing
   in the app's own loss/restore path ever ran. The `"WebGL context was lost."` warning in the
   smoke's error list comes from **`src/ui/WebGLFallback.tsx` line 13**, which is the app
   deliberately disposing its WebGL2 *capability-probe* canvas with
   `WEBGL_lose_context.loseContext()` at boot (Firefox logs a console warning for that call). It is
   benign, fires before any tier switch, and has nothing to do with the scene renderer. The real
   cause is `ShaderWarmup`'s `gl.compileAsync(scene, camera)`: in three 0.184, `compileAsync`
   polls program readiness synchronously **only** when `KHR_parallel_shader_compile` is present;
   without it (three logs `KHR_parallel_shader_compile extension not supported` — Firefox 150 does
   not expose it, and neither does SwiftShader) it defers to
   `setTimeout(checkMaterialsReady, 10)`, and that callback reads
   `properties.get(material).currentProgram.isReady()`
   (`node_modules/three/build/three.module.js:17431-17435`). A tier switch remounts a good part of
   the tree, so any material DISPOSED inside that 10 ms window has already been removed from the
   renderer's `properties` map by `deallocateMaterial` → `properties.remove(material)` (same file,
   `:17082-17088`) → `currentProgram` is `undefined` → TypeError **thrown from a timer callback**,
   outside the promise chain (so the discarded `p.then(undefined, () => {})` could not catch it)
   and outside `ShaderWarmup`'s own try/catch. Headless Chromium under SwiftShader reproduces it
   verbatim (`Cannot read properties of undefined (reading 'isReady')` in
   `fallback-swiftshader.json`, which had been passing because `shot.mjs` does not fail on a
   pageerror) — so the "Firefox driver hiccup" framing was wrong: the discriminator is the missing
   extension, not the browser.
   **Fixed** by dropping to the synchronous `gl.compile(scene, camera)` in
   `src/scene/ShaderWarmup.tsx`. Programs are created synchronously by both and the promise was
   discarded, so the warmup is behaviourally identical — it just no longer schedules a poll that
   can throw. Verified: `MODES=realistic` and `MODES=performance,realistic,performance` both exit
   **0** with **0** pageerrors (were 1 and 2), and the Chromium SwiftShader scenario logs **0**
   (was 1). Not flag-gated: it removes a call inside an already-unflagged internal controller
   rather than adding a feature.
   **(b) The soft recovered frame is `interactiveDegrade` working exactly as designed — no
   defect, nothing changed.** The dump settles the three candidates: it is a **pixel-ratio drop**
   (`gl.getPixelRatio()` 1 → **0.5**, drawing buffer **640x400** stretched over 1280x800 CSS px —
   which is why the DOM stays crisp and the canvas does not), **not** the `dprHalved` last rung
   (`false` throughout), **not** the class ladder (`deviceClass` is still `capable` in the soft
   frame; the demotion to `weak` only lands one step LATER, during step 3), and **not** DoF. It is
   `InteractiveDprController` applying `degradedDpr`, and the decision genuinely WANTS it:
   `shouldDegradeDpr` reports `wants: true` with the last >250 ms frame 612–624 ms earlier, inside
   the 3000 ms `LONG_FRAME_HOLD_MS`. Headless Firefox renders Realistic frames slower than 250 ms
   continuously, so the hold never lapses while the mode is active — and it heals correctly the
   moment frames get cheap again (step 3 reads `pixelRatio: 1`). Two facts make this a *product*
   question rather than a bug: `performance` never degrades at all (`shouldDegradeDpr` returns
   false without `postprocessing`), which is the whole reason the two frames differ; and at
   `devicePixelRatio === 1` the halving lands on **0.5**, i.e. a visibly upscaled canvas, where at
   DPR 2 it lands on 1 and is invisible. `interactiveDegrade.ts` documents that trade explicitly
   ("device DPR 1 → 0.5 (upscaled, still fluid)"), so narrowing it to `MIN_DEGRADED_DPR = 1` on
   DPR-1 displays would be re-deciding a shipped, measured GPU-watchdog defence — a call for the
   product owner, not this item. **If it is picked up, it belongs in
   `docs/open-graphics-decisions.md`, not here.**
   Frames: `/tmp/photoreal/firefox/fix-prp-{1-performance,2-realistic,3-performance}.png` and
   `/tmp/photoreal/firefox/fix-r-1-realistic.png` (the realistic frame is still soft, correctly —
   the fix was for the pageerror, not for the DPR).
