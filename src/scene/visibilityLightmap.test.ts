// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LinearFilter } from 'three'
import { describe, expect, it } from 'vitest'
import {
  applyVisibilityLightmap,
  detachVisibilityLightmap,
  IRRADIANCE_GAIN,
  prepareVisibilityTexture,
} from './visibilityLightmap'

/**
 * Each assertion here corresponds to a measured failure, named in the module's own docs. They are
 * cheap to state and each one cost a round of the graphics arc to discover — the channel default
 * alone cost five. Written against minimal stand-ins rather than real three materials so they run
 * in the node environment with no GPU.
 */

const fakeTexture = () => ({ generateMipmaps: true, minFilter: 0, needsUpdate: false }) as never

// `userData` because three's Material always has one and the module marks patched materials
// there so they can be detached again.
const fakeMaterial = () => ({ needsUpdate: false, userData: {} }) as never

/** A shader pair carrying the four anchor points three's real ones have. */
const shaderStub = () => ({
  uniforms: {} as Record<string, { value: unknown }>,
  vertexShader: 'void main() {\n#include <begin_vertex>\n}',
  fragmentShader: 'void main() {\n#include <lights_fragment_end>\n#include <opaque_fragment>\n}',
})

describe('prepareVisibilityTexture', () => {
  it('disables mipmaps, because mip levels average across atlas slot boundaries', () => {
    const t = prepareVisibilityTexture(fakeTexture()) as unknown as {
      generateMipmaps: boolean
      minFilter: number
    }
    expect(t.generateMipmaps).toBe(false)
    expect(t.minFilter).toBe(LinearFilter)
  })

  it('does NOT set a texture channel — the map no longer goes through three’s aoMap slot', () => {
    // Routed through `aoMap`, the mapped materials compiled without `USE_AOMAP` and the
    // attenuation never ran (v0.31.7.36). The shader now declares its own sampler and varying,
    // so three's channel plumbing is not involved and setting `channel` would be misleading.
    const t = prepareVisibilityTexture(fakeTexture()) as unknown as { channel?: number }
    expect(t.channel).toBeUndefined()
  })
})

describe('applyVisibilityLightmap', () => {
  const compile = (gain?: number, debug?: boolean) => {
    const m = fakeMaterial() as unknown as {
      onBeforeCompile: (s: ReturnType<typeof shaderStub>) => void
      customProgramCacheKey: () => string
      needsUpdate: boolean
    }
    applyVisibilityLightmap(m as never, fakeTexture(), gain, debug)
    const s = shaderStub()
    m.onBeforeCompile(s)
    return { m, s }
  }

  it('declares its own sampler, uniform and varying — nothing conditional on a three define', () => {
    // The whole point of the rewrite: no `#ifdef` that three can compile out.
    const { s } = compile(6)
    expect(s.fragmentShader).toContain('uniform sampler2D visMap')
    expect(s.fragmentShader).toContain('uniform float visGain')
    expect(s.fragmentShader).toContain('varying vec2 vVisUv')
    expect(s.fragmentShader).not.toContain('#ifdef')
  })

  it('passes uv1 through the VERTEX shader, since a fragment varying needs a source', () => {
    const { s } = compile(6)
    expect(s.vertexShader).toContain('attribute vec2 uv1')
    expect(s.vertexShader).toContain('vVisUv = uv1')
  })

  it('ASSIGNS indirect diffuse after lights_fragment_end, and never touches specular', () => {
    // Specular attenuation is physically tempting and measured worse (1.51x vs 1.36x).
    // Assignment rather than multiplication since `v0.31.7.185` removed the other operator.
    const { s } = compile(6)
    expect(s.fragmentShader).toContain('reflectedLight.indirectDiffuse = visOcclusion * visGain')
    expect(s.fragmentShader).not.toContain('indirectSpecular')
    expect(s.fragmentShader).toContain('#include <lights_fragment_end>')
  })

  it('binds the map and the gain as uniforms', () => {
    const { s } = compile(42)
    expect(s.uniforms.visGain.value).toBe(42)
    expect(s.uniforms.visMap.value).toBeTruthy()
  })

  it('defaults to the fitted IRRADIANCE gain', () => {
    // `v0.31.7.185` removed the `multiply` operator, so the only default that can be right here
    // is the irradiance fit. `v0.31.7.184` refitted it in display space against Cycles
    // references after `.183` derived it with the wrong albedo.
    //
    // `v0.31.7.223` refitted it AGAIN, to **4.2**, and this is the first fit whose measurement
    // chain is validated end to end: raycast-verified surfaces (`.214` showed the old fit's
    // "ceiling" was not a ceiling), an exposure-matched byte->linear curve (`.217` showed a
    // mismatched one manufactured a 0.65x error), and a Cycles reference rendered from the app's
    // OWN exported scene at the same pose through `Standard`. Measured against that reference the
    // old 6 was 1.38-1.49x too bright; 4.2 lands at 0.98-1.03x in two rooms whose baked irradiance
    // differs by 2x.
    expect(IRRADIANCE_GAIN).toBe(4.2)
    expect(compile().s.uniforms.visGain.value).toBe(IRRADIANCE_GAIN)
  })

  it('keys the program cache by gain and debug mode, so variants cannot collapse', () => {
    // A constant key let a with-map and a without-map program share one entry (v0.31.7.35).
    expect(compile(6).m.customProgramCacheKey()).not.toBe(compile(4).m.customProgramCacheKey())
    expect(compile(6).m.customProgramCacheKey()).not.toBe(
      compile(6, true).m.customProgramCacheKey(),
    )
  })

  it('flags the material for recompilation', () => {
    expect(compile().m.needsUpdate).toBe(true)
  })

  it('in debug mode paints the sampled value, with MAGENTA for never-sampled', () => {
    // The distinction that found the fault: "no map here" and "map reads zero" are identical
    // in a brightness measurement, and every measurement of this bug was one.
    const { s } = compile(6, true)
    expect(s.fragmentShader).toContain('vec4( 1.0, 0.0, 1.0, 1.0 )')
    expect(s.fragmentShader).not.toContain('#include <opaque_fragment>')
  })

  it('leaves the output chunk alone when NOT debugging', () => {
    expect(compile(6, false).s.fragmentShader).toContain('#include <opaque_fragment>')
  })
})

