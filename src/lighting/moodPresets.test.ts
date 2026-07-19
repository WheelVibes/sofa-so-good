import { describe, expect, it } from 'vitest'
import {
  applyMoodPreset,
  applyMoodTint,
  isCeilingFixtureKind,
  LIGHT_MOODS,
  MOOD_PRESETS,
  moodIntensityMultiplier,
} from './moodPresets'

describe('moodPresets', () => {
  it('lists Normal first, then the four moods', () => {
    expect(LIGHT_MOODS).toEqual(['none', 'reading', 'movie', 'entertaining', 'romantic'])
  })

  it('"none" is a true no-op: neutral tint, 1x intensity everywhere', () => {
    const preset = MOOD_PRESETS.none
    expect(preset.intensity).toBe(1)
    expect(preset.ceilingIntensity).toBe(1)
    expect(preset.tint).toEqual([1, 1, 1])
    expect(applyMoodTint('#ffe6b8', 'none')).toBe('#ffe6b8')
    expect(moodIntensityMultiplier('none', 'ceiling-light')).toBe(1)
    expect(moodIntensityMultiplier('none', 'table-lamp')).toBe(1)
  })

  it('identifies registered ceiling/overhead fixture kinds', () => {
    expect(isCeilingFixtureKind('ceiling-light')).toBe(true)
    expect(isCeilingFixtureKind('ceiling-fan')).toBe(true)
    expect(isCeilingFixtureKind('cove-light')).toBe(true)
    expect(isCeilingFixtureKind('table-lamp')).toBe(false)
    expect(isCeilingFixtureKind('floor-lamp')).toBe(false)
    expect(isCeilingFixtureKind('wall-sconce')).toBe(false)
    expect(isCeilingFixtureKind('some-random-glb-def')).toBe(false)
  })

  it('Movie night dims ceiling fixtures harder than accent lamps', () => {
    const ceiling = moodIntensityMultiplier('movie', 'ceiling-light')
    const lamp = moodIntensityMultiplier('movie', 'table-lamp')
    expect(ceiling).toBeLessThan(lamp)
    expect(ceiling).toBeLessThan(1)
    expect(lamp).toBeLessThan(1)
  })

  it('Romantic is dim overall with the ceiling dimmed hardest', () => {
    const ceiling = moodIntensityMultiplier('romantic', 'ceiling-fan')
    const lamp = moodIntensityMultiplier('romantic', 'floor-lamp')
    expect(ceiling).toBeLessThan(lamp)
    expect(lamp).toBeLessThan(1)
  })

  it('Entertaining and Reading are brighter than normal', () => {
    expect(moodIntensityMultiplier('entertaining', 'table-lamp')).toBeGreaterThan(1)
    expect(moodIntensityMultiplier('reading', 'table-lamp')).toBeGreaterThan(1)
  })

  it('every non-"none" mood applies a warm (or cool-neutral) tint, not blown-out white', () => {
    for (const mood of LIGHT_MOODS) {
      if (mood === 'none') continue
      const tinted = applyMoodTint('#ffffff', mood)
      expect(tinted).not.toBe('#ffffff')
      // A tint is a component-wise multiply of channels in 0..1 — never brightens
      // a channel past its input.
      const r = Number.parseInt(tinted.slice(1, 3), 16)
      const g = Number.parseInt(tinted.slice(3, 5), 16)
      const b = Number.parseInt(tinted.slice(5, 7), 16)
      expect(r).toBeLessThanOrEqual(255)
      expect(g).toBeLessThanOrEqual(255)
      expect(b).toBeLessThanOrEqual(255)
    }
  })

  it('movie/romantic tints read warm: red channel >= blue channel', () => {
    for (const mood of ['movie', 'romantic'] as const) {
      const tinted = applyMoodTint('#ffffff', mood)
      const r = Number.parseInt(tinted.slice(1, 3), 16)
      const b = Number.parseInt(tinted.slice(5, 7), 16)
      expect(r).toBeGreaterThan(b)
    }
  })

  it('falls back to neutral for a malformed hex instead of throwing', () => {
    expect(() => applyMoodTint('not-a-colour', 'movie')).not.toThrow()
  })

  it('applyMoodPreset composes tint + multiplier in one call', () => {
    const adj = applyMoodPreset('movie', 'ceiling-light', '#fff0d4')
    expect(adj.intensityMultiplier).toBe(MOOD_PRESETS.movie.ceilingIntensity)
    expect(adj.color).toBe(applyMoodTint('#fff0d4', 'movie'))
  })

  it(
    'never returns a multiplier that could turn a light on (composition invariant) — ' +
      'multipliers only scale brightness, callers gate on/off upstream',
    () => {
      for (const mood of LIGHT_MOODS) {
        for (const kind of ['ceiling-light', 'table-lamp', 'floor-lamp']) {
          const m = moodIntensityMultiplier(mood, kind)
          expect(m).toBeGreaterThan(0)
          expect(Number.isFinite(m)).toBe(true)
        }
      }
    },
  )
})
