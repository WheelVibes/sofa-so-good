import { describe, expect, it } from 'vitest'
import { parseTourDuration } from './recordViewTour'

describe('parseTourDuration', () => {
  it('returns null when the prompt is cancelled / left blank', () => {
    expect(parseTourDuration(null, 3, 15)).toBeNull()
  })

  it('falls back to the default for non-numeric input', () => {
    expect(parseTourDuration('abc', 3, 15)).toBe(15)
  })

  it('falls back to the default for zero / negative input', () => {
    expect(parseTourDuration('0', 3, 15)).toBe(15)
    expect(parseTourDuration('-4', 3, 15)).toBe(15)
  })

  it('passes a valid in-range total straight through', () => {
    expect(parseTourDuration('20', 3, 15)).toBe(20)
  })

  it('clamps a too-short total up to the min per-leg pace (0.5s/leg)', () => {
    // 3 legs → min total 1.5s
    expect(parseTourDuration('0.2', 3, 15)).toBe(1.5)
  })

  it('clamps a too-long total down to the max per-leg pace (12s/leg)', () => {
    // 3 legs → max total 36s
    expect(parseTourDuration('999', 3, 15)).toBe(36)
  })

  it('treats a degenerate leg count as at least one leg', () => {
    expect(parseTourDuration('100', 0, 5)).toBe(12)
  })
})
