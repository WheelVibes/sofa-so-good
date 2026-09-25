/**
 * Box-projected (parallax-corrected) specular probe injection — the shader half of ROOM-PROBES
 * (R7-L).
 *
 * ## PINNED TO three r184 (`three@0.184.0`, the version in `package.json`).
 *
 * This is a `ShaderChunk` replacement, and that is the single most version-fragile thing you can
 * do to three. The upstream WebGL example this technique comes from
 * ([PR #15897](https://github.com/mrdoob/three.js/pull/15897), 2019) broke against chunk churn
 * ([issue #18111](https://github.com/mrdoob/three.js/issues/18111), 2019) and was eventually
 * **deleted from the repository**: it is present in the `examples/` listing at `r131` and gone by
 * `r133` (verified against the GitHub contents API, 2026-09-25). The only maintained upstream
 * implementation today is `webgpu_materials_envmaps_bpcem` — TSL nodes, WebGPU only, i.e. not a
 * path this app can take (the WebGPU verdict is §6 of `docs/research/sota-2026-09-25.md`).
 *
 * So the r129 example's code is **not** reusable verbatim, and the copy below was re-derived
 * against the installed chunk. Three things changed upstream since:
 *
 * 1. The functions are now `getIBLIrradiance` / `getIBLRadiance`, not
 *    `getLightProbeIndirect*`.
 * 2. `ENVMAP_TYPE_CUBE` is gone from the physical path — the only surviving branch is
 *    `ENVMAP_TYPE_CUBE_UV` (PMREM), and the r129 example patched *only* the `CUBE` branch, so
 *    pasting it into a modern build silently does nothing.
 * 3. `envMapRotation` now multiplies the lookup vector.
 *
 * **If you bump three, re-diff `envmap_physical_pars_fragment.glsl.js`.**
 * `boxProjectEnv.test.ts` asserts the installed chunk still contains the exact strings this
 * module rewrites, so a bump that changes them fails a unit test instead of a screenshot.
 *
 * ## Why only `getIBLRadiance`
 *
 * **The lightmap already contains the diffuse bounce.** `visibilityLightmap.ts` runs in
 * `replace` mode: it *assigns* `reflectedLight.indirectDiffuse` from the Cycles bake and
 * deliberately discards ambient + hemisphere + IBL. Feeding a second, darker, per-room
 * irradiance into the diffuse path would move the calibrated patches `IRRADIANCE_GAIN` is
 * pinned to — the `(z)5` double-count, wearing a new hat.
 *
 * The guarantee here is structural, not a tuning choice: this patch **does not touch
 * `getIBLIrradiance`, and does not touch `material.envMap`**. The room probe arrives on its own
 * sampler (`roomProbeMap`) that only the specular function reads. Diffuse keeps sampling the
 * global probe through byte-identical source. There is no value of `roomProbeMix` that can leak
 * diffuse, because the diffuse code cannot see the room probe at all.
 *
 * A pleasant consequence of leaving `material.envMap === null`: three keeps assigning
 * `envMapIntensity = scene.environmentIntensity` for us (`WebGLRenderer.js:2688`, r184), so the
 * room probe rides the day curve, the curtain attenuation and the weather grade exactly as the
 * global probe does, with no second plumbing.
 *
 * ## The CubeUV size constraint (the non-obvious one)
 *
 * `textureCubeUV` reads `CUBEUV_TEXEL_WIDTH` / `CUBEUV_TEXEL_HEIGHT` / `CUBEUV_MAX_MIP`, which
 * three emits as **preprocessor macros** derived from the bound `envMap`
 * (`WebGLProgram.js:691-693`). One program therefore has one set of atlas constants, so the room
 * probe's PMREM must have the SAME dimensions as the global probe's. `PMREMGenerator` rounds its
 * source down to a power of two (`_cubeSize = 2^floor(log2(size))`), so the requirement is
 * `2^floor(log2(roomProbeResolution)) === 2^floor(log2(envResolution))` — pinned in
 * `quality.test.ts`, which is why `roomProbeResolution` is 128 where `envResolution` is 192.
 */

/** Uniform names this injection adds. Exported so the attach side cannot typo one. */
export const ROOM_PROBE_UNIFORMS = {
  map: 'roomProbeMap',
  boxMin: 'roomProbeBoxMin',
  boxMax: 'roomProbeBoxMax',
  center: 'roomProbeCenter',
  mix: 'roomProbeMix',
} as const

/** The vertex chunk the patch rewrites. */
export const WORLDPOS_INCLUDE = '#include <worldpos_vertex>'

/** The fragment chunk the patch rewrites. */
export const ENVMAP_PHYSICAL_INCLUDE = '#include <envmap_physical_pars_fragment>'

/** Varying carrying the fragment's world position into the projection. */
const VARYING = 'vRoomProbeWorldPos'

/**
 * Vertex-side replacement for `#include <worldpos_vertex>`.
 *
 * `worldPosition` is declared by that chunk only under a `#if` that includes `USE_ENVMAP`, and
 * this material is only ever patched while an environment exists — but a tier demotion can
 * recompile it without one, and a vertex shader that fails to compile renders nothing at all.
 * The `#else` recomputes it from `transformed`, which every path defines.
 */
