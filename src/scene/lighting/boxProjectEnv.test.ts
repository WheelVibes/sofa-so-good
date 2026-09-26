import { ShaderChunk } from 'three'
import { describe, expect, it } from 'vitest'
import {
  ENVMAP_PHYSICAL_INCLUDE,
  envmapPhysicalParsReplacement,
  patchBoxProjectedEnv,
  ROOM_PROBE_UNIFORMS,
  WORLDPOS_INCLUDE,
  worldPosVertexReplacement,
} from './boxProjectEnv'

/**
 * The version tripwire.
 *
 * This injection is pinned to three r184. The upstream WebGL example it descends from broke
 * against chunk churn twice and was then deleted outright (present in `examples/` at r131, gone
 * by r133). These tests exist so a `three` bump fails HERE — in two seconds, by name — instead
 * of in a screenshot review three days later.
 */
describe('the installed three still has the anchors this patch needs', () => {
  it('exposes `envmap_physical_pars_fragment`', () => {
    expect(typeof ShaderChunk.envmap_physical_pars_fragment).toBe('string')
  })

  it('still sells specular IBL through `getIBLRadiance`, sampling CUBE_UV', () => {
    const chunk = ShaderChunk.envmap_physical_pars_fragment
    expect(chunk).toContain('vec3 getIBLRadiance( const in vec3 viewDir')
    expect(chunk).toContain('ENVMAP_TYPE_CUBE_UV')
    expect(chunk).toContain('textureCubeUV( envMap, envMapRotation * reflectVec, roughness )')
  })

  it('still sells diffuse IBL through `getIBLIrradiance` — the function this must NOT touch', () => {
    expect(ShaderChunk.envmap_physical_pars_fragment).toContain(
      'vec3 getIBLIrradiance( const in vec3 normal )',
    )
  })

  it('reproduces the installed chunk verbatim apart from the room-probe additions', () => {
    // Strip our additions from the replacement and the two must agree token-for-token. A three
    // bump that reworks the chunk fails here, naming the drift.
    const stripped = envmapPhysicalParsReplacement
      .replace(/\n\tuniform (sampler2D|vec3|float) roomProbe\w+;/g, '')
      .replace(/\n\tvarying vec3 vRoomProbeWorldPos;/g, '')
      .replace(/\n\tvec3 roomProbeCorrect[\s\S]*?\n\t}\n/, '')
      .replace(/\n\t\t\tvec4 roomColor[\s\S]*?roomProbeMix \);\n/, '')
    // Comments are stripped from BOTH sides: this asserts the executable source has not
    // drifted, not that upstream's prose has not.
    const norm = (s: string) =>
      s
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n')
        .replace(/\s+/g, ' ')
        .trim()
    expect(norm(stripped)).toBe(norm(ShaderChunk.envmap_physical_pars_fragment))
  })

  it('still has `worldpos_vertex` and still declares `worldPosition` there', () => {
    expect(ShaderChunk.worldpos_vertex).toContain('vec4 worldPosition')
  })
})

describe('patchBoxProjectedEnv', () => {
  const shader = () => ({
    vertexShader: `void main() {\n#include <begin_vertex>\n${WORLDPOS_INCLUDE}\n}`,
    fragmentShader: `${ENVMAP_PHYSICAL_INCLUDE}\nvoid main() {}`,
  })

  it('declares the varying and fills it from the world position', () => {
    const out = patchBoxProjectedEnv(shader())
    expect(out).not.toBeNull()
    expect(out?.vertexShader.startsWith('varying vec3 vRoomProbeWorldPos;')).toBe(true)
    expect(out?.vertexShader).toContain(worldPosVertexReplacement)
    // Both branches present: the `#else` is what keeps the shader COMPILING if the material is
    // recompiled without an environment (a tier demotion).
    expect(out?.vertexShader).toContain('vRoomProbeWorldPos = worldPosition.xyz;')
    expect(out?.vertexShader).toContain('modelMatrix * vec4( transformed, 1.0 )')
  })

  it('adds every uniform the attach side binds, and no others', () => {
    const out = patchBoxProjectedEnv(shader())
    for (const name of Object.values(ROOM_PROBE_UNIFORMS)) {
      expect(out?.fragmentShader).toContain(name)
    }
  })

  it('leaves `getIBLIrradiance` byte-identical — the diffuse-leak guarantee', () => {
    const out = patchBoxProjectedEnv(shader())
    const body = out?.fragmentShader.slice(
      out.fragmentShader.indexOf('vec3 getIBLIrradiance'),
      out.fragmentShader.indexOf('vec3 getIBLRadiance'),
    )
    // The room probe's sampler must not appear anywhere in the diffuse function. This is the
    // structural version of "do not repeat the (z)5 double count": it is not a tuning choice,
    // the diffuse path cannot see the probe.
    expect(body).not.toContain(ROOM_PROBE_UNIFORMS.map)
    expect(body).toContain('textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 )')
  })

  it('mixes the room probe into the SPECULAR function only', () => {
    const out = patchBoxProjectedEnv(shader())
    const spec = out?.fragmentShader.slice(out.fragmentShader.indexOf('vec3 getIBLRadiance'))
    expect(spec).toContain(`textureCubeUV( ${ROOM_PROBE_UNIFORMS.map}`)
    expect(spec).toContain(`mix( envMapColor, roomColor, ${ROOM_PROBE_UNIFORMS.mix} )`)
  })

  it('does not rotate the room lookup — the probe is captured in world space', () => {
    const out = patchBoxProjectedEnv(shader())
    expect(out?.fragmentShader).not.toContain(
      `textureCubeUV( ${ROOM_PROBE_UNIFORMS.map}, envMapRotation`,
    )
  })

  it('refuses rather than half-patches when an anchor is missing', () => {
    expect(patchBoxProjectedEnv({ vertexShader: 'void main(){}', fragmentShader: '' })).toBeNull()
    expect(
      patchBoxProjectedEnv({ vertexShader: WORLDPOS_INCLUDE, fragmentShader: 'nothing' }),
    ).toBeNull()
  })

  it('guards the projection against a divide-by-zero and a negative hit', () => {
    const out = patchBoxProjectedEnv(shader())
    expect(out?.fragmentShader).toContain('1e-5')
    expect(out?.fragmentShader).toContain('max( min( min( tBound.x, tBound.y ), tBound.z ), 0.0 )')
  })
})
