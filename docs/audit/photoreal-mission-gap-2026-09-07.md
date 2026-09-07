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
| Fallback tier: no post, no shadow maps, baked light only, DPR 1 | **Shipped** | `softwareRasterFallback` (simple, default on again since `v0.33.2.9`). `isSoftwareRenderer` is read once at boot into the store's `softwareRenderer`; `resolveQuality` layers a NARROW floor between the preset and the user's overrides — `shadowMapSize 0`, `dof`/`cinematic` false, `dprMax 1`, with `postprocessing`, `ao`, `envResolution` and `ibl` deliberately ABSENT so the preset's post stack, N8AO and 192 probe survive alongside the mode-gated baked visibility lightmaps (the wide floor that also dropped those shipped in `v0.33.2.0`, went off in `v0.33.2.7` and is retired — see open item 4). Keyed on the renderer NAME, so phones keep `realistic/weak`; a user override still wins. Measured (SwiftShader headless, 1280x800 dpr2, hour 13, default 4-room, 8s warm-up + 45s motion): p50 inside `gl.render` walk 8.7→5.0 ms (-42%), orbit 13.3→10.5 ms (-21%). The caveat shipped with that number — the achieved RATE did not separate the arms — is now settled by FRAME-COST-SYNC, see the row below: end to end this is a **tail** win (p90 -30% orbit / -36% walk) with **no median win**. |
| FPS benchmark, Chrome | **Shipped** | `scripts/perf.mjs`, `perf-orbit.mjs`, `dev-probes/frame-time.mjs` (SwiftShader headless = the CPU path); real GPU via `SHOT_GPU=1`. |
| FRAME-COST-SYNC (whole-frame instrument) | **Shipped** | `dev-probes/frame-time.mjs SYNC=1`. Every earlier number in this arc timed CPU inside `gl.render`, which on a software rasteriser is <1% of the frame. `SYNC=1` drives the pipeline instead of watching it — r3f's own demand pass is dropped, one `window.__three.advance(now)` runs per rAF, and a 1x1 `readPixels` of the *default* framebuffer (the dependable Chromium sync; `gl.finish()` is not) forces completion before the clock stops. Both numbers print per tier: `cpu p50/p90` and `sync p50/p90`. Validated by the ratio — under SwiftShader `sync` p50 is ~1900 ms against `cpu` p50 ~10 ms, i.e. the read really is waiting on raster the wrapper never saw; `readPixels` mode, zero GL errors, zero black reads. Known blind spot, documented in the file: `sync` is a *serialised* frame (no CPU/GPU overlap), so it is an upper bound on cost and a lower bound on rate — a valid A/B and a valid attribution, not the rate a user sees. |
| Look parity of the floored Realistic path | **Measured, no defect** | Same default orbit pose, 1280x800, hour 13, interior crop (central third). Luminance p05/p25/p50/p95 + mean saturation: floored Realistic on SwiftShader **155 / 196.7 / 207.4 / 237.8, sat 0.070**; full Realistic on a real GPU (ANGLE Metal, Apple M4) **125.9 / 167.4 / 189.0 / 227.5, sat 0.093**; `performance`/weak **145.4 / 176.1 / 189.8 / 229.0, sat 0.098**. The floored frame is the brightest of the three and the lift shrinks monotonically with luminance (+29 counts at p05, +10 at p95) while saturation drops — the signature of missing OCCLUSION (N8AO off, `shadowMapSize 0`, and a 64px probe filling shadow with flat neutral light), not of an exposure error, which would scale the image roughly proportionally. **The exposure path is shared and was verified as such**: `Lighting` writes `gl.toneMappingExposure` in `useFrame` with no post gate, and `composerPlan` mounts a composer carrying `<ToneMapping>` on *every* tier (WALL-NO-COMPOSER), so the composer-less-sounding floored path in fact takes the same AgX transform — `gl.toneMapping === 6` and `toneMappingExposure === 1.38` in all three captures. No fix made; the brightness is the honest cost of dropping occlusion. Caveat on the real-GPU capture: `interactiveDegrade`'s long-frame hold left it at `pixelRatio 0.5`, which blurs and therefore *understates* its p05/p95 spread — the gap is real and if anything larger. |
| FPS / parity benchmark, Firefox | **Shipped (parity suite added)** | `scripts/dev-probes/firefox-smoke.mjs` (boot smoke) plus `scripts/dev-probes/browser-parity.mjs` (BROWSER-PARITY, added 2026-09-07), which drives Chromium (`channel: 'chrome'`, real ANGLE Metal) and Firefox (Playwright 150.0.2, real Apple GPU) through the identical boot/tier sequence, measures frame cost with `frame-time.mjs`'s `SYNC=1` fence method, and diffs the resulting screenshots (whole-frame `img-diff.mjs` + the interior-crop luminance/saturation recipe from the row above). Measured this machine, both tiers: whole-frame mean |diff| 0.52 (performance) / 0.95 (realistic) counts, but the interior-crop percentile deltas were ≤0.2 luminance counts and 0.000 saturation at every percentile in both modes — the two engines render the identical picture, the whole-frame number is AA/rounding noise. Zero `pageerror`s in either browser (the v0.33.2.2 `KHR_parallel_shader_compile` fix holds). Visual review of all four captures found no cross-browser difference in tone, shadows, AO or UI. Docs: `docs/visual-verification-playbook.md`'s new "Chrome vs Firefox parity" section. |
| Clean fallback with hardware acceleration disabled | **Shipped** | `scripts/scenarios/fallback-swiftshader.json` asserts `softwareRenderer`, `deviceClass === 'weak'`, the resolved Realistic settings for the shipped narrow floor (shadows/DoF/grain off and DPR 1, with post/AO/`ibl`/`envResolution 192` untouched from the preset), zero shadow-casting lights in the scene graph and `gl.getPixelRatio() === 1` (`interactiveDegrade` pinned off so that is deterministic), then shoots both modes from the same default orbit pose. `fallback-swiftshader-flag-off.json` covers the escape hatch: with the flag off, Realistic resolves to `QUALITY_PRESETS.realistic.weak` byte-for-byte. |
| Dimensional accuracy of the shell + fittings ("accurate, precise, to scale") | **Shipped (audited + 4 fixes)** | [`docs/audit/hdb-scale-audit-2026-09-07.md`](hdb-scale-audit-2026-09-07.md) — 35 rows of code vs **measured** vs cited HDB/BCA/SCDF/PUB reference for the default 4-room flat. Measured, not read off constants: `scripts/dev-probes/scale-audit.mjs` raycasts every opening through its wall (a hole has no bounding box — the extruded wall body's AABB is the full storey however it is punched) and reads fitting mount heights out of the instance matrices; it is re-runnable against either flag state and asserts 19 rows. Four fixes behind ONE flag `hdbScaleAudit` (simple, default on): the household-shelter blast door 800x2100 -> **700x1900 mm** (SCDF TRHS 2023 cl. 2.5), door lever centre 0.878 -> **1.000 m AFFL** (BCA COA 2025 cl. 4.4.8.1(c) — and the real defect was the MECHANISM: the height was a fraction of the leaf, so the corrected 1.9 m blast leaf would have put its handle at 798 mm), main-door kick plate 200 -> **250 mm** (COA 2019 cl. 4.4.13.1), shower wall take-off 600 -> **1000 mm** (COA 2025 cl. 5.8.9). Everything else verified **ok** (2.6 m ceiling, 2.4 m wet-room drop, 90 mm skirting inside HDB's 100 mm cap, 70 mm cornice clearing the 2.1 m pelmet rule, 1.005 m corridor meeting COA cl. 7.1.7's 1000 mm, switches at the 1200 mm band top, floor traps, laundry rack, trunking) or recorded as a **product call** and NOT touched: the 550 mm window cill (HDB(ARCH) asks >=1.0 m; the plan asset's own W1 callout specifies a 3/4-height window over a 550 mm parapet and the windows carry the approved safety grille — escalate as content), the 800 mm internal leaf and 1.0 m main leaf, every plan-traced wall thickness, the tile module, 300 mm sockets (COA's mandatory band is 450-1200 mm but 300-350 is the documented as-built BTO height), and the FCU height (a furniture item). One new measured anomaly logged for follow-up: bedroom 3's window renders **1.38 m** clear against 1.50 declared while its twin in bedroom 2 renders 1.48, the reveal against the 300 mm `wall-ext-N-pier` eating ~100 mm. |
| LIVING-SLAB — the baked bounce did not follow the sun | **Fixed** | Flag `bakedGiDayLevel` (simple, default on). The `photoreal-defect-sweep` GPU run showed the right ~20 % of `02-01-living-far.png` as a featureless near-white plane, still blown-out white at 20:00 while the rest of the room was lamp-lit. Raycast at NDC (1450, 600) of the 1600x1000 frame: NOT a curtain — a `wallOverlay` finish mesh, `userData {finishTarget:{kind:'wall',roomId:'livingDining'}, wallOverlay:true}`, `MeshStandardMaterial #f5f5f0` roughness 0.92 with plaster normal+roughness at `repeat` 1.67 (world-metre UVs, so a 0.6 m period), world plane x = 12.524, z 2.8→6.35, y 0→2.6, carrying `/assets/lightmaps/5487e7de-6f5a1254.png` — the `livingDining` EAST wall, one of the 178 baked meshes. **Not a clipping bug**: by day p95 is 227, well under 245. The cause is that `visGain` was a CONSTANT while `lampBounce` and `exteriorBoost` both already tracked their own level, so the Cycles *bounced-daylight* bake was assigned whole at every hour and every mapped surface held its 13:00 irradiance all night. Measured real GPU (Apple M4, Metal, realistic/capable, 1600x1000), 300x590 px of the wall at 20:00: **201.6 counts at R−B −1.7 → 163.8 at R−B +18.1**, against the adjacent lamp-lit west wall's 165.0 — so it is now no brighter than the wall beside it and warm instead of neutral-cold. Day is unchanged, and **exactly so by construction**: `daylightFromAltitude` saturates at 1 for any sun above the horizon, so `visGain * visDay` is `visGain * 1.0` at every daytime hour. Verified two ways — mean/p05/p95/R−B/sd all delta **0.00** over both the 350x700 spec crop and a minimap-free 300x590 one, and per-pixel the slab region differs by at most **4 counts** (the animated film grain). The whole-frame day diff of mean 0.90 / max 242 is the CEILING FAN at a different blade angle plus grain, localised on a diff image — not the term. `setVisDayLevel` rides the same ramp as `setExteriorBoostLevel`; the uniform is present holding 1 when the flag is off, so the program cache key is untouched. Tests: `visibilityLightmap.test.ts` (`visDayScale` both states, uniform threading, cache key, detach). |
| DOOR-LEAF-REALISM — wavy door grain + black wedges over the door heads | **Fixed** | Flag `doorLeafRealism` (simple, default on), two defects. **(a) Grain:** the leaves used the FURNITURE cabinet wood, whose figure meanders `FURNITURE_WOOD_WAVER x FURNITURE_WOOD_RINGS` = 28 % of a band, at an isotropic `repeat` 2 on a 0.8 x 2.1 m panel — so the lengthwise meander was stretched 2.6x up the leaf and read as rippling water (`08-06-door-bedroom2.png`, `09-07-main-door.png`). `woodGrainParams` adds a `door` variant: rings 7→22 (~18 mm nominal pitch, 23 px/cycle in the 256² tile), waver 0.04→0.002 (**4.4 % of a band**), latePower 4→3, lateDepth 0.2→0.11, poreDepth 0.1→0.09, a new across-grain `toneDepth` 0.07, a new per-band **pitch jitter 0.4**, planks 3→1 (a flush leaf is one veneer sheet, not three boards), relief 3→0.8 and `normalScale` 0.45→0.28. **The pitch jitter was the difference between "veneer" and "corrugated rib"**: a first real-GPU pass at a UNIFORM 18 mm pitch with relief 1.6 / poreDepth 0.18 read as evenly spaced ridges, so `woodBandEdges(rings, jitter)` now gives band `k` a width of `1 ± 0.4` seeded from its own index and renormalised to sum to exactly one tile — a monotone remap of `u`, so it changes SPACING without bending any band sideways, and it still tiles. Relief and pores halved with it (ridge contrast is a relief problem, not an albedo one). Measured real GPU at `pose-door-bedroom2`, adjacent-column gradient on a 512x700 px crop of the leaf: **1.890 (pre-fix) → 1.722 (uniform pitch) → 1.440 (jittered, shipped)**, per-row sd 9.92 → 6.02 → 5.50. Lateral wander of a grain line, by drift-free bounded cross-correlation of 8-row block averages against a mid-leaf reference (±4 px window, under half the MINIMUM jittered pitch): **1.76 px pre-fix** (5 % of rows saturating the window, so understated) → 1.99 px uniform → **1.65 px shipped**. That last number is an upper bound, not a measurement: the same estimator reads **2.90 px on the featureless plaster wall beside the door**, so the leaf is BELOW its own noise floor, and the design amplitude bounds true wander at ±0.34 px (waver 0.002 u-units at ~340 px per u-tile in this framing) with the jitter contributing exactly zero because it is constant in `v`. **Two earlier metrics were wrong and are recorded so they are not re-run:** a single-frequency Fourier phase aliases once the band pitch drops to 16.5 px and is invalid outright once the pitch is jittered (the jitter spreads the spectrum and one bin reports that spread as wander — it read 3.30 px on a leaf that is straighter than before); and row-to-row line tracking random-walks over 700 rows and read 6.85 px. `furniture` is byte-for-byte the shipped values, asserted in `woodGrainVariant.test.ts`, so no furniture pixel moves either way. **(b) Wedges:** raycast at the black pixels of `07-05-corridor-west.png` (left ~x 645–700 y 305–350, right ~x 935–1000 y 285–330) lands on a face with WINDING normal (0, −1, 0) at y = **2.09** (door head 2.1 less `wallBodyShape.ts:OPENING_CLEARANCE`) on the wall-segment box world `3.28,0,3.725`→`9.135,2.6,3.825`, `MeshStandardMaterial #f1f0ec`, `side: FrontSide`, facing the camera — the doorway HEAD SOFFIT. **Not** a missing head-jamb face, **not** a back-face cull, **not** a lintel/frame gap and **not** shadow acne. It is the third member of the family `exteriorFaceLightmapFallback` and `orbitNightCaps` fixed: an opening cut *inside* a wall box is not one of the six box faces, so `computeBoxAtlasUv` mirrored the lookup onto an atlas slot the bake never filled and `replace` mode assigned ~0. `markOpeningSoffitFaces` gives those faces the same `CUT_CAP_UV_SENTINEL` (**26 faces, 0 uv1 conflicts** on the default flat). Measured real GPU at `pose-corridor-west` 13:00, p05 of the soffit patches: right door head **43.3 → 71.1**, the second head **26.7 → 82.0**, and the leafless doorway's soffit blob (mean 86.5) dissolves entirely above the 120-count threshold. Attribution: with the bake off entirely the same patch reads 77.2 and with bake AND N8AO off 127.3, so the sentinel recovers **all** of the bake's share and the residual dark line above a CLOSED leaf is N8AO on the real 25 mm reveal pocket between the 50 mm leaf and the 100 mm wall — a genuine crevice, correct behaviour, and closing it would need a door LINING (new geometry, not a defect fix). No z-fighting introduced: paired frames 400 ms apart over the right and left door frames differ by mean 0.50/0.61 counts, max ≤40, ~150 px of 128k above 8 — identical in both flag states, and it is the animated film grain (the earlier max-187 reading was the DOM interaction pill fading in). |
| SHOWER-GLASS-ROUGHNESS-FLOOR — shower screen glass shows a faceted hexagon at close range | **Fixed** | Flag `showerGlassRoughnessFloor` (simple, default on). The `photoreal-defect-sweep` GPU frame `13-11-bath1.png` showed bath1's corner shower's +X `GlassMaterial` pane (`Shower.tsx`, roughness 0.04) as a soft-edged pentagon/hexagon at 0.2-0.3 m from the camera. `materialRealism.ts:glassRoughnessFloor(roughness, kind, tier, enabled)` floors it for `getGlassMaterial`'s new `kind: 'showerScreen'` only (threaded through `GlassMaterial.tsx`'s new `kind` prop from `Shower.tsx`'s two panes, and directly from `ShowerScreen.tsx`'s standalone fixed screen — same fixture class); every other caller (windows, `CabinetModule`, `BarCart`, `FlutedPartition`) keeps `kind: 'default'`, untouched. Cache key extended to `glass:<tier>:<color>:<opacity>:<tint>:<kind>` so the shower's floored material never shares a slot with a same-colour non-shower pane. **The first diagnosis (a reflected Lightformer facet, floor 0.12) was WRONG and did not remove the shape** — caught by a coordinator review of the real-GPU frame, not by the unit tests, since the pure function did exactly what it claimed. **Bisected live** rather than re-guessed: `window.__three` was used to find the mounted material (scene-traverse for `userData.itemId === 'default-bath1-shower'`, the sole `MeshPhysicalMaterial` with `transmission > 0`) and toggle `envMapIntensity` and `transmission` independently at the same pose, one page load, four frames (`/tmp/photoreal/shower/bisect/01-00-baseline-r012.png` roughness 0.12 baseline; `02-01-env0-transmission-untouched.png` env zeroed; `03-02-transmission0-env-untouched.png` transmission zeroed; `04-03-both0.png` both zeroed). Blob-region (x1300-1550, y280-780) edge-gradient max: baseline 3.162, env-zeroed **3.162 (unchanged)**, transmission-zeroed **1.414 (matches "both zeroed")** — the shape is UNCHANGED by the reflection and GONE when transmission is zeroed, so it is the blurred TRANSMITTED view of the tiled wall/fittings behind the glass (three blurs that pass by the same `roughness` uniform, `applyIorToRoughness`), not a reflected Lightformer facet — the transmission target is far larger than the 256 px env PMREM, so the same roughness buys much less relative blur there, which is why 0.12 (tuned only against the reflection hypothesis) never worked. **Swept the floor** at the same pose/material (`05-sweep-r020.png`/`06-sweep-r030.png`/`07-sweep-r045.png`): edge-gradient max 2.236 (r0.2, facet still visually distinguishable in a 2x crop) → **1.414 (r0.3, matches the transmission-zeroed reference exactly, no identifiable edge in a 2x crop or a 40x-amplified edge map)** → 1.414 (r0.45, no further reduction, marginally softer overall via gradient-mean but the shape was already gone at 0.3). **0.3 shipped** — the smallest swept value that removes the identifiable shape while the pane still clearly reads as glass (the sink/fittings behind it stay visible, softly blurred, at every tested value). **Final measurement at the shipped 0.3** (real GPU, Apple M4/Metal, `realistic/capable`, `pose-bath1`, 1600x1000, flag on/off via URL override — `on/01-bath1.png` / `off/01-bath1.png`): blob-region edge-gradient max **5.028 (flag off, roughness 0.04) → 1.414 (flag on, roughness 0.3), a 71.9 % cut**, gradient mean 0.206 → 0.158 (−23 %); p95/sd are nearly flat (172.93→174.85, 8.73→9.03) because the defect is an edge shape, not a brightness shift. **Control (window pane, `pose-living-far`) stays unaffected**: whole-frame mean \|diff\| 0.135 (well under the 0.5 target), window-pane-pixels-only mean \|diff\| **0.0058**, and excluding the ceiling fan's bounding box (an animated element that lands at a different blade angle across separate page loads, same caveat `LIVING-SLAB`/`DOOR-LEAF-REALISM` already recorded) mean \|diff\| **0.0249** — effectively byte-identical. Tests: `materialRealism.test.ts` (`glassRoughnessFloor` — floors the shower kind to 0.3 on the transmission tier, leaves `default`/`undefined` kinds and the cheap tier alone, never lowers an already-rougher value, no-ops with the flag off). |

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
4. ✅ **CLOSED, `v0.33.2.9` — SOFTWARE-FLOOR-DEFAULT decided: option (3) shipped.** See
   `docs/open-graphics-decisions.md` item (af), now marked DECIDED, for the closing paragraph and
   the certification of the shipped path. The instrument problem is fixed and the tail number is no
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
   least as fast as the floor on p50 and p90 in both modes, with a flatter frame). **Closed,
   `v0.33.2.9`:** the maintainer chose option (3) — `SOFTWARE_REALISTIC_FLOOR` is now the four keys
   `shadowMapSize 0`, `dof false`, `cinematic false`, `dprMax 1`, with `postprocessing`, `ao`,
   `envResolution` and `ibl` deliberately absent so the `realistic`/`weak` preset's values survive,
   and the flag defaults back to `true`. Certified on the shipped path (same instrument, `fence`,
   `SECONDS=90`): sync p50/p90 **846.4 / 925.6 ms** orbit (n=95, 1.2 fps, 640×400) and **776.7 /
   887.6 ms** walk (n=104, 1.3 fps, 640×400) against flag-off 1768.4 / 1906.0 and 2035.5 / 2294.6 ms
   at 1280×800, i.e. flat-`performance` parity; look parity 107.3 / 168.5 / 192.6 / 231.3, sat 0.096
   against full Realistic on a real GPU 125.9 / 167.4 / 189.0 / 227.5, sat 0.093. Nothing further is
   owed here — a reopening needs a new measurement.