export const worldPosVertexReplacement = `${WORLDPOS_INCLUDE}
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined( USE_SHADOWMAP ) || defined( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	${VARYING} = worldPosition.xyz;
#else
	${VARYING} = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
#endif`

/**
 * Fragment-side replacement for `#include <envmap_physical_pars_fragment>`.
 *
 * A verbatim copy of the r184 chunk with exactly one function changed. Copied rather than
 * string-surgeried on purpose: a `.replace()` against three's own body is what breaks silently
 * on a version bump, whereas a copy that has drifted is caught by `boxProjectEnv.test.ts`
 * comparing this file's expectations against the installed chunk.
 */
export const envmapPhysicalParsReplacement = `
#ifdef USE_ENVMAP

	uniform sampler2D ${ROOM_PROBE_UNIFORMS.map};
	uniform vec3 ${ROOM_PROBE_UNIFORMS.boxMin};
	uniform vec3 ${ROOM_PROBE_UNIFORMS.boxMax};
	uniform vec3 ${ROOM_PROBE_UNIFORMS.center};
	uniform float ${ROOM_PROBE_UNIFORMS.mix};
	varying vec3 ${VARYING};

	// Lagarde & Zanuttini, SIGGRAPH 2012 Talks: re-intersect the reflection ray with the room's
	// proxy AABB and re-aim it from the cubemap's capture point, so a cubemap taken at one spot
	// stays correct as the camera walks the room.
	vec3 roomProbeCorrect( const in vec3 dir ) {

		vec3 nDir = normalize( dir );
		// Sign-preserving epsilon. A ray exactly parallel to an axis divides by zero; one
		// infinity in the min() is harmless, a NaN would poison the whole fragment.
		vec3 sDir = nDir + ( 1.0 - step( vec3( 1e-5 ), abs( nDir ) ) ) * 1e-5;
		vec3 tMax = ( ${ROOM_PROBE_UNIFORMS.boxMax} - ${VARYING} ) / sDir;
		vec3 tMin = ( ${ROOM_PROBE_UNIFORMS.boxMin} - ${VARYING} ) / sDir;
		vec3 tBound = mix( tMin, tMax, step( vec3( 0.0 ), sDir ) );
		// A fragment outside its own box (a mesh assigned by centroid that overhangs) would get a
		// negative hit and sample the far side of the room.
		float t = max( min( min( tBound.x, tBound.y ), tBound.z ), 0.0 );
		return ( ${VARYING} + nDir * t ) - ${ROOM_PROBE_UNIFORMS.center};

	}

	// UNCHANGED from three r184. The lightmap owns diffuse; this must never be touched.
	vec3 getIBLIrradiance( const in vec3 normal ) {

		#ifdef ENVMAP_TYPE_CUBE_UV

			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );

			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );

			return PI * envMapColor.rgb * envMapIntensity;

		#else

			return vec3( 0.0 );

		#endif

	}

	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {

		#ifdef ENVMAP_TYPE_CUBE_UV

			vec3 reflectVec = reflect( - viewDir, normal );

			// Mixing the reflection with the normal is more accurate and keeps rough objects from gathering light from behind their tangent plane.
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );

			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );

			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );

			// ROOM-PROBES. A runtime mix on a uniform, not an #ifdef: at 0 this is the shipped
			// render bit-for-bit, and the program cache key does not move with the blend.
			// No envMapRotation on the room lookup — the probe is captured in world space.
			vec4 roomColor = textureCubeUV( ${ROOM_PROBE_UNIFORMS.map}, roomProbeCorrect( reflectVec ), roughness );
			envMapColor = mix( envMapColor, roomColor, ${ROOM_PROBE_UNIFORMS.mix} );

			return envMapColor.rgb * envMapIntensity;

		#else

			return vec3( 0.0 );

		#endif

	}

	#ifdef USE_ANISOTROPY

		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {

			#ifdef ENVMAP_TYPE_CUBE_UV

			  // https://google.github.io/filament/Filament.md.html#lighting/imagebasedlights/anisotropy
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );

				return getIBLRadiance( viewDir, bentNormal, roughness );

			#else

				return vec3( 0.0 );

			#endif

		}

	#endif

#endif
`

/** Prefix added to the vertex shader so the varying is declared before `main`. */
const vertexVaryingDeclaration = `varying vec3 ${VARYING};\n`

/**
 * Apply the two replacements to a shader pair. Pure string work, so a unit test can assert the
 * result without a GL context.
 *
 * Returns `null` when either anchor is missing, which is the three-bumped-and-moved-the-chunk
 * case: the caller then leaves the material alone rather than shipping a shader that compiles to
 * something unintended.
 */
export function patchBoxProjectedEnv(shader: {
  vertexShader: string
  fragmentShader: string
}): { vertexShader: string; fragmentShader: string } | null {
  if (!shader.vertexShader.includes(WORLDPOS_INCLUDE)) return null
  if (!shader.fragmentShader.includes(ENVMAP_PHYSICAL_INCLUDE)) return null
  return {
    vertexShader:
      vertexVaryingDeclaration +
      shader.vertexShader.replace(WORLDPOS_INCLUDE, worldPosVertexReplacement),
    fragmentShader: shader.fragmentShader.replace(
      ENVMAP_PHYSICAL_INCLUDE,
      envmapPhysicalParsReplacement,
    ),
  }
}
