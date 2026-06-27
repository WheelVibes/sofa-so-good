import { describe, expect, it } from 'vitest'
import { anisotropyRotationForNormal, DEFAULT_ANISOTROPY_ROTATION, type Vec3 } from './brushAxis'

/**
 * BRUSH-AXIS — `anisotropyRotationForNormal` maps a face/mesh normal to the
 * `anisotropyRotation` that keeps the brushed-metal hairlines along the face's
 * dominant in-plane axis. Pure + deterministic, so it's tested without three/DOM.
 *
 * The contract that matters most: NO normal → the default (0) so the render is
 * byte-identical to today; horizontal faces keep the default; upright faces get a
 * quarter turn so the hairlines run vertically.
 */
const QUARTER = Math.PI / 2

describe('anisotropyRotationForNormal — default unchanged', () => {
  it('no normal (undefined) → the default rotation (legacy fixed U axis)', () => {
    expect(anisotropyRotationForNormal()).toBe(DEFAULT_ANISOTROPY_ROTATION)
    expect(anisotropyRotationForNormal(undefined)).toBe(DEFAULT_ANISOTROPY_ROTATION)
  })

  it('null normal → the default rotation', () => {
    expect(anisotropyRotationForNormal(null)).toBe(DEFAULT_ANISOTROPY_ROTATION)
  })

  it('the default rotation is 0 (byte-identical to the pre-BRUSH-AXIS material)', () => {
    expect(DEFAULT_ANISOTROPY_ROTATION).toBe(0)
  })
})

describe('anisotropyRotationForNormal — axis-aligned faces', () => {
  it('a top face (+Y normal) is horizontal → keeps the default (U already in-plane)', () => {
    expect(anisotropyRotationForNormal([0, 1, 0])).toBe(DEFAULT_ANISOTROPY_ROTATION)
  })

  it('a bottom face (−Y normal) → the default too', () => {
    expect(anisotropyRotationForNormal([0, -1, 0])).toBe(DEFAULT_ANISOTROPY_ROTATION)
  })

  it('a front face (+Z normal) is upright → a quarter turn (hairlines run vertical)', () => {
    expect(anisotropyRotationForNormal([0, 0, 1])).toBeCloseTo(QUARTER, 12)
  })

  it('a back face (−Z normal) → a quarter turn', () => {
    expect(anisotropyRotationForNormal([0, 0, -1])).toBeCloseTo(QUARTER, 12)
  })

  it('a left/right side face (±X normal) is upright → a quarter turn', () => {
    expect(anisotropyRotationForNormal([1, 0, 0])).toBeCloseTo(QUARTER, 12)
    expect(anisotropyRotationForNormal([-1, 0, 0])).toBeCloseTo(QUARTER, 12)
  })

  it('a non-unit normal is normalized internally (length-independent)', () => {
    expect(anisotropyRotationForNormal([0, 5, 0])).toBe(DEFAULT_ANISOTROPY_ROTATION)
    expect(anisotropyRotationForNormal([0, 0, 9])).toBeCloseTo(QUARTER, 12)
  })

  it('a steep-but-not-vertical normal past 45° still reads as an upright panel', () => {
    // Mostly horizontal (|y| < cos45°) → upright → quarter turn.
    expect(anisotropyRotationForNormal([1, 0.5, 0])).toBeCloseTo(QUARTER, 12)
    // Mostly vertical (|y| > cos45°) → horizontal face → default.
    expect(anisotropyRotationForNormal([0.5, 1, 0])).toBe(DEFAULT_ANISOTROPY_ROTATION)
  })
})

describe('anisotropyRotationForNormal — degenerate / non-finite normals', () => {
  it('a zero-length normal → the default (no plane to orient against)', () => {
    expect(anisotropyRotationForNormal([0, 0, 0])).toBe(DEFAULT_ANISOTROPY_ROTATION)
  })

  it('a near-zero normal (below the epsilon) → the default', () => {
    expect(anisotropyRotationForNormal([1e-9, 1e-9, 1e-9])).toBe(DEFAULT_ANISOTROPY_ROTATION)
  })

  it('a NaN / Infinity component → the default (never NaN out)', () => {
    expect(anisotropyRotationForNormal([Number.NaN, 0, 1])).toBe(DEFAULT_ANISOTROPY_ROTATION)
    expect(anisotropyRotationForNormal([0, Number.POSITIVE_INFINITY, 0])).toBe(
      DEFAULT_ANISOTROPY_ROTATION,
    )
    expect(anisotropyRotationForNormal([0, 0, Number.NEGATIVE_INFINITY])).toBe(
      DEFAULT_ANISOTROPY_ROTATION,
    )
  })
})

describe('anisotropyRotationForNormal — deterministic', () => {
  it('the same normal always yields the same rotation', () => {
    const cases: Vec3[] = [
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 0],
      [0.3, 0.4, 0.5],
      [0, 0, 0],
    ]
    for (const n of cases) {
      const first = anisotropyRotationForNormal(n)
      for (let i = 0; i < 5; i++) {
        expect(anisotropyRotationForNormal(n)).toBe(first)
      }
    }
  })

  it('every output is a finite number', () => {
    for (const n of [
      [0, 1, 0],
      [0, 0, 1],
      [0, 0, 0],
      [3, -2, 7],
    ] as Vec3[]) {
      expect(Number.isFinite(anisotropyRotationForNormal(n))).toBe(true)
    }
  })
})
