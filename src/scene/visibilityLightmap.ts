/**
 * Apply a baked **aperture-visibility** map to a material — item (w)'s fix, as a shader patch.
 *
 * The app's `HemisphereLight` + `AmbientLight` are visibility-blind: every surface receives the
 * same skylight whether or not it can see the sky. Measured against a Cycles reference, that is
 * a ~3× error on a wall in a normal living room, and the single largest defect the graphics arc
 * found (`docs/open-graphics-decisions.md`, item (w)). Modulating indirect irradiance by baked
 * visibility takes the spatial mismatch from **4.76× to 1.36×**.
 *
 * Every line below encodes a measured requirement, and each one was a round of debugging:
 *
 * 1. **`channel = 1`.** three selects a texture's UV set per texture and defaults to `0` — the
 *    `uv` attribute. The shell's `uv` is a *tiling* coordinate running −2.9…+2.9, so a map left
 *    on channel 0 samples the atlas with wrapping and reads noise. Setting `uv1` on the geometry
 *    is necessary and **not sufficient** (`v0.31.7.19`; it cost five rounds).
 * 2. **No mipmaps.** Every mip level averages across the 3×2 atlas's slot boundaries, mixing one
 *    face's visibility into another's — at mip 4 a 256 px atlas has 5×8-texel slots. The UV
 *    margin protects bilinear filtering at mip 0 and nothing beyond it.
 * 3. **A replaced `aomap_fragment`, not `aoMapIntensity`.** three's chunk lerps from 1 toward
 *    the texel, so it is capped at 1 and can only darken; the correction is `V / mean(V)`, which
 *    exceeds 1 wherever a surface sees more sky than the room's average. `aoMapIntensity` is a
 *    different curve and cannot express it (`v0.31.7.17`).
 * 4. **`customProgramCacheKey`.** Without it three reuses a program compiled from the unpatched
 *    chunk and the patch silently does nothing.
 * 5. **Diffuse only.** Attenuating `indirectSpecular` as well is physically tempting — a surface
 *    that cannot see the sky cannot reflect it — and measured *worse* (1.51× against 1.36×).
 *
 * **Call this where the material is built, never on a live material.** Adding an `aoMap` compiles
 * a new shader variant: ~19 extra programs across a plan, and doing it mid-session cost a
 * **216 ms** frame (`v0.31.7.15`). A flag that toggles this at runtime will stutter; read the flag
 * at construction. Steady-state cost is nil — measured 60 fps unchanged at `performance` and
 * `medium` with 331 distinct maps attached.
 */
import type { MeshStandardMaterial, Texture } from 'three'
import { LinearFilter } from 'three'

/**
 * The gain relating the app's artistic fill to physical visibility.
 *
 * **Fitted, not derived.** `1 / mean(V)` looks principled and is scope-dependent by 2.7× —
 * averaging over a whole plan gives 4.81, over just the in-view surfaces 13.12 (`v0.31.7.27`).
 * It is only well-defined if you know which surfaces the fill was calibrated against, and a fill
 * chosen to look right has no such definition. So this is measured against the Cycles reference:
 * 6 minimises the spatial mismatch, and the fit is stable across very different crops (1.36× and
 * 1.39×).
 */
export const VISIBILITY_GAIN = 6

/**
 * Gain for an **irradiance** set in `'replace'` mode — a different quantity from
 * {@link VISIBILITY_GAIN}, kept separate even though it currently holds the same number.
 *
 * **Why the separation is still right.** `VISIBILITY_GAIN`'s fit describes a dimensionless [0,1]
 * occlusion ratio that MULTIPLIES the app's fill. An irradiance map IS the light and stands in for
 * the fill, so its factor is a unit conversion. The two are independent and either may move.
 *
 * **⚠️ `v0.31.7.183` set this to 3.59 and that was WRONG — corrected in `v0.31.7.184`.** The 3.59
 * came from inverting a rendered radiance to irradiance as `E = R * pi / rho`, taking `rho` from
 * `material.color`. But these materials carry a **base-colour map**, so the shader's
 * `diffuseColor` is `color * texture(map)` and the true albedo is well below `material.color`.
 * Dividing by the wrong albedo understated the required gain, and the same mistake produced
 * `.183`'s claim that 6 "would over-brighten by 50–87 %". It does not.
 *
 * **Fitted instead in DISPLAY space against Cycles references, which needs no albedo and no curve
 * inversion** — the two assumptions that have gone wrong repeatedly in this thread. Three surfaces,
 * each against a reference at its own pose, `TONE=neutral` on both sides:
 *
 * | gain | floor (target 160.3) | wall (196.4) | ceiling (192.6) |
 * | --- | --- | --- | --- |
 * | 3.59 | 135.0 | 160.3 | 59.4 |
 * | **6** | **156.5** | 184.0 | 85.7 |
 * | 9 | 172.9 — over | 190.6 | 109.3 |
 * | 14 | 189.4 — over | 194.0 | 138.4 |
 *
 * **The floor is the binding constraint**: it lands within 2 % at 6 and overshoots beyond it, while
 * the wall is still 6 % short and the ceiling 55 % short. Nothing overshoots at 6, and a surface
 * pushed past its reference is a worse error than one left short of it.
 *
 * **What that leaves.** The ceiling cannot be reached by ANY gain without blowing the floor past its
 * reference, so a residual spatial error remains after the glazing fix (`.182` closed the bake's
 * ceiling/wall ratio from 0.92 to 1.48 against a reference 2.18 — most of the way, not all). That
 * is the next thing to chase, and it is a bake-side question, not a gain.
 */
