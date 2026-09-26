# The lights-on GPU bound — options for 19 forward point lights in a lightmapped flat

**Brief:** R7-P. Research + decision document. No `src/` changes.
**Date:** 2026-09-25 · **Branch:** `feat/photoreal-round7` · **Build read:** `v0.35.17.0`
**Established, not re-litigated:** [`docs/audit/perf-trace-2026-09-25.md`](../audit/perf-trace-2026-09-25.md)
— the 60→33 Hz lights-on stall was a synchronous `getImageData` readback in the rAF callback
(`src/scene/lighting/statusBarTint.ts`); fixed in `v0.35.12.3`, long tasks 71 → 0, main-thread idle
13 % → 54 %. **The residual is GPU-bound**: lights on at `realistic`, flat 30 Hz on a clean
every-other-vsync cadence, `gl.render` CPU submit 8–10 ms.
**Companion:** [`docs/research/sota-2026-09-25.md`](./sota-2026-09-25.md) (R7-B) surveys clustered
lighting, probe volumes and WebGPU as *state of the art*; this document is the *decision* for one
specific bound and deliberately does not repeat it.

---

## 0. TL;DR

1. **The brief's premise is half wrong in a way worth knowing.** The 19 lights are not
   "18 × `#ffd9a0` + 1 × `#fff1d6`" — they are **six** fixture kinds with six bulb tints, dominated
   by **ten `ceiling-light`s, one per room** (§1.1). A merge/dedup strategy sized against "18
   identical lights" would have been sized against a scene that does not exist.
2. **The lights' diffuse *indirect* is already free, and has been since `v0.33.0.3`.** Every
   lightmapped shell material carries a `lampBounce` uniform — a per-room `Σ intensity / floor area`
   scalar, orientation-weighted, scaled live by the lights switch (§1.3). The 19 real lights buy only
   the **direct** term: the pool under a lamp, the falloff on a nearby wall, the specular highlight,
   and *all* lighting on furniture — which is not lightmapped and is ~74 % of the frame. So the
   brief's central question answers **yes for the shell, no for the furniture**, and that split is
   what every option below is really about.
3. **The consequence of the residual is worse than 30 Hz, and nobody has written it down.** The
   adaptive ladder demotes at `DEMOTE_INTERVAL_MS = 1000 / 30 = 33.33 ms`
   (`src/scene/adaptiveTier.ts:111`). The measured steady state is `interval p50/p90 = 33.3 / 33.4 ms`.
   **It is over the line by 0.07 ms.** Two bad windows demote the device class, the failure is written
   to `autoMaxDevice` so the ladder can never climb back, and the settled value persists across visits
   (§1.6). Flipping the lights on once costs the user 4096 → 2048 shadows, then the sun-shadow pass,
   then half DPR — and it does not come back when they turn the lights off or move to noon. **That is
   the real defect**, and it is a much sharper product bug than the frame rate.
4. **The research turned up something the last round's survey got wrong, and it is the best option
   on the table.** `docs/research/sota-2026-09-25.md` §1.3 states that a three.js probe *volume*
   "has never landed". **It landed in r184 — the pinned version — as
   `examples/jsm/lighting/LightProbeGrid.js`, with first-class `WebGLRenderer` support wired into
   core** (`WebGLRenderer.js:1839` `isLightProbeGrid`). It is a GPU-baked, zero-readback L2 SH
   irradiance grid: Unity's Adaptive Probe Volumes, on WebGL, today (§2.6). It is the only thing in
   this document that lights **furniture** — the 74 % of the frame the shell lightmap cannot reach,
   and the sole reason the point-light count cannot be cut deeply.
5. **Recommendation** (§5): Stage 0 fix the threshold; Stage 1 the three A/Bs that were never run;
   Stage 2 **room-scoped lights into a fixed-count pool** (the big win, no new bytes, corrects light
   leaking through walls, and closes `z16` because a constant light count is a constant program
   cache key); Stage 3 cover what the pool stopped covering — **3b the probe grid for furniture**
   (spike this first; it needs no Blender time) and **3a a lamps-on baked lightmap set** for the
   shell (~5.8 MB, one Blender night, and a genuine look upgrade over `lampBounce`).
6. **"Do nothing" is not available in its literal form**, because of (3). The cheapest honest
   do-nothing is *one constant*: lift `DEMOTE_INTERVAL_MS` clear of 33.4 ms and accept 30 Hz (§4.7).

---

## 1. What is actually there — verified from source

### 1.1 The 19 lights, by kind

`src/scene/lighting/FurnitureLights.tsx` renders one `<pointLight>` per entry returned by
`fixtureLightsFor(items, …)` (`src/scene/lighting/fixtureLights.ts`), and one `<spotLight>` per entry
carrying an IES profile. Census of the default 4-room Serangoon North Vista flat, counted from
`src/furniture/defaults/*.ts` against `LIGHT_EMITTERS` in `src/furniture/lightEmitters.ts`:

| n | `defId` | bulb tint | `intensity` | `distance` (m) | emit height | layer |
|---|---|---|---|---|---|---|
| 10 | `ceiling-light` | `#fff0d4` | 9 | 6.5 | `mountHeight − drop − 0.05` | ambient |
| 3 | `table-lamp` | `#ffe6b8` | 4 | 3.2 | `surfaceHeight + 0.32` | task |
| 2 | `floor-lamp` | `#ffdfae` | 7 | 5.5 | 1.5 m (2.05 arc) | task |
| 2 | `wall-sconce` | `#ffe2b0` | 3.5 | 3.0 | `mountHeight` (1.7) | accent |
| 1 | `ceiling-fan` | `#fff1d6` | 8 | 6.0 | `mountHeight − 0.35` | ambient |
| 1 | `cove-light` | `#ffd9a0` | 2.6 | 3.2 | `mountHeight + 0.2` | accent |
| **19** | | | | | | |

`#ffd9a0` is the **cove light**, of which the default flat has exactly **one**; `#fff1d6` is the
**ceiling fan**, also one. The dominant population is **ten `ceiling-light`s, one per room** — which
is what makes room-based culling (§4.4) the structurally interesting option rather than merging.

### 1.2 Type, shadows, decay, distance

- **All `PointLight`, `decay = 2`** (inverse-square), hardcoded in `FurnitureLights.tsx`. `distance`
  comes from the per-def spec above (3.0–6.5 m); in three that is a windowed cutoff, not a physical
  term.
- **None of them casts a shadow.** No `castShadow` anywhere in `FurnitureLights.tsx`; its docblock
  says so outright. The only shadow-casting light in the scene is the sun (`shadowMapSize` 2048 weak
  / 4096 capable, `src/scene/quality.ts`). **This is load-bearing**: the 19 are pure BRDF cost with
  no shadow-map cost, and correspondingly produce *no* occlusion cue — a lamp behind a wardrobe lights
  the wall on the far side of it. Anything that replaces them with a bake gains shadowing for free.
- **IES spots exist but are not in the default flat.** `iesLights` + `props.iesProfile` promote a
  fixture to a `SpotLight`; no default item sets one.
- **`mergeCoincidentLights: true` on every tier, and it merges nothing here.** `MERGE_RADIUS_M = 1.0`
  with a same-`defId` + same-colour requirement; `aggregateFixtureLights`'s own docblock states the
  default flat's fixtures are all > 1.2 m apart or of different kinds, and the census above confirms
  it (ten ceiling lights, one per room). **The merge path is dead code on the shipped default plan.**
- `MAX_LIVE_FIXTURE_LIGHTS = 64` is a `MAX_FRAGMENT_UNIFORM_VECTORS` guard, explicitly "NOT a quality
  budget". **There is no light-count budget at any tier.** A previous per-camera nearest-N cap (2 on
  Performance, ×3 in orbit) was removed because it read as lamps switching on and off around a
  walking camera — recorded in both `FurnitureLights.tsx` and `fixtureLights.ts`. Any culling proposal
  must answer that specific, already-rejected failure.

### 1.3 How they interact with the bake — the important question

The bake (`public/assets/lightmaps/index.json`) is `"pass": "irradiance"`, `uv: box-atlas-3x2`,
`res: 256`, `samples: 4096`, `kill_emissive: true` (23 emissive materials zeroed) — i.e. **sky-dome
diffuse only, with the lamps deliberately baked out**. 229 maps; **5.82 MB KTX2/UASTC on disk**
(10.42 MB PNG kept beside as fallback) and **10.03 MB attached VRAM**, down from 40.11 MB as PNG —
the 4× the brief refers to (`CHANGELOG.md` v0.35.14.0).

The injection in `src/scene/visibilityLightmap.ts` does this, once per mapped material:

```glsl
vec3 visLit = ( visOcclusion * visGain * visDay + vec3( lampBounce ) ) * BRDF_Lambert( material.diffuseColor );
reflectedLight.indirectDiffuse = visAnalytic * visNight + max( visLit, visAnalytic * visSpill );
```

Two things follow, and they are the crux of this brief:

1. **It assigns `indirectDiffuse` and never touches `directDiffuse`.** The 19 point lights'
   contribution to a lightmapped wall survives the `replace` in full. The pools of light are real,
   live, and come from the point lights.
2. **`lampBounce` already *is* the lamps' diffuse interreflection, at zero real-time-light cost.**
   `src/scene/lampBounce.ts`: per-room `Σ emitter intensity / floor area`, × `LAMP_BOUNCE_K = 1.2`,
   × an orientation weight (`down 1.0 / side 0.35 / up 0.2`), folded into each material's
   registration and scaled live by one uniform write per material
   (`setLampBounce((lightsMode === 'on' ? 1 : 0) * lampDaylightWeight(alt))`). It exists precisely
   because the daylight-only bake could not hold it: the kitchen ceiling read **152 against a Cycles
   reference's 190** with the lamps on, and `lampBounce` closed that.

So, of the work a real point light does here, the diffuse-indirect half is **already being done for
free** on every lightmapped shell surface. What the 19 uniquely provide:

| contribution | provided today by | survives removing the point lights? |
|---|---|---|
| lamp bounce on the shell (walls/floors/ceilings) | `lampBounce` uniform | **yes — unaffected** |
| direct pool / falloff gradient on the shell | the 19 point lights | no |
| specular highlight on glossy shell (tile, splashback) | the 19 point lights | no — the R7-L room probe is a box-projected *environment* reflection, not a lamp |
| **all lighting on furniture** | the 19 point lights + one global env probe | **no — and this is the blocker** |
| shadowing/occlusion from lamps | *nobody* — they cast none | n/a |

Furniture is **not** lightmapped: `applyVisibilityLightmaps.ts:isCandidate` requires
`span >= MIN_SPAN_M` (1.5 m), and the bake's own `--min-area` is 1.0 m², which selects the room shell.
`src/scene/CLAUDE.md` (LIGHTMAP-COVERAGE) records that the baked lightmap covers **25.6 % of the
frame** at the calibrated living/dining pose. **Three quarters of the picture is still lit
analytically, by these lights.**

That is the honest answer to the brief's most important question: the lights are doing *less*
perceptual work than the framing implies on the shell, and *all* of the work on everything else.

### 1.4 The post stack, as configured on the measured arm

`src/scene/EffectsImpl.tsx` at `realistic/capable`, 21:00, `dof` off (default), `chromaticAberration`
flag off (default), `cinematic: true`, `aoFullRes: true`, `multisampling: msaa` (0 by default —
MSAA-DEPTH-BLIT, `z22`):

| mounted | kind | notes |
|---|---|---|
| `N8AO` | **own pass chain** | `quality: 'high'`, `halfRes: false` on `capable` — depth/normal + AO + denoise at full DPR-2 resolution |
| `Bloom` | **own pass chain** | mounted only when `bloomActiveForDay(dayLevel)`, i.e. at night. `mipmapBlur: false` (BLOOM-MIP-FLASH), `KernelSize.LARGE` Kawase, `resolutionScale: 0.5` |
| `ToneMapping` | `Effect` | merged |
| `HueSaturation` | `Effect` | merged |
| `Vignette` | `Effect` | merged — its own comment already documents that this is *why* it was safe to put on every tier |
| `Noise` | `Effect` | merged (`cinematic`) |
| `SMAA` | `Effect` + 2 supporting passes | edge detection + blend weights render separately; the blend itself merges |

