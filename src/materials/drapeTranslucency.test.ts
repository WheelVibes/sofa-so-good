import { MeshPhysicalMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { applyDrapeTranslucency, backsideChunk } from './drapeTranslucency'

/** The pieces of three's shader the patch depends on existing. */
const FAKE_SHADER = {
  uniforms: {} as Record<string, { value: number }>,
  vertexShader: '',
  fragmentShader: '#include <common>\nvoid main() {\n#include <lights_fragment_end>\n}',
}

describe('drape translucency shader patch', () => {
  it('injects the uniform and the back-side term into the fragment shader', () => {
    const m = new MeshPhysicalMaterial()
    applyDrapeTranslucency(m, 0.6)
    const shader = { ...FAKE_SHADER, uniforms: {} }
    m.onBeforeCompile?.(shader as never, null as never)
    expect(shader.fragmentShader).toContain('uniform float uDrapeTranslucency;')
    expect(shader.fragmentShader).toContain('irradiance += backIrradiance')
    // The term must be added BEFORE the include that consumes `irradiance`.
    expect(shader.fragmentShader.indexOf('backIrradiance')).toBeLessThan(
      shader.fragmentShader.indexOf('#include <lights_fragment_end>'),
    )
  })

  it('uploads the strength as a uniform the caller can retune', () => {
    const m = new MeshPhysicalMaterial()
    const patch = applyDrapeTranslucency(m, 0.6)
    const shader = { ...FAKE_SHADER, uniforms: {} as Record<string, unknown> }
    m.onBeforeCompile?.(shader as never, null as never)
    expect(shader.uniforms.uDrapeTranslucency).toBe(patch.uniform)
    expect(patch.uniform.value).toBeCloseTo(0.6, 6)
  })

  it('sets a program cache key, without which it shares a program with plain fabric', () => {
    // three caches compiled programs by material type + defines. Two materials
    // of the same type that differ only in an `onBeforeCompile` patch collide,
    // and whichever compiled first wins for both.
    const patched = new MeshPhysicalMaterial()
    const plain = new MeshPhysicalMaterial()
    applyDrapeTranslucency(patched, 0.6)
    expect(patched.customProgramCacheKey()).not.toBe(plain.customProgramCacheKey())
  })

  it('responds to the surface NORMAL, which is the whole point', () => {
    // `.199` refuted an emissive stand-in precisely because it carries no normal
    // information and so dilutes the normal-mapped weave. A term that did not
    // reference the shading normal would repeat that failure.
    expect(backsideChunk()).toContain('-geometryNormal')
  })

  it('guards the environment term, which does not exist without an env map', () => {
    expect(backsideChunk()).toContain('#ifdef USE_ENVMAP')
  })
})