export const IRRADIANCE_GAIN = 6

/**
 * The mean visibility of the plan `VISIBILITY_GAIN` was fitted against (the 4-Room default).
 *
 * Only the *ratio* to another plan's mean is used, so this is a unit-carrying reference rather
 * than a tuned number: a plan whose surfaces see more sky needs proportionally less gain. The
 * 5-Room plan measures 0.355 against this 0.208, and applying the unscaled gain to it made its
 * spatial match worse (1.53× → 2.25×, `v0.31.7.44`).
 */
const VISIBILITY_REFERENCE_MEAN = 0.20809

/** The gain to use for a plan whose area-weighted mean visibility is `mean`. */
export function gainForPlanMean(mean: number | undefined): number {
  if (!mean || mean <= 0) return VISIBILITY_GAIN
  return VISIBILITY_GAIN * (VISIBILITY_REFERENCE_MEAN / mean)
}

/** three's chunk that writes the final colour. Replaced only by the DEV visualiser. */
const OUTPUT_INCLUDE = '#include <opaque_fragment>'
/** Where the indirect-diffuse term is available to modify. */
const LIGHTS_END = '#include <lights_fragment_end>'

/**
 * Prepare a texture as a visibility map. Idempotent, so a shared texture is safe.
 *
 * **No `channel` is set, because the map no longer goes through three's `aoMap` slot** — the
 * shader below declares its own sampler and its own `uv1` varying. See
 * `applyVisibilityLightmap` for why.
 */