So the ~22 `gl.render` calls per rAF decompose roughly as: one scene pass, N8AO's chain, Bloom's
luminance + Kawase chain, SMAA's two supporting passes, one combined `EffectPass`, one final copy.
**`postprocessing`'s effect merging is already working** — `ToneMapping + HueSaturation + Vignette +
Noise + SMAA-blend` is *one* fragment shader, not five. §4.6 says what that means for the "20 passes"
observation, which is real but is not a merging failure.

**Critically, the post stack is identical in both arms of the measured A/B.** 21:00 lights-off is
also night, so Bloom is mounted there too; AO, SMAA, tone and grain do not read `lightsMode`. The
60 → 30 Hz delta is therefore **entirely the 19 lights**, and post is fixed overhead that the lights
push over the line rather than a co-cause.

### 1.5 Per-lamp interactivity is a shipped feature, in four places

This is the constraint that kills the naive version of a baked lights-on set, so be exact:

| surface | file | granularity |
|---|---|---|
| walk-mode click / E-key, "Turn off table lamp" | `src/furniture/lightInteract.ts`, `src/state/slices/lightInteractSlice.ts`, `src/ui/LightPrompt.tsx` | **per item**, discrete on/off via `props.lightOn` |
| inspector "Make a light source" / "Turn off light source" | `src/ui/inspector/InspectorHeader.tsx` | **per item**, any item |
| per-item bulb colour + brightness | `props.lightColor`, `props.lightIntensity` (PARITY-FURNLIGHT), read in `fixtureLights.ts` | **per item**, continuous |
| lighting mood presets | `src/lighting/moodPresets.ts` (`lightMoodPresets`) | **per `defId`**, tint + multiplier |

Plus: the user can place, move and delete lamps freely, and the 2D editor can change the plan. A
lamp's position, colour and intensity are all live design state, not authored content.

### 1.6 The 0.07 ms that actually matters

`src/scene/frameCost.ts` learned in `v0.31.7.84` that submit time cannot see a GPU-bound frame
(10.9 fps at a 6.9 ms submit p90) and added `intervalP50/P90`, the wall-clock spacing between
displayed frames. `src/scene/adaptiveTier.ts:classifyWindow` checks **wall clock first**:

```ts
export const DEMOTE_INTERVAL_MS = 1000 / 30      // 33.333…
…
const wall = window.intervalP90
if (Number.isFinite(wall) && wall >= DEMOTE_INTERVAL_MS) return 'bad'
```

The shipped-flags steady state in `perf-trace-2026-09-25.md` is `raf p50/p90/p99/max =
33.3 / 33.4 / 33.4 / 33.4 ms`. **`33.4 >= 33.333` → `'bad'`, every window, for as long as the lights
are on.** With `DEMOTE_WINDOWS = 2` and `MIN_WINDOW_FRAMES = 20`, `decideAutoDevice` then:

- demotes `realistic/capable` → `realistic/weak` — 4096 → 2048 shadows, full-res AO → half-res,
  `cinematic` grain off, env 256 → 192, room probe 256 → 128, geometry detail 1.8 → 1.4 — **and sets
  `autoMaxDevice = 'weak'`, which the promotion branch treats as a permanent ceiling** ("a tier that
  has failed on this device is never retried");
- then, at the lowest class with `shadowsShed`, drops the sun-shadow pass;
- then sets `dprHalved: true`.

`PROMOTE_INTERVAL_MS = 20` means recovery needs a sustained 50 fps *and* `autoMaxDevice` cleared,
which only a reload can do — and `qualityPrefs` persists the settled value across visits.

**User-visible story:** walk into the flat at 21:00 on a capable desktop, flip the lights on, and
within a few seconds the shadows go soft and coarse, then vanish, then the whole picture goes soft —
and it does not come back when the lights go off or the clock moves to noon. Caused by being **0.07 ms
over a threshold.**

### 1.7 What has *not* been measured, and must be before anything ships

`perf-trace-2026-09-25.md` states its own method gap: the DPR A/B is **void** (r3f re-applied the
Canvas `dpr` prop and stomped `gl.setPixelRatio(0.5)`). To that, add two more that were never
attempted:

- **No light-count A/B.** "19 lights cost 19 BRDFs per fragment" is a correct statement about the
  shader and an *unmeasured* attribution of ~16 ms. Nobody has rendered the same pose at 19 / 8 / 4 /
  1 / 0 lights.
- **No post-stack A/B with the lights on.** §1.4 argues post is not the *delta*, but it is plausibly
  most of the *base*, and the margin over the demote line is 0.07 ms.

Everything in §4 is scored on the assumption that the attribution is right. Stage 0 (§5) exists
because it might not be.

---

## 2. Research — what the options actually are

Every claim below carries a URL and a date (publication date where the page states one, else
"accessed 2026-09-25"). Where §1 already established something from this tree, it is not repeated.

### 2.1 three.js forward lighting: the cost is real and there is no early-out

Verified against the pinned version's own source, `three` r184
([`src/renderers/shaders/ShaderChunk/lights_fragment_begin.glsl.js`, tag r184](https://github.com/mrdoob/three.js/blob/r184/src/renderers/shaders/ShaderChunk/lights_fragment_begin.glsl.js),
accessed 2026-09-25):

```glsl
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
  PointLight pointLight;
  #pragma unroll_loop_start
  for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
    pointLight = pointLights[ i ];
    getPointLightInfo( pointLight, geometryPosition, directLight );
    …
    RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir,
               geometryClearcoatNormal, material, reflectedLight );
  }
  #pragma unroll_loop_end
