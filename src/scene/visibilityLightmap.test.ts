// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LinearFilter } from 'three'
import { describe, expect, it } from 'vitest'

/** Shape of the `visGain` vec3 uniform, which the shader stubs type loosely. */
type Vec3 = { x: number; y: number; z: number }

import { weatherGrade } from './lighting/weather'
import {
  applyVisibilityLightmap,
  DAYLIGHT_SPILL_K,
  detachVisibilityLightmap,
  exteriorBoostBase,
  IRRADIANCE_GAIN,
  prepareVisibilityTexture,
  setExteriorBoostLevel,
  setVisDayLevel,
  setVisSpillLevel,
  visDayScale,
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
      // `* visDay` is BAKED-GI-DAY-LEVEL: the bake is bounced daylight and follows the sun.
      // `visAnalytic * visNight +` is LIGHTMAP-NIGHT-FLOOR: crossfades back to three's own fill
      // as the day level falls, so a mapped surface is never darker than an unmapped one at night.
      'vec3 visLit = ( visOcclusion * visGain * visDay + vec3( lampBounce ) )',
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
    // is the irradiance fit. `v0.31.7.223` fitted **4.2** against a Cycles reference rendered from
    // the app's own exported scene — a sound method, but against a map set that was broken in ways
    // nobody had measured yet.
    //
    // `v0.34.1.34` refits to **2.7** WITH the set it belongs to. The old set had 28 maps zeroed by
    // the bake-twin collision, large black regions in ~39 more, and baked lamp/cove-light energy
    // throughout (the baker had no emissive kill). Coverage in FRAME PIXELS went 24.9 % → 69 %, so
    // a gain fitted when the maps reached a quarter of the picture cannot be right once they reach
    // most of it.
    //
    // **The gain and the asset set are ONE calibration.** Changing `public/assets/lightmaps/`
    // without re-fitting this, or vice versa, is the error this pairing exists to prevent — which
    // is why the assertion is a hard equality rather than a range.
    expect(IRRADIANCE_GAIN).toBe(2.7)
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
    // LIGHTMAP-CHANNEL: `visOcclusion` is a vec3 now, so the visualiser shows its LUMINANCE —
    // painting one channel would misreport exactly the quantity that round is about.
    expect(s.fragmentShader.indexOf('visDebug = dot( visOcclusion')).toBeGreaterThan(
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
      // `* visDay` is BAKED-GI-DAY-LEVEL: the bake is bounced daylight and follows the sun.
      // `visAnalytic * visNight +` is LIGHTMAP-NIGHT-FLOOR: see the assertion above.
      'vec3 visLit = ( visOcclusion * visGain * visDay + vec3( lampBounce ) )',
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

/**
 * BAKED-GI-DAY-LEVEL (LIVING-SLAB) — the bake is bounced DAYLIGHT and `visGain` was a constant, so
 * every mapped surface held its 13:00 irradiance after dark and read as a lit slab in an unlit
 * room. Both flag states are asserted here, because "off is byte-identical" is the property that
 * makes the flag safe: with `dayScaled: false` the uniform holds 1 at every hour.
 */
describe('BAKED-GI-DAY-LEVEL (visDay)', () => {
  const compile = (dayScaled: boolean) => {
    const m = fakeMaterial() as unknown as {
      onBeforeCompile: (s: ReturnType<typeof shaderStub>) => void
      customProgramCacheKey: () => string
      userData: Record<string, unknown>
    }
    applyVisibilityLightmap(m as never, fakeTexture(), 6, false, [1, 1, 1], 0, 0, dayScaled)
    const s = shaderStub()
    m.onBeforeCompile(s)
    return { m, s }
  }

  it('is 1 at every hour when the feature is off — the off state cannot move a pixel', () => {
    expect(visDayScale(1, false)).toBe(1)
    expect(visDayScale(0, false)).toBe(1)
    expect(visDayScale(0.37, false)).toBe(1)
  })

  it('follows and CLAMPS the day level when the feature is on', () => {
    expect(visDayScale(1, true)).toBe(1)
    expect(visDayScale(0, true)).toBe(0)
    expect(visDayScale(0.4, true)).toBeCloseTo(0.4, 6)
    // A caller passing a raw un-normalised daylight cannot over- or under-drive the bake.
    expect(visDayScale(4, true)).toBe(1)
    expect(visDayScale(-2, true)).toBe(0)
    expect(visDayScale(Number.NaN, true)).toBe(0)
  })

  it('declares the uniform in EVERY program and multiplies ONLY the baked term', () => {
    // Rule 1 of `src/scene/CLAUDE.md`'s lightmap bullet: unconditional GLSL, no `#ifdef`. And the
    // lamp bounce must stay OUTSIDE the day scale — it is the term that carries the night.
    const f = compile(false).s.fragmentShader
    expect(f).toContain('uniform float visDay')
    expect(f).not.toContain('#ifdef')
    expect(f).toContain(
      'vec3 visLit = ( visOcclusion * visGain * visDay + ' +
        'vec3( lampBounce ) ) * BRDF_Lambert( material.diffuseColor );',
    )
    // MAPPED-DAYLIGHT-SPILL (W3): the baked term is floored at a fraction of the analytic fill by
    // day with `max`, never summed with it -- a sum would re-open the `.67` double-count.
    expect(f).toContain(
      'reflectedLight.indirectDiffuse = visAnalytic * visNight + max( visLit, visAnalytic * visSpill );',
    )
  })

  it('LIGHTMAP-NIGHT-FLOOR: captures the analytic fill before the replace and crossfades with it', () => {
    // `visAnalytic` must be read from `reflectedLight.indirectDiffuse` immediately after
    // `lights_fragment_end` -- before anything below can overwrite it -- and the interior branch's
    // assignment must lead with `visAnalytic * visNight` so a mapped surface converges on the same
    // floor an unmapped neighbour already renders at, rather than a constant.
    const f = compile(true).s.fragmentShader
    expect(f).toContain('vec3 visAnalytic = reflectedLight.indirectDiffuse;')
    expect(f).toContain('uniform float visNight')
    expect(f.indexOf('vec3 visAnalytic')).toBeLessThan(f.indexOf('vVisUv.x < -1.5'))
  })

  it('LIGHTMAP-NIGHT-FLOOR: setVisDayLevel writes the complementary night uniform', () => {
    const { s } = compile(true)
    setVisDayLevel(1)
    expect(s.uniforms.visNight.value).toBe(0)
    setVisDayLevel(0)
    expect(s.uniforms.visNight.value).toBe(1)
    setVisDayLevel(0.37)
    expect(s.uniforms.visNight.value).toBeCloseTo(0.63, 6)
    setVisDayLevel(1)
  })

  it('LIGHTMAP-NIGHT-FLOOR: a weather-scaled day still writes night 0 -- weather never reaches it', () => {
    // Under a full deck at noon (`weatherGrade('overcast', 1).bounce` scales `visDay` down, not
    // `daylight` itself) the RAW daylight is still 1, so the night floor must stay exactly 0 --
    // else the analytic fill would fade IN at midday under a dark sky, a daytime look change this
    // fix has no business making.
    const { s } = compile(true)
    setVisDayLevel(1, 1.15)
    expect(s.uniforms.visNight.value).toBe(0)
    expect(s.uniforms.visDay.value).toBeCloseTo(1.15, 6)
    setVisDayLevel(1)
  })

  it('holds 1 with the flag off and tracks the sun with it on', () => {
    const off = compile(false)
    const on = compile(true)
    setVisDayLevel(1)
    expect(off.s.uniforms.visDay.value).toBe(1)
    expect(on.s.uniforms.visDay.value).toBe(1)
    setVisDayLevel(0)
    expect(off.s.uniforms.visDay.value).toBe(1)
    expect(on.s.uniforms.visDay.value).toBe(0)
    setVisDayLevel(1)
  })

  it('does not change the program cache key — the flag is a uniform, not a variant', () => {
    expect(compile(true).m.customProgramCacheKey()).toBe('visLightmap:1')
    expect(compile(false).m.customProgramCacheKey()).toBe('visLightmap:1')
  })

  it('unregisters the uniform on detach, so a detached material stops tracking the sun', () => {
    const m = fakeMaterial() as unknown as { userData: Record<string, unknown> }
    applyVisibilityLightmap(m as never, fakeTexture(), 6, false, [1, 1, 1], 0, 0, true)
    const u = m.userData.visDayUniform as { value: number }
    expect(detachVisibilityLightmap(m as never)).toBe(true)
    expect(m.userData.visDayUniform).toBeUndefined()
    setVisDayLevel(0)
    expect(u.value).toBe(1)
    setVisDayLevel(1)
  })
})

/**
 * WEATHER-BAKED-GI / WEATHER-EXTERIOR-FACE — the two injected daylight levels take the weather
 * grade, and they take DIFFERENT fields of it.
 *
 * The property that makes this safe to default on is stated first and structurally: `clear`'s grade
 * returns the exact literals `fill: 1` / `blowout: 1`, so both levels multiply by the NUMBER 1 and
 * the default condition cannot move a float. The rest asserts that the non-clear grades do reach
 * the uniforms, and — the one that a `clamp01` would silently break — that `partlyCloudy`'s fill of
 * **1.15** survives, because a half-covered sky puts more light through a vertical window than a
 * clear one and clamping it to 1 would leave the bake at `clear` while every other indirect source
 * in the room went up 15 %.
 */
describe('WEATHER-BAKED-GI (the weather factor on both injected day levels)', () => {
  const dayUniform = (dayScaled: boolean) => {
    const m = fakeMaterial() as unknown as {
      onBeforeCompile: (s: ReturnType<typeof shaderStub>) => void
      userData: Record<string, unknown>
    }
    applyVisibilityLightmap(m as never, fakeTexture(), 6, false, [1, 1, 1], 0, 3.6, dayScaled)
    const s = shaderStub()
    m.onBeforeCompile(s)
    return s
  }

  it('is the exact identity for `clear` at every hour, in both flag states', () => {
    for (const d of [0, 0.37, 1]) {
      const clear = weatherGrade('clear', d)
      expect(clear.bounce).toBe(1)
      expect(clear.blowout).toBe(1)
      expect(visDayScale(d, true, clear.bounce)).toBe(visDayScale(d, true))
      expect(visDayScale(d, false, clear.bounce)).toBe(1)
    }
  })

  it('takes the grade BOUNCE, not its FILL — measured, they are a 1.7x apart', () => {
    // The bake is `with_sun_disc: false`, so it holds the sky DOME alone. Cycles puts a deck's
    // dome at 0.94/0.99 of a clear sky's where it puts the ROOM at 0.44/0.35 — the 60 % that
    // leaves is the beam, which `sun -> 0` already removes. `fill` would remove it twice.
    const overcast = weatherGrade('overcast', 1)
    expect(overcast.bounce).toBeCloseTo(0.95, 6)
    expect(overcast.sun).toBe(0)
    expect(overcast.bounce / overcast.fill).toBeGreaterThan(1.6)
    expect(visDayScale(1, true, overcast.bounce)).toBeCloseTo(0.95, 6)
    // Night: the grade ramps to identity, so a lamp-lit room looks the same in any weather.
    expect(weatherGrade('overcast', 0).bounce).toBe(1)
    expect(visDayScale(0, true, weatherGrade('overcast', 0).bounce)).toBe(0)
  })

  it('does NOT clamp the weather factor at 1 — partlyCloudy brightens the bake', () => {
    const pc = weatherGrade('partlyCloudy', 1)
    expect(pc.bounce).toBeGreaterThan(1)
    expect(visDayScale(1, true, pc.bounce)).toBeCloseTo(pc.bounce, 6)
    // ...but it is bounded, so a future grade cannot over-drive the injection.
    expect(visDayScale(1, true, 99)).toBe(2)
    expect(visDayScale(1, true, -1)).toBe(0)
    expect(visDayScale(1, true, Number.NaN)).toBe(1)
  })

  it('is ORTHOGONAL to bakedGiDayLevel — weather still reaches a material with the day flag off', () => {
    // The two are different defects. `dayScaled: false` drops the DAY ramp only; an overcast sky
    // is not a night, and a term that ignored it because another flag is off would be the same
    // rule-8 omission in a third place.
    expect(visDayScale(1, false, 0.55)).toBeCloseTo(0.55, 6)
    expect(visDayScale(0, false, 0.55)).toBeCloseTo(0.55, 6)
  })

  it('writes both uniforms live, with no recompile — the setLampBounce pattern', () => {
    const s = dayUniform(true)
    setVisDayLevel(1, 1)
    setExteriorBoostLevel(1, 1)
    expect(s.uniforms.visDay.value).toBe(1)
    expect(s.uniforms.exteriorBoost.value).toBeCloseTo(3.6, 6)
    const overcast = weatherGrade('overcast', 1)
    setVisDayLevel(1, overcast.bounce)
    setExteriorBoostLevel(1, overcast.blowout)
    expect(s.uniforms.visDay.value).toBeCloseTo(0.95, 6)
    expect(s.uniforms.exteriorBoost.value).toBeCloseTo(3.6 * overcast.blowout, 6)
    // The EXTERIOR face tracks OUTDOOR transmittance, not the room's fill: `blowout` is
    // `transmittance / fill`, and the analytic half under it is already scaled by `fill`.
    expect(overcast.blowout).toBeCloseTo(0.18 / 0.55, 6)
    setVisDayLevel(1, 1)
    setExteriorBoostLevel(1, 1)
  })

  it('does not change the program cache key — the factor is a uniform, not a variant', () => {
    setVisDayLevel(1, 0.55)
    const m = fakeMaterial() as unknown as { customProgramCacheKey: () => string }
    applyVisibilityLightmap(m as never, fakeTexture(), 6, false, [1, 1, 1], 0, 0, true)
    expect(m.customProgramCacheKey()).toBe('visLightmap:1')
    setVisDayLevel(1, 1)
  })
})

/**
 * LIGHTMAP-ENCODE-DECODE: `lightmapIndex.ts` now accepts a bake `--encode` in `(0, 1]` instead of
 * refusing every non-unit value, so the shader has to actually undo it. `visDecode = 1 / encode`
 * mirrors the `gain`/`tint`/`chroma` plumbing — a positional parameter defaulting to the
 * bit-identical off state.
 */
describe('LIGHTMAP-ENCODE-DECODE (visDecode)', () => {
  const compile = (encode?: number) => {
    const m = fakeMaterial() as unknown as {
      onBeforeCompile: (s: ReturnType<typeof shaderStub>) => void
      customProgramCacheKey: () => string
    }
    applyVisibilityLightmap(
      m as never,
      fakeTexture(),
      6,
      false,
      [1, 1, 1],
      0,
      0,
      false,
      false,
      encode,
    )
    const s = shaderStub()
    m.onBeforeCompile(s)
    return { m, s }
  }

  it('defaults visDecode to 1 — the bit-identical off state for every set shipped before this existed', () => {
    const { s } = compile()
    expect(s.uniforms.visDecode.value).toBe(1)
  })

  it('sets visDecode to 1 / encode — 2 for a --encode of 0.5', () => {
    const { s } = compile(0.5)
    expect(s.uniforms.visDecode.value).toBeCloseTo(2, 6)
  })

  it('declares the uniform, unconditionally, in every program', () => {
    const f = compile(0.5).s.fragmentShader
    expect(f).toContain('uniform float visDecode')
    expect(f).not.toContain('#ifdef')
  })

  it('places the decode branch AFTER the visTexel sample and BEFORE visOcclusion is derived', () => {
    const f = compile(0.5).s.fragmentShader
    // WALL-HEAD-CLAMP put the sample on a clamped copy of the varying; the ORDER this test
    // exists for is unchanged.
    const clampAt = f.indexOf('vec2 visUv = vec2( vVisUv.x, clamp(')
    const sampleAt = f.indexOf('vec4 visTexel = texture2D( visMap, visUv );')
    expect(clampAt).toBeGreaterThan(-1)
    expect(sampleAt).toBeGreaterThan(clampAt)
    const decodeAt = f.indexOf(
      'if ( visDecode != 1.0 ) { visTexel.rgb = pow( max( visTexel.rgb, vec3( 0.0 ) ), vec3( visDecode ) ); }',
    )
    const occlusionAt = f.indexOf('vec3 visOcclusion = mix(')
    expect(sampleAt).toBeGreaterThan(-1)
    expect(decodeAt).toBeGreaterThan(sampleAt)
    expect(occlusionAt).toBeGreaterThan(decodeAt)
  })

  it('does not change the program cache key — the exponent is a uniform, not a variant', () => {
    expect(compile(0.5).m.customProgramCacheKey()).toBe('visLightmap:1')
    expect(compile(1).m.customProgramCacheKey()).toBe('visLightmap:1')
  })

  it('falls back to 1 for an unusable exponent rather than feeding pow() garbage', () => {
    expect(compile(0).s.uniforms.visDecode.value).toBe(1)
    expect(compile(-1).s.uniforms.visDecode.value).toBe(1)
    expect(compile(Number.NaN).s.uniforms.visDecode.value).toBe(1)
  })
})

/**
 * MAPPED-DAYLIGHT-SPILL (W3) — the day-time analytic-fill floor under the baked term.
 *
 * The defect: the windowless `corridor`'s dome-only bake sees no aperture and returns ~0, and
 * `replace` mode had already thrown the analytic fill away — measured floor luma 16.2 at 13:00
 * beside `bedroom3` at 149.9 across an open doorway, and BRIGHTER at 21:00 lights-off than at
 * midday. The two properties that make the fix safe are asserted here: `max` never sums, and the
 * off state (`visSpill === 0`) is bit-identical because `max(x, 0.0) === x` for the non-negative
 * `x` the baked branch always produces.
 */
describe('MAPPED-DAYLIGHT-SPILL (visSpill)', () => {
  const compile = () => {
    const m = fakeMaterial() as unknown as {
      onBeforeCompile: (s: ReturnType<typeof shaderStub>) => void
      userData: Record<string, unknown>
    }
    applyVisibilityLightmap(m as never, fakeTexture(), 6, false, [1, 1, 1], 0, 0, true)
    const s = shaderStub()
    m.onBeforeCompile(s)
    return { m, s }
  }

  it('declares the uniform in EVERY program, with no `#ifdef` (rule 1)', () => {
    setVisSpillLevel(0)
    const f = compile().s.fragmentShader
    expect(f).toContain('uniform float visSpill')
    expect(f).not.toContain('#ifdef')
  })

  it('FLOORS the baked term with `max`, never sums — a sum would re-open the `.67` double-count', () => {
    const f = compile().s.fragmentShader
    expect(f).toContain(
      'reflectedLight.indirectDiffuse = visAnalytic * visNight + max( visLit, visAnalytic * visSpill );',
    )
    expect(f).not.toContain('+ visAnalytic * visSpill +')
  })

  it('setVisSpillLevel reaches every material, and clamps', () => {
    setVisSpillLevel(0)
    const a = compile()
    const b = compile()
    expect(a.s.uniforms.visSpill.value).toBe(0)
    setVisSpillLevel(DAYLIGHT_SPILL_K)
    expect(a.s.uniforms.visSpill.value).toBe(DAYLIGHT_SPILL_K)
    expect(b.s.uniforms.visSpill.value).toBe(DAYLIGHT_SPILL_K)
    setVisSpillLevel(-1)
    expect(a.s.uniforms.visSpill.value).toBe(0)
    setVisSpillLevel(9)
    expect(a.s.uniforms.visSpill.value).toBe(1)
    setVisSpillLevel(Number.NaN)
    expect(a.s.uniforms.visSpill.value).toBe(0)
  })

  it('k sits inside the 0.2–0.35 bracket a real corridor/room ratio gives', () => {
    expect(DAYLIGHT_SPILL_K).toBeGreaterThanOrEqual(0.2)
    expect(DAYLIGHT_SPILL_K).toBeLessThanOrEqual(0.35)
  })

  it('detaching unregisters the uniform, so a stale material cannot be written', () => {
    setVisSpillLevel(0)
    const { m, s } = compile()
    detachVisibilityLightmap(m as never)
    setVisSpillLevel(DAYLIGHT_SPILL_K)
    expect(s.uniforms.visSpill.value).toBe(0)
    expect(m.userData.visSpillUniform).toBeUndefined()
    setVisSpillLevel(0)
  })
})

/**
 * DAYLIGHT-HOUR-CURVE (W2) — the baked day level takes the clear-sky curve while the
 * LIGHTMAP-NIGHT-FLOOR crossfade keeps running off the RAW night ramp.
 */
describe('DAYLIGHT-HOUR-CURVE: setVisDayLevel takes a separate night ramp', () => {
  const compile = () => {
    const m = fakeMaterial() as unknown as {
      onBeforeCompile: (s: ReturnType<typeof shaderStub>) => void
      userData: Record<string, unknown>
    }
    applyVisibilityLightmap(m as never, fakeTexture(), 6, false, [1, 1, 1], 0, 0, true)
    const s = shaderStub()
    m.onBeforeCompile(s)
    return s
  }

  it('a dimmed 18:30 bake does NOT fade the analytic fill in at 18:30', () => {
    const s = compile()
    // `bakedDayLevel(7.3 degrees)` is 0.461 while the raw night ramp is still 1.
    setVisDayLevel(0.461, 1, 1)
    expect(s.uniforms.visDay.value).toBeCloseTo(0.461, 6)
    expect(s.uniforms.visNight.value).toBe(0)
    setVisDayLevel(1)
  })

  it('omitting the third argument is exactly the old two-argument behaviour', () => {
    const s = compile()
    setVisDayLevel(0.4)
    expect(s.uniforms.visNight.value).toBeCloseTo(0.6, 6)
    setVisDayLevel(1)
  })
})
