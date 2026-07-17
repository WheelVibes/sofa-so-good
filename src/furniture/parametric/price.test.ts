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
    for (const type of ['bookshelf', 'wardrobe', 'sideboard', 'desk'] as const) {
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

  it('a sliding/hinged front adds hardware cost over an open front', () => {
    const open = estimatePrice(
      buildParametric({ ...defaultSpec('wardrobe'), wardrobeFront: 'open' }),
    )
    const doored = estimatePrice(
      buildParametric({ ...defaultSpec('wardrobe'), wardrobeFront: 'sliding' }),
    )
    expect(doored).toBeGreaterThan(open)
  })

  it('lands in a plausible flat-pack band for a PAX-class wardrobe', () => {
    // 1.5 × 2.2 × 0.6 m modular wardrobe ≈ mid-hundreds SGD, not $50, not $5000.
    const price = estimatePrice(buildParametric({ ...defaultSpec('wardrobe'), width: 1.5 }))
    expect(price).toBeGreaterThan(150)
    expect(price).toBeLessThan(1500)
  })

  it('drawers add hardware cost over an open bay', () => {
    const openSpec = { ...defaultSpec('sideboard'), doors: false, compartments: [] }
    const drawerSpec = {
      ...openSpec,
      compartments: [{ style: 'drawer' as const }],
    }
    const pOpen = estimatePrice(buildParametric(openSpec))
    const pDrawer = estimatePrice(buildParametric(drawerSpec))
    expect(pDrawer).toBeGreaterThan(pOpen)
  })

  it('drawer-handle parts are skipped (counted with their drawer)', () => {
    const drawerSpec = {
      ...defaultSpec('sideboard'),
      doors: false,
      compartments: [{ style: 'drawer' as const }],
    }
    const model = buildParametric(drawerSpec)
    const handles = model.parts.filter((p) => p.role === 'drawer-handle')
    // estimatePrice skips handles; price should still be positive + $5-rounded.
    const price = estimatePrice(model)
    expect(handles.length).toBeGreaterThan(0)
    expect(price).toBeGreaterThan(0)
    expect(price % 5).toBe(0)
  })
})

describe('estimatePrice — kitchen-run', () => {
  it('is positive and $5-rounded for the default kitchen-run', () => {
    const price = estimatePrice(buildParametric(defaultSpec('kitchen-run')))
    expect(price).toBeGreaterThan(0)
    expect(price % 5).toBe(0)
  })

  it('includes all types now (including kitchen-run) and all positive + $5-rounded', () => {
    for (const type of ['bookshelf', 'wardrobe', 'sideboard', 'desk', 'kitchen-run'] as const) {
      const price = estimatePrice(buildParametric(defaultSpec(type)))
      expect(price).toBeGreaterThan(0)
      expect(price % 5).toBe(0)
    }
  })

  it('worktop slab pricing: kitchen-run with large worktop area costs more than a narrow one', () => {
    const narrow = estimatePrice(buildParametric({ ...defaultSpec('kitchen-run'), width: 0.6 }))
    const wide = estimatePrice(buildParametric({ ...defaultSpec('kitchen-run'), width: 3.6 }))
    expect(wide).toBeGreaterThan(narrow)
  })

  it('adding uppers increases price', () => {
    const base = estimatePrice(buildParametric({ ...defaultSpec('kitchen-run'), hasUppers: false }))
    const withUppers = estimatePrice(
      buildParametric({ ...defaultSpec('kitchen-run'), hasUppers: true }),
    )
    expect(withUppers).toBeGreaterThan(base)
  })

  it('lands in a plausible Singapore kitchen cabinet range for a 1.8 m run', () => {
    // A 3-bay 1.8 m base run + worktop should be $500–$8000 (budget–mid-market SG joinery).
    const price = estimatePrice(buildParametric(defaultSpec('kitchen-run')))
    expect(price).toBeGreaterThan(500)
    expect(price).toBeLessThan(8000)
  })

  it('drawer bays cost more than door bays (drawer slides add ~$35 per unit)', () => {
    const doorSpec = {
      ...defaultSpec('kitchen-run'),
      bays: 3,
      compartments: [
        { style: 'door' as const },
        { style: 'door' as const },
        { style: 'door' as const },
      ],
    }
    const drawerSpec = {
      ...defaultSpec('kitchen-run'),
      bays: 3,
      compartments: [
        { style: 'drawer' as const },
        { style: 'drawer' as const },
        { style: 'drawer' as const },
      ],
    }
    const pDoor = estimatePrice(buildParametric(doorSpec))
    const pDrawer = estimatePrice(buildParametric(drawerSpec))
    expect(pDrawer).toBeGreaterThan(pDoor)
  })
})