#endif
```

- **Fully unrolled** (`#pragma unroll_loop_start`), `NUM_POINT_LIGHTS` baked into the program as a
  preprocessor constant — which is why the light count is part of the program cache key and why
  toggling the switch recompiles (`z16`; [mrdoob/three.js#11341](https://github.com/mrdoob/three.js/issues/11341),
  opened 2017, still the canonical reference).
  The unroll is a **JS string replace**, not a GLSL loop: `WebGLProgram.js`'s `unrollLoopPattern`
  emits N literal copies of the body with `[ i ]` → `[ 0 ]…[ N-1 ]`. 19 lights is 19 literal copies
  of the BRDF in the fragment source.
- **No early-out — and the one flag that could provide it is ignored.** `getPointLightInfo` does set
  `light.visible = ( light.color != vec3( 0.0 ) )`, but `RE_Direct_Physical`
  (`lights_physical_pars_fragment.glsl.js`) never tests it: the body goes straight to
  `dotNL`/`irradiance`/`BRDF_GGX`. `visible` only gates the shadow multiply. So a light attenuated
  to exactly zero at a fragment still pays a full GGX + Lambert evaluation, plus clearcoat/sheen
  where compiled in.
- **Uniform budget: fine now, and hard proof that fixture shadows are impossible.**
  `struct PointLight { vec3 position; vec3 color; float distance; float decay; }`
  (`lights_pars_begin.glsl.js`) ≈ **4 vec4 per light** as an array of structs → 19 lights = **76
  vec4** against the GLSL ES 3.00 minimum `gl_MaxFragmentUniformVectors` of **224**
  ([Khronos GLSL ES 3.00 spec](https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf)).
  Comfortable — `MAX_LIVE_FIXTURE_LIGHTS = 64` is the right guard. But add shadows and
  `pointLightShadows` contributes ~7 more vec4 each → 19 × 11 = **209 vec4 before anything else**,
  plus 19 `samplerCube` against a GLES3 minimum of 16 texture units and `vPointShadowCoord[19]`
  against a minimum of 15 varyings. **19 shadow-casting point lights is not slow, it is
  unlinkable.** three does not check these caps against the light count and never has
  ([#5869](https://github.com/mrdoob/three.js/issues/5869), 2015-01-07 → 2015-08-28;
  [#7807](https://github.com/mrdoob/three.js/issues/7807), 2015-12-16) — you get a link error, not
  a degrade. Whatever else this document recommends, **"just give the fixtures shadows" is off the
  table.**
- `getPointLightInfo` applies `getDistanceAttenuation(lightDistance, cutoffDistance, decay)`, which
  with a non-zero `cutoffDistance` reaches **exactly 0 at and beyond `distance`**. **A point light
  farther than its own `distance` from a fragment contributes nothing and costs full price.** This
  is the single most exploitable fact in this document (§4.4).
- Light collection *is* filtered by camera layers, and only by camera layers:
  `WebGLRenderer.projectObject` does `if ( object.isLight && object.layers.test( camera.layers ) )
  currentRenderState.pushLight( object )`
  ([r184 `WebGLRenderer.js`](https://github.com/mrdoob/three.js/blob/r184/src/renderers/WebGLRenderer.js),
  accessed 2026-09-25). `WebGLLights.setup()` then packs everything it was given with **no**
  per-object or frustum filtering
  ([r184 `WebGLLights.js`](https://github.com/mrdoob/three.js/blob/r184/src/renderers/webgl/WebGLLights.js)).
  **There is no per-object light list in the WebGL forward path** — every light lights every object.
- Community measurements of the same shape, [three.js forum, "Optimizing Point Lights"](https://discourse.threejs.org/t/optimizing-point-lights/36153)
  (thread 2022-03-19 → 2023-11-14): a GTX 960 fell over at ~50 point lights; a 960M ran 78 lights at
  26–30 fps / 35–44 ms GPU and reached 60 fps with a per-light range check patched into the shader;
  an RX 560 at 100 lights measured **GPU 20 ms unpatched vs 10 ms patched**; an M1 Max went from
  0.66 fps at 250 lights to 38–45 fps. The mechanism, Usnul (2023-10-13): *"you end up looping over
  each light for each pixel on the screen."* **The early-out is still not in three core.**
- The maintainer's own guidance, donmccurdy in [three.js forum, "Light and framerate"](https://discourse.threejs.org/t/light-and-framerate/61876)
  (2024-02): *"I'd start to have second thoughts going above 4-5 dynamic lights"*, *"lights are not
  culled"*, and *"adding/removing lights requires recompiling material shaders. So even that tends
  to be expensive."* manthrax, same thread: *"each light increases the cost of all shaders doing
  lighting."*
- **A caution against over-confidence in the attribution.** 19 lights is inside where the machines
  above were still comfortable. What is different here is that every fragment is a full
  `MeshPhysicalMaterial` with transmission/clearcoat/sheen compiled in, at DPR 2, with full-res
  N8AO on top — so each of those 19 BRDFs is far more expensive than in a `MeshStandardMaterial`
  test scene. That is a plausible story, not a measurement. See §1.7.

### 2.2 Clustered / tiled forward (Forward+): exists, is maintained, and is WebGPU-only

three.js shipped **`ClusteredLighting`** in **r185**
([release notes](https://github.com/mrdoob/three.js/releases/tag/r185), 2026; docs
[ClusteredLighting](https://threejs.org/docs/pages/ClusteredLighting.html) and
[ClusteredLightsNode](https://threejs.org/docs/pages/ClusteredLightsNode.html), accessed
2026-09-25; live example [webgpu_lights_clustered](https://threejs.org/examples/webgpu_lights_clustered.html)).
Defaults `maxLights: 1024`, `maxLightsPerCluster: 64`. The docs state it *"overwrites the default
lighting system in WebGPURenderer"* — **there is no WebGL path and the documentation makes no claim
of one.**

Adopting it therefore means adopting `WebGPURenderer`, which `docs/research/sota-2026-09-25.md` §6
already priced as **XL / NO for R7–R8**: it deletes `EffectComposer` and pmndrs/postprocessing
(incompatible), and every `onBeforeCompile` patch in this repo — `visibilityLightmap.ts`,
`boxProjectEnv.ts`, the material realism injections — has no equivalent. **Ruled out**, and not
close.

There is no maintained WebGL clustered-forward add-on for three. The community references are a
2021 showcase thread
([discourse.threejs.org/t/23104](https://discourse.threejs.org/t/dr-strangelight-or-how-i-learned-to-stop-worrying-and-love-the-cluster/23104))
and course projects; the "proper" answer in the 2023 forum thread above is explicitly *"requires
WebGPU compute shaders and substantial implementation work."*

### 2.3 Light culling by room / frustum: three does none, so it is ours to write

Per §2.1, three culls lights by **camera layers only**. So culling is entirely an application-level
decision: either don't mount the light (React — changes `NUM_POINT_LIGHTS`, recompiles), or keep it
mounted and move it off the camera's layer (also changes the count three packs, also recompiles), or
keep the count constant and re-target a fixed pool (no recompile).

The community-endorsed pattern is the third. Usnul, same thread (2023-10-13): *"a static pool of
lights, say 16 point lights"*, with priority-based assignment of unbounded "virtual" lights to the
physical slots. This is precisely the **fixed-count budget** of §4.4, and it has the property this
repo needs most: **a light count that never changes is a program cache key that never changes**, so
`z16`'s +25/+31 compile burst disappears entirely.

### 2.4 Shader-level early-out

The forum patch that produced the 2× above is a distance test inserted into the unrolled loop. In
this repo that means patching `<lights_fragment_begin>` on **every** material via
`onBeforeCompile`. Two problems: `src/scene/CLAUDE.md` rule 5 ("Compose, never replace,
`onBeforeCompile` and `customProgramCacheKey`") makes the blast radius large — the lightmapped shell
materials already own both hooks, the room probe composes onto them, and material realism composes
again; and GPUs execute both sides of a divergent branch, so the saving is real only where the
branch is *coherent* across a warp (true for a distant lamp, false at a pool's edge). Keep as a
fallback, not a plan.

### 2.5 Faking pools: emissive geometry, cookies, projected decals

- Emissive geometry (a glowing shade) is what `setFixtureGlow` already drives, and it is what Bloom
  already picks up at night. It produces **no illumination of other surfaces** in a rasteriser —
  it is the *source* reading as lit, not the room.
- A light "cookie"/gobo is a projected texture on a spotlight; three has no built-in cookie, and it
  would not remove a light, only shape it.
- An additive blended quad/decal on the floor under each lamp is the cheap classic. It costs
  transparent overdraw (which this app already spends on `contactShadows`) and it cannot follow
  geometry — it reads as a sticker at a wall junction. Against a *baked* lamp map (§3) it is strictly
  worse for the same architectural commitment.

**None of these are a serious competitor**, and they are listed so the record shows they were
considered.

### 2.6 `LightProbeGrid` — an Adaptive-Probe-Volume equivalent, on WebGL, **already in r184**

**This is the find of this brief, and it corrects `docs/research/sota-2026-09-25.md` §1.3, which
states that a probe *volume* "has never landed" in three (citing donmccurdy's unmerged
[#18371](https://github.com/mrdoob/three.js/pull/18371), 2020). It landed — three weeks before that
document was written, in the exact version this repo pins.**

Verified directly against the `r184` tag (not `dev`), 2026-09-25:

- `examples/jsm/lighting/LightProbeGrid.js` exists at `r184` (651 lines) and imports
  `WebGL3DRenderTarget`, `WebGLCubeRenderTarget`, `WebGLRenderTarget`, `CubeCamera` — a **WebGL**
  implementation, not a TSL/WebGPU one.
- It is **wired into core `WebGLRenderer`**, not bolted on. At `r184`,
  `src/renderers/WebGLRenderer.js:1839` does `} else if ( object.isLightProbeGrid ) {
  currentRenderState.pushLightProbeGrid( object );`, and `findLightProbeGrid( volumes, object )`
  (line 2302) is called from the material-refresh path (line 2538) whenever
  `materialProperties.needsLights`.
- Added as PR **#33125, 2026-04-16** and listed in the r184 release notes; developed continuously
  since — docs #33426 (2026-04-20), #33489 (2026-04-28), indirect bounces #33657 (2026-05-27),
  renamed `LightProbeGridWebGL` in #33911 (2026-06-30) when the WebGPU twin arrived,
  **incremental baking #34486 (2026-09-07)**. Not abandoned; shipped and moving.
- It is an L2 SH irradiance grid packed into one `WebGL3DRenderTarget` atlas, **baked GPU-side with
  no CPU readback** — which matters a great deal in this codebase, whose single worst measured
  performance defect this round was a CPU readback (`perf-trace-2026-09-25.md`).
- Toggling is trivial: the official `webgl_lightprobes_sponza` example's "GI" checkbox is literally
  `probes.visible = value`.

**Why this matters more than anything else in §2.** §1.3 established that the blocker on removing
the point lights is *furniture* — the ~74 % of the frame the shell lightmap cannot reach. A probe
grid is precisely the instrument for that: position-dependent diffuse irradiance for **dynamic
objects**, which is what furniture is in this app. A lamps-on grid would light a sofa the user just
dragged across the room, which no lightmap ever can.

**Two limits, read off the r184 source rather than assumed:**

- `findLightProbeGrid` is a **containment lookup, not a blend**: with one volume it returns it; with
  several it returns the **first** whose `boundingBox.containsPoint( object.matrixWorld position )`.
  So **one volume per object, and two overlapping grids cannot be cross-faded by the renderer.** A
  lights-on/off fade has to swap or lerp the volume's own `texture`, not stack two volumes. (A 3D
  texture lerp between two atlases is one extra sampler and a mix — the same shape as §3's second
  lightmap, but in a 3D texture, and it would need a patch to core or a custom material.)
- **Diffuse indirect only.** No specular, no direct pool, no lamp shadowing on the shell. It
  complements §3, it does not replace it.

Plain `LightProbe` (9-coefficient SH, diffuse only,
[threejs.org docs](https://threejs.org/docs/pages/LightProbe.html), accessed 2026-09-25) remains the
degenerate one-per-room case if a full grid is too much.

### 2.7 Multiple baked lighting states: what other products do

This is the brief's "solved somewhere" question. The answer is: **solved in game engines, not solved
in the closest web-archviz competitor.**

- **Unity — Adaptive Probe Volumes "Lighting Scenarios"** is the mature version of exactly the
  proposal in §3. A *Lighting Scenario* is a complete baked lighting dataset; you bake one per setup
  and switch or **blend** between them at runtime via `ProbeReferenceVolume.BlendLightingScenario`
  ([Unity 6 manual, "Bake different lighting setups with Lighting Scenarios"](https://docs.unity3d.com/6000.0/Documentation/Manual/urp/probevolumes-bakedifferentlightingsetups.html),
  page built 2026-09-24). Unity's own framing names our case: APV *"enables … lighting transition
  through Sky Occlusion and Lighting Scenarios, suitable for achieving time-of-day and **lights
  on/off** situations"*
  ([Unity blog, "Lighting & Environment HDRP Updates in Unity 6"](https://unity.com/blog/lighting-and-environments-hdrp-updates-unity-6)).
  The documented constraint is the one this repo already knows by another name:
  *"If you move static geometry between bakes, Light Probe positions might be different"* — you
  cannot blend scenarios whose baked topology differs. That is `LIGHTMAP-KEY-AUDIT` /
  `docs/…/lightmap-key-audit.mjs`, restated by a different vendor.
- **Unity, classic lightmaps** — the community answer to "night to day transition with baked
  lightmaps" is the same: bake N sets and swap/lerp the arrays at runtime
  ([laurenth-unity/lightmap-switching-tool](https://github.com/laurenth-unity/lightmap-switching-tool),
  accessed 2026-09-25; the [Unity discussion thread](https://discussions.unity.com/t/night-to-day-transition-with-baked-lightmaps/690606)).
  **VRChat** publishes a user-facing guide for the same trick
  ([VRChat Wiki, "How to swap out baked lightmaps"](https://wiki.vrchat.com/wiki/Guides:How_to_swap_out_baked_lightmaps),
  accessed 2026-09-25). So "two lightmap sets, one scalar between them" is a boring, well-trodden
  technique — the engine support exists because the technique is right, not the other way round.
- **Unreal — Precomputed Lighting Scenarios** ([UE 5.8 docs](https://dev.epicgames.com/documentation/unreal-engine/using-precomputed-lighting-scenarios-in-unreal-engine),
  accessed 2026-09-25) stores each setup's lightmaps in a streamed sublevel, and is a **hard switch
  with no blending**: *"Only one Lighting Scenario level should be visible at any time."* Day =
  directional + sky sublevel, night = spotlights sublevel. Cruder than Unity's, same idea.
- **Shapespark — the closest commercial analogue (baked lightmaps + WebGL browser archviz) does not
  do it at all, and says so in as many words.** Shapespark staff (Magda), 2024-01-16, asked directly
  how to do a night lighting setup: ***"There is no other way than having two separate scenes: one
  with a night, second with a day."***
  ([forum.shapespark.com/t/night-light-setup-in-shapespark/4884](https://forum.shapespark.com/t/night-light-setup-in-shapespark/4884)).
  On the related Object Switch question, staff (Jan, 2021-05-26) offered the "Isolate shadows" bake
  option — which adjusts *one* bake, it does not produce a second — and on reflections was flat:
  *"Currently it is not possible to update the reflections."*
  ([forum.shapespark.com/t/object-switch-lighting-baking/2587](https://forum.shapespark.com/t/object-switch-lighting-baking/2587)).
  The [Shapespark viewer JS API](https://github.com/shapespark/shapespark-viewer-api) (accessed
  2026-09-25) exposes camera, views, node-click callbacks, screenshots, minimap and **editable
  materials** — and **no light, lightmap or lighting-state control at all**. Its 2026 changelog is
  bake quality and mobile, not switchable lighting
  ([shapespark.com/changelog](https://www.shapespark.com/changelog), accessed 2026-09-25;
  `sota-2026-09-25.md` §1.4).
- Nor does anyone else surveyed: **Matterport** has no lighting parameter in the 3D Showcase URL
  surface ([support.matterport.com](https://support.matterport.com/hc/en-us/articles/209980967-URL-Parameters))
  and its SDK's `mp.lights` only lights *your own inserted CG models*; **Coohom/Kujiale** picks a
  daytime/nighttime *cloud render template before rendering* and swaps pre-rendered panoramas via
  "Style Substitution" ([Coohom help](https://www.coohom.com/us/helpcenter/render-real-time-rendering-operation-guide),
  modified 2026-06-26); **Archilogic** bakes at a fixed *"specified time and day of the year"* and
  its 3D Embed API exposes no lighting options at all
  ([developers.archilogic.com](https://developers.archilogic.com/3d-embed-api/guide.html));
  **Enscape Web Standalone** ships with *"Enscape Settings are disabled"*
  ([Chaos docs](https://documentation.chaos.com/space/ENSCAPE/840892493/Web+Standalone+Export))
  and a 2022 request for in-web time-of-day control remains unshipped.
- **One outlier worth knowing: PlayCanvas bakes lightmaps *in the browser at runtime*** —
  *"the lightmaps are generated in the browser at runtime so you avoid potentially costly texture
  downloads"* ([PlayCanvas user manual, Runtime Lightmaps](https://developer.playcanvas.com/user-manual/graphics/lighting/runtime-lightmaps/),
  accessed 2026-09-25) — with per-light `Affect Dynamic` / `Affect Lightmapped` flags. So the
  industry does consider a runtime re-bake viable on the web. Not proposed here (Cycles quality is
  the whole point of our bake), but it bounds what is thinkable.

**What that means for us.** The product we most resemble solved the problem by **not having the
feature**. We already have it, we have it at per-lamp granularity (§1.5), and we are paying 30 Hz
for it. That is a position of strength, not a gap to close — but it also means there is no
off-the-shelf web recipe to copy, and the engine recipe (Unity) comes with a hard constraint we
already know we cannot satisfy for user-edited plans.

### 2.8 Post-stack passes on mobile, and whether we are defeating effect merging

We are **not** defeating it. `EffectPass` merges effects *"into a single compound shader by gathering
and prefixing shader functions, varyings, uniforms, macros and blend functions"*
([pmndrs/postprocessing wiki, "Effect Merging"](https://github.com/pmndrs/postprocessing/wiki/Effect-Merging),
accessed 2026-09-25). The documented reasons an effect gets its own pass are structural, not
configuration errors:

- `CONVOLUTION` — an effect that fetches extra samples from the input buffer. *"It is not allowed to
  have more than one effect with this attribute per `EffectPass`."*
- `DEPTH` — an effect needing a depth texture; the pass requests one from the composer.
- Bloom and SSAO *"won't show up in the effect shader, but they will still calculate their offscreen
  textures"* — i.e. their blur/AO chains are separate render targets by construction.

Read off `src/passes/EffectPass.js` on `main` (repo last pushed 2026-09-19): two `CONVOLUTION`
effects in one pass `throw new Error("Convolution effects cannot be merged")`, and a UV-transforming
effect combined with a convolution one throws *"Effects that transform UVs are incompatible with
convolution effects"*. `SMAAEffect` carries `CONVOLUTION | DEPTH`; `BloomEffect` carries no
attributes (its combine merges, its luminance + Kawase chain does not); `SSAOEffect` and
`DepthOfFieldEffect` carry `DEPTH` only (composites merge, offscreen chains do not — DoF allocates
**six** render targets).

Against §1.4's inventory: our merged set (`ToneMapping + HueSaturation + Vignette + Noise +
SMAA-blend`) is already one shader, because Convolution × Other is a legal merge. The separate
passes are N8AO's chain, Bloom's chain and SMAA's two supporting passes — every one a documented
must-be-separate. **There is no merging win available here.**

**One live trap, though.** `ChromaticAberration` is a **UV-transform** effect, and SMAA is
`CONVOLUTION` — Convolution × UV-Transform is the combination the library refuses. Enabling the
`chromaticAberration` flag (currently default off, ORBIT-CLEAN-CUT) therefore does not add fragment
math to an existing pass the way `Vignette` does; **it splits the combined `EffectPass` into two
full-screen passes.** That is worth a line in `EffectsImpl.tsx` next to the Vignette comment, which
currently states the "free because it merges" rule without its exception.

**And the pass count itself is a bandwidth budget, not a shader budget.** On tile-based mobile GPUs
each extra fullscreen pass is a full tile-buffer store to DRAM and a full load back. Arm's
measurement of exactly this (Attilio Provenzano, *"Post-processing Effects on Mobile: Optimization
and Alternatives"*, [Arm Community, 2018-04-17](https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/post-processing-effects-on-mobile-optimization-and-alternatives)):
*"standard post-processing pipelines for consoles aren't sustainable for mobile"*; their custom
bloom cost **3 ms of a 16.67 ms budget** and a **texture-baked replacement cost < 1 ms**, while
dropping one element from 1080p to 720p saved **~4.3 ms**. Corroborated by the
[Arm GPU Best Practices Guide](https://documentation-service.arm.com/static/67a62b17091bfc3e0a947695)
and [Vulkan tile-based rendering best practices](https://docs.vulkan.org/guide/latest/tile_based_rendering_best_practices.html).
**This is the strongest external evidence in this document for the open DPR-0.5 call** in
`docs/open-graphics-decisions.md`: resolution beats pass-count optimisation on mobile, quadratically.
It is also why the full post stack is correctly `realistic`-only and phones boot `performance`.

---

## 3. The second baked lightmap set, costed honestly

The brief asks this to be taken seriously. It deserves to be — and it turns out to be **a look
upgrade first and a performance measure only second**.

### 3.1 What it would be

A second `--pass irradiance` bake over the same shell meshes, lit by **the 19 fixtures only** (no
sky, no sun), sampled at the **same `uv1` box atlas** as the daylight set. Added in the same injected
chunk that already exists:

```glsl
// today
vec3 visLit = ( visOcclusion * visGain * visDay + vec3( lampBounce ) ) * BRDF_Lambert( … );
// proposed
vec3 visLit = ( visOcclusion * visGain * visDay + texture2D( lampMap, visUv ).rgb * lampGain * lampLevel ) * BRDF_Lambert( … );
```

That is one extra `sampler2D`, one extra texture fetch, one extra uniform, **no new UV channel, no
new atlas layout, no new key scheme** — because the lamps do not move the shell and the existing
`lightmapKey` (world-space vertex hash) resolves both sets identically. It is architecturally the
cheapest new asset this codebase could add.

### 3.2 Cost

| axis | number | basis |
|---|---|---|
| **bake time** | **~1–3 h, one overnight run** | The shipped daylight set took **2 h 32 m wall-clock on Metal** for a *three-arm composed* recipe (A 4096 spp, B/C 2048 spp) over 228/230 maps (`docs/open-graphics-decisions.md`, `z18`). A lamps-on set needs **one arm** — lamps do not move with the hour, so there is nothing to compose — but a lamp-lit interior is noisier than a dome (small, bright, high-dynamic-range emitters), so budget more samples and run `denoise_lightmaps.py` (OIDN, already in the pipeline). |
| **disk** | **+5.8 MB KTX2** (5.82 → ~11.6 MB) | Same 229 maps, same `res: 256`, same UASTC settings. PNG fallbacks would double again (10.42 → ~20.8 MB) unless the lamp set ships KTX2-only. |
| **VRAM** | **+10.0 MB** (10.03 → ~20.1 MB) | Measured per-set figure from `CHANGELOG.md` v0.35.14.0. For scale, R7-L's four room probes cost 24.0 MB on `realistic/capable`. |
| **GL textures** | **+229** | Currently 223 GL textures / 689 patched materials. |
| **code** | small | `bake_material.py` gains a lamps-only mode (`sofa_scene.py` can already place the app's point lights in Cycles — that is how `render_from_manifest.py` produces the reference renders); `lightmapIndex.ts` gains a second map list; `visibilityLightmap.ts` gains one sampler; `VisibilityLightmaps.tsx` swaps `setLampBounce` for `setLampMapLevel`. |
| **first-paint** | +229 fetches on the `realistic` tier | Precache goes 5.82 → ~11.6 MB; the maps mount behind the loader, as today. |

### 3.3 What it buys, visually

Better than what it replaces, on four counts:

1. **Per-texel instead of per-room.** `lampBounce` is `Σ intensity / floor area` with a three-value
   orientation weight; the bake is the actual irradiance at each texel.
2. **Real occlusion.** The 19 lights cast no shadows (§1.2), so today a bedside lamp lights the far
   side of the wardrobe. Cycles does not. **A baked lamp set is the only option in this document
   that makes the lamps cast shadows at all.**
3. **Real interreflection and colour bleed** from the lamp, in the bake's own chroma (the
   `lightmapChroma` path already exists).
4. It closes the `LAMP-BOUNCE` docblock's own open caveat — the calibration constant
   `LAMP_BOUNCE_K = 1.2` and the orientation weights are a hand-fitted model standing in for a
   quantity we can simply measure.

### 3.4 What it breaks — and the one that actually matters

| feature | verdict |
|---|---|
| **`lampsDaylightRelative` hour weighting** | **Survives intact, and gets simpler.** The map is scaled by one scalar exactly as `lampBounce` is today — `setLampMapLevel((lightsMode === 'on' ? 1 : 0) * lampDaylightWeight(alt))`. `src/scene/CLAUDE.md`'s rule ("both halves of one lamp must take the weight") still holds, and the "two halves" become one term plus the surviving real lights. Below the horizon `lampDaylightWeight` returns literal 1.0, so the calibrated 21:00 frames stay comparable. |
| **Scene-wide lights switch** | Survives — it is the same scalar. |
| **Per-lamp switching (§1.5)** | **Degrades.** A single baked set has the lamp population frozen at bake time. The graceful fallback is to scale the *room's* map by `Σ(on flux) / Σ(baked flux)`, which is exactly the granularity `lampBounce` already has. Observable regression: turn off one of two bedside lamps and, on the shell, **both pools dim by half instead of one going out.** Today's point lights get this right. |
| **Per-lamp colour / intensity / mood presets** | **Degrades.** Baked chroma is frozen. Mitigation: bake neutral and tint with a per-room uniform — which loses per-lamp differences *within* a room. |
| **Moving, adding or deleting a lamp** | **Breaks outright.** Today it is instant. A bake is stale the moment the user drags a lamp. The daylight set has the same class of problem but only for *shell* geometry, which users change rarely; **lamps are furniture, which users change constantly.** This is the strongest argument against, and it is why the lamp map can only ever be an *opportunistic fast path*, validated against a lamp-set digest (same shape as `lightmapKey`) and silently abandoned to today's path when the design differs. |
| **Non-default plans / user plans** | Never baked. Falls back to today's path. (Per the standing steer, the default 4-room flat is the only plan that matters for the showroom — but the code must not assume it.) |
| **Furniture** | **Unaffected, and this is why the bake cannot get us to zero real lights.** ~74 % of the frame is unlightmapped and must still be lit by something. |

### 3.5 Verdict on §3

**Worth doing, but not as the performance fix.** It is a genuine realism upgrade with a modest,
well-understood asset cost, and it removes the shell's *dependence* on the point lights — which is
what makes a light-count cut survivable. It does **not**, on its own, remove a single light.

---

## 4. Options, scored

Scoring: **visual** is the change a user would notice (↑ better, ↓ worse, = none);
**cost** is engineering effort (S/M/L/XL); **risk** is the chance of a regression that a screenshot
would not catch; **tiers** names where it applies.

| # | Option | GPU win | Visual | Cost | Risk | Tiers | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | **Fix the demote off-by-epsilon** (§4.1) | none | ↑↑ (stops silent quality loss) | **S** (one constant) | Low | all | **DO FIRST** |
| 2 | **Measure**: light-count A/B, valid DPR A/B, post A/B (§4.2) | none | = | S–M | Low | — | **BLOCKING** |
| 3 | **Room-scoped light culling into a fixed pool** (§4.4) | **large (19 → 4–8)** | ↑ (kills light leaking through walls) | **M** | **Med** (the already-rejected "lamps switch as you walk") | `realistic` first, all later | **RECOMMENDED — Stage 2** |
| 4 | **Lamps-on baked lightmap set** (§3) | none alone; enables #3 | **↑↑** (per-texel pools + lamp shadows) | **M** (+ a Blender night) | Med (per-lamp switching regresses) | `realistic` only | **RECOMMENDED — Stage 3** |
| 5 | **`LightProbeGrid` for furniture** (§2.6) | **large** — it is the only thing that unblocks a deep light cut | ↑ (furniture finally gets room-correct indirect) | M–L | Med (core addon, unblended volumes) | `realistic` | **RECOMMENDED — Stage 3b**, and the single biggest surprise in this research |
| 6 | **Post-stack trims**: half-res N8AO at night on `capable`, smaller Kawase (§4.6) | small–medium | ↓ slightly | S | Low | `realistic/capable` | **Hold** — cheap insurance if #3 leaves us near the line |
| 7 | **More aggressive `mergeCoincidentLights`** | ~none | ↓ | S | Low | — | **NO** — merges nothing on this plan (§1.2); raising `MERGE_RADIUS_M` past 1.2 m collapses the sconce pair the constant was chosen to protect |
| 7b | **Give the fixtures shadows instead** | negative | ↑↑ | — | — | — | **IMPOSSIBLE** — 19 shadowed point lights exceeds the GLES3 minimum texture-unit and varying counts; the program does not link (§2.1) |
| 8 | **Shader early-out in `lights_fragment_begin`** (§2.4) | medium, divergence-dependent | = | M | **High** (touches every material's `onBeforeCompile` chain) | all | **NO for now** — fallback only |
| 9 | **Clustered / Forward+** (§2.2) | large | = | **XL** | High | — | **NO** — WebGPU only; kills pmndrs post and every `onBeforeCompile` patch |
| 10 | **Emissive geometry / additive decals** (§2.5) | small | ↓ | M | Med | — | **NO** — strictly worse than #4 for the same commitment |
| 11 | **Do nothing** (§4.7) | none | = at 60 Hz→30 Hz, ↓↓ via the ladder | — | — | — | **Not available as stated** |

### 4.1 Option 1 — the demote threshold is an off-by-epsilon bug

`DEMOTE_INTERVAL_MS`'s own comment says *"33.3 ms is the 30 fps floor the tier ladder is documented
against — `tier-fps.mjs`: 'an auto-selected tier is only defensible if it holds the 30 fps floor'"*.
A frame at exactly 33.33 ms **is** 30 fps, i.e. it **holds** the floor — but `classifyWindow` uses
`>=`, so a perfectly vsync-locked 30 Hz is classified `'bad'`. Every 30 Hz-locked display, and every
GPU-bound scene that lands on the every-other-vsync cadence, sits exactly on this boundary.

The fix is a hysteresis margin, not a different design: classify `'bad'` only above (say) 36 ms
(~28 fps), which is genuinely *missing* the floor. **One constant, one test.** It does not make the
frame faster; it stops the frame rate silently costing the user their shadows and their resolution,
permanently, for being 0.07 ms slow. Touches `src/scene/adaptiveTier.ts` and
`src/scene/adaptiveTier.test.ts`.

### 4.2 Option 2 — the three measurements, before anything else

All three in **one browser session**, one arm, pinned clock/pose/tier, flag-toggled in place — the
R7-L caution ("a two-boot A/B of this app is not attributable"; 552/1320 vs 480/1224 lightmap
lookups across two boots of the same build) applies with full force.

1. **Light-count ladder.** Same pose, 21:00, lights on: render at 19 / 12 / 8 / 4 / 1 / 0 lights by
   truncating `fixtureLightsFor`'s output through a dev seam. Report `interval p50/p90`. This is the
   one number the whole brief rests on and it does not exist.
2. **Valid DPR A/B.** Drive the store's own DPR path (`qualityOverrides.dprMax`, or
   `InteractiveDprController`'s degrade), **not** `gl.setPixelRatio` — r3f re-applies the Canvas
   prop, which is what voided the previous attempt. If half DPR restores 60 Hz, the bound is fill,
   not ALU, and options 3/4 are the wrong lever while option 6 is the right one.
3. **Post-stack A/B, lights on.** `postprocessing: false, ao: true` (the minimal composer) vs the
   full stack, at 19 lights. Separates "the lights are expensive" from "the lights plus a full-res
   AO at DPR 2 are expensive".

New one-off probe under `scripts/dev-probes/`, deleted after use — the standing convention.

### 4.3 What the answer probably is, and why §5 is staged around it

§1.4 shows the post stack is identical in both arms, so the 60 → 30 Hz **delta** is the lights. But
the **margin** is 0.07 ms. If post is (say) 9 ms of an 33.4 ms frame, then halving AO alone could
clear the demote line without touching a single light. That is why option 6 is "hold, cheap
insurance" rather than "no", and why the staging refuses to commit to a bake before (2) is in.

### 4.4 Option 3 — room-scoped culling into a fixed pool, in detail

Two facts from §2.1 make this much stronger than the nearest-N cap that was tried and removed:

1. **A point light beyond its own `distance` contributes exactly zero.** Fixture `distance` is
   3.0–6.5 m. Dropping a light whose sphere does not reach any visible fragment is not an
   approximation — it is **bit-identical**.
2. **The lights cast no shadows, so today they leak through walls.** A `ceiling-light` (`distance`
   6.5 m) in bedroom 3 is currently illuminating the living room through a solid wall. **Culling by
   room does not degrade the render; it corrects it.** This is the only option here with a
   correctness argument as well as a performance one.

The machinery is already in the tree. `src/floorplan/types.ts:pointInRoom`,
`src/scene/lighting/roomProbe.ts:probeAt(probes, x, z)` (world point → room, shipped in R7-L),
`src/floorplan/openingProbe.ts` and `openingSegments.ts` for doorways. The selection set is *the
camera's room, plus every room reachable through an opening inside the view frustum* — which on the
default 4-room flat is typically 2–4 rooms, i.e. **2–6 of the 19 lights**.

Two design requirements, both non-negotiable, both learnable from what is already in the tree:

- **Constant count.** Pad the set to a fixed `N` (8 is comfortably above the worst realistic case and
  is 2.4× cheaper than 19), with unused slots at `intensity 0`. `NUM_POINT_LIGHTS` then never
  changes, so **`z16` disappears** — no +25/+31 compile burst on the switch, ever, on any tier. The
  cost is that the lights-off state now pays 8 zero-intensity BRDFs per fragment, which
  `fixtureLights.ts`'s own research note calls "the wrong trade for this app's default state". The
  honest resolution is to pick the padding count *after* measurement (2), and to accept a variable
  count if 8-while-off measures worse than a recompile that `skipShaderLinkChecks` has already made
  cheap.
- **No pops.** Crossfade a slot's intensity over ~250 ms on reassignment, and require hysteresis on
  the room set (a room leaves the set only after the camera has been unable to see it for a beat).
  Because a culled light is by construction one whose room is not visible, the visible failure mode
  is narrower than the distance-ranked cap that was removed — but it is the *same* failure mode, and
  the reviewer who removed that cap will be right to look for it. **A walk-mode scenario clip
  through every doorway of the default flat, watching for a pool appearing or vanishing, is the
  acceptance test.**

Files: new `src/scene/lighting/lightRooms.ts` (pure, unit-testable — the selection), plus
`src/scene/lighting/fixtureLights.ts` (pool assignment + crossfade state) and
`src/scene/lighting/FurnitureLights.tsx` (render the fixed pool). A new `FEATURE_FLAGS` entry —
`roomScopedLights`, `tier: 'simple'` — per the hard rule.

### 4.5 Where options 4 and 5 sit relative to the cull

Options 4 (lamps-on bake) and 5 (`LightProbeGrid`) are the **two halves of one job**: making option
3's light cut invisible. The bake covers the **shell**, the probe grid covers the **furniture**, and
§1.3's table is exactly the split between them. Neither removes a light on its own; together they
are what would let the pool go from 8 to 2–3.

They are Stage 3 rather than Stage 2 because option 3 works without them and they do not work
without it. But **option 5 should be spiked during Stage 1**, not after Stage 2: `probes.visible =
true` is the entire API surface of the experiment, it needs no Blender time and no new assets, and
if it works it changes the shape of everything downstream of it.

### 4.6 Option 6 — the post stack, quantified

Per §2.8 there is no merging to reclaim. What is available is **mounting less**:

- **`aoFullRes: true` is `realistic/capable` only** — the exact arm that measured 30 Hz. Full-res
  N8AO at `quality: 'high'` on a DPR-2 1200×900 canvas is a 4.3 MP AO solve plus denoise, every
  frame. At **night with the lights on**, ambient occlusion is contributing least (the picture is
  lamp-pool contrast, not skylit corner shading) and costing most. `aoFullRes: dayLevel > 0` is a
  two-line, tier-correct trade: `src/scene/quality.ts` + `src/scene/Effects.tsx`.
- **`KernelSize.LARGE` Kawase at `resolutionScale: 0.5`** for Bloom. `mipmapBlur` must stay off
  (BLOOM-MIP-FLASH, measured). Dropping to `MEDIUM` is a look call, not free.
- `multisampling` is already 0 on the full stack; SMAA's two supporting passes are structural.

Expected: a handful of ms, not a halving — but "a handful of ms" is 100× the margin over the demote
line.

### 4.7 Option 11 — "do nothing", stated honestly

**What the user would actually perceive at a flat, locked 30 Hz**, lights on, `realistic`, walk mode:

- **Nothing at all while standing still.** A static or slowly-orbiting view at 30 Hz is
  indistinguishable from 60. For a "virtual showroom where you feel inside the flat", a large part of
  the session is standing and looking.
- **A perceptible heaviness when turning.** A locked 30 Hz is *much* better than a variable 45 — no
  judder, no beat frequency, just a lower-fidelity motion cue. Fast mouse-look in walk mode will read
  as slightly smeary and slightly laggy (one extra vsync of latency); a slow pan will not.
- **Touch drag is where it shows.** Direct-manipulation input at 30 Hz feels less "stuck to the
  finger" than at 60. This is a phone/tablet concern — and phones boot `performance` (`deviceClassFor`
  returns `weak` on a coarse pointer), which mounts no lightmaps and a minimal composer, so the
  measured arm is not the phone arm.
- **`performance` tier is unaffected.** It is the boot default (`uiSlice.ts:450`), and the whole
  lightmap + full-post configuration this document is about is `realistic`-only.

So: **30 Hz, on its own, is a defensible product decision for this app.** If it were the only
consequence, "do nothing" would be a real option and this document would recommend it.

**It is not the only consequence.** §1.6 is. Doing nothing means the adaptive ladder quietly
dismantles the `realistic` look — 4096 → 2048 shadows, then no sun shadows, then half resolution —
the first time a user turns the lights on at night, and never restores it. That is a far worse
outcome than 30 Hz, and it is why option 1 is the one thing in this document that should ship whether
or not anything else does.

---

## 5. Recommendation

**Ship the threshold fix now; measure; then cull, then bake.**

### Stage 0 — immediately, independent of everything else (S)
Fix the demote off-by-epsilon (§4.1). One constant plus a test in `src/scene/adaptiveTier.ts` /
`adaptiveTier.test.ts`. This stops the lights switch permanently degrading the render and is correct
on its own terms regardless of what the GPU is doing.

### Stage 1 — the measurements (§4.2) (S–M, blocking)
Light-count ladder, valid DPR A/B, post-stack A/B, one session, one arm, dev probe deleted after use.
**Do not start Stage 2 or 3 before this lands.** If the DPR A/B shows a fill bound, stop and do
option 6 instead.

### Stage 2 — room-scoped lights into a fixed pool (§4.4) (M)
The big win, no new bytes, no bake, and it corrects light leaking through walls. Flag
`roomScopedLights`, `realistic` first, `performance` once the pop behaviour is proven. Closes `z16`
if the pool count is fixed. Acceptance: a walk-mode scenario clip through every doorway of the
default flat with no visible pool appearing or vanishing, plus the standing calibrated-pose luma
check to prove the lit rooms are unchanged.

### Stage 3 — cover what the pool stopped covering (M + one Blender night)
Two halves of one idea; **3a is the shell, 3b is the furniture**, and the pool can only shrink
further once both exist.

- **3a — lamps-on baked lightmap set (§3).** A look upgrade that also removes the *shell's*
  dependence on the pool. Additive, `realistic`-only, validated against a lamp-set digest and
  silently abandoned when the user's lamp set differs from the bake. Explicitly accept the
  per-lamp-switching regression **on the shell only**, documented in `src/scene/CLAUDE.md` beside
  the existing `LAMP-BOUNCE` rule.
- **3b — `LightProbeGrid` for furniture (§2.6).** The piece nothing else in this document supplies,
  and it is already in the pinned `three@0.184.0` with first-class `WebGLRenderer` support. Bake one
  grid with the lamps on, one with them off, and swap the volume's `texture` on the switch (the
  renderer's `findLightProbeGrid` is a containment lookup, so two volumes cannot be cross-faded —
  budget a lerp between two 3D textures if a hard swap pops). **Spike this before 3a**: it is the
  cheaper experiment (`probes.visible = true` in the Sponza example is the whole API surface), it
  needs no Blender time, and if it works the lamps-on lightmap becomes a polish item rather than a
  prerequisite.

### Stage 4 — hold in reserve
Post-stack trims (§4.6) if Stage 2 leaves us near the line; a `three` bump to r186 for the renamed
`LightProbeGridWebGL` plus its incremental baking (#34486, 2026-09-07) if the r184 addon proves
awkward — noting `sota-2026-09-25.md` §1.5's caveat that a version bump re-opens the AgX/Cycles
gain fit.

### Explicitly not recommended
Clustered/Forward+ (WebGPU-only, XL, kills pmndrs post — §2.2), a shader early-out in
`lights_fragment_begin` (blast radius across every `onBeforeCompile` chain — §2.4), widening
`MERGE_RADIUS_M` (merges nothing here and breaks the sconce pair — §1.2), emissive/decal fakes
(§2.5).

---

## 6. Files any recommendation would touch

| stage | files |
|---|---|
| 0 | `src/scene/adaptiveTier.ts` (`DEMOTE_INTERVAL_MS`, `classifyWindow`), `src/scene/adaptiveTier.test.ts` |
| 1 | new `scripts/dev-probes/lights-count-ab.mjs` (one-off, deleted after use); `scripts/scenarios/` clip for the pinned pose; read-only use of `src/scene/frameCost.ts` |
| 2 | new `src/scene/lighting/lightRooms.ts` + `.test.ts`; `src/scene/lighting/fixtureLights.ts` (pool assignment, crossfade); `src/scene/lighting/FurnitureLights.tsx`; `src/features/flags/registry.ts` + `types.ts` (`roomScopedLights`); reuses `src/scene/lighting/roomProbe.ts:probeAt`, `src/floorplan/types.ts:pointInRoom`, `src/floorplan/openingProbe.ts`; docs `src/scene/CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/open-graphics-decisions.md` (`z16`) |
| 3a | `python/scripts/blender/bake_material.py` (lamps-only pass), `python/scripts/blender/sofa_scene.py`, `python/scripts/blender/denoise_lightmaps.py`; `public/assets/lightmaps/` (+229 `.ktx2`, index v3); `src/scene/lightmapIndex.ts`, `src/scene/lightmapTexture.ts`, `src/scene/applyVisibilityLightmaps.ts`, `src/scene/visibilityLightmap.ts` (second sampler), `src/scene/VisibilityLightmaps.tsx` (`setLampBounce` → `setLampMapLevel`), `src/scene/lampBounce.ts` (retained as the fallback for unbaked plans); `src/features/flags/registry.ts` (`lampLightmap`); service-worker precache list; `src/scene/CLAUDE.md` |
| 3b | new `src/scene/lighting/LightProbeGridVolume.tsx` (mount + bake trigger) and `probeGridPlan.ts` (pure — volume bounds from `planExtent.ts`); `src/scene/Scene.tsx` / `RoomEditorScene.tsx` mount points (same both-scenes rule as `VisibilityLightmaps`); `src/features/flags/registry.ts` (`lampProbeGrid`); reuses `examples/jsm/lighting/LightProbeGrid.js` from the pinned `three` |
| 4 | `src/scene/quality.ts` (`aoFullRes`), `src/scene/Effects.tsx`, `src/scene/EffectsImpl.tsx`; the `chromaticAberration` pass-split note in `src/scene/EffectsImpl.tsx` (§2.8) |

---

## 7. What would change this recommendation

- **The light-count ladder shows a shallow curve** (19 → 8 lights buys < 4 ms). Then the attribution
  in `perf-trace-2026-09-25.md` §6 is wrong, Stage 2 is not worth its risk, and the answer is
  Stage 0 + option 6.
- **The DPR A/B restores 60 Hz at half resolution.** Fill-bound, not ALU-bound. Then option 6 and the
  `(z)7` `dprMax` rung from `sota-2026-09-25.md` are the plan, and neither the cull nor the bake
  helps much.
- **A maintained WebGL clustered-forward path appears**, or the app migrates to `WebGPURenderer` for
  unrelated reasons. Then `ClusteredLighting` (r185) subsumes Stage 2 entirely.
- **The product decides per-lamp switching is not a feature it needs.** That removes §3.4's main
  objection and promotes the bake to Stage 2.
- **The `LightProbeGrid` spike (Stage 3b) succeeds cheaply.** Then it, not the cull, is the headline:
  furniture gets room-correct indirect from a lamps-on grid, the point-light pool drops to the two
  or three kept purely for specular pools, and the lamps-on lightmap set becomes optional polish.
  **This is the experiment with the best ratio of information to effort in the whole plan and it
  should be run alongside Stage 1, not after Stage 2.**

---

## 8. Corrections this document makes to the existing record

Stated plainly so they are not lost in the prose, and so whoever maintains those documents can fix
them:

| document | claim | correction |
|---|---|---|
| this brief (R7-P) | "18 × `#ffd9a0`, 1 × `#fff1d6`" | Six fixture kinds, six tints, dominated by ten `ceiling-light`s at `#fff0d4` (§1.1) |
| this brief (R7-P) | "~20 single-quad passes … is pmndrs merging being defeated?" | It is not. Every separate pass is a documented must-be-separate; the merge is working (§2.8). The live trap is `chromaticAberration`, which *would* split the pass |
| `docs/research/sota-2026-09-25.md` §1.3 | a three.js probe volume "has never landed" | `LightProbeGrid` landed in **r184**, the pinned version, with core `WebGLRenderer` support, and has shipped four further PRs since (§2.6) |
| this document §2.6 / Stage 3b (added 2026-09-26, R7-AC) | the grid is untried here and "the only thing that unblocks a deep light cut" | It was spiked and rejected on 2026-08-28 (`src/scene/CLAUDE.md`), and re-spiked per room in R7-AC: furniture's night light is ~75–80 % direct, so the grid does not lower the light floor. The 8 nearest lights suffice with or without it. Stage 3b is withdrawn, and Stage 2 alone clears a 14→18-light cost cliff. See [`lightprobegrid-spike-2026-09-26.md`](./lightprobegrid-spike-2026-09-26.md) |
| `docs/audit/perf-trace-2026-09-25.md` §6 | "the cause is the obvious one … 19 forward point lights" | Correct in mechanism and *unmeasured* in magnitude; the light-count A/B has never been run (§1.7, §4.2) |
| — (unrecorded anywhere) | — | The residual sits **0.07 ms** over `DEMOTE_INTERVAL_MS`, so the lights switch permanently demotes the render through the adaptive ladder (§1.6) |

---

## 9. Stage 1 results — the three A/Bs, measured (R7-AB, 2026-09-26)

**Build:** `v0.35.18.7` (`47664b75`), branch `feat/photoreal-round7`, no `src/` changes.
**Probe:** [`scripts/dev-probes/lights-gpu-ab.mjs`](../../scripts/dev-probes/lights-gpu-ab.mjs), kept
rather than deleted because Stage 2's acceptance has to re-run exactly these A/Bs. Modes: `ladder`,
`pool`, `post`, `dpr`, `passes`, `explore`. Raw JSON and logs were written to `/tmp/r7ab/` and are not
committed.

### 9.1 Method

- **Real GPU:** headless Chrome 149, `--use-angle=metal`, renderer string
  `ANGLE Metal Renderer: Apple M4`. One browser and one probe at a time, with
  `sofa-shot-harness.lock` held.
- **Pins, read back on every row:** `realistic/capable` (desktop) or `performance/weak` (phone).
  `setDeviceClass`, `setAutoMaxDevice`, `setDprHalved` and `setAutoShadowsOff` are replaced by no-ops
  once the pin is applied, and the `interactiveDegrade` flag is off, so neither the adaptive ladder nor
  the interactive DPR degrade can change quality mid-measurement. Every row reads back the device class,
  `dprHalved`, the pixel ratio and the **drawing-buffer size**. Clock `manual` 21:00, `firstPerson`,
  lights `on`, 229 baked lightmaps attached and settled before the first row.
- **One boot per A/B, one variable per step.** Each ladder is walked **down and back up** in the same
  boot, so the return leg is the drift control. The two legs agree to ±0.1 ms `thru` on every desktop
  row, and the tables below give the mean of the two.
- **Light count:** set by toggling `.visible` on the fixture `PointLight`s (the only point lights in
  the scene). three skips invisible lights in `projectObject`, so `NUM_POINT_LIGHTS` really changes
  and programs recompile, exactly as an unmount would, without needing a `src/` seam. The K lights kept
  on are the K **nearest the camera**, so the picture changes as little as possible.
- **Instruments.** A row is measured only after a 2.5 s settle. Compile frames are timed separately.
  - `thru`: **N = 40 × `__three.advance()`**, then **one** 1-px `readPixels` drain, divided by N.
    `advance()` is the real pipeline with the composer included, never bare `gl.render`. `thru` is
    the pipelined cost of a frame with vsync taken out of the picture, and **it is the headline number
    throughout.** At low load it bottoms out at the CPU submit cost (`cpu`, ≈ 8 ms desktop / 2 ms
    phone). Anything near 8 ms is therefore the CPU floor, not the GPU.
  - `raf`: a passive 4 s window on the app's own loop. It gives the rAF Hz and the p50/p90 interval
    between *rendered* frames (frames where `gl.info.render.frame` advanced). This is what the user
    actually gets, quantised to vsync.
  - `submit`: the summed CPU time of the `gl.render` calls inside one rendered frame. There are 22
    calls per frame on the full stack, 12 with AO off and 2 on the minimal composer.
  - **`EXT_disjoint_timer_query_webgl2` is exposed, but its numbers are discarded.** It read 73–84 ms
    for a frame whose pipelined cost is 25 ms and which is displayed at 38 Hz. On ANGLE/Metal the query
    brackets queue time, not execution. The columns are kept in the JSON and none are quoted here.
- **Poses** (plan x/z, yaw):
  - living `[11, 7.0] 0.07` (the perf-trace pose)
  - kitchen `[9.3, 8.0] π/2`
  - main bedroom `[1.9, 3.4] 0.25`
  - corridor `[8.8, 4.3] π/2`

  Each was screenshot-verified to be inside the named room and looking along it.
- **Scope of the desktop arm:** 1200×900 at **DPR 1**, the same as the perf trace, so this is the arm
  that measured "30 Hz". A real Retina Mac runs `realistic` at `dprMax 2`, which is 4× the pixels
  (§9.4).

### 9.2 A/B 1 — light-count ladder (desktop, DPR 1, full post stack)

Each cell gives `thru` in ms (the pipelined frame cost), then the displayed rAF rate, then the p50/p90
rendered-frame interval in brackets.

| lights | living | kitchen | main bedroom | corridor |
|---|---|---|---|---|
| **19** | **25.3** · 38 Hz (33.3/33.4) | **22.7** · 43 Hz (16.7/33.4) | **22.6** · 43 Hz (16.7/33.4) | **23.2** · 43 Hz (16.7/33.4) |
| 12 | 16.3 · 60 Hz | 16.3 · 60 Hz | 15.3 · 60 Hz | 18.1 · 55 Hz |
| 8 | 14.3 · 60 Hz | 14.9 · 60 Hz | 13.5 · 60 Hz | 17.0 · 58 Hz |
| 4 | 12.6 · 60 Hz | 14.0 · 60 Hz | 12.2 · 60 Hz | 16.2 · 60 Hz |
| 1 | 11.8 · 60 Hz | 13.5 · 60 Hz | 11.5 · 60 Hz | 15.7 · 60 Hz |
| **0** | **11.7** · 60 Hz | **13.4** · 60 Hz | **11.3** · 60 Hz | **15.7** · 60 Hz |
| **19 → 0** | **−13.6 (54 %)** | **−9.3 (41 %)** | **−11.3 (50 %)** | **−7.5 (32 %)** |

The fine ladder below covers living and corridor in a second boot, in `thru` ms:

| lights | 19 | 17 | 16 | 15 | 14 | 13 | 12 | 10 |
|---|---|---|---|---|---|---|---|---|
| living | 25.3 | 22.3 | 20.8 | 18.8 | 17.5 | 16.7 | 16.1 | 14.9 |
| living rAF Hz | 38 | 43 | 47 | 51 | 55 | 58 | 60 | 60 |
| corridor | 23.0 | 21.5 | 20.7 | 19.8 | 18.8 | 18.6 | 18.1 | 17.5 |

**The curve is not linear, and its shape is the most useful result in this section.**

- From 0 to 12 lights the marginal cost is about **0.4 ms per light**.
- From 12 to 19 it is about **1.3 ms per light**, peaking at ~2 ms for the 15th and 16th. In the living
  room the bend is at about 13–14 lights.
- The likely mechanism is register pressure in the fully unrolled `lights_fragment_begin` loop (§2.1:
  19 literal copies of the physical BRDF), which costs occupancy once the shader exceeds the GPU's
  register budget. That mechanism is inferred from the shape, not proven. The shape itself is measured,
  and it reproduced in both boots.

**Whatever the cause, the last seven lights cost twice what the first twelve do.**

`submit` (CPU) does not follow the light count in the living room or bedroom, where it stays flat at
≈ 10 ms and ≈ 6 ms. In the kitchen and corridor it rises from about 12 ms to 22 ms at 19 lights. That
rise is CPU time spent *waiting* inside `gl.render` once the GPU queue backs up, i.e. the same GPU cost
showing up in another column. `cpu` (the `advance` call on a drained queue) stays flat at 5–11 ms in
every pose.

#### Padding a pool costs full price

`pool` mode keeps all 19 lights visible, so `NUM_POINT_LIGHTS` stays constant, and sets the far ones to
intensity 0:

| arm (living / corridor) | `thru` ms |
|---|---|
| 19 visible, 19 lit | 25.2 / 23.1 |
| 19 visible, **8 lit, 11 at intensity 0** | **25.2 / 23.1** |
| 19 visible, **0 lit** | **25.2 / 23.1** |
| 8 visible | 14.0 / 17.0 |
| 0 visible | 11.7 / 15.5 |

The three 19-visible arms are identical to 0.1 ms, which confirms §2.1's reading of the source: there is
no early-out. **A pool slot costs the same lit or dark, so the pool size N *is* the cost**, including
while the lights are off.

#### The recompile cost (`z16`)

The first frame after the count changes is a synchronous `advance` plus drain, and that is where three
compiles and links. It is counted only the **first** time a given count is seen in a boot:

| view | new programs per count | first-frame cost, cold | first-frame cost, count already seen |
|---|---|---|---|
| living (desktop) | +35 | **3.0–7.7 s** (median ≈ 5 s) | 13 ms |
| kitchen (desktop, after living) | +7 (materials new to this view) | 0.5–1.5 s | 15 ms |
| living (phone, `performance`) | +21 | 0.25–2.0 s | 5 ms |

- **All of it is CPU time that blocks the main thread** (`firstCpu` ≈ `firstTotal`), even with
  `skipShaderLinkChecks` on.
- Two variants that an earlier *browser session* had already compiled came back in 0.27 s and 1.2 s
  instead of 3–8 s. That points to the OS-level Metal shader cache surviving a fresh Chrome profile. So
  "cold" here means first-ever on this machine, and a returning user's lights switch probably lands
  closer to the warm figure.
- **Even so, this is several times the ~333 ms recorded for `z16`**, and it is a strong argument for a
  constant light count (§9.6).

### 9.3 A/B 3 — post stack with lights on (desktop, DPR 1, same boot)

Overrides were applied one at a time through `setQualityOverride`, with the lights toggled between 19
and 0 inside each arm. `thru` ms:

| arm | composer | passes/frame | living 19 | living 0 | kitchen 19 | kitchen 0 |
|---|---|---|---|---|---|---|
| **full** (shipped) | SMAA, Bloom, N8AO full-res, tone/vignette/grain | 22 | **25.4** | 11.7 | 18.4¹ | 12.1¹ |
| AO off | full stack minus N8AO | 12 | **15.4** | 7.7 | 12.6 | 9.9 |
| all post off | minimal composer (tone map only, MSAA 4×) | 2 | 17.1 | 7.5 | 13.1 | 9.3 |
| AO only | minimal composer + N8AO, MSAA 4× | 12 | 29.9 | 14.7 | 25.7 | 16.1 |

¹ The kitchen was measured after living's arms had already remounted the composer. See the remount
anomaly below.

Read as a 2×2 on living (lights × AO, with the rest of the stack held fixed):

| component of the 25.3 ms living frame | ms | share |
|---|---|---|
| base: scene, no lights, no AO, no other post (≈ the 8 ms CPU floor) | 7.5 | 30 % |
| rest of the post stack (Bloom, SMAA, tone, vignette, grain) | **0.2** | **1 %** |
| N8AO on its own | 4.0 | 16 % |
| 19 point lights on their own | 7.7 | 30 % |
| **lights × AO interaction** | **5.9** | **23 %** |

**The interaction has a mechanism, read off the code rather than guessed.**

- The `passes` census shows **three** full scene renders per frame, not one. The extra two are N8AO's
  `renderTransparency`, from the N8AO bundled in `@react-three/postprocessing`.
- `renderTransparency` re-renders every transparent object (window glass, shades, sheer curtains)
  twice, into two transparency targets, **with the objects' own materials and no override**. Every
  transparent fragment therefore runs the unrolled 19-light loop three times.
- That explains both halves of the table: AO costs 4 ms with the lights off but 10 ms with them on, and
  the lights cost 7.7 ms with AO off but 13.6 ms with it on.
- The per-pass drain timings cannot attribute cost on this GPU. The M4 is tile-based and defers the
  scene's fragment work into whichever later pass first samples it, so N8AO's first full-screen pass
  "costs" 23 ms with the lights on and 10 ms with them off. The mechanism therefore comes from the call
  stacks and the N8AO source, and the magnitudes come from the arm-level A/B above.

**The "~22 `gl.render` calls" are cheap.** Bloom's luminance pass, 5 Kawase passes and copy, SMAA's two
support passes and the merged `EffectPass` together cost about 0.2 ms. §2.8 was right that merging
works, and there is nothing to reclaim there.

**Remount anomaly (open, reproduced, not chased).**

- Remounting the composer *through the minimal composer* (`postprocessing` false → true) makes the
  19-light frame **3.4 ms cheaper**: living 25.2 → 21.8, kitchen 22.7 → 18.4. The 0-light frame does
  not change (11.7 → 12.0).
- After the remount the pass list is identical: 22 calls, the same targets, the same sizes.
- Remounting through `ao` false → true does *not* produce the saving.
- Because the saving scales with the light count, something in the lit programs or the transmission
  path differs after that route. It is potentially a free 3 ms if someone finds it. It is recorded here
  and was not investigated further.

### 9.4 A/B 2 — DPR through the store's own path (living, one boot, 1200×900 viewport at DSF 2)

DPR was set with `setQualityOverride('dprMax', d)`. That drives the Canvas `dpr` prop, which r3f applies
through its own `setDpr`. **The drawing buffer was read back on every row.** It changed exactly as
requested, with one exception, and the rows are labelled by what was **measured**, not by what was
requested:

| drawing buffer | Mpx | 19 lights `thru` / Hz | 0 lights `thru` / Hz | lights cost | lights ms per Mpx |
|---|---|---|---|---|---|
| **2400×1800** (DPR 2, what a Retina Mac runs) | 4.32 | **103.8 / 9.4 Hz** | 60.3 / 16 Hz | 43.5 | 10.1 |
| 1800×1350 (DPR 1.5) | 2.43 | 56.8 / 17 Hz | 29.8 / 32 Hz | 27.0 | 11.1 |
| 1200×900 (DPR 1, the perf-trace arm) | 1.08 | 25.9 / 37 Hz | 11.7 / 60 Hz | 14.2 | 13.1 |
| 600×450 (DPR 0.5) | 0.27 | **10.3 / 60 Hz** | 9.3 / 60 Hz | 1.0 | (CPU floor) |

The exception was the first `dprMax 2` step, which read back **1800×1350**, not 2400×1800:

- At boot the interactive degrade had already set the raw ratio to 1.5.
- Turning its flag off stopped it from healing back.
- An unchanged Canvas prop gives r3f no reason to re-apply.

That row has been relabelled by its buffer size. A later `dprMax 2` step, which followed a real prop
change, did produce 2400×1800. **This is why the backing-store readback is mandatory.** Without it,
two rows both labelled "DPR 2" would have disagreed by 2×, and the A/B would have been void a second
time.

What the table shows:

- **The light cost is per fragment and scales with pixel count**, at 10–13 ms per Mpx for 19 lights,
  with no measurable fixed per-light cost. So "fill rate vs per-light cost" is a false choice here:
  **the lights *are* the fill cost.** The 19-BRDF fragment is what fills slowly.
- **Half resolution alone restores 60 Hz with all 19 lights** (10.3 ms, against the CPU floor). That
  literally triggers §7's second bullet, but read on.
- **The perf trace's 30 Hz understated the real desktop by about 3×.** At the `dprMax 2` a Retina
  display actually gets, the lights-on living room runs at **~10 Hz (104 ms)**, and even with the lights
  *off* it runs at **16 Hz (60 ms)**.
- On real hardware, then, the adaptive ladder and the interactive degrade are not an edge case. They are
  what makes `realistic` usable at all on a 2× display, and the 0.07 ms threshold story in §1.6 is the
  smallest part of the problem.

### 9.5 Phone viewport (390×844, `performance/weak`, one boot)

`performance/weak` has no post composer beyond tone mapping, `dprMax 1`, and no shadows. It was measured
on the same M4, so it gives **shares, not phone milliseconds**:

| lights | living `thru` | bedroom `thru` | Hz (both) |
|---|---|---|---|
| 19 | 2.2 | 2.0 | 60 |
| 12 | 1.8 | 1.4 | 60 |
| 8 | 1.6 | 1.1 | 60 |
| 4 | 1.7 | 1.2 | 60 |
| 0 | 1.7 | 1.0 | 60 |

- At phone resolution the lights are **~25 % (living) to ~50 % (bedroom)** of the GPU frame.
- The curve has the same shape as on desktop: most of the cost sits above 8–12 lights.
- The absolute frame here is CPU-bound (≈ 2 ms submit).
- A real phone GPU is many times slower than an M4 at fragment work, so on a real phone the lights'
  share will be higher. That multiplier was **not measured**.
- On this tier z16 is +21 programs and 0.25–2.0 s per new light count.

### 9.6 Answers

**How much of the 33 ms frame is the point lights, how much is fill rate, how much is post?**

First, the 33 ms is a vsync artefact. The real (pipelined) GPU frame at the trace arm (living, DPR 1) is
**25.3 ms**. That misses the 16.7 ms budget, so each frame is displayed every other vsync. The 25.3 ms
splits as follows:

| | ms | share |
|---|---|---|
| **point lights**: 7.7 direct + 5.9 multiplied through N8AO's transparency re-renders | **13.6** | **54 %** |
| **N8AO**: 4.0 of its own, plus the same 5.9 interaction (counted once, above) | 4.0 | 16 % |
| **rest of post** (Bloom, SMAA, tone, vignette, grain, i.e. 18 of the 22 passes) | 0.2 | 1 % |
| **base** scene + composer, which is also the ≈ 8 ms CPU submit floor | 7.5 | 30 % |

**Fill rate is not a third bucket.** Every GPU term above scales with pixel count, and the lights scale
most steeply. At DPR 1 the frame is fragment-bound, and the lights are the most expensive thing in each
fragment. At the DPR 2 a Retina Mac really runs, the split is the same at 4× the size: 104 ms, with the
lights at 42 %.

**The lights are the main cost.** They are 41–54 % of the frame in three of the four poses, and 32 % in
the corridor, whose base cost is already heavy. The plan is **not** redirected, but it is refined in
three ways.

**Which Stage 2 the numbers justify, and what budget.**

1. **The room-scoped fixed-count pool, with N = 8, is justified.**
   - At 8 slots every desktop pose holds 60 Hz at DPR 1 (the corridor 58). In the living room it
     recovers 11.3 of the 13.6 ms the lights cost.
   - 8 is well below the 12–14-light knee.
   - It covers the worst room on the default plan. The **main bedroom carries 6 fixtures** (ceiling,
     two table lamps, two sconces, a floor lamp), and 6 + the corridor + one neighbour = 8.
   - It costs 2.6 ms (living) to 1.3 ms (corridor) more than 0 lights.
   - **Keep N constant, including when the lights are off.** Padded slots cost full price, but changing
     the light count costs **3–8 s** of blocked main thread cold (0.3–1.2 s warm). Paying ~2 ms per
     frame in a lights-off state that already runs at 60 Hz, in exchange for removing `z16` entirely, is
     the right trade.
   - **N = 12 is the highest the data allows.** It still holds 60 Hz at DPR 1 everywhere except the
     corridor (55 Hz). Anything past 12 buys into the steep part of the curve.
   - On this plan there is no case for a per-room cap beyond "the camera's room, then its visible
     neighbours, nearest first, until 8".
2. **Promote the N8AO transparency re-render to Stage 2, alongside the pool (S, low risk, 5.9 ms).**
   This is the cheapest large item in this section, because the light loop runs three times on every
   transparent fragment. Options, in order of preference:
   - tag the big transparent surfaces (window glass) with `userData.treatAsOpaque`, which N8AO honours;
   - turn off `transparencyAware` where the glass does not need AO;
   - give those two renders an unlit override.

   This makes §4.6's option 6 worth *more* than the doc estimated. It should no longer wait for Stage 2
   to leave us "near the line".
3. **On real displays, fill is the lever that matters, and neither the pool nor the bake touches it.**
   At `dprMax 2` the lights-*off* frame is already 60 ms. The candidate fixes are a `realistic`
   `dprMax` of 1.5 on capable (the `(z)`7 rung made explicit) or a resolution scale driven by a real
   frame-time target. That is a separate decision for the maintainer and out of scope for R7-AB, but for
   a Retina user it matters more than anything in Stage 2.

**Agreement with R7-AC (run in parallel, landed first).**
[`lightprobegrid-spike-2026-09-26.md`](./lightprobegrid-spike-2026-09-26.md) withdraws Stage 3b and
finds, from the image side, that the 8 nearest lights are enough. It also reports a 14→18-light cost
cliff. This section reaches the same pool size from the cost side, and its fine ladder puts the steep
part of that curve at 13–17 lights. The two measurements are independent and point the same way: a pool
of 8. Stage 3a (the lamps-on bake for the shell) is not a performance lever, and nothing here changes
it.

---

## 10. Stage 2 shipped — the room-scoped pool and the N8AO redraws (R7-AE, 2026-09-26)

**Method:** exactly §9.1 — the same kept probe (`scripts/dev-probes/lights-gpu-ab.mjs`, new modes
`flagab`, `toggle`, `visual`, `walk`), headless Chrome on `ANGLE Metal Renderer: Apple M4`, device
class pinned, adaptive setters no-op'd, `interactiveDegrade` off, 21:00 lights on, 1200×900 at
DPR 1, `thru` = 40 × `__three.advance()` + one 1-px `readPixels`, timer queries discarded. Every
A/B is ONE boot with the feature flag flipped in place off → on → off → on; the second pair is the
drift control. Raw JSON under `/tmp/r7ae/`, not committed.

### 10.1 Part 1 — `roomScopedLights`: a constant pool of 8, scoped by room

**What it is** (`src/scene/lighting/lightRooms.ts`, `lightPool.ts`, `PooledFixtureLights.tsx`).
Eight `PointLight`s are always mounted — dark while the switch is off — so `NUM_POINT_LIGHTS` never
changes in walk mode. The slots carry the camera's room, then the rooms visible from it (open
doors and wall-less boundaries, from the walker's own door-aware collision walls), ring by ring.
The selection is a function of the camera's ROOM, the doors and the design — no camera distance
and no heading — which is the answer to the rejected nearest-N cap: turning or walking inside a
room changes nothing. A room change fades (in 0.3 s, out 0.12 s; instant under reduced motion).
Orbit still renders every fixture (the 8 slots plus the other 11 on top).

**Demand on the default plan.** With the shipped doors (all interior doors closed, the service
yard's open) every room fits in 8 with one slot per lamp: living, kitchen and corridor share one
open space and carry 7 (4 living + kitchen + corridor + service yard); the main bedroom carries its
6. With every door open, the main bedroom carries exactly 8 (6 + bath + corridor), and the corridor
sees **16** lamps in 7 rooms — the one case 8 cannot carry, and 12 could not either. There every
visible room keeps one merged slot (`room:<id>`, emission-weighted centroid, intensity lifted by
`aggregateGain` so its walls get the same mean irradiance) and spare slots un-merge rooms in order.

**Frame cost, `thru` ms (mean of the two legs; legs agree within 0.4 ms except bedroom, below):**

| pose | legacy (19) | pool (8) | Δ | legacy rAF → pool rAF |
|---|---|---|---|---|
| living | 25.2 | **14.0** | **−11.2 (−44 %)** | 38 Hz (33.3/33.4) → **60 Hz** (16.7/16.7) |
| kitchen | 22.8 | **15.0** | −7.8 (−34 %) | 43 Hz → **60 Hz** |
| main bedroom | 22.6 / 26.0 ¹ | **15.9 / 16.5** | −6.7 / −9.5 | 43 / 37 Hz → **60 / 59 Hz** |
| corridor | 25.6 | **20.1** | −5.5 (−21 %) | 38 Hz → 48 Hz (16.7/33.3) ² |

¹ The legacy bedroom leg drifted 22.6 → 26.0 between the two passes; both pool legs sit 16 ms.
² The corridor is now CPU-bound: `cpu` (the `advance` call on a drained queue) is 16.6–17.0 ms in
both arms, against 8 ms elsewhere. The lights are no longer its bottleneck; its draw submission is.

**Lights OFF** (the default state, which now pays 8 dark slots): living 11.7 → 14.0 (+2.3 ms),
corridor 15.5 → 16.9 (+1.4 ms); rAF 60 → 60 and 60 → 58.7 Hz. This is the §9.6 trade, measured.

**Phone viewport** (390×844, `performance/weak`, same M4 — shares, not phone ms): living 2.4 / 2.0
→ 1.7 / 1.8 ms, bedroom 1.6 / 2.0 → 1.1 / 1.1 ms, i.e. the lit frame is ~30–40 % cheaper at phone
resolution; both arms already hold 60 Hz on this GPU.

**The lights-switch stall (`z16`)**, `--mode toggle`, one boot with the lights OFF at boot, living,
the app's own rAF intervals over 3 s around each `setLightsMode`:

| arm | 1st toggle on | later toggles |
|---|---|---|
| legacy | **+35 programs, worst frame 266.6 ms** | +0, worst 33.4 ms |
| pool | **+0 programs, worst frame 16.8 ms** | +0, worst 16.8 ms |

The legacy first toggle ran with the OS Metal shader cache already warm from earlier boots; §9.2
measured the first-ever figure at 3.0–7.7 s. The pool compiles nothing on any toggle.

### 10.2 The visual change, linear light, one boot

`--mode visual`, per pose and state: frame with the flag off, on, off again (the noise-floor
control), sRGB-decoded to linear, Rec.709 luminance. "changed" = pixels whose luminance moved by
more than 5 % relative.

| pose | 13:00 lights off | 13:00 lights on | 21:00 lights on | control (off vs off) |
|---|---|---|---|---|
| living | ratio 1.000, 0.15 % | 0.975, 18.5 % darker | **0.970, 21.4 % darker** | ≤ 0.21 % |
| kitchen | 1.000, 0.01 % | 0.945, 47.4 % | **0.926, 48.9 %** | ≤ 0.03 % |
| main bedroom | 1.000, 0.03 % | 0.986, 8.6 % | **0.978, 17.5 %** | ≤ 0.03 % |
| corridor | 1.000, 0.00 % | 0.789, 93.5 % | **0.829, 91.5 %** | ≤ 0.01 % |
| bedroom 2 | 1.000, 0.01 % | 0.847, 65.5 % | **0.680, 72.4 %** | ≤ 0.03 % |

- **Lights off is bit-identical to the noise floor** at every pose — eight dark slots add no light.
- **Every changed pixel got darker** (brighter ≤ 0.1 % anywhere). Nothing new is added; what goes is
  light from lamps in rooms that cannot be seen from the camera's room — light that reached this
  room only through a wall, because the fixtures cast no shadows. That is the correction §4.4
  predicted and R7-AC measured (41 % of bedroom-2 shell pixels).
- **Where it shows:** bedroom 2 (−32 % at night: its wardrobe front and west wall were lit by the
  main bedroom's sconce and table lamp 1–2 m away through the party wall), the corridor (−17 %:
  five rooms' pendants within 6.5 m used to light it through their walls), the kitchen's west wall
  and hob (the shelter light behind it). The living room and main bedroom, lit mostly by their own
  lamps, move 2–3 %.
- `lampBounce` (the lamps' diffuse bounce on the shell) is per room and untouched, so a room is never
  left with nothing; only the leaked DIRECT term is gone. Whether the result is now closer to a
  Cycles render of the same lamps is the right next check and was not run here.
- **Checked against Cycles in R7-AH (`room-scoped-lights-cycles-2026-09-26.md`): a correction.**
  Cycles puts 0.000 % of the light in every region on the dropped lamps. The worst is 0.06 %, and
  that holds with every bounce counted and with the `distance` cutoff removed. Two corrections to
  the account above:
  - Bedroom 2's "wardrobe front" is a furniture panel 8 cm from the lens. It was lit by the
    corridor pendant and bedroom 3's light to its EAST, not by the main bedroom's lamps, which
    sit behind its normal.
  - These percentages are sRGB-decoded AgX. In scene-linear the removed share is larger
    (corridor 27.9 %).

  The pool frame is further from Cycles' *distribution* in bedroom 2 and the corridor, because the
  leak had been standing in for lamp interreflection the app lacks. The app's lamp light is about
  Cycles' direct term, and Cycles' total is 3.5–6× that. That gap is Stage 3, not the pool.

### 10.3 Walking through doorways — does the pool pop?

`--mode walk`: every door open, a 721-frame path at 1.4 m/s from the living room down the corridor,
into the main bedroom, back out and into bedroom 2, one step per rendered frame, mean linear
luminance per frame, both arms twice. Geometry (a door jamb filling the view) moves both arms
alike, so the pop metric is the frame-to-frame change of the pool/legacy ratio.

- The control (legacy vs legacy) moves the ratio by at most 0.003 per frame.
- The pool arm's ratio holds steady everywhere except the corridor → main bedroom crossing. There the
  corridor is over-subscribed (16 lamps in view, §10.1), the main bedroom is carried by one merged
  slot, and seen from its doorway it reads at **~0.6 of the legacy frame**. Crossing in, the ratio
  dips to 0.28 for ~3 frames (the eight slots are full on both sides, so the bedroom's lamps must wait
  for the leaving slots' 0.12 s fade) and settles at 0.91 within ~0.4 s. The dip lands while the door
  jamb fills the view (legacy itself drops from 0.35 to 0.19 at the same frames), but it is the one
  place the fade is visible as a fade. With the shipped doors nothing is over-subscribed and the room
  changes are plain fades between light sets that differ by one or two lamps.
- The first design (rank individual lamps, no merging) left the main bedroom at 0.44 from the corridor
  and then ramped it up on entry — the rejected failure — which is why merging exists.

### 10.4 Part 2 — N8AO's transparency redraws: `aoGlazingOpaque`

**What the installed source does** (`n8ao` 1.10.1, `N8AOPostPass`, the build `@react-three/
postprocessing` bundles). `detectTransparency` turns `transparencyAware` on as soon as any scene
material is `transparent`, and this flat always has some. Every frame `renderTransparency` then
renders the scene twice more: once with only the transparent meshes that don't write depth
(`transparent && !depthWrite && !userData.treatAsOpaque || userData.cannotReceiveAO`), and once
with only those that do (`transparent && depthWrite && !userData.treatAsOpaque`). Each pass uses
the mesh's own material. The compositor reads only the alpha of those targets (plus the second
target's depth) and fades the AO toward 1 under a see-through surface. Census at the living pose:
seven transmissive `MeshPhysicalMaterial` glazing panes (all `depthWrite`), one `MeshStandard`
lamp shade at opacity 0.7, 61 `MeshBasic` contact-shadow planes, and 24 invisible wall-reveal
prepass planes.

**All three options, one boot, 19 lights** (`--mode aoopts --flags roomScopedLights:off`). `thru`
is in ms. "vs base" is the linear frame diff against the stock redraw, as the share of pixels
changed by more than 5 %. The control is the base arm measured twice.

| pose / state | base | glazing `treatAsOpaque` | `transparencyAware = false` | unlit stand-in (prototype) | control |
|---|---|---|---|---|---|
| living 21:00 clear | 25.2 | **21.2** · 0.23 % | 20.7 · 0.23 % | 21.3 · 2.7 % brighter | 0.22–0.26 % |
| living 13:00 clear | 25.1 | **20.9** · 0.27 % | 20.6 · 0.20 % | 20.9 · 0.9 % brighter | 0.15 % |
| living 13:00 rain (wet glass) | 25.0–25.2 | **20.8–20.9** · 0.26–0.28 % | 20.4–20.6 · 0.22–0.28 % | 21.0 · 1.5 % brighter | 0.09–0.13 % |
| main bedroom 21:00 clear | 22.4–22.5 | **18.0** · 0.14 % | 17.6 · 0.25–0.27 % | 18.0 · 5.3 % brighter | 0.02–0.03 % |
| main bedroom 13:00 clear | 22.0 | **17.5** · 0.12 % | 17.1 · 0.24 % | 17.5 · 1.7 % brighter | 0.02 % |
| main bedroom 13:00 rain | 22.0 | **17.4–17.5** · 0.19–0.24 % | 17.1 · 0.34 % | 17.4 · 3.0 % brighter | 0.13 % |

- **Glazing `treatAsOpaque` recovers 4.0–4.5 ms of the 5.9 ms.** Its effect on the AO is at the
  noise floor at every pose and hour, including rain. The heatmap shows only a one-pixel line at
  the curtain rail. So the brief's first preference is also the right one, and it ships. The
  shipped arm (`aoGlazingOpaque`, which applies the flag only inside the redraw and only for panes
  at full opacity) measured identical to the hand-set arm in a second boot: 21.1 vs 21.2 ms, and
  0.15–0.25 % vs 0.14–0.28 % of pixels.
- **`transparencyAware = false` saves another ~0.4 ms** (4 fewer `gl.render` calls, 22 → 18). It
  is also at the noise floor here. It was not shipped because it also removes the contact-shadow
  planes and the orbit wall-reveal fade (whose walls go transparent) from the AO's transparency
  handling, and none of the measured poses covers the wall reveal.
- **The unlit stand-in costs the same as `treatAsOpaque`, and it is wrong.** This option drew the
  two redraws with a cached `MeshBasicMaterial` whose opacity was meant to reproduce the lit alpha:
  `opacity × (1 − transmission/2)`, from three's transmission-pass clear to `(1, 1, 1, 0.5)`. It
  lifted the AO off the glass: up to 5.3 % of pixels came out brighter, all of them on the pane.
  So the lit pane's alpha in that pass is not what the shader model predicts. Empirically it is
  about 1, which is why dropping the pane from the pass changes nothing. The prototype was removed.
- **Wet glass under rain** was checked at both poses (13:00 rain rows above): the droplet
  normals, roughness and refraction are untouched, and so is the AO.

The shipped rule keeps the redraw for a pane that is see-through in alpha. That covers a window
fading with its wall in orbit, and the alpha-blended panes of the tiers without transmission.

### 10.5 Before / after — both parts, one boot per A/B

`--mode flagab --flag roomScopedLights,aoGlazingOpaque` (both flags off vs both on), DPR 1,
21:00, lights on. `thru` in ms, with the rendered-frame interval p50/p90:

| pose | before (19 lights, stock AO) | after | Δ |
|---|---|---|---|
| living | 25.3 · 38 Hz (33.3/33.4) | **12.5 · 60 Hz (16.7/16.7)** | **−12.8 (−51 %)** |
| kitchen | 22.8 · 43 Hz (16.7/33.4) | **13.6 · 60 Hz** | −9.2 (−40 %) |
| main bedroom | 22.5 · 43 Hz (16.7/33.4) | **11.8 · 60 Hz** | −10.7 (−48 %) |
| corridor | 23.1–23.2 · 43 Hz (16.7/33.4) | **15.6 · 60 Hz** | −7.5 (−33 %) |

Both legs agree within 0.1 ms. Part 2 on top of the pool alone (`--flag aoGlazingOpaque`, a
separate boot): living 14.1 → 12.5, kitchen 14.9 → 13.7, bedroom 13.4 → 11.8, corridor 16.9 → 15.6
(and 58 → 60 Hz). The corridor measured 20.1 ms under the pool in the §10.1 boot, which had a CPU
floor of 16.6–17 ms. In these boots it runs at 15.6–16.9. The CPU floor varies from boot to boot,
so the §10.1 corridor figure is the pessimistic one.

**Phone viewport** (both flags; shares only): living 2.5 / 2.3 → 1.75 / 1.74 ms, bedroom
1.6 / 2.0 → 1.05 / 1.16 ms. The whole 60 Hz frame is about 30–45 % cheaper on the M4 at phone
resolution. `performance/weak` runs no N8AO, so this is all Part 1.

**Recompile stall on the lights switch:** §10.1. Legacy was +35 programs with a 267 ms frame
(3–8 s cold); now it is +0 programs, 16.8 ms.

**The remount anomaly (§9.3).** Remounting the composer through `postprocessing: false` made the
19-light frame 3.4 ms cheaper, and only with lights on. That is the same size and the same
lights-scaling as the transparency redraws measured here (4.0–4.5 ms). A plausible explanation is
that a fresh `N8AOPostPass` built while the minimal composer is mounted comes back without
`transparencyAware`, or without the glass in its redraw. This was not verified, and it was not
chased.
