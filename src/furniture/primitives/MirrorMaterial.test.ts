import { describe, expect, it } from 'vitest'
import { mirrorReflectorConfig } from './MirrorMaterial'

describe('mirrorReflectorConfig', () => {
  it('enables real reflections only on High and Maximum', () => {
    expect(mirrorReflectorConfig('performance').real).toBe(false)
    expect(mirrorReflectorConfig('medium').real).toBe(false)
    expect(mirrorReflectorConfig('high').real).toBe(true)
    expect(mirrorReflectorConfig('maximum').real).toBe(true)
  })

  it('scales reflection resolution with the tier', () => {
    expect(mirrorReflectorConfig('high').resolution).toBe(512)
    expect(mirrorReflectorConfig('maximum').resolution).toBe(1024)
    // Lower tiers carry no reflector, so resolution is unused (0).
    expect(mirrorReflectorConfig('medium').resolution).toBe(0)
  })
})
