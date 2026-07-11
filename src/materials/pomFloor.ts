/**
 * PHOTO-POM — parallax-occlusion mapping on hero floors.
 *
 * A big step up from normal maps on the geometric floor finishes: instead of
 * only shading grout/joints as if recessed (a normal-map fake that stays flat as
 * you move), POM ray-marches the pattern's OWN height field in the fragment
 * shader so the grout genuinely RECEDES and occludes the tile faces as the
 * camera moves. It reuses the exact relief the procedural pattern already
 * computes to derive its normals (see `generateProceduralHeightTexture`) — no
 * new/bespoke texture art (repo rule).
 *
 * Cost & gating:
 *  - The ray-march is GPU-expensive, so it is gated to **High / Maximum** tiers
 *    (`pomStepsForTier` → Performance / Medium return 0 steps = NO POM, and the
 *    floor keeps the plain shared procedural material, byte-identical to before).
 *  - Steps scale by tier (High ~16, Max ~32).
 *  - Only patterns with real recessed grout / joints are eligible (tile, hexagon,
 *    subway, checker, brick, parquet, herringbone). Smooth patterns (carpet,
 *    concrete, marble, wood-planks, …) have no crisp relief to recess and are
 *    left on the normal-map path.
 *
 * The pure decision helpers (eligibility / steps / height-scale) are separated
 * from the three.js material construction below so they unit-test without a WebGL
 * context (`pomFloor.test.ts`).
 *
 * Shader integration: a self-contained `onBeforeCompile` patch of the stock
 * `MeshStandardMaterial` shader (three r184) that offsets the shared floor UV
 * (`vMapUv` == `vNormalMapUv` == `vRoughnessMapUv`, one UV channel) via a
 * steep-parallax + occlusion ray-march before the map / roughness / normal
 * samples. It touches ONLY those UV lookups — sun/VSM shadows, the envMap/IBL
 * probe and every other feature compose unchanged. Chunk bodies below are copied
 * verbatim from three r184 with the UV varying swapped for the marched `pomUv`;
 * re-verify them on a three upgrade. Ray-march reference: LearnOpenGL "Parallax
 * Mapping" (steep parallax + occlusion interpolation) with a Schüler cotangent
 * frame (no precomputed tangents) for the tangent-space view vector.
 */
import { MeshStandardMaterial, RepeatWrapping, type Texture } from 'three'
import type { RenderTier } from '../scene/quality'
import { applyAnisotropy } from './anisotropy'
import { LruCache } from './materialLru'
import { generateProcedural, generateProceduralHeightTexture } from './procedural/generators'
import type { ProceduralMaterialDef, ProceduralPattern } from './types'

/** Geometric floor patterns whose height field has real recessed grout / joints
 *  worth ray-marching. Smooth / noise patterns are excluded (nothing to recess). */
export const POM_ELIGIBLE_PATTERNS: readonly ProceduralPattern[] = [
  'tile',
  'hexagon',
  'subway',
  'checker',
  'brick',
  'parquet',
  'herringbone',
]

export function pomEligiblePattern(pattern: ProceduralPattern): boolean {
  return POM_ELIGIBLE_PATTERNS.includes(pattern)
}

/** POM runs on High / Maximum only (shader ray-march cost). Performance / Medium
 *  stay on the flat normal-map path — byte-identical to before. */
export function pomFloorTierEnabled(tier: RenderTier): boolean {
  return tier === 'high' || tier === 'maximum'
}

/** Ray-march step budget for a tier: 0 disables POM (Performance / Medium), High
 *  ~16, Maximum ~32 (finer relief, more cost). */
export function pomStepsForTier(tier: RenderTier): number {
  switch (tier) {
    case 'maximum':
      return 32
    case 'high':
      return 16
    default:
      return 0
  }
}

/** Per-pattern parallax depth scale (in UV units) — how deep the grout / joint
 *  recesses. Tuned per family: chunky brick joints deepest, thin tile grout
 *  shallowest. At a floor `uvScale` of ~0.6 m/tile a 0.03 scale ≈ ~1.8 cm of
 *  apparent grout recession, realistic for ceramic. */
const POM_HEIGHT_SCALE: Partial<Record<ProceduralPattern, number>> = {
  tile: 0.03,
  hexagon: 0.03,
  subway: 0.028,
  checker: 0.022,
  brick: 0.04,
  parquet: 0.02,
  herringbone: 0.02,
}

export function pomHeightScaleForPattern(pattern: ProceduralPattern): number {
  return POM_HEIGHT_SCALE[pattern] ?? 0.03
}

/** Whether a procedural floor finish earns POM right now: flag on + a tier that
 *  can afford the ray-march + an eligible grout-relief pattern. Pure. */
export function pomFloorEligible(
  pattern: ProceduralPattern,
  tier: RenderTier,
  flagEnabled: boolean,
): boolean {
  return flagEnabled && pomFloorTierEnabled(tier) && pomEligiblePattern(pattern)
}

// ── three.js shader injection (r184) ───────────────────────────────────────

/** Steep-parallax + occlusion ray-march. Declared just before `main()` so the
 *  `vNormal` / `vViewPosition` varyings it reads are already declared by three's
 *  `*_pars_fragment` includes above. Uses `POM_MAX_STEPS` / `POM_SCALE` defines
 *  injected per material (steps by tier, scale by pattern). Height convention:
 *  1 = tile face (top plane), 0 = grout → depth = 1 - height (grout is deepest). */
