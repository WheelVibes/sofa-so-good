import { describe, expect, it } from 'vitest'
import { estimateRenovation, floorRateKind, RENO_RATES, wallRateKind } from './renovationCost'

describe('floorRateKind / wallRateKind', () => {
  it('classifies floor finishes by keyword', () => {
    expect(floorRateKind('floor-tile-grey')).toBe('tile')
    expect(floorRateKind('floor-tile-marble')).toBe('stone')
    expect(floorRateKind('floor-terrazzo')).toBe('stone')
    expect(floorRateKind('floor-wood-oak')).toBe('wood')
    expect(floorRateKind('floor-vinyl-grey')).toBe('vinyl')
    expect(floorRateKind('floor-mystery')).toBe('other')
  })
  it('classifies wall finishes by keyword', () => {
    expect(wallRateKind('wall-paint-white')).toBe('paint')
    expect(wallRateKind('wall-tile-subway')).toBe('tile')
    expect(wallRateKind('wall-wallpaper-floral')).toBe('wallpaper')
    expect(wallRateKind('wall-unknown')).toBe('other')
  })
})

describe('estimateRenovation', () => {
  it('costs each finish area at its category rate and sums the subtotal', () => {
    const est = estimateRenovation(
      [
        { id: 'floor-tile-grey', area: 10 }, // 10 × 90 = 900
        { id: 'floor-wood-oak', area: 20 }, // 20 × 120 = 2400
      ],
      [
        { id: 'wall-paint-white', area: 50 }, // 50 × 22 = 1100
      ],
    )
    expect(est.floors).toHaveLength(2)
    expect(est.walls).toHaveLength(1)
    const oak = est.floors.find((l) => l.id === 'floor-wood-oak')!
    expect(oak.rate).toBe(RENO_RATES.floor.wood)
    expect(oak.cost).toBe(2400)
    expect(est.subtotal).toBe(900 + 2400 + 1100)
  })

  it('sorts lines by descending cost (biggest spend first)', () => {
    const est = estimateRenovation(
      [
        { id: 'floor-vinyl', area: 5 }, // 300
        { id: 'floor-tile-marble', area: 10 }, // 1500
      ],
      [],
    )
    expect(est.floors.map((l) => l.id)).toEqual(['floor-tile-marble', 'floor-vinyl'])
  })

  it('is zero for an empty design', () => {
    const est = estimateRenovation([], [])
    expect(est.subtotal).toBe(0)
    expect(est.floors).toHaveLength(0)
  })
})
