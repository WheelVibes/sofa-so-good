# RD-412 — procedural Preetham/Hosek sky → backdrop + procedural IBL (2026-06-20 research)

Replace the stylistic Lightformer IBL + static photo backdrop with a physically-grounded, sun-driven
procedural sky that feeds BOTH the backdrop and a PMREM environment map. The pure sky math + texture
dimensions are headlessly verifiable; the lit result needs a real GPU.

## Current system (three independent sources, all off `useSunPosition()` → {azimuth, altitude})
1. **Sky dome** — `src/scene/lighting/Sky.tsx` mounts drei `<Sky>` (Preetham), params from
   `altitudeCurve.ts` `skyFromAltitude(altitude)` (turbidity/rayleigh/mie…), sun disc via
   `sunDirectionToScene()` rotated by `orientationDeg`. Hidden in walk mode when a photo backdrop is active.
2. **Photo backdrop equirect** — `src/scene/backdropEquirect.ts` `bakeBackdropEquirect(kind)` paints a
   2048×1024 LDR canvas (pure `backdropHorizon.ts` generators), wrapped as a `CanvasTexture`
   (EquirectangularReflectionMapping, SRGB) → `scene.background` (walk mode only). **Static presets
   (city/dusk/park/hills), NOT sun-driven.**
3. **IBL** — `src/scene/lighting/SceneEnvironment.tsx` mounts drei `<Environment frames={1}>` from
   hand-placed `<Lightformer>` rects (no HDR fetch; drei PMREMs internally). Intensity is altitude-driven:
   `scene.environmentIntensity = 0.12 + level*0.55`. Gated by `quality.ibl` (off on `performance`,
   on `medium/high/maximum`), sized by `quality.envResolution`.
- Direct lights (`Lighting.tsx`): directional sun + hemisphere fill + ambient, eased over 0.6 s.

## The tuned couplings (regression surface — READ `src/scene/CLAUDE.md`)
- **Exposure:** `gl.toneMappingExposure = grade(altitude).exposure * toneExposureBias(toneMode) * st.exposure`
  every frame; `grade()` (look.ts) maps altitude→[0.7,1.25].
- **Bloom threshold lock-step (#1 risk):** `look.BLOOM.luminanceThreshold = 1.35` sits *above* sunlit white
  walls under the day IBL at ~1.2 graded exposure and *below* night fixture emissive peaks. `fixtureGlow.test.ts`
  asserts the threshold === the look constant and that each emitter clears it. **A brighter sky probe can push
  daytime diffuse over 1.35 → the milky-veil bug (RD-409).** Raise one → raise the other in the same change.
- `environmentIntensity` (0.12–0.67) must be re-tuned to the new probe's absolute luminance.
- `performance` has NO IBL — its look is direct-lights + exposure only; recalibration must not drift it.

## Plan
1. **Extract** shared `rotateY` + sunDir-with-orientation helper out of `Sky.tsx`/`Lighting.tsx` into
   `sunPosition.ts` (pure, tested). Low-risk refactor.
2. **Pure core `src/scene/lighting/skyGradient.ts`** (mirror `backdropHorizon.ts` / procedural painters — no
   three/canvas): `skyRadiance(view, {sunDir, turbidity, groundAlbedo})` (analytic **Preetham** — simpler,
   matches the existing dome; Hosek-Wilkie a later upgrade) + `paintSkyEquirect(buf, w, h, params)`.
   `skyGradient.test.ts`: zenith>horizon, sun-side>anti-sun, turbidity whitens near sun, low-altitude warms
   horizon, night darkens, finite/non-negative.
3. **Pure rebuild-trigger predicate** (should-regenerate given old vs new sunDir/turbidity/orientation) + test.
4. **Backdrop adapter** — `bakeSkyEquirect(sunDir, turbidity)` in `backdropEquirect.ts` (canvas/DataTexture
   from the pure core, guarded for missing 2D context); `SceneBackdrop.tsx` rebuilds on threshold +
   `invalidate()` + disposes old. Unit-test dims/format.
5. **`proceduralSky` flag** (registry; `tier: 'pro'`, `default: true`) gating the new mounts; both-mode test.
6. **IBL adapter** — rewrite `SceneEnvironment.tsx` to `PMREMGenerator.fromEquirectangular(skyFloatTexture)`
   (use a **Float/HalfFloat** equirect so the sun's HDR survives — an LDR equirect flattens speculars).
   Single reusable `PMREMGenerator`, rebuild-on-threshold, **dispose old target**, `invalidate()`. Keep
   `quality.ibl` gate + `envResolution`; re-tune `environmentIntensity`.
7. **Bloom calibration pass** — verify/adjust the `BLOOM.luminanceThreshold` ↔ `fixtureGlow` lock-step;
   update both + the test if the probe brightness moved. Keep `grade()`/direct-light constants fixed.
8. **Visual verification (real GPU):** scenario screenshots at 4 times × {High,Maximum,medium,performance} ×
   {filmic,agx,neutral} — milky-veil (RD-409), night-glow, reflections, backdrop-through-windows; add recipe
   to the playbook.
9. **Docs** in lock-step: ARCHITECTURE, `src/scene/CLAUDE.md`, the time-of-day spec (mark Lightformer IBL
   superseded), CHANGELOG, version.

## Verifiable vs real-GPU
- **Headless:** skyGradient math, texture dims/format/mapping/colorSpace, rebuild predicate, flag both-mode,
  bloom lock-step test, `grade()`/look constants unchanged.
- **Real GPU:** the PMREM env map + speculars, lit daytime (no milky veil), night fixtures glow, tone operators.

## Key risks
1. Milky-veil regression (brighter probe over bloom threshold) — calibrate probe to current brightness.
2. Per-frame PMREM — must be one-time/debounced + dispose targets (demand-mode FPS + leaks).
3. LDR equirect for IBL loses sun HDR → flat speculars; use a Float buffer for the IBL path.
4. Tier drift — recalibration must not change the no-IBL `performance` look.