describe('detachVisibilityLightmap', () => {
  it('restores the stock program so a re-applied plan cannot inherit the old one', () => {
    // Materials survive a plan change, so without this the previous plan's visibility stays on
    // every material the new plan reuses -- measured as a result that would not move across
    // three different code states.
    const m = fakeMaterial() as unknown as {
      onBeforeCompile: unknown
      customProgramCacheKey?: unknown
      userData: Record<string, unknown>
      needsUpdate: boolean
    }
    applyVisibilityLightmap(m as never, fakeTexture())
    expect(m.userData.visLightmap).toBe(true)
    expect(detachVisibilityLightmap(m as never)).toBe(true)
    // `customProgramCacheKey` must be DELETED, not set to undefined: three falls back to
    // Material.prototype's implementation, and an own-property `undefined` would shadow it.
    expect(Object.hasOwn(m, 'customProgramCacheKey')).toBe(false)
    expect(m.userData.visLightmap).toBeUndefined()
    expect(m.needsUpdate).toBe(true)
  })

  it('leaves an unpatched material alone and reports it', () => {
    const m = fakeMaterial()
    expect(detachVisibilityLightmap(m as never)).toBe(false)
  })

  it('is idempotent — a second detach is a no-op', () => {
    const m = fakeMaterial()
    applyVisibilityLightmap(m as never, fakeTexture())
    expect(detachVisibilityLightmap(m as never)).toBe(true)
    expect(detachVisibilityLightmap(m as never)).toBe(false)
  })
})

describe('runtime-attachment hazard', () => {
  it('is documented as construction-time only (216 ms compile hitch if toggled live)', () => {
    // A tripwire, not a behavioural test. If the warning is deleted, the reason goes with it
    // and a flag that toggles this at runtime stutters for a fifth of a second with no clue why.
    const src = readFileSync(join(__dirname, 'visibilityLightmap.ts'), 'utf8')
    expect(src).toContain('never on a live material')
    expect(src).toContain('216 ms')
  })
})

describe('replace mode (v0.31.7.88)', () => {
  const frag = () => {
    const m = fakeMaterial() as unknown as { onBeforeCompile: (s: unknown) => void }
    applyVisibilityLightmap(m as never, fakeTexture(), 6, false)
    const s = shaderStub()
    m.onBeforeCompile(s)
    return s.fragmentShader
  }

  it('ASSIGNS the indirect term rather than scaling it', () => {
    // The distinction is the whole point: an irradiance map IS the light, so
    // multiplying leaves the app's ambient/hemisphere fill in place and scales it
    // -- the double-count `v0.31.7.67` measured as WORSE than the crude proxy
    // (+58 % against visibility's +79 % on the one view where either helps).
    const f = frag()
    expect(f).toContain('reflectedLight.indirectDiffuse = visOcclusion * visGain')
    expect(f).not.toContain('reflectedLight.indirectDiffuse *=')
  })

  it('emits NO multiply form at all — the operator was removed, not defaulted away', () => {
    // `(z)`5 was "delete the pass, the assets and the `multiply` path entirely -- removal, not
    // deprecation", and `.102` measured that operator as wrong outright (52-80 % of slots dark by
    // design). A default is not a removal: this asserts the form cannot be produced.
    expect(frag()).not.toContain('reflectedLight.indirectDiffuse *=')
  })

  it('keys the program on the GAIN, so two gains cannot share one cached program', () => {
    // `v0.31.7.44`: a constant key collapsed two variants into one program, and the second
    // material silently rendered with the first's gain. The MODE is no longer part of the key
    // because `v0.31.7.185` removed the `multiply` operator -- there is one operator now.
    const a = fakeMaterial() as unknown as { customProgramCacheKey?: () => string }
    const b = fakeMaterial() as unknown as { customProgramCacheKey?: () => string }
    applyVisibilityLightmap(a as never, fakeTexture(), 6, false)
    applyVisibilityLightmap(b as never, fakeTexture(), 9, false)
    expect(a.customProgramCacheKey?.()).not.toBe(b.customProgramCacheKey?.())
  })

  it('puts the map through the SAME Lambert BRDF three would have', () => {
    // `indirectDiffuse` is irradiance x albedo/PI, not irradiance -- read from
    // three's `RE_IndirectDiffuse_Physical`. Assigning a bare value erases albedo
    // on every mapped surface, which `v0.31.7.90` measured as interior p90/p10
    // 3.03 -> 59.40 against physics' 2.72. A ratio no gain can correct.
    const f = frag()
    // , not : only PhysicalMaterial declares
    // the latter, and referencing it made the program fail to compile on any
    // Lambert/Phong material the bake happened to cover (v0.31.7.94).
    expect(f).toContain('BRDF_Lambert( material.diffuseColor )')
  })
})
