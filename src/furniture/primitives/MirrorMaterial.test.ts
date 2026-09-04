import { describe, expect, it } from 'vitest'
import { mirrorReflectorConfig } from './MirrorMaterial'

describe('mirrorReflectorConfig', () => {
  it('enables real reflections only in realistic, on either device class', () => {
    // Parity with the retired ladder: the gate was High-or-Maximum, and those two
    // rungs are exactly the two variants of `realistic`.
    expect(mirrorReflectorConfig('performance', 'weak').real).toBe(false)
    expect(mirrorReflectorConfig('performance', 'capable').real).toBe(false)
    expect(mirrorReflectorConfig('realistic', 'weak').real).toBe(true)
    expect(mirrorReflectorConfig('realistic', 'capable').real).toBe(true)
  })

  it('scales reflection resolution with the DEVICE CLASS, as it used to with the rung', () => {
    // Old high → 512, old maximum → 1024. Same two numbers, same two pictures.
    expect(mirrorReflectorConfig('realistic', 'weak').resolution).toBe(512)
    expect(mirrorReflectorConfig('realistic', 'capable').resolution).toBe(1024)
    // Performance carries no reflector, so resolution is unused (0).
    expect(mirrorReflectorConfig('performance', 'capable').resolution).toBe(0)
  })
})
