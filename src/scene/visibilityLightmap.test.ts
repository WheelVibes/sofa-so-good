// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LinearFilter } from 'three'
import { describe, expect, it } from 'vitest'
import {
  applyVisibilityLightmap,
  prepareVisibilityTexture,
  VISIBILITY_GAIN,
} from './visibilityLightmap'

/**
 * Each assertion here corresponds to a measured failure, named in the module's own docs. They are
 * cheap to state and each one cost a round of the graphics arc to discover — the channel default
 * alone cost five. Written against minimal stand-ins rather than real three materials so they run
 * in the node environment with no GPU.
 */

const fakeTexture = () =>
  ({ channel: 0, generateMipmaps: true, minFilter: 0, needsUpdate: false }) as never

const fakeMaterial = () => ({ aoMap: null, aoMapIntensity: 0, needsUpdate: false }) as never

/** A fragment shader with the two anchor points three's real one has. */
const shaderStub = () => ({
  uniforms: {} as Record<string, { value: number }>,
  fragmentShader: 'uniform float x;\nvoid main() {\n#include <aomap_fragment>\n}',
})

describe('prepareVisibilityTexture', () => {
  it('samples uv1, because three defaults a texture to channel 0 (the tiling uv)', () => {
    const t = prepareVisibilityTexture(fakeTexture())
    expect((t as { channel: number }).channel).toBe(1)
  })

  it('disables mipmaps, because mip levels average across atlas slot boundaries', () => {
    const t = prepareVisibilityTexture(fakeTexture()) as unknown as {
      generateMipmaps: boolean
      minFilter: number
    }
    expect(t.generateMipmaps).toBe(false)
    expect(t.minFilter).toBe(LinearFilter)
  })

  it('is idempotent, so one map can be shared across materials', () => {
    const t = fakeTexture()
    prepareVisibilityTexture(t)
    const first = { ...(t as object) }
    prepareVisibilityTexture(t)
    expect({ ...(t as object) }).toEqual(first)
  })
})

describe('applyVisibilityLightmap', () => {
  it('replaces three’s aomap chunk with a plain multiply that may exceed 1', () => {
    const m = fakeMaterial() as unknown as {
      onBeforeCompile: (s: ReturnType<typeof shaderStub>) => void
    }
    applyVisibilityLightmap(m as never, fakeTexture(), 6)
    const s = shaderStub()
    m.onBeforeCompile(s)
    // The clamped include must be gone...
    expect(s.fragmentShader).not.toContain('#include <aomap_fragment>')
    // ...replaced by an unclamped product, and the gain declared.
    expect(s.fragmentShader).toContain('texture2D( aoMap, vAoMapUv ).r * aoGain')
    expect(s.fragmentShader).toContain('reflectedLight.indirectDiffuse *= ambientOcclusion')
    expect(s.uniforms.aoGain.value).toBe(6)
    // And it keeps three's own compile guard. Without it the injected code lands in programs
    // where `aoMap` was never declared, the shader fails to compile, and the material silently
    // falls back -- measured as a WORSE render (frame mean 46.7 vs 72.4) that looks like a
    // tuning problem rather than a compile error.
    expect(s.fragmentShader).toContain('#ifdef USE_AOMAP')
    expect(s.fragmentShader).toContain('#endif')
  })

  it('does NOT attenuate indirect specular — measured worse (1.51x vs 1.36x)', () => {
    const m = fakeMaterial() as unknown as {
      onBeforeCompile: (s: ReturnType<typeof shaderStub>) => void
    }
    applyVisibilityLightmap(m as never, fakeTexture())
    const s = shaderStub()
    m.onBeforeCompile(s)
    expect(s.fragmentShader).not.toContain('indirectSpecular')
  })

  it('sets a program cache key that varies with gain, or the patch is silently ignored', () => {
    const a = fakeMaterial() as unknown as { customProgramCacheKey: () => string }
    const b = fakeMaterial() as unknown as { customProgramCacheKey: () => string }
    applyVisibilityLightmap(a as never, fakeTexture(), 6)
    applyVisibilityLightmap(b as never, fakeTexture(), 4)
    expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey())
  })

  it('leaves aoMapIntensity at 1, since the patch bypasses the intensity lerp', () => {
    const m = fakeMaterial() as unknown as { aoMapIntensity: number }
    applyVisibilityLightmap(m as never, fakeTexture())
    expect(m.aoMapIntensity).toBe(1)
  })

  it('defaults to the fitted gain rather than a derived one', () => {
    expect(VISIBILITY_GAIN).toBe(6)
    const m = fakeMaterial() as unknown as {
      onBeforeCompile: (s: ReturnType<typeof shaderStub>) => void
    }
    applyVisibilityLightmap(m as never, fakeTexture())
    const s = shaderStub()
    m.onBeforeCompile(s)
    expect(s.uniforms.aoGain.value).toBe(VISIBILITY_GAIN)
  })

  it('flags the material for recompilation', () => {
    const m = fakeMaterial() as unknown as { needsUpdate: boolean }
    applyVisibilityLightmap(m as never, fakeTexture())
    expect(m.needsUpdate).toBe(true)
  })
})

describe('runtime-attachment hazard', () => {
  it('is documented as construction-time only (216 ms compile hitch if toggled live)', () => {
    // Not a behavioural test -- a tripwire. If the module's warning is ever deleted, the
    // reason it exists goes with it, and a feature flag that toggles aoMap at runtime will
    // stutter for a fifth of a second with no clue why.
    const src = readFileSync(join(__dirname, 'visibilityLightmap.ts'), 'utf8')
    expect(src).toContain('never on a live material')
    expect(src).toContain('216 ms')
  })
})
