import type { Material } from 'three'

/**
 * CURTAIN-TRANSLUCENCY — diffuse forward scattering for drapery, as a shader
 * chunk.
 *
 * `.198` measured the app's drawn curtain at **0.69** of frame mean where the
 * reference photographs put a backlit curtain at **1.32–1.48**: it is the
 * brightest large surface in a real room, because daylight passes through cloth.
 * `.199` then built and refuted the two cheap stand-ins:
 *
 * - an **emissive** term reaches the ratio (1.33 at gain 1.6) and destroys the
 *   fabric — absolute micro-sd 4.10 → 2.62. Plain drapery carries `map: null`,
 *   so ALL of its detail is `normalMap`, and emissive is added after shading
 *   with no normal information, diluting exactly that signal.
 * - `transmission` buys 0.10 of ratio against the 0.63 needed, still costs a
 *   third of the weave, and adds a render pass. Three's transmission is
 *   SPECULAR refraction; cloth is a diffuse transmitter.
 *
 * Both fail the same way: the camera sees the FRONT face while the light is
 * BEHIND it, and a standard material's front face receives nothing at
 * `N·L < 0`. So the term has to be one that responds to the normal — then a
 * doubled fold, whose normal points elsewhere, stays darker, which is exactly
 * why a photographed backlit curtain is bright AND keeps its folds.
 *
 * This adds back-side irradiance to `irradiance` just before `RE_IndirectDiffuse`
 * consumes it, so it is modulated by the material's own diffuse colour and takes
 * the same path as every other diffuse term:
 *
 * - **punctual**: `saturate(-dot(N, L))` per directional light — the sun seen
 *   through the cloth.
 * - **environment**: `getIBLIrradiance(-N)`, which is what actually carries a
 *   north-facing window, where the sun never strikes the glass directly and the
 *   sky is the whole of the backlight. Where there is no env map — the
 *   `performance` tier, i.e. what the capability veto hands most phones — it
 *   falls back to the hemisphere light, which exists at every tier. Without that
 *   fallback the term measured **1.17** there against a 1.32–1.48 band while the
 *   other three tiers sat at 1.35–1.48; with it, **1.42** (`.220`).
 *
 * `customProgramCacheKey` is REQUIRED alongside `onBeforeCompile`: three caches
 * programs by material type + defines, so without it a patched and an unpatched
 * material of the same type share one compiled program and whichever compiled
 * first wins.
 */

/** Injected once; the value is set per material from `look.ts`. */
const UNIFORM = 'uDrapeTranslucency'

export interface DrapeShaderPatch {
  /** The uniform three will upload; mutate `.value` to retune without a rebuild. */
  uniform: { value: number }
}

/**
 * Patch a drapery material so it scatters light forward.
 *
 * Returns the uniform holder so a caller can drive the strength per frame; the
 * material is mutated in place. Safe to call on a cached material once — calling
 * it twice would stack two `onBeforeCompile` hooks, so callers key it off their
 * own cache.
 */
export function applyDrapeTranslucency(material: Material, strength: number): DrapeShaderPatch {
  const uniform = { value: strength }
  // Drapery materials carry no other patch today, so this deliberately REPLACES
  // rather than chains: chaining needs the previous hook's exact parameter tuple,
  // and a wrong guess there silently drops the earlier patch instead of failing.
  material.onBeforeCompile = (shader) => {
    shader.uniforms[UNIFORM] = uniform
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `uniform float ${UNIFORM};\n#include <common>`)
      .replace(
        '#include <lights_fragment_end>',
        `${backsideChunk()}\n#include <lights_fragment_end>`,
      )
  }
  // Without this every drapery material shares one program with unpatched
  // fabric of the same type, and the first one compiled wins.
  material.customProgramCacheKey = () => `drape-translucency-${strength.toFixed(3)}`
  material.needsUpdate = true
  return { uniform }
}

/**
 * The injected GLSL. Kept as a function so the test can assert on it without
 * compiling a shader, and so the guards are visible rather than buried.
 *
 * `geometryNormal` is three's own shading normal at this point (already
 * normal-mapped and front-facing corrected), which is what makes the term follow
 * the weave rather than the flat panel.
 */
export function backsideChunk(): string {
  return `
	// CURTAIN-TRANSLUCENCY: light arriving on the FAR side of the cloth, scattered
	// forward. Normal-responsive, so folds stay readable — see drapeTranslucency.ts.
	{
		vec3 backNormal = -geometryNormal;
		vec3 backIrradiance = vec3( 0.0 );
		#if ( NUM_DIR_LIGHTS > 0 )
			#pragma unroll_loop_start
			for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
				backIrradiance += saturate( dot( backNormal, directionalLights[ i ].direction ) ) * directionalLights[ i ].color;
			}
			#pragma unroll_loop_end
		#endif
		#ifdef USE_ENVMAP
			backIrradiance += getIBLIrradiance( backNormal );
		#elif ( NUM_HEMI_LIGHTS > 0 )
			// The performance tier has no IBL, so without this the term collapses to
			// the directional light alone -- measured 1.17 against a 1.32-1.48 band
			// while the other three tiers sat at 1.35-1.48 (.220). The hemisphere is
			// the app's ambient model at EVERY tier. (An earlier attempt at this in
			// .214 measured nothing because that probe was rendering the orbit
			// dollhouse; see .218.)
			// NOTE: no backticks in this GLSL -- it lives inside a template literal.
			backIrradiance += getHemisphereLightIrradiance( hemisphereLights[ 0 ], backNormal );
		#endif
		irradiance += backIrradiance * ${UNIFORM};
	}
`
}
