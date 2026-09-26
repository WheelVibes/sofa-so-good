# `LightProbeGrid` for furniture — spike (R7-AC)

**Date:** 2026-09-26 · **Branch:** `feat/photoreal-round7` (head `47664b75`, `v0.35.18.7`) ·
**Machine:** Apple M4, headless Chrome for Testing 149, ANGLE/Metal, 1280×800, DPR 1, `realistic/capable`, walk mode.
**Brief:** spike three r184's `LightProbeGrid` as the thing that lights furniture, so the 19 forward
point lights can be cut (Stage 3b of [`lights-gpu-bound-2026-09-25.md`](./lights-gpu-bound-2026-09-25.md)).

## 0. Verdict: **REJECT on every tier.** The spike code is removed; this document is what is left.

1. **It works as described.** `LightProbeGrid` is in the installed `three@0.184.0`, wired into core
   `WebGLRenderer`, GPU-baked with no readback. Built per room, furniture-only, with no leak into
   the lightmapped shell (§3). The claim about the API is correct.
2. **It does not let the light count drop.** At 21:00 with the lights on, furniture lighting is
   mostly the lamps' **direct** term. The grid holds indirect light only. Keeping the **8 lights
   nearest the camera** without the grid already matches today's furniture to within 4 % (§4). At 4
   lights or fewer, furniture goes wrong with or without the grid, and the grid barely changes that.
   So the grid adds nothing at the count where it would have to work.
3. **What it costs:** a **4.0–5.2 s synchronous bake** (7.4 s after a lamp toggle). It has to
   re-run on every change to hour, weather, lights, lamps or finishes. Turning the flag on
   recompiled all 126 lit programs. Per frame it costs **+1.2 to +5 ms** at a fixed light count.
   The texture memory is trivial (82 KB).
4. **Phone tier: does not fit** (§6).
5. **Separate finding, bigger than the grid:** the 19-light frame is not ~19× one light's cost.
   There is a **cliff between 14 and 18 lights** (§5). At the living-room pose the frame goes
   27 → 61 → 82 → 89 ms for 14 / 16 / 18 / 19 lights, and 8 or fewer lights all sit at ~17 ms. So
   Stage 2 (a room-scoped pool of about 8) wins the performance on its own, with no grid.
6. **Correction to the record, both research docs missed it.** This exact spike has been done
   before. `src/scene/CLAUDE.md` ("Baking into an irradiance volume was spiked and REJECTED",
   2026-08-28, commit `35f76444`, CHANGELOG v0.30.x) recorded a 420-probe whole-flat grid
   rejected at 6.19 ms of SH sampling against 9.10 ms of lights, with a 4.4 s bake.
   `sota-2026-09-25.md` §1.3 said a probe volume had "never landed", which was wrong: it landed in
   r184. `lights-gpu-bound-2026-09-25.md` §2.6 fixed that but called it untried, which was also
   wrong. This round repeats it with per-room volumes, furniture-only application, replace
   semantics and the light-count question the first spike never asked. It reaches the same
   verdict for a different reason.

## 1. Research — r184 as installed, verified against `node_modules`

| claim | installed source | verdict |
|---|---|---|
| addon exists | `node_modules/three/examples/jsm/lighting/LightProbeGrid.js`, 651 lines, `three@0.184.0` (types `@types/three@0.184.1` ship `LightProbeGrid.d.ts`) | true |
| core wiring | `WebGLRenderer.js:1839` `object.isLightProbeGrid → pushLightProbeGrid`; `findLightProbeGrid` :2302; uniform upload :2730; `WebGLPrograms.js:347` `numLightProbeGrids`; `WebGLProgram.js:759` `#define USE_LIGHT_PROBES_GRID`; `lightprobes_pars_fragment.glsl.js` (7 `texture()` fetches, L2 SH eval) | true |
| zero readback | bake = `CubeCamera.update` per probe → SH-projection pass into a `9 × N` RGBA32F batch target → 7 repack passes into one `RGBA32F` `WebGL3DRenderTarget` atlas | true |
| applies to what | **every lit program in the scene** once any grid is visible: `irradiance += getLightProbeGridIrradiance(...)` in `lights_fragment_begin`, unconditionally | the hazard (§2) |
| per-object | one volume: every object gets it; several: the FIRST whose `boundingBox.containsPoint(object origin)`; none contains → no grid | containment, no blend |
| what the bake sees | `bake()` sets `this.visible = false`, renders the live scene with the renderer's lights (shadow map updated once, then frozen). One pass, no bounces | direct + whatever the scene's materials already show |

