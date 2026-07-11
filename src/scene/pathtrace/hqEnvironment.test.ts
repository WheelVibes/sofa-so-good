import { DataTexture, EquirectangularReflectionMapping, HalfFloatType } from 'three'
import { describe, expect, it } from 'vitest'
import { HDRI_PRESETS } from '../lighting/hdriCatalog'
import { hqEnvironmentUrl, isReusableEquirectEnvironment } from './hqEnvironment'

describe('hqEnvironmentUrl (PHOTO-HDRI-PT)', () => {
  it('resolves the selected preset URL when the flag is on', () => {
    const preset = HDRI_PRESETS[0]
    expect(hqEnvironmentUrl(true, preset.id)).toBe(preset.url)
  })

  it('returns null when the flag is off — even with a selection (gradient fallback)', () => {
    expect(hqEnvironmentUrl(false, HDRI_PRESETS[0].id)).toBeNull()
  })

  it('returns null for no/unknown selection (procedural mode stays gradient)', () => {
    expect(hqEnvironmentUrl(true, null)).toBeNull()
    expect(hqEnvironmentUrl(true, undefined)).toBeNull()
    expect(hqEnvironmentUrl(true, 'not-a-real-hdri')).toBeNull()
  })
})

describe('isReusableEquirectEnvironment', () => {
  it('accepts the RGBELoader-style equirect DataTexture the live IBL holds', () => {
    const tex = new DataTexture(new Uint16Array(4 * 4), 2, 2)
    tex.type = HalfFloatType
    tex.mapping = EquirectangularReflectionMapping
    expect(isReusableEquirectEnvironment(tex)).toBe(true)
  })

  it('rejects null / non-textures', () => {
    expect(isReusableEquirectEnvironment(null)).toBe(false)
    expect(isReusableEquirectEnvironment(undefined)).toBe(false)
    expect(isReusableEquirectEnvironment({})).toBe(false)
  })

  it('rejects a non-equirect mapping (the procedural cube probe)', () => {
    const tex = new DataTexture(new Uint16Array(4 * 4), 2, 2)
    // default mapping (UVMapping) — not equirect
    expect(isReusableEquirectEnvironment(tex)).toBe(false)
  })

  it('rejects render-target textures (no CPU-readable image data)', () => {
    const tex = new DataTexture(new Uint16Array(4 * 4), 2, 2)
    tex.mapping = EquirectangularReflectionMapping
    tex.isRenderTargetTexture = true
    expect(isReusableEquirectEnvironment(tex)).toBe(false)
  })
})
