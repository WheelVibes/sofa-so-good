import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRICE_RULES,
  estimateRenovation,
  floorRateFor,
  floorRateKind,
  isNonDefaultPriceRules,
  mergePriceRules,
  RENO_RATES,
  wallRateFor,
  wallRateKind,
} from './renovationCost'

describe('price-rule library', () => {
  it('DEFAULT_PRICE_RULES reproduces the built-in rate table', () => {
    expect(DEFAULT_PRICE_RULES.floor).toEqual(RENO_RATES.floor)
    expect(DEFAULT_PRICE_RULES.wall).toEqual(RENO_RATES.wall)
    expect(DEFAULT_PRICE_RULES.carpentryPerM).toBe(320)
  })

  it('floorRateFor / wallRateFor resolve a finish id through the rate card', () => {
    const rules = mergePriceRules({ floor: { wood: 200 }, wall: { paint: 30 } })
    expect(floorRateFor(rules, 'floor-wood-oak')).toBe(200)
    expect(floorRateFor(rules, 'floor-tile-grey')).toBe(RENO_RATES.floor.tile) // untouched bucket
    expect(wallRateFor(rules, 'wall-paint-white')).toBe(30)
  })

  it('mergePriceRules sanitises negatives / NaN / missing back to defaults', () => {
    const merged = mergePriceRules({
      floor: { wood: -5, tile: Number.NaN, vinyl: 70 },
      carpentryPerM: -1,
    })
    expect(merged.floor.wood).toBe(RENO_RATES.floor.wood) // negative rejected
    expect(merged.floor.tile).toBe(RENO_RATES.floor.tile) // NaN rejected
    expect(merged.floor.vinyl).toBe(70) // valid override kept
    expect(merged.carpentryPerM).toBe(320) // negative rejected
    expect(merged.wall).toEqual(RENO_RATES.wall) // absent → defaults
  })

  it('mergePriceRules(undefined) returns the defaults', () => {
    expect(mergePriceRules(undefined)).toEqual(DEFAULT_PRICE_RULES)
  })

  it('isNonDefaultPriceRules detects any changed rate', () => {
    expect(isNonDefaultPriceRules(DEFAULT_PRICE_RULES)).toBe(false)
    expect(isNonDefaultPriceRules(mergePriceRules({ floor: { wood: 999 } }))).toBe(true)
    expect(isNonDefaultPriceRules(mergePriceRules({ carpentryPerM: 400 }))).toBe(true)
  })

  it('estimateRenovation honours a custom rate card', () => {
    const floors = [{ id: 'floor-wood-oak', area: 10 }]
    const walls = [{ id: 'wall-paint-white', area: 20 }]
    const def = estimateRenovation(floors, walls)
    const custom = estimateRenovation(floors, walls, mergePriceRules({ floor: { wood: 240 } }))
    expect(def.floors[0].rate).toBe(RENO_RATES.floor.wood)
    expect(custom.floors[0].rate).toBe(240)
    expect(custom.floors[0].cost).toBe(2400)
    // Walls untouched bucket prices identically.
    expect(custom.walls[0].rate).toBe(def.walls[0].rate)
  })
})

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
