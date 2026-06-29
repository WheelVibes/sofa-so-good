import { describe, expect, it } from 'vitest'
import { chooseScaleBar } from './scaleBar'

describe('chooseScaleBar', () => {
  it('picks a metric length near the pixel target', () => {
    // 50 px/m → a 2 m bar is 100 px (≤110), 5 m would be 250 px (too wide).
    const r = chooseScaleBar(50, 'metric', 110)
    expect(r.meters).toBe(2)
    expect(r.px).toBeCloseTo(100)
    expect(r.label).toBe('2 m')
  })

  it('drops to sub-metre labels when zoomed in', () => {
    // 400 px/m → 0.2 m is 80 px (≤110), 0.5 m would be 200 px.
    const r = chooseScaleBar(400, 'metric', 110)
    expect(r.meters).toBe(0.2)
    expect(r.label).toBe('20 cm')
  })

  it('grows the bar length when zoomed far out', () => {
    // 2 px/m → 50 m is 100 px (≤110), 100 m would be 200 px.
    const r = chooseScaleBar(2, 'metric', 110)
    expect(r.meters).toBe(50)
  })

  it('falls back to the smallest step when even it overflows the target', () => {
    // Extreme zoom: smallest 0.05 m already exceeds the target → still returned.
    const r = chooseScaleBar(100000, 'metric', 110)
    expect(r.meters).toBe(0.05)
  })

  it('chooses imperial feet at their true metre length', () => {
    // 50 px/m, target 110 → 5 ft = 1.524 m = 76 px (≤110); 10 ft = 152 px.
    const r = chooseScaleBar(50, 'imperial', 110)
    expect(r.label).toBe('5 ft')
    expect(r.meters).toBeCloseTo(1.524)
  })

  it('throws on a non-positive scale', () => {
    expect(() => chooseScaleBar(0, 'metric')).toThrow()
    expect(() => chooseScaleBar(-5, 'metric')).toThrow()
    expect(() => chooseScaleBar(Number.NaN, 'metric')).toThrow()
  })
})
