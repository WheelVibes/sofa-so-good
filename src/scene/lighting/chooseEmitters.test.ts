import { describe, expect, it } from 'vitest'
import { QUALITY_PRESETS } from '../quality'
import { chooseEmitters, fixtureLightBudget, ORBIT_BUDGET_MULTIPLIER } from './chooseEmitters'

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