export function prepareVisibilityTexture(texture: Texture): Texture {
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

/**
 * Attach `texture` to `material` as a gained visibility map, via a **self-contained shader
 * injection** rather than three's `aoMap` slot.
 *
 * **Why not `aoMap`.** It was the obvious slot and it does not work here. Routed through it, the
 * mapped materials compiled **without `USE_AOMAP`** — proven by painting the sampled value out as
 * the fragment colour with a sentinel for "branch never ran": the mapped walls came back
 * **magenta** (`v0.31.7.36`). three derives that define from `!!material.aoMap` *at program-build
 * time* and pairs it with an `aoMapUv` channel parameter and a matching vertex attribute, and
 * something in that chain does not hold for a map attached after the material exists. Nine
 * hypotheses were eliminated chasing it.
 *
 * So this stops depending on that chain. It declares its own `visMap` sampler, its own `visGain`
 * uniform, and its own `uv1` attribute → varying, and multiplies `reflectedLight.indirectDiffuse`
 * immediately after `lights_fragment_end`. Nothing here is conditional on a three define, so
 * there is no branch that can be compiled out. It is more code than a slot assignment and it is
 * the code that runs.
 *
 * **Diffuse only** — attenuating `indirectSpecular` too is physically tempting and measured
 * *worse* (1.51× against 1.36×).
 *
 * **Call this where the material is built, never on a live material.** Adding the injection
 * compiles a new shader variant — ~19 across a plan — and doing it mid-session cost a measured
 * **216 ms** frame (`v0.31.7.15`). Steady-state cost is nil: 60 fps unchanged at `performance`
 * and `medium` with 331 distinct maps attached.
 */
/**
 * How a baked map enters the shading.
 *
 * - `'multiply'` — `indirectDiffuse *= map * gain`. Correct for a *visibility*
 *   map, which is a dimensionless [0,1] occlusion ratio: it modulates the fill the
 *   app already computes.
 * - `'replace'` — `indirectDiffuse = map * gain`. Required for an *irradiance*
 *   map, which is the light itself. `v0.31.7.67` measured that multiplying by
 *   irradiance is **worse** than multiplying by visibility (+58 % vs +79 % on the
 *   one view where either helps), which is exactly what double-counting looks
 *   like: the app's ambient/hemisphere fill is still there, and the map scales it
 *   instead of standing in for it.
 *
 * The map fed to `'replace'` must be **indirect-only** — `bake_material.py
 * --pass irradiance` bakes it that way by default, because the app computes
 * direct sun itself and a baked direct term would be double-counted in turn.
 */
export type LightmapMode = 'multiply' | 'replace'

export function applyVisibilityLightmap(
  material: MeshStandardMaterial,
  texture: Texture,
  gain: number = VISIBILITY_GAIN,
  /**
   * DEV visualiser: write the sampled value out as the fragment colour instead of shading, with
   * magenta for "never sampled". Every *indirect* measurement of this term was exhausted before
   * it existed, and it found the fault in one frame. Not a feature: unusable by design.
   */
  debug = false,
  mode: LightmapMode = 'multiply',
): void {
  const map = prepareVisibilityTexture(texture)
  material.onBeforeCompile = (shader) => {
    shader.uniforms.visMap = { value: map }
    shader.uniforms.visGain = { value: gain }
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute vec2 uv1;\nvarying vec2 vVisUv;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvVisUv = uv1;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform sampler2D visMap;\nuniform float visGain;\nvarying vec2 vVisUv;\n' +
          `${debug ? 'float visDebug = -1.0;\n' : ''}void main() {`,
      )
      .replace(
        LIGHTS_END,
        `${LIGHTS_END}\n\tfloat visOcclusion = texture2D( visMap, vVisUv ).r;\n` +
          (mode === 'replace'
            ? // The map IS the incoming light, so it stands in for the fill rather
              // than scaling it -- anything already accumulated into
              // `indirectDiffuse` (ambient + hemisphere + IBL) is discarded on
              // purpose, because keeping it is the double-count `.67` measured.
              //
              // But `indirectDiffuse` is NOT irradiance. Read from three's own
              // source: `RE_IndirectDiffuse_Physical` computes
              // `irradiance * BRDF_Lambert( material.diffuseContribution )`, i.e.
              // irradiance x albedo/PI. Assigning a bare grey value therefore
              // ERASES ALBEDO on every mapped surface -- a dark floor and a white
              // wall get the same number. So the map goes through the same Lambert
              // BRDF three would have applied.
              //
              // `material.diffuseColor`, NOT `diffuseContribution`. Only
              // `PhysicalMaterial` declares the latter -- `BlinnPhongMaterial` and
              // `ToonMaterial` do not -- and this injection is applied to whatever
              // material a baked mesh happens to carry. Referencing a
              // physical-only field made the program fail to compile
              // (`VALIDATE_STATUS false`), and a failed program renders as if the
              // term were zero, which is indistinguishable from a real result:
              // `v0.31.7.90`-`.92`'s app-side numbers were all that failure.
              // `diffuseColor` exists in every struct. For physical materials
              // three's own path uses `diffuseContribution`, which additionally
              // accounts for transmission/sheen energy, so this is a slight
              // simplification -- and a compiling one.
              '\treflectedLight.indirectDiffuse = visOcclusion * visGain * BRDF_Lambert( material.diffuseColor );'
            : '\treflectedLight.indirectDiffuse *= visOcclusion * visGain;') +
          (debug ? '\n\tvisDebug = visOcclusion;' : ''),
      )
    if (debug) {
      shader.fragmentShader = shader.fragmentShader.replace(
        OUTPUT_INCLUDE,
        'gl_FragColor = visDebug < 0.0\n' +
          '  ? vec4( 1.0, 0.0, 1.0, 1.0 )\n' +
          '  : vec4( vec3( clamp( visDebug, 0.0, 1.0 ) ), 1.0 );',
      )
    }
  }
  // Encodes the gain and the debug mode, so two variants cannot share one cached program.
  // Mode is in the key: `replace` and `multiply` are different programs, and a
  // constant key already collapsed two variants once (`v0.31.7.44`).
  material.customProgramCacheKey = () => `visGain${gain}:${mode}${debug ? ':dbg' : ''}`
  // Marked so it can be found and DETACHED again. Materials outlive a plan change -- they are
  // shared/cached across plans -- so a re-run that only adds maps leaves the previous plan's
  // visibility on any material the new plan reuses (`v0.31.7.45`).
  material.userData.visLightmap = true
  if (import.meta.env.DEV) {
    // DEV-only handle so a probe can check the texture actually LOADED, not just
    // that the injection ran. `v0.31.7.93`: three irradiance bakes produced
    // identical statistics because the fetch had failed and `replace` was
    // assigning zero -- indistinguishable, from outside, from a real result.
    ;(material as unknown as { __visMapForProbe?: unknown }).__visMapForProbe = map
  }
  material.needsUpdate = true
}

/**
 * Remove a visibility lightmap from a material, restoring three's own shading.
 *
 * Needed because **materials survive a plan change**. The maps are per-plan, so re-running the
 * apply pass without first detaching leaves the old plan's visibility attached to every material
 * the new plan happens to reuse — which is indistinguishable from the feature working, and was
 * measured as a plan-2 result that did not move across three different code states.
 *
 * Restores rather than nulls: `onBeforeCompile` and `customProgramCacheKey` are three's own
 * no-op/default when untouched, so putting those back is what actually returns the material to
 * its stock program.
 */
export function detachVisibilityLightmap(material: MeshStandardMaterial): boolean {
  if (!material.userData?.visLightmap) return false
  material.onBeforeCompile = () => {}
  // Deleting restores `Material.prototype.customProgramCacheKey`, which is what three uses when
  // a material has not overridden it. Assigning `undefined` would break that lookup.
  delete (material as { customProgramCacheKey?: unknown }).customProgramCacheKey
  delete material.userData.visLightmap
  material.needsUpdate = true
  return true
}
