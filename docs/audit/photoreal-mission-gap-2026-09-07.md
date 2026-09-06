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
| Fallback tier: no post, no shadow maps, baked light only, DPR 1 | **Shipped** | `softwareRasterFallback` (simple, default on). `isSoftwareRenderer` is read once at boot into the store's `softwareRenderer`; `resolveQuality` layers a floor between the preset and the user's overrides — `shadowMapSize 0`, `postprocessing`/`ao`/`dof`/`cinematic` false, `dprMax 1`, `envResolution 64` — keeping `ibl` and the mode-gated baked visibility lightmaps, so Realistic on a CPU renderer is baked-only rather than flat. Keyed on the renderer NAME, so phones keep `realistic/weak`; a user override still wins. Measured (SwiftShader headless, 1280x800 dpr2, hour 13, default 4-room, 8s warm-up + 45s motion): p50 inside `gl.render` walk 8.7→5.0 ms (-42%), orbit 13.3→10.5 ms (-21%). The caveat shipped with that number — the achieved RATE did not separate the arms — is now settled by FRAME-COST-SYNC, see the row below: end to end this is a **tail** win (p90 -30% orbit / -36% walk) with **no median win**. |
| FPS benchmark, Chrome | **Shipped** | `scripts/perf.mjs`, `perf-orbit.mjs`, `dev-probes/frame-time.mjs` (SwiftShader headless = the CPU path); real GPU via `SHOT_GPU=1`. |
| FRAME-COST-SYNC (whole-frame instrument) | **Shipped** | `dev-probes/frame-time.mjs SYNC=1`. Every earlier number in this arc timed CPU inside `gl.render`, which on a software rasteriser is <1% of the frame. `SYNC=1` drives the pipeline instead of watching it — r3f's own demand pass is dropped, one `window.__three.advance(now)` runs per rAF, and a 1x1 `readPixels` of the *default* framebuffer (the dependable Chromium sync; `gl.finish()` is not) forces completion before the clock stops. Both numbers print per tier: `cpu p50/p90` and `sync p50/p90`. Validated by the ratio — under SwiftShader `sync` p50 is ~1900 ms against `cpu` p50 ~10 ms, i.e. the read really is waiting on raster the wrapper never saw; `readPixels` mode, zero GL errors, zero black reads. Known blind spot, documented in the file: `sync` is a *serialised* frame (no CPU/GPU overlap), so it is an upper bound on cost and a lower bound on rate — a valid A/B and a valid attribution, not the rate a user sees. |
| Look parity of the floored Realistic path | **Measured, no defect** | Same default orbit pose, 1280x800, hour 13, interior crop (central third). Luminance p05/p25/p50/p95 + mean saturation: floored Realistic on SwiftShader **155 / 196.7 / 207.4 / 237.8, sat 0.070**; full Realistic on a real GPU (ANGLE Metal, Apple M4) **125.9 / 167.4 / 189.0 / 227.5, sat 0.093**; `performance`/weak **145.4 / 176.1 / 189.8 / 229.0, sat 0.098**. The floored frame is the brightest of the three and the lift shrinks monotonically with luminance (+29 counts at p05, +10 at p95) while saturation drops — the signature of missing OCCLUSION (N8AO off, `shadowMapSize 0`, and a 64px probe filling shadow with flat neutral light), not of an exposure error, which would scale the image roughly proportionally. **The exposure path is shared and was verified as such**: `Lighting` writes `gl.toneMappingExposure` in `useFrame` with no post gate, and `composerPlan` mounts a composer carrying `<ToneMapping>` on *every* tier (WALL-NO-COMPOSER), so the composer-less-sounding floored path in fact takes the same AgX transform — `gl.toneMapping === 6` and `toneMappingExposure === 1.38` in all three captures. No fix made; the brightness is the honest cost of dropping occlusion. Caveat on the real-GPU capture: `interactiveDegrade`'s long-frame hold left it at `pixelRatio 0.5`, which blurs and therefore *understates* its p05/p95 spread — the gap is real and if anything larger. |
| FPS / parity benchmark, Firefox | **Shipped (parity suite added)** | `scripts/dev-probes/firefox-smoke.mjs` (boot smoke) plus `scripts/dev-probes/browser-parity.mjs` (BROWSER-PARITY, added 2026-09-07), which drives Chromium (`channel: 'chrome'`, real ANGLE Metal) and Firefox (Playwright 150.0.2, real Apple GPU) through the identical boot/tier sequence, measures frame cost with `frame-time.mjs`'s `SYNC=1` fence method, and diffs the resulting screenshots (whole-frame `img-diff.mjs` + the interior-crop luminance/saturation recipe from the row above). Measured this machine, both tiers: whole-frame mean |diff| 0.52 (performance) / 0.95 (realistic) counts, but the interior-crop percentile deltas were ≤0.2 luminance counts and 0.000 saturation at every percentile in both modes — the two engines render the identical picture, the whole-frame number is AA/rounding noise. Zero `pageerror`s in either browser (the v0.33.2.2 `KHR_parallel_shader_compile` fix holds). Visual review of all four captures found no cross-browser difference in tone, shadows, AO or UI. Docs: `docs/visual-verification-playbook.md`'s new "Chrome vs Firefox parity" section. |
| Clean fallback with hardware acceleration disabled | **Shipped** | `scripts/scenarios/fallback-swiftshader.json` asserts `softwareRenderer`, `deviceClass === 'weak'`, the resolved Realistic settings (shadows/post/AO/DoF/grain off, DPR 1, `ibl` on at `envResolution 64`), zero shadow-casting lights in the scene graph and `gl.getPixelRatio() === 1`, then shoots both modes from the same default orbit pose. |

