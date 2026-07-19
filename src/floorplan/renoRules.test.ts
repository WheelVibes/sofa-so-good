import { describe, expect, it } from 'vitest'
import { RENO_RULES, RENO_RULES_AS_OF } from './renoRules'

describe('RENO_RULES reference pack (R4-6)', () => {
  it('bundles the four cited rule sections', () => {
    const ids = RENO_RULES.map((s) => s.id)
    expect(ids).toEqual(['wet-area', 'windows-grilles', 'working-hours', 'permits-drc'])
  })

  it('every section has a title, at least one point, and a cited source', () => {
    for (const s of RENO_RULES) {
      expect(s.title.length).toBeGreaterThan(0)
      expect(s.points.length).toBeGreaterThan(0)
      expect(s.source).toMatch(/\./) // a domain-like source
      for (const p of s.points) expect(p.trim().length).toBeGreaterThan(0)
    }
  })

  it('mentions the 3-year wet-area tile rule', () => {
    const wet = RENO_RULES.find((s) => s.id === 'wet-area')!
    expect(wet.points.join(' ')).toMatch(/3 years/)
  })

  it('is dated so its currency is clear', () => {
    expect(RENO_RULES_AS_OF).toBe('2026')
  })
})