Upstream (all via `gh`/web, accessed 2026-09-26):
- PR [#33125](https://github.com/mrdoob/three.js/pull/33125), opened 2026-03-05 and merged
  2026-04-16 for r184. mrdoob, 2026-03-05: *"light leaking is hard to solve"*. It gives no bake
  timings. Mugen87 (2026-03-18) flagged the module-scope bake resources (`_cubeRenderTarget`,
  `_shMaterial`, `_batchTarget`) as never freed by `dispose()`, and they are still module-level in
  the installed file.
- Example `webgl_lightprobes_sponza.html` @ r184: 7×7×3 = 147 probes, `cubemapSize: 32`, re-bakes
  the whole grid on a 250 ms debounce when the light changes, and the GI toggle is
  `probes.visible = value`.
- PR [#33657](https://github.com/mrdoob/three.js/pull/33657) (2026-05-27) adds `bounces`: *"`bounces:
  0` matches the previous single-pass bake exactly"*, so **r184 is single-bounce**. PR
  [#33911](https://github.com/mrdoob/three.js/pull/33911) (2026-06-30) renames it to
  `LightProbeGridWebGL`. PR [#34486](https://github.com/mrdoob/three.js/pull/34486) (2026-09-06)
  adds incremental `start`/`count` baking. **r184 has neither.**
- No three.js issue or forum thread yet on interiors, leaks or mobile for this class (searched
  2026-09-26).
- WebGL2 capability ([web3dsurvey](https://web3dsurvey.com/webgl2/extensions/OES_texture_float_linear),
  accessed 2026-09-26): `OES_texture_float_linear` reaches **90.6 %** overall, but only
  **iOS 49.1 %** and **Android 74.9 %** (macOS 85.7 %, Windows 99.99 %). The atlas is RGBA32F
  sampled `LinearFilter`. Without the extension the texture is incomplete and reads black.
  `EXT_color_buffer_float` is ~99.9 %. `MAX_3D_TEXTURE_SIZE` has a spec minimum of 256 and is 2048
  on the M4.

## 2. What was built (removed after the verdict)

Flag `lightProbeGrid` (`simple` tier, **default false**). Component `LightProbeGridSpike`, loaded
lazily into `Scene.tsx`. Pure module `probeGrid.ts` plus 18 unit tests (both Simple and Pro modes).
Probe script `scripts/dev-probes/lightprobegrid-spike.mjs`. The design encoded three rules the
project had learned before:

- **One volume per room.** Boxes from `roomProbe.ts:roomProbeBox`, inset 0.2 m from the walls,
  y from 0.45 m to ceiling −0.35 m, ~0.8 m spacing, 2 layers, sorted smallest first to match
  `probeAt`'s tie-break. No probe sits in a wall. The default flat gets **11 rooms / 380 probes**.
- **Furniture-only, and no double count on the shell.** Core compiles the grid into *every* lit
  program. On a lightmapped surface it would leak twice: once into `visAnalytic`, which
  `visibilityLightmap.ts` captures after `lights_fragment_end` for its night crossfade and daylight
  spill, and once more on exterior faces. So the spike rewrote two `ShaderChunk`s, idempotently and
  refusing to act if the r184 block moved. The grid is evaluated only under a second define,
  `SOFA_PROBE_GRID`. That define goes only on materials under a `userData.itemId` root, and never
  on a `visLightmap` material.
- **Replace, not add.** On opted-in `STANDARD` materials: `irradiance = 0` (drops ambient,
  hemisphere and SH probe) and `iblIrradiance = grid` (the energy-conserving diffuse path). IBL
  *specular* (including R7-L room probes) and all direct lights are untouched. This is the
  lightmap's `replace` rule and the lesson of the `.67` and `bounce` double counts.
- **Bake with furniture hidden** (meshes, not roots). There are no black probes inside wardrobes,
  and a furniture move needs no re-bake. The cost is no furniture-on-furniture bounce.

## 3. Shell leak check — passes

The same boot flipped grid off/on, and every non-furniture pixel was compared in linear against arm
a:

| pose | shell mean rel. diff | shell pixels changed > 2 % |
|---|---|---|
| kitchen-east | 0.000 % | 0.000 % |
| bedroom2-door | 0.026 % | 0.40 % |
| living-far | 0.39 % | 0.77 % |

Kitchen is exactly zero. The living-room residual comes from the animating ceiling fan's blades and
their shadow on the ceiling, the same confound WEATHER-CONDITIONS records, since its rotation angle
differs between captures. The lightmapped shell is untouched.

## 4. The real question — how few lights does furniture need?

**Method.** Everything ran in **one boot**. Arms were switched in place: grid on or off via
`grid.visible`, and N lights kept as the N nearest the camera via `light.visible`, which nothing in
the frame loop rewrites. For radiometry the scene was rendered into an RGBA32F target (no tone
mapping) and read back as floats. A second render masked furniture pixels: furniture white,
everything else black. "Ratio" is furniture-pixel luminance against the reference arm. "dev25" is
the share of furniture pixels more than 25 % off the reference, per pixel. Grid baked with all 19
lights on.

**Daytime, 13:00, lights off (a vs b):**

| pose | furniture b/a | dev25 |
|---|---|---|
| living-far | 1.150 | 11.2 % |
| bedroom2-door | **1.802** | **65.0 %** |
| kitchen-east | 1.016 | 7.6 % |

The grid is a look change, not neutral. In bedroom 2 the bed takes the window's cool daylight
bounce and reads 1.8× brighter. `day-bedroom2-a-b.jpg` shows a plausibly skylit bedspread, but it
is uncalibrated against Cycles and would re-open every fill fit that FILL / BOUNCE / PHOTO-FILL rest
on.

**Night, 21:00, 19 lights on** (a = today, b = 19 + grid, cN = N + grid, dN = N, no grid):

| pose | b vs a | c8 vs b | d8 vs a | c4 vs b | d4 vs a | c2 vs b | d2 vs a | c0 vs b |
|---|---|---|---|---|---|---|---|---|
| living-far | 1.127 (11 %) | **0.973 (1.2 %)** | **1.033 (1.0 %)** | 0.995 (11 %) | 1.058 (12 %) | 0.233 (89 %) | 0.220 (89 %) | 0.166 (100 %) |
| bedroom2-door | 1.331 (62 %) | **0.963 (2.2 %)** | **0.961 (5.4 %)** | 0.709 (37 %) | 0.623 (45 %) | 0.631 (88 %) | 0.520 (93 %) | 0.324 (99 %) |
| kitchen-east | 1.080 (0 %) | 0.998 (0 %) | 0.998 (0 %) | 0.965 (0 %) | 0.962 (0 %) | 0.914 (0 %) | 0.907 (0 %) | 0.313 (27 %) |

(ratio, dev25 in brackets)

- **At 8 lights, the no-grid control is already as good as the grid.** d8 sits within 1–5 % of
  today, so the grid buys nothing there.
- **At 4 lights, both are wrong in bedroom 2.** The grid lifts furniture from 0.62 to 0.71 of its
  reference, so it helps a little, but 37 % of furniture pixels are still more than 25 % off. At 2
  or 0 lights both collapse. Furniture falls to about 20 % of its light in the living room, because
  **at night ~75–80 % of furniture light is the lamps' direct term**, which a diffuse-only SH grid
  cannot carry. The grid does hold the lamps' pools on the shell as seen from each probe, since it
  was baked with all 19 on, so c0 is the grid's full indirect contribution, and it is small.
- **Looks** (`night-*.jpg`): b is brighter and slightly cooler on bedding and fabric than a. The
  warm lamp cast still reads, and nothing blotches or leaks. c2/d2/c0/d0 are visibly wrong: dark
  sofa, lit window beyond (`night-living-c2-d2-c0-d0.jpg`).

**Answer:** with the grid on, furniture needs about **8** real-time lights before it looks wrong, and
it needs 8 without the grid as well. The grid does not move the floor. The floor is set by the
direct term, so the lever is *which* lights stay (Stage 2's room pool), not an indirect volume.

## 5. Costs

**Per frame** (`__three.advance` + GPU fence poll, 60 frames × 3 interleaved rounds, median p50,
night, all programs warmed). ⚠ These are headless absolute timings. The fence resolves on a
`setTimeout` poll and headless presentation inflates the numbers (a 0-light frame reads ~16 ms), so
read the *differences*, not the absolutes.

| pose | a (19) | b (19+grid) | d8 | c8 | d4 | c4 | d0 | c0 |
|---|---|---|---|---|---|---|---|---|
| living-far | 89.4 | 87.2 | 16.9 | 18.1 | 16.7 | 17.8 | 15.8 | 17.8 |
| bedroom2-door | 79.0 | 78.2 | 16.8 | 22.4 | 17.0 | 21.9 | 16.7 | 21.1 |
| kitchen-east | 76.1 | 76.0 | 16.7 | 17.9 | 16.6 | 17.9 | 16.4 | 18.2 |

The grid costs **+1.2 ms** (kitchen, living) to **+5.6 ms** (bedroom 2, where the bed fills the frame)
at the same light count. The 7 extra 3D-texture fetches are per furniture fragment. This matches the
first spike's 6.19 ms at a larger share of the frame. It is never cheaper than the lights it could
replace, because at ≤8 lights it replaces almost nothing.

**The light-count cliff** (same method, no grid, `--cliff`):

| lights | 8 | 10 | 12 | 14 | 16 | 18 | 19 |
|---|---|---|---|---|---|---|---|
| living-far | 16.9 | 22.7 | 22.2 | 26.7 | **60.6** | 82.3 | 89.4 |
| bedroom2-door | 16.8 | 18.5 | 21.2 | 21.7 | 31.7 | **73.2** | 78.7 |
| kitchen-east | 16.7 | 16.8 | 21.2 | 21.2 | 30.8 | **71.1** | 75.8 |

This is not linear at ~0.5 ms/light. Somewhere between 14 and 18 unrolled lights the physical
material's fragment program falls off a cliff on this GPU. A register/occupancy spill is the likely
cause, but it is not proven. **Stage 2 below ~14 lights captures essentially the whole win.** This
should be re-measured headful and on the real-time pipeline before it drives a number. It is the
most decision-relevant measurement in this round.

**Bake** (fenced wall-clock, synchronous, main thread):

| config | probes | bake |
|---|---|---|
| per-room, 0.8 m, cube 8 | 380 | **4.0–5.2 s** (livingDining alone 1.10 s, 108 probes) |
| 0.5 m spacing | 800 | 8.6 s |
| cube 16 | 380 | 4.2 s — draw-call bound, not fill bound |
| re-bake on weather change | 380 | 4.0 s |
| re-bake on one lamp toggle | 380 | 7.4 s |

One bake issued **1,040,535 draw calls / 184 M triangles**: 6 faces × ~456 draws per probe, even
with furniture hidden. Compare R7-L room probes: 130–180 ms per capture, and R7-N built a whole
coalescing mechanism because *that* was too slow to repeat on a slider. The grid is **25–40×
worse**, it is not time-sliceable in r184 (#34486 is post-r184), and on this app it must re-bake on
hour bucket, weather, lights switch, any lamp edit or recolour, and any finish change. Furniture
moves are the only thing it survives.

**Programs:** 260 → **386** on the flag flip. `numLightProbeGrids > 0` is in every program's
cache key, so *every* lit material recompiled, including the shell materials that never read the
grid. It is the `z16` light-count recompile burst again, triggered by grid visibility.
**VRAM:** 82 KB of atlas + batch + cube, i.e. nothing, and not the cost.

## 6. Phone tier — does not fit

- Phones boot `performance`: no lightmaps, no IBL, no post. There is no shell bake for the grid to
  photograph and no fill model it would be calibrated against.
- 51 % of iOS and 25 % of Android WebGL2 contexts lack `OES_texture_float_linear`. There the atlas
  samples black, which with replace semantics means black furniture. The spike gated on both
  extensions and on `realistic`.
- The bake is draw-call bound (≈2.7 k draws per probe). The M4 needs 4–5 s, so a phone would be
  tens of seconds of blocked main thread, well past the GPU-STARVE watchdog. It would also recur on
  every hour step.

## 7. How this combines with Stage 2 (room-scoped light pool)

It doesn't need to. The measurement says Stage 2 is sufficient on its own for furniture:
- a nearest-8 subset is within 1–5 % on furniture (d8 vs a), and
- ≤14 lights is below the cost cliff.

The pool must be **room-scoped, not nearest-N**. The nearest-N cull used here as an instrument is
the camera-distance selection `src/scene/CLAUDE.md` forbids (lamps switching as you walk). It also
moves the *shell* more than the furniture: shell pixels changed at d8 were 41 % in bedroom 2 and
7.9 % mean, because far lamps currently light walls through other walls. That is the correctness
argument Stage 2 already makes. If the pool is ever pushed below ~6, the missing piece is
**direct** light on furniture (Stage 3a's lamps-on bake covers the shell only). A future volume
would need a direct/indirect split that `LightProbeGrid` r184 does not offer.

**Revisit only if** three is bumped past r186, where incremental baking (#34486) and bounces
(#33657) arrive, *and* a daytime Cycles comparison shows the grid's furniture fill is closer to
physics than today's hemisphere + IBL. That would make it a look feature, not a light-count
feature.

## 8. Frames and data

Frames, left to right as named (arm letters as in §4), 480×300 each:
- `docs/research/assets/lightprobegrid-spike-2026-09-26/day-living-a-b.jpg`
- `docs/research/assets/lightprobegrid-spike-2026-09-26/day-bedroom2-a-b.jpg`
- `docs/research/assets/lightprobegrid-spike-2026-09-26/night-living-a-b-c8-d8.jpg`
- `docs/research/assets/lightprobegrid-spike-2026-09-26/night-bedroom2-a-b-c4-d4.jpg`
- `docs/research/assets/lightprobegrid-spike-2026-09-26/night-living-c2-d2-c0-d0.jpg`

Screenshots are tone-mapped for viewing. Every number above comes from the float readback, not
from these. The raw run output (`results.json`, logs) was in `/tmp/r7ac/` and is not kept. The
spike code is in no pushed commit. To reproduce, rebuild from §2, which covers every design choice
that mattered.
