import { describe, expect, it } from 'vitest'
import { QUALITY_PRESETS } from '../quality'
import {
  chooseEmitters,
  fixtureLightBudget,
  LIGHT_SLOT_STEP,
  lightSlotCount,
  ORBIT_BUDGET_MULTIPLIER,
} from './chooseEmitters'

describe('fixtureLightBudget', () => {
  it('walk mode uses the raw maxFixtureLights cap', () => {
    expect(fixtureLightBudget('firstPerson', 6)).toBe(6)
    expect(fixtureLightBudget('firstPerson', 2)).toBe(2)
  })

  it('orbit mode scales the cap by the orbit multiplier', () => {
    expect(fixtureLightBudget('orbit', 6)).toBe(6 * ORBIT_BUDGET_MULTIPLIER)
    expect(fixtureLightBudget('orbit', 2)).toBe(2 * ORBIT_BUDGET_MULTIPLIER)
  })

  it('is tier-aware: higher tiers allow more live lights in both modes', () => {
    const perf = QUALITY_PRESETS.performance.maxFixtureLights
    const max = QUALITY_PRESETS.maximum.maxFixtureLights
    expect(max).toBeGreaterThan(perf)
    expect(fixtureLightBudget('orbit', max)).toBeGreaterThan(fixtureLightBudget('orbit', perf))
    expect(fixtureLightBudget('firstPerson', max)).toBeGreaterThan(
      fixtureLightBudget('firstPerson', perf),
    )
    // Orbit always allows at least as many as walk at the same tier.
    expect(fixtureLightBudget('orbit', perf)).toBeGreaterThanOrEqual(
      fixtureLightBudget('firstPerson', perf),
    )
  })

  it('never returns a negative or fractional budget', () => {
    expect(fixtureLightBudget('firstPerson', 0)).toBe(0)
    expect(fixtureLightBudget('orbit', 0)).toBe(0)
  })
})

describe('chooseEmitters', () => {
  // A nearest-first ranked list (the caller sorts by squared distance).
  const ranked = Array.from({ length: 50 }, (_, i) => ({ id: `e${i}` }))

  it('walk mode keeps only the nearest maxFixtureLights', () => {
    const chosen = chooseEmitters(ranked, 'firstPerson', 6)
    expect(chosen).toHaveLength(6)
    expect(chosen.map((e) => e.id)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4', 'e5'])
  })

  it('orbit mode caps at maxFixtureLights * multiplier (no longer renders every emitter)', () => {
    const chosen = chooseEmitters(ranked, 'orbit', 6)
    expect(chosen).toHaveLength(6 * ORBIT_BUDGET_MULTIPLIER)
    // PERF-002: 50 emitters must NOT all become live lights.
    expect(chosen.length).toBeLessThan(ranked.length)
    // Still the nearest ones.
    expect(chosen[0].id).toBe('e0')
  })

  it('respects the per-tier cap in orbit', () => {
    for (const tier of ['performance', 'medium', 'high', 'maximum'] as const) {
      const max = QUALITY_PRESETS[tier].maxFixtureLights
      const chosen = chooseEmitters(ranked, 'orbit', max)
      expect(chosen.length).toBeLessThanOrEqual(max * ORBIT_BUDGET_MULTIPLIER)
      expect(chosen.length).toBeLessThanOrEqual(ranked.length)
    }
  })

  it('is a no-op (returns the same array) when under the budget', () => {
    const few = ranked.slice(0, 3)
    expect(chooseEmitters(few, 'firstPerson', 6)).toBe(few)
    expect(chooseEmitters(few, 'orbit', 6)).toBe(few)
  })

  it('handles exactly-at-budget without slicing', () => {
    const exact = ranked.slice(0, 6)
    expect(chooseEmitters(exact, 'firstPerson', 6)).toBe(exact)
    const exactOrbit = ranked.slice(0, 6 * ORBIT_BUDGET_MULTIPLIER)
    expect(chooseEmitters(exactOrbit, 'orbit', 6)).toBe(exactOrbit)
  })

  it('handles zero emitters', () => {
    expect(chooseEmitters([], 'orbit', 6)).toHaveLength(0)
    expect(chooseEmitters([], 'firstPerson', 6)).toHaveLength(0)
  })

  it('handles a zero budget by dropping all lights', () => {
    expect(chooseEmitters(ranked, 'firstPerson', 0)).toHaveLength(0)
  })
})

describe('lightSlotCount (LIGHT-COUNT-STABLE)', () => {
  it('renders nothing for no emitters', () => {
    // Four dead lights in an unlit scene would be pure waste.
    expect(lightSlotCount(0, 36)).toBe(0)
    expect(lightSlotCount(-3, 36)).toBe(0)
  })

  it('rounds up to the quantisation step', () => {
    expect(lightSlotCount(1, 36)).toBe(LIGHT_SLOT_STEP)
    expect(lightSlotCount(LIGHT_SLOT_STEP, 36)).toBe(LIGHT_SLOT_STEP)
    expect(lightSlotCount(LIGHT_SLOT_STEP + 1, 36)).toBe(LIGHT_SLOT_STEP * 2)
  })

  it('absorbs the +/-1 wobble that caused the recompiles', () => {
    // The measured defect: the live set moved 18 -> 19 as the camera moved, and
    // three bakes the light COUNT into every lit material's program cache key, so
    // 29 materials recompiled in one frame (204-214ms). Both counts must now map
    // to the same number of slots.
    expect(lightSlotCount(18, 36)).toBe(lightSlotCount(19, 36))
    expect(lightSlotCount(17, 36)).toBe(lightSlotCount(20, 36))
  })

  it('never exceeds the tier budget', () => {
    // The budget is itself a program boundary, but one the user only crosses on a
    // tier change — which already happens behind a loading overlay.
    expect(lightSlotCount(10, 12)).toBeLessThanOrEqual(12)
    expect(lightSlotCount(11, 12)).toBeLessThanOrEqual(12)
  })

  it('never returns fewer slots than there are live emitters', () => {
    // Dropping a real light to satisfy the budget is the caller's job
    // (`chooseEmitters`); this function must never silently unlight a fixture.
    for (let n = 1; n <= 40; n++) {
      expect(lightSlotCount(n, 12)).toBeGreaterThanOrEqual(Math.min(n, n))
    }
    expect(lightSlotCount(20, 5)).toBe(20)
  })

  it('pads by at most step-1 lights', () => {
    // The cost ceiling: padding to the full budget would trade a one-off compile
    // for a permanent per-fragment cost.
    for (let n = 1; n <= 40; n++) {
      const slots = lightSlotCount(n, 100)
      expect(slots - n).toBeLessThan(LIGHT_SLOT_STEP)
    }
  })

  it('survives a non-finite budget', () => {
    expect(lightSlotCount(5, Number.NaN)).toBeGreaterThanOrEqual(5)
  })
})
