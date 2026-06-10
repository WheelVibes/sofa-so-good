import { describe, expect, it } from 'vitest'
import { mountHeightPresets, mountHeightPresetsInRange } from './mountHeightPresets'

describe('mountHeightPresets', () => {
  it('returns TV-specific seated heights for a flatscreen', () => {
    const p = mountHeightPresets('flatscreen-tv')
    expect(p.some((x) => x.label.includes('Seated'))).toBe(true)
    // TVs hang lower than gallery art.
    expect(p.every((x) => x.height <= 1.3)).toBe(true)
  })

  it('returns the gallery 1.45 m centre for wall art', () => {
    const p = mountHeightPresets('wall-art')
    expect(p.some((x) => x.height === 1.45)).toBe(true)
  })

  it('matches the most specific group first (mirror over generic)', () => {
    const p = mountHeightPresets('wall-mirror')
    expect(p.some((x) => x.label.includes('Centre'))).toBe(true)
  })

  it('falls back to a generic set for an unknown mounted item', () => {
    const p = mountHeightPresets('mystery-wall-thing')
    expect(p).toHaveLength(3)
    expect(p.map((x) => x.height)).toEqual([1.1, 1.45, 1.7])
  })

  it('is case-insensitive on the def id', () => {
    expect(mountHeightPresets('WALL-ART')).toEqual(mountHeightPresets('wall-art'))
  })

  it('drops presets outside the field range', () => {
    // A range that only admits the lowest generic preset.
    const p = mountHeightPresetsInRange('mystery', 1.0, 1.2)
    expect(p).toEqual([{ label: 'Low 1.1 m', height: 1.1 }])
  })

  it('never returns out-of-range heights', () => {
    const p = mountHeightPresetsInRange('aircon-unit', 0, 2.3)
    expect(p.every((x) => x.height >= 0 && x.height <= 2.3)).toBe(true)
    // The 2.5 m ceiling option is excluded.
    expect(p.some((x) => x.height === 2.5)).toBe(false)
  })
})
