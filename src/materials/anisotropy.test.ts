import { Texture } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import {
  __resetAnisotropyForTests,
  applyAnisotropy,
  getAnisotropy,
  setMaxAnisotropy,
} from './anisotropy'

afterEach(() => {
  __resetAnisotropyForTests()
})

describe('anisotropy cap (RD-401)', () => {
  it('returns a sane default before the renderer is known', () => {
    expect(getAnisotropy()).toBe(8)
  })

  it('applyAnisotropy stamps the current cap onto a texture', () => {
    const t = new Texture()
    applyAnisotropy(t)
    expect(t.anisotropy).toBe(8)
  })

  it('raises the cap to the device max once known', () => {
    setMaxAnisotropy(16)
    expect(getAnisotropy()).toBe(16)
    const t = applyAnisotropy(new Texture())
    expect(t.anisotropy).toBe(16)
  })

  it('clamps a low headless max (e.g. 1) instead of over-requesting', () => {
    setMaxAnisotropy(1)
    expect(getAnisotropy()).toBe(1)
    expect(applyAnisotropy(new Texture()).anisotropy).toBe(1)
  })

  it('never exceeds the reported device max for already-created textures', () => {
    // Texture created BEFORE the cap is resolved gets the default…
    const early = applyAnisotropy(new Texture())
    expect(early.anisotropy).toBe(8)
    const v0 = early.version
    // …then is bumped up to the real device max when it lands.
    setMaxAnisotropy(16)
    expect(early.anisotropy).toBe(16)
    // needsUpdate is a write-only setter that bumps `version` — assert the bump.
    expect(early.version).toBeGreaterThan(v0)
    expect(early.anisotropy).toBeLessThanOrEqual(getAnisotropy())
  })

  it('re-applies a lower device max to already-created textures (clamps down)', () => {
    const early = applyAnisotropy(new Texture())
    setMaxAnisotropy(2) // SwiftShader-style low cap
    expect(early.anisotropy).toBe(2)
    expect(getAnisotropy()).toBe(2)
  })

  it('floors a garbage / zero device max at 1', () => {
    setMaxAnisotropy(0)
    expect(getAnisotropy()).toBe(1)
    setMaxAnisotropy(Number.NaN)
    expect(getAnisotropy()).toBe(1)
  })

  it('is idempotent for the same resolved value', () => {
    const t = applyAnisotropy(new Texture())
    setMaxAnisotropy(16)
    const v = t.version
    setMaxAnisotropy(16) // same value → no re-apply churn
    expect(t.version).toBe(v)
  })
})