const POM_FRAG_HELPER = /* glsl */ `
uniform sampler2D pomHeightMap;
vec2 pomParallaxUv( vec2 uv ) {
  vec3 N = normalize( vNormal );
  vec3 V = normalize( vViewPosition ); // fragment -> camera (view space)
  // Schüler cotangent frame aligned to this UV set (no precomputed tangents).
  vec3 dpdx = dFdx( - vViewPosition ); // d(view-space position)/dx
  vec3 dpdy = dFdy( - vViewPosition );
  vec2 duvdx = dFdx( uv );
  vec2 duvdy = dFdy( uv );
  vec3 T = dpdx * duvdy.y - dpdy * duvdx.y;
  T = normalize( T - N * dot( N, T ) );
  vec3 B = normalize( cross( N, T ) );
  vec3 vts = vec3( dot( V, T ), dot( V, B ), dot( V, N ) );
  float nz = max( abs( vts.z ), 0.15 ); // clamp so grazing angles don't explode
  vec2 P = ( vts.xy / nz ) * POM_SCALE;
  float fSteps = float( POM_MAX_STEPS );
  float layerDepth = 1.0 / fSteps;
  vec2 dUv = P / fSteps;
  vec2 curUv = uv;
  float curDepth = 0.0;
  float mapDepth = 1.0 - texture2D( pomHeightMap, curUv ).r;
  for ( int i = 0; i < POM_MAX_STEPS; i ++ ) {
    if ( curDepth >= mapDepth ) break;
    curUv -= dUv;
    mapDepth = 1.0 - texture2D( pomHeightMap, curUv ).r;
    curDepth += layerDepth;
  }
  // Occlusion refinement: interpolate between the last two marched layers.
  vec2 prevUv = curUv + dUv;
  float after = mapDepth - curDepth;
  float before = ( 1.0 - texture2D( pomHeightMap, prevUv ).r ) - ( curDepth - layerDepth );
  float w = after / ( after - before );
  return mix( curUv, prevUv, clamp( w, 0.0, 1.0 ) );
}
`

/** r184 `map_fragment`, prefixed with the parallax UV solve (runs first, so the
 *  marched `pomUv` is in scope for the roughness + normal chunks below). */
const POM_MAP_FRAGMENT = /* glsl */ `
	vec2 pomUv = pomParallaxUv( vMapUv );
#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, pomUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif
`

/** r184 `roughnessmap_fragment` with the UV swapped for `pomUv`. */
const POM_ROUGHNESSMAP_FRAGMENT = /* glsl */ `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, pomUv );
	roughnessFactor *= texelRoughness.g;
#endif
`

/** r184 `normal_fragment_maps` with the UV swapped for `pomUv` (the tangent
 *  frame `tbn` from `normal_fragment_begin` is left as-is — it is the surface
 *  basis, independent of the sampled texel). */
const POM_NORMAL_FRAGMENT_MAPS = /* glsl */ `
#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, pomUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, pomUv ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif
`

/** Bounded cache of POM floor materials, keyed by finish id + step budget. Each
 *  entry OWNS its albedo / normal / roughness / height textures (a self-contained
 *  bake, independent of the shared `cache.ts` LRU) so eviction disposes them. */
const POM_CACHE = new LruCache<MeshStandardMaterial>({
  max: 24,
  dispose: (m) => {
    m.map?.dispose()
    m.normalMap?.dispose()
    m.roughnessMap?.dispose()
    ;(m.userData.pomHeightMap as Texture | undefined)?.dispose()
    m.dispose()
  },
})

/**
 * Build (or reuse) the parallax-occlusion floor material for a procedural finish
 * at a given tier. The caller must have already checked {@link pomFloorEligible}.
 * Self-contained: it bakes its own full-quality PBR maps + a height map, so it
 * does not depend on the shared procedural material staying resident.
 */
export function buildPomFloorMaterial(
  def: ProceduralMaterialDef,
  tier: RenderTier,
): MeshStandardMaterial {
  const steps = pomStepsForTier(tier)
  const scale = pomHeightScaleForPattern(def.pattern)
  const key = `${def.id}@pom@${steps}`
  const cached = POM_CACHE.get(key)
  if (cached) return cached

  const maps = generateProcedural(def.id, def.pattern, def.swatch)
  const height = generateProceduralHeightTexture(def.id, def.pattern, def.swatch)
  const rx = 1 / def.uvScale[0]
  const ry = 1 / def.uvScale[1]
  for (const t of [maps.albedo, maps.normal, maps.roughness, height]) {
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(rx, ry)
    applyAnisotropy(t)
  }

  const m = new MeshStandardMaterial({
    color: '#ffffff', // tint is baked into the albedo
    map: maps.albedo,
    normalMap: maps.normal,
    roughnessMap: maps.roughness,
    metalness: maps.metalness,
  })
  m.userData.pomHeightMap = height

  m.onBeforeCompile = (shader) => {
    shader.uniforms.pomHeightMap = { value: height }
    const defines = `#define POM_MAX_STEPS ${steps}\n#define POM_SCALE ${scale.toFixed(4)}\n`
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${defines}${POM_FRAG_HELPER}\nvoid main() {`)
      .replace('#include <map_fragment>', POM_MAP_FRAGMENT)
      .replace('#include <roughnessmap_fragment>', POM_ROUGHNESSMAP_FRAGMENT)
      .replace('#include <normal_fragment_maps>', POM_NORMAL_FRAGMENT_MAPS)
  }
  // Distinct program from the plain floor material (and shared across finishes
  // that resolve to the same steps + scale — same shader, only the height
  // uniform differs).
  m.customProgramCacheKey = () => `pom-floor-${steps}-${scale}`

  POM_CACHE.set(key, m)
  return m
}

/** Test-only: drop all cached POM materials. */
export function clearPomFloorCacheForTest(): void {
  POM_CACHE.clearForTest()
}
