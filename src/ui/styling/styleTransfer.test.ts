import { describe, expect, it } from 'vitest'
import { BUILTIN_MATERIALS } from '../../materials/builtinCatalog'
import { planStyleApply, STYLE_PRESETS } from './styleTransfer'

describe('styleTransfer presets', () => {
  it('every preset references a real builtin floor + wall finish', () => {
    for (const s of STYLE_PRESETS) {
      expect(BUILTIN_MATERIALS[s.floorFinishId], `floor for ${s.id}`).toBeDefined()
      expect(BUILTIN_MATERIALS[s.wallFinishId], `wall for ${s.id}`).toBeDefined()
      expect(s.floorFinishId.startsWith('floor-'), `${s.id} floor id shape`).toBe(true)
      expect(s.wallFinishId.startsWith('wall-'), `${s.id} wall id shape`).toBe(true)
    }
  })

  it('every preset has a valid hex palette of 1–5 colours', () => {
    for (const s of STYLE_PRESETS) {
      expect(s.palette.length, `${s.id} palette size`).toBeGreaterThanOrEqual(1)
      expect(s.palette.length, `${s.id} palette size`).toBeLessThanOrEqual(5)
      for (const hex of s.palette) {
        expect(hex, `${s.id} hex ${hex}`).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    }
  })

  it('preset ids are unique', () => {
    const ids = STYLE_PRESETS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('planStyleApply', () => {
  it('resolves a known style id to its floor/wall/palette plan', () => {
    const scandi = STYLE_PRESETS.find((s) => s.id === 'scandi')
    expect(scandi).toBeDefined()
    const plan = planStyleApply('scandi')
    expect(plan).toEqual({
      floorFinishId: scandi?.floorFinishId,
      wallFinishId: scandi?.wallFinishId,
      palette: scandi?.palette,
    })
  })

  it('returns null for an unknown style id', () => {
    expect(planStyleApply('nope')).toBeNull()
  })

  it('honours an injected preset list', () => {
    const custom = [
      {
        id: 'x',
        name: 'X',
        description: '',
        floorFinishId: 'floor-concrete',
        wallFinishId: 'wall-paint-white',
        palette: ['#ffffff'],
      },
    ]
    expect(planStyleApply('x', custom)?.floorFinishId).toBe('floor-concrete')
    expect(planStyleApply('scandi', custom)).toBeNull()
  })
})
