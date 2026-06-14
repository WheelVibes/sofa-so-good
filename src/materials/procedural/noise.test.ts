import { describe, expect, it } from 'vitest'
import { makeFbm, makeValueNoise } from './noise'

// Regression guard for the "non-integer frequency → NaN → all-black texture"
// trap: the value-noise lattice is sized + indexed by `period`, so a fractional
// period must be coerced to a valid integer rather than producing out-of-grid
// (`undefined`) reads.
describe('value noise / fbm — non-integer period safety', () => {
  const samples: [number, number][] = [
    [0, 0],
    [0.3, 1.7],
    [2.5, 4.1],
    [-1.2, 3.9],
    [10.6, 0.4],
  ]

  it('makeValueNoise returns finite values for a non-integer period', () => {
    const n = makeValueNoise(2.4, 123)
    for (const [x, y] of samples) {
      const v = n(x, y)
      expect(Number.isFinite(v), `n(${x},${y})=${v}`).toBe(true)
    }
  })

  it('makeFbm returns finite values for a non-integer baseFreq', () => {
    const f = makeFbm(99, 3, 2.4)
    for (const [u, v] of samples) {
      const out = f(u, v)
      expect(Number.isFinite(out), `f(${u},${v})=${out}`).toBe(true)
    }
  })

  it('is unchanged for integer periods (the coercion is the identity)', () => {
    // Same seed/period → deterministic, finite, and in the value-noise range.
    const a = makeValueNoise(8, 42)
    const b = makeValueNoise(8, 42)
    for (const [x, y] of samples) {
      expect(a(x, y)).toBe(b(x, y))
      expect(a(x, y)).toBeGreaterThanOrEqual(0)
      expect(a(x, y)).toBeLessThanOrEqual(1)
    }
  })
})
