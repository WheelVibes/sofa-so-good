import { describe, expect, it } from 'vitest'
import { buildParametric } from './buildParts'
import { estimatePrice, partBoardArea } from './price'
import { defaultSpec } from './spec'

describe('partBoardArea', () => {
  it('returns the largest face area of a panel box', () => {
    expect(partBoardArea({ role: 'shelf', position: [0, 0, 0], size: [0.8, 0.018, 0.3] })).toBe(
      0.8 * 0.3,
    )
    // Orientation-independent.
    expect(partBoardArea({ role: 'side', position: [0, 0, 0], size: [0.018, 2, 0.3] })).toBe(
      2 * 0.3,
    )
  })
})

describe('estimatePrice', () => {
  it('is positive and rounded to $5 for every default type', () => {
    for (const type of ['bookshelf', 'wardrobe', 'sideboard'] as const) {
      const price = estimatePrice(buildParametric(defaultSpec(type)))
      expect(price).toBeGreaterThan(0)
      expect(price % 5).toBe(0)
    }
  })

  it('scales monotonically with size (more material costs more)', () => {
    const small = estimatePrice(
      buildParametric({ ...defaultSpec('bookshelf'), width: 0.4, height: 0.8 }),
    )
    const big = estimatePrice(
      buildParametric({ ...defaultSpec('bookshelf'), width: 2.0, height: 2.4 }),
    )
    expect(big).toBeGreaterThan(small)
  })

  it('doors add hardware cost over an open front', () => {
    const open = estimatePrice(buildParametric({ ...defaultSpec('wardrobe'), doors: false }))
    const doored = estimatePrice(buildParametric({ ...defaultSpec('wardrobe'), doors: true }))
    expect(doored).toBeGreaterThan(open)
  })

  it('lands in a plausible flat-pack band for a PAX-class wardrobe', () => {
    // 1.5 × 2.2 × 0.6 m hinged wardrobe ≈ mid-hundreds SGD, not $50, not $5000.
    const price = estimatePrice(buildParametric({ ...defaultSpec('wardrobe'), width: 1.5 }))
    expect(price).toBeGreaterThan(150)
    expect(price).toBeLessThan(1500)
  })
})
