// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LinearFilter } from 'three'
import { describe, expect, it } from 'vitest'

/** Shape of the `visGain` vec3 uniform, which the shader stubs type loosely. */
type Vec3 = { x: number; y: number; z: number }

import {
  applyVisibilityLightmap,
  detachVisibilityLightmap,
  exteriorBoostBase,
  IRRADIANCE_GAIN,
  prepareVisibilityTexture,
  setExteriorBoostLevel,
  visGainLuminance,
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

  it('does NOT flag an image-less texture for update', () => {
    // `VisibilityLightmaps.tsx` attaches this to a `TextureLoader` texture before its async
    // fetch resolves — three's own `image` is `null` until then. Flagging it anyway made
    // `WebGLRenderer` warn `Texture marked for update but no image data found` ~25 times on
    // every boot of the default flat; the loader's own callback raises the flag once the image
    // actually lands.
    const t = prepareVisibilityTexture(fakeTexture()) as unknown as { needsUpdate: boolean }
    expect(t.needsUpdate).toBe(false)
  })

  it('DOES flag a texture that already carries image data', () => {
    const withImage = {
      generateMipmaps: true,
      minFilter: 0,
      needsUpdate: false,
      image: { width: 256, height: 256 },
    } as never
    const t = prepareVisibilityTexture(withImage) as unknown as { needsUpdate: boolean }
    expect(t.needsUpdate).toBe(true)
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
    expect(s.fragmentShader).toContain('uniform vec3 visGain')
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
    expect(s.fragmentShader).toContain(
      'reflectedLight.indirectDiffuse = ( visOcclusion * visGain + vec3( lampBounce ) )',
    )
    expect(s.fragmentShader).not.toContain('indirectSpecular')
    expect(s.fragmentShader).toContain('#include <lights_fragment_end>')
  })

  it('binds the map and the gain as uniforms', () => {
    const { s } = compile(42)
    expect(visGainLuminance(s.uniforms.visGain.value as Vec3)).toBeCloseTo(42, 6)
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
    expect(visGainLuminance(compile().s.uniforms.visGain.value as Vec3)).toBeCloseTo(
      IRRADIANCE_GAIN,
      6,
    )
  })

  it('keys the program cache by DEBUG mode, which is the only source difference left', () => {
    // A constant key let a with-map and a without-map program share one entry (v0.31.7.35). That
    // is still guarded: an un-injected material never overrides `customProgramCacheKey` at all,
    // so it keeps three's default and cannot collide with `visLightmap:*`.
    //
    // The GAIN is no longer in the key -- see `(z9)`. It is a uniform VALUE and changes no shader
    // source, so keying on it bought ~195 programs per plan and a 1130-1224 ms load hitch. Debug
    // genuinely rewrites the output chunk, so it stays.
    expect(compile(6).m.customProgramCacheKey()).not.toBe(
      compile(6, true).m.customProgramCacheKey(),
    )
  })

  it('gives two SEPARATE materials the same key, so a plan compiles one program', () => {
    // The `(z9)` win, and it is safe for a reason worth naming: three's
    // `materialProperties.programs` is a Map held on the MATERIAL, so a shared key dedupes nothing
    // ACROSS materials and two materials cannot bleed uniforms into each other. Measured: ceiling,
    // wall and floor render with their own distinct gains and tints under this shared key.
    const a = fakeMaterial() as unknown as { customProgramCacheKey?: () => string }
    const b = fakeMaterial() as unknown as { customProgramCacheKey?: () => string }
    applyVisibilityLightmap(a as never, fakeTexture(), 6, false)
    applyVisibilityLightmap(b as never, fakeTexture(), 9, false)
    expect(a.customProgramCacheKey?.()).toBe(b.customProgramCacheKey?.())
  })

  it('flags the material for recompilation', () => {
    expect(compile().m.needsUpdate).toBe(true)
  })

  it('in debug mode paints the sampled value, with MAGENTA for never-sampled', () => {
    // The distinction that found the fault: "no map here" and "map reads zero" are identical
    // in a brightness measurement, and every measurement of this bug was one.
    // The magenta sentinel now covers the EXTERIOR-FACE branch as well: `visDebug` is only
    // written inside the `else`, so an outward-facing face paints magenta in the visualiser.
    const { s } = compile(6, true)
    expect(s.fragmentShader).toContain('vec4( 1.0, 0.0, 1.0, 1.0 )')
    expect(s.fragmentShader.indexOf('visDebug = visOcclusion')).toBeGreaterThan(
      s.fragmentShader.indexOf('if ( vVisUv.x < 0.0 )'),
    )
    expect(s.fragmentShader).not.toContain('#include <opaque_fragment>')
  })

  it('leaves the output chunk alone when NOT debugging', () => {
    expect(compile(6, false).s.fragmentShader).toContain('#include <opaque_fragment>')
  })

  it('GUARDS the replace on the exterior-face sentinel, so an outside face keeps the fill', () => {
    // EXTERIOR-FACE-LIGHTMAP. `applyVisibilityLightmaps` writes `uv1 = (-1,-1)` on any face that
    // points out of the building, because the bake only fills a shell box's room-facing atlas
    // slots and the UV builder's mirror row would otherwise hand an exterior face the INTERIOR
    // face's irradiance — the 10–20 cm grey-brown mottle on the flat's own outside wall, seen
    // through the living-room pane. For those fragments the whole replace is skipped, so three's
    // analytic hemisphere/ambient/IBL fill stands.
    const { s } = compile(6)
    expect(s.fragmentShader).toContain('if ( vVisUv.x < 0.0 )')
    // A RUNTIME branch on a varying, not an `#ifdef` — an `#ifdef` is what the engine can
    // disable, which is the failure rule 1 of `src/scene/CLAUDE.md` exists for.
    expect(s.fragmentShader).not.toContain('#ifdef')
  })

  it('keeps the LAMP BOUNCE out of the sentinel branch too', () => {
    // An exterior face receives no interior lamp interreflection either, so the whole assignment
    // — irradiance and lamp bounce together — sits inside the `else`.
    const f = compile(6).s.fragmentShader
    const guard = f.indexOf('if ( vVisUv.x < 0.0 )')
    expect(guard).toBeGreaterThan(-1)
    expect(f.indexOf('vec3( lampBounce )')).toBeGreaterThan(guard)
  })

  it('does NOT change the program cache key for the guard — it is unconditional GLSL', () => {
    // The guard is the same source in every program, so it cannot split the cache; the key stays
    // the per-material generation (plus the debug flag). Stated as a test because a key change
    // here would silently multiply the ~19 compiles a plan pays at attach.
    const { m } = compile(6)
    expect(m.customProgramCacheKey()).toBe('visLightmap:1')
  })
})

