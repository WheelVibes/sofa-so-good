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

/** three's `aomap_fragment` include, replaced wholesale — see requirement 3. */
const AOMAP_INCLUDE = '#include <aomap_fragment>'
/** three's final colour write. Replaced only by the DEV visualiser below. */
const OUTPUT_INCLUDE = '#include <opaque_fragment>'

/**
 * Prepare a texture as a visibility map. Idempotent, so a shared texture is safe.
 *
 * Exported separately because a map may be prepared once and attached to several materials, and
 * the channel/mipmap settings live on the *texture* rather than the material.
 */
export function prepareVisibilityTexture(texture: Texture): Texture {
  texture.channel = 1
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
  // `flipY` is deliberately LEFT AT three's default (`true`). Tested: forcing `false` changes
  // the render materially — frame mean 99.8 → 84.7, spatial spread 4.75× → 6.77× — so the V
  // orientation is load-bearing, and `true` is the correct one. Recorded because "it looked
  // like it might be flipped" is a tempting and wrong change to make twice.
  texture.needsUpdate = true
  return texture
}

/**
 * Attach `texture` to `material` as a gained visibility map.
 *
 * `gain` defaults to the fitted `VISIBILITY_GAIN`; pass another only to measure.
 */
export function applyVisibilityLightmap(
  material: MeshStandardMaterial,
  texture: Texture,
  gain: number = VISIBILITY_GAIN,
  /**
   * DEV visualiser: write the sampled occlusion value out as the fragment colour instead of
   * shading. Exists because every *indirect* measurement of this term has been exhausted — the
   * texture, UVs, channel, gain and compiled program are all verified correct, yet the wired
   * render darkens uniformly instead of spatially (`v0.31.7.35`). Showing the shader's own view
   * of the map is the only thing left that looks at it directly rather than inferring.
   *
   * Not a feature: it makes the scene unusable by design.
   */
  debug = false,
): void {
  material.aoMap = prepareVisibilityTexture(texture)
  // Left at 1 deliberately: the intensity lerp is bypassed entirely by the patch below, and a
  // value other than 1 would silently do nothing, which is worse than being ignored.
  material.aoMapIntensity = 1
  material.onBeforeCompile = (shader) => {
    shader.uniforms.aoGain = { value: gain }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform float aoGain;\n${debug ? 'vec4 aoDebugValue = vec4( -1.0 );\n' : ''}void main() {`,
      )
      .replace(
        OUTPUT_INCLUDE,
        debug
          ? // `aoDebugValue` is seeded to a sentinel and only written inside the USE_AOMAP
            // block, so a surface that never sampled the map shows magenta rather than black —
            // "no map here" and "map reads zero" must not look the same.
            'gl_FragColor = aoDebugValue.x < 0.0\n' +
              '  ? vec4( 1.0, 0.0, 1.0, 1.0 )\n' +
              '  : vec4( vec3( clamp( aoDebugValue.x, 0.0, 1.0 ) ), 1.0 );'
          : OUTPUT_INCLUDE,
      )
      .replace(
        AOMAP_INCLUDE,
        // KEEP three's `#ifdef USE_AOMAP` guard. Replacing the include wholesale removes it,
        // and the injected code then compiles into programs where three never declared the
        // `aoMap` uniform or the `vAoMapUv` varying -- which fails with
        // `'aoMap' : undeclared identifier` and drops the material to a default shader, so the
        // render changes for the WRONG reason (measured: frame mean 46.7 instead of 72.4, and
        // the spatial match got worse than baseline).
        '#ifdef USE_AOMAP\n' +
          '  float ambientOcclusion = texture2D( aoMap, vAoMapUv ).r * aoGain;\n' +
          '  reflectedLight.indirectDiffuse *= ambientOcclusion;\n' +
          (debug ? '  aoDebugValue = vec4( texture2D( aoMap, vAoMapUv ).r );\n' : '') +
          '#endif',
      )
  }
  // The cache key must encode whether this material HAS a map, not just the gain. Measured:
  // with a constant key, three served 15 draw calls a program compiled with the patch but
  // WITHOUT `USE_AOMAP` defined — so the guarded code was preprocessed out and those surfaces
  // got no attenuation at all, which is why the wired path delivered ~40 % of the effect the
  // same maps produced through the probe (`v0.31.7.32`–`.34`). Two genuinely different program
  // variants must not collapse into one cache entry.
  material.customProgramCacheKey = () =>
    `aoGain${gain}:${material.aoMap ? 1 : 0}${debug ? ':dbg' : ''}`
  material.needsUpdate = true
}