## Open items, in order
1. ~~**REALISTIC-SOFTWARE-FALLBACK.**~~ Done, and the open measurement thread is now **closed by
   FRAME-COST-SYNC** (`frame-time.mjs SYNC=1`). Full re-measurement, SwiftShader headless,
   1280x800 dpr2, hour 13, default 4-room flat, 8s warm-up + 45s of motion, whole-frame `sync`
   times in ms:

   | arm | mode | cpu p50/p90 | **sync p50/p90** | n | frames/s |
   | --- | --- | --- | --- | --- | --- |
   | A — `realistic`, `softwareRasterFallback` **off** | orbit | 16.8 / 26.1 | **1898.2 / 2911.8** | 16 | 0.4 |
   | B — `realistic`, flag **on** (shipped) | orbit | 10.3 / 21.9 | **1975.0 / 2035.4** | 19 | 0.5 |
   | C — `performance` (control) | orbit | 5.8 / 6.4 | **864.7 / 932.9** | 41 | 1.1 |
   | D — B + `pbrSurfaces` **off** | orbit | 10.6 / 16.1 | **2208.6 / 2779.5** | 18 | 0.4 |
   | A — flag **off** | walk | 9.2 / 100.1 | **1881.4 / 3133.6** | 18 | 0.5 |
   | B — flag **on** (shipped) | walk | 6.1 / 17.4 | **1854.3 / 2006.4** | 19 | 0.5 |
   | C — `performance` (control) | walk | 3.3 / 3.6 | **788.6 / 869.1** | 43 | 1.2 |
   | D — B + `pbrSurfaces` **off** | walk | 5.1 / 17.0 | **1877.5 / 2597.9** | 19 | 0.5 |

   **Verdict: the caveat is half resolved, half refuted.** B beats A decisively in the TAIL —
   sync p90 -30% orbit, -36% walk, and max 3407→2787 / 3577→3109 — but there is **no median
   win**: sync p50 is 1975 vs 1898 (orbit, B 4% *slower*) and 1854 vs 1881 (walk, -1.4%), both
   inside run-to-run noise, and the achieved rate is 0.4-0.5 frames/s in both arms. So the
   shipped claim must be restated: the floor removes the worst frames on a CPU rasteriser and
   costs the CPU less to submit them; it does not make the typical frame faster.

   **Root cause of the missing median win, and the useful finding of the round:**
   `interactiveDegrade` (GPU-STARVE-1) already holds a CPU rasteriser at DPR 1 — every frame is
   a "long frame" by its 250 ms threshold, so the 3 s hold never releases. Measured directly
   with the flag OFF at `deviceScaleFactor: 2`: `gl.getPixelRatio()` was **1** before the drag
   started (drawing buffer 1280x800, not 2560x1600), 1 throughout a 25 s drag, and 1 six
   seconds after release. The floor's `dprMax 1` is therefore **redundant on exactly the
   machines it targets**, which removes the largest of its five axes; the shadow map, N8AO,
   bloom/SMAA, DoF and `envResolution` 192→64 are what remain, and they land in the tail.

   **What the fallback cannot reach.** Flat `performance`/weak is still 2.2-2.4x faster
   (865/789 ms). It differs from floored Realistic only in `ibl` (off), `geometryDetail`
   (0.7 vs 1.4) and the Realistic-*only* content — baked-lightmap shader variants, photoreal
   hero GLBs, transmission. That is where the remaining ~1.1 s/frame lives, and no per-frame
   quality setting in this floor touches it. Anyone wanting a CPU-renderer speed-up should look
   there, not at more settings to zero.

   **Arm D (`pbrSurfaces` off), measure-only per the brief's "lock materials to basic PBR
   shaders on the fallback" idea: it does not pay.** `pbrSurfaces` does gate the
   `MeshPhysicalMaterial` lobes (clearcoat/sheen/anisotropy + the micro-normal/roughness maps —
   `furnitureMaterials.ts`), so the ablation is the right one; it must be set via
   `?ff=pbrSurfaces:off` at boot because the materials are built and cached once. Result: orbit
   sync p50 2208.6 ms (**+12% vs B**), walk 1877.5 ms (+1%, noise). No implementation made.
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
4. **SOFTWARE-FLOOR-DEFAULT option (3), CERTIFIED.** See `docs/open-graphics-decisions.md` item
   (af), "Certified (fence) comparison". The instrument problem is fixed and the tail number is no
   longer a lower bound. **FRAME-COST-FENCE** (`frame-time.mjs v0.33.2.6`) adds a third completion
   mode — a WebGL2 `fenceSync(SYNC_GPU_COMMANDS_COMPLETE)` polled to `SIGNALED` across
   `setTimeout(0)` ticks (`clientWaitSync` cannot block: its timeout is capped at
   `MAX_CLIENT_WAIT_TIMEOUT_WEBGL`, which Chromium reports as 0) — selected by default when
   WebGL2 offers it, forceable with `SYNCMODE=fence|readPixels|finish`. Validated three ways:
   fence p50 agrees with `readPixels` p50 to +3.1 % on arm B and +1.2 % on arm E (both modes back
   to back in one session); under SwiftShader fence p50 is 1984.7 ms against a `cpu` p50 of
   10.2 ms (195×), so it really is waiting on raster; and arm E runs `[fence]` with zero GL errors.
   The root cause of the old fallback was **not** a broken `readPixels`: GL errors are sticky, the
   composer + N8AO leave a `glBlitFramebuffer` error pending when they mount, and the one-shot mode
   detection was collecting it after its own read and blaming the read. Forced `SYNCMODE=readPixels`
   on arm E reads 855.6 ms, within 1.2 % of the fence. The detection now drains pending errors
   first. `finish` mode had been under-measuring arm E by ~11 % (774 → certified 864.6 ms).

   **Certified result (SwiftShader, `SYNC=1 SYNCMODE=fence WARMUP=8 SECONDS=90 DSF=2`, hour 13,
   default 4-room, one session per mode for B/E/C; A is boot-flagged so it is a separate session):**

   | arm | mode | **sync p50 / p90 (ms)** | n | frames/s | cpu p50 | drawing buffer |
   | --- | --- | --- | --- | --- | --- | --- |
   | A — flag off *(separate session)* | orbit | 1756.6 / 1983.8 | 46 | 0.6 | 14.7 | 1280×800 |
   | B — flag on (shipped) | orbit | 1938.2 / 2087.8 | 42 | 0.5 | 9.6 | 1280×800 |
   | **E — option (3)** | orbit | **864.6 / 943.4** | 58 | 1.1 | 11.4 | **640×400** |
   | C — `performance` (control) | orbit | 848.6 / 919.4 | 94 | 1.2 | 5.9 | 1280×800 |
   | A — flag off *(separate session)* | walk | 2046.4 / 2304.7 | 40 | 0.5 | 7.6 | 1280×800 |
   | B — flag on (shipped) | walk | 2162.8 / 2452.6 | 39 | 0.5 | 4.9 | 1280×800 |
   | **E — option (3)** | walk | **786.4 / 893.9** | 68 | 1.2 | 5.9 | **640×400** |
   | C — `performance` (control) | walk | 943.4 / 1065.6 | 88 | 1.1 | 3.4 | 1280×800 |

   Option (3) **keeps the tail win and enlarges it** — p90 −55 % orbit / −64 % walk against the
   shipped floor, and it moves the median by the same amount, reaching flat `performance` parity at
   1.1–1.2 frames/s. The mechanism is mostly **resolution, not settings**: `shouldDegradeDpr`
   returns false without `postprocessing`, so option (3) re-arms `InteractiveDprController` and the
   canvas halves to 640×400, a quarter of the floor's pixels. Pinned to equal pixels
   (`FLAGS_OFF=interactiveDegrade`) option (3) is only −19 % p50 orbit and −11 % walk against B
   (1557.5 vs 1928.6; 1927.6 vs 2161.4). Two threads left open, both wanting a same-session
   confirmation: on the fence instrument arm **A is faster than B on p50 *and* p90 in both modes**,
   i.e. the floor's own tail win over "flag off" does not reproduce (A is a separate session, and A
   also has post on, so it also takes the composer path); and the option-(3) look-parity capture was
   taken at full resolution, so as shipped it will be a 640×400 upscale. **Update, `v0.33.2.7`:**
   `softwareRasterFallback`'s `default` flipped to `false` on this certified table (flag-off is at
   least as fast as the floor on p50 and p90 in both modes, with a flatter frame) — item (af) stays
   OPEN for the remaining product call (stay off / back on / build option (3)).
