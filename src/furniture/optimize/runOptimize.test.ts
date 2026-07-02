import { describe, expect, it } from 'vitest'
import { computePoolMax, HARD_POOL_MAX } from './runOptimize'

describe('computePoolMax (optimize worker pool ceiling)', () => {
  it('leaves a core free (cores - 1)', () => {
    expect(computePoolMax(4)).toBe(3)
    expect(computePoolMax(8)).toBe(7)
    expect(computePoolMax(2)).toBe(1)
  })

  it('hard-caps at HARD_POOL_MAX on many-core machines', () => {
    expect(computePoolMax(16)).toBe(HARD_POOL_MAX)
    expect(computePoolMax(64)).toBe(HARD_POOL_MAX)
  })

  it('handles single-core (→1) and bogus input (→ fallback of 4 cores → 3)', () => {
    expect(computePoolMax(1)).toBe(1)
    expect(computePoolMax(0)).toBe(3) // 0 is not a valid core count → fallback to 4
    expect(computePoolMax(Number.NaN)).toBe(3) // ditto
    expect(computePoolMax(-8)).toBe(3)
  })

  it('downshifts on low-memory devices', () => {
    // 8 cores would allow 7, but low RAM clamps it.
    expect(computePoolMax(8, 2)).toBe(2)
    expect(computePoolMax(8, 4)).toBe(4)
    expect(computePoolMax(8, 1)).toBe(2)
  })

  it('does not upshift beyond the core budget when memory is plentiful', () => {
    // Plenty of RAM must not raise the pool above cores - 1.
    expect(computePoolMax(4, 8)).toBe(3)
    expect(computePoolMax(4, 32)).toBe(3)
  })

  it('ignores memory when unknown (undefined)', () => {
    expect(computePoolMax(8, undefined)).toBe(7)
  })
})