describe('EXTERIOR-FACE-DAYLIGHT (exteriorBoost)', () => {
  const compile = (exteriorBase?: number) => {
    const m = fakeMaterial() as unknown as {
      onBeforeCompile: (s: ReturnType<typeof shaderStub>) => void
      customProgramCacheKey: () => string
      userData: Record<string, unknown>
    }
    applyVisibilityLightmap(m as never, fakeTexture(), 6, false, [1, 1, 1], 0, exteriorBase)
    const s = shaderStub()
    m.onBeforeCompile(s)
    return { m, s }
  }

  it('declares the uniform in EVERY program, even where the boost is zero', () => {
    // Rule 1 of `src/scene/CLAUDE.md`'s lightmap bullet: no `#ifdef`, nothing for the engine to
    // compile out — so an interior-only material carries the same source with a 0 value.
    const { s } = compile(0)
    expect(s.fragmentShader).toContain('uniform float exteriorBoost')
    expect(s.fragmentShader).not.toContain('#ifdef')
    expect(s.uniforms.exteriorBoost.value).toBe(0)
  })

  it('adds the boost ONLY on the exterior sentinel, through the Lambert BRDF', () => {
    // Light ARRIVING, not light emitted: it must be multiplied by the surface's own albedo, or a
    // dark face would render as bright as a white one. That is also why the constant is ~PI times
    // the estate's emissive `EXTERIOR_DAY_BOOST`.
    const f = compile(3.6).s.fragmentShader
    expect(f).toContain(
      'reflectedLight.indirectDiffuse += exteriorBoost * diffuseColor.a * ' +
        'BRDF_Lambert( material.diffuseColor );',
    )
    const ext = f.indexOf('if ( vVisUv.x < -1.5 )')
    const cap = f.indexOf('if ( vVisUv.x < 0.0 )')
    expect(ext).toBeGreaterThan(-1)
    // The CUT-CAP branch comes second and adds nothing: a section cut is not a physical surface.
    expect(cap).toBeGreaterThan(ext)
    expect(f.indexOf('exteriorBoost * diffuseColor.a')).toBeLessThan(cap)
  })

  it('does not change the program cache key — the branch is unconditional GLSL', () => {
    // Stated as a test because a key change here would multiply the ~19 compiles a plan pays at
    // attach, which is the 1130-1224 ms load hitch `(z9)` removed.
    expect(compile(3.6).m.customProgramCacheKey()).toBe('visLightmap:1')
    expect(compile(0).m.customProgramCacheKey()).toBe('visLightmap:1')
  })

  it('scales every registered uniform by the DAY level, like setLampBounce does the lights', () => {
    const { s } = compile(3.6)
    setExteriorBoostLevel(1)
    expect(s.uniforms.exteriorBoost.value).toBeCloseTo(3.6, 6)
    setExteriorBoostLevel(0)
    expect(s.uniforms.exteriorBoost.value).toBe(0)
    // Clamped, so a caller passing a raw un-normalised daylight cannot over-drive it.
    setExteriorBoostLevel(4)
    expect(s.uniforms.exteriorBoost.value).toBeCloseTo(3.6, 6)
    setExteriorBoostLevel(0)
  })

  it('is zero for a material with no exterior face, and zero when the flag is off', () => {
    expect(exteriorBoostBase(true, true)).toBeGreaterThan(0)
    expect(exteriorBoostBase(false, true)).toBe(0)
    expect(exteriorBoostBase(true, false)).toBe(0)
  })

  it('unregisters the uniform on detach, so a detached material stops tracking the sun', () => {
    const m = fakeMaterial() as unknown as { userData: Record<string, unknown> }
    applyVisibilityLightmap(m as never, fakeTexture(), 6, false, [1, 1, 1], 0, 3.6)
    const u = m.userData.visExteriorUniform as { value: number }
    expect(detachVisibilityLightmap(m as never)).toBe(true)
    expect(m.userData.visExteriorUniform).toBeUndefined()
    setExteriorBoostLevel(1)
    expect(u.value).toBe(0)
    setExteriorBoostLevel(0)
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
    expect(f).toContain(
      'reflectedLight.indirectDiffuse = ( visOcclusion * visGain + vec3( lampBounce ) )',
    )
    expect(f).not.toContain('reflectedLight.indirectDiffuse *=')
  })

  it('emits NO multiply form at all — the operator was removed, not defaulted away', () => {
    // `(z)`5 was "delete the pass, the assets and the `multiply` path entirely -- removal, not
    // deprecation", and `.102` measured that operator as wrong outright (52-80 % of slots dark by
    // design). A default is not a removal: this asserts the form cannot be produced.
    expect(frag()).not.toContain('reflectedLight.indirectDiffuse *=')
  })

  it('RE-ATTACHING the same material changes the key, so a new gain cannot be swallowed', () => {
    // `v0.31.7.44`'s hazard, restated as what it actually is. On a key HIT three's `getProgram`
    // returns early, skipping BOTH `onBeforeCompile` and the `materialProperties.uniforms`
    // assignment -- so a re-attach that reused its key would never get the new gain to the GPU.
    // Materials outlive a plan change here (`visClonedFrom`), so this path is live.
    //
    // A per-material GENERATION covers it, and covers more than keying on the gain did: this also
    // catches a changed MAP at an unchanged gain, which the old key silently missed.
    const m = fakeMaterial() as unknown as { customProgramCacheKey?: () => string }
    applyVisibilityLightmap(m as never, fakeTexture(), 6, false)
    const first = m.customProgramCacheKey?.()
    applyVisibilityLightmap(m as never, fakeTexture(), 9, false)
    expect(m.customProgramCacheKey?.()).not.toBe(first)
  })

  it('keeps the generation MONOTONIC across a detach, so a re-attach cannot hit a stale program', () => {
    // After a detach the material recompiles to its stock program with a FRESH uniforms object
    // that has no `visMap`/`visGain`. If a re-attach reused an earlier generation it would hit
    // that generation's injected program and find those uniforms absent -- an indirect term of
    // zero, which reads as a bake fault rather than a cache one. So detach must NOT reset it.
    const m = fakeMaterial() as unknown as {
      customProgramCacheKey?: () => string
      userData: { visGeneration?: number }
    }
    applyVisibilityLightmap(m as never, fakeTexture(), 6, false)
    const g1 = m.userData.visGeneration
    detachVisibilityLightmap(m as never)
    applyVisibilityLightmap(m as never, fakeTexture(), 6, false)
    expect(m.userData.visGeneration).toBeGreaterThan(g1 as number)
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
