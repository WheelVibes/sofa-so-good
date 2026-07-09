import { describe, expect, it } from 'vitest'
import { changeAffectsShadow, SHADOW_IRRELEVANT_KEYS } from './shadowRelevance'

const base = {
  items: [1],
  floorPlan: { a: 1 },
  orientationDeg: 0,
  selectedItemId: null,
  finishes: {},
}

describe('changeAffectsShadow', () => {
  it('pulses when shadow-casting geometry changes (items)', () => {
    expect(changeAffectsShadow({ ...base, items: [1, 2] }, base)).toBe(true)
  })

  it('pulses when the floor plan changes (walls/rooms → shadow + occluder)', () => {
    expect(changeAffectsShadow({ ...base, floorPlan: { a: 2 } }, base)).toBe(true)
  })

  it('pulses when the sun orientation changes', () => {
    expect(changeAffectsShadow({ ...base, orientationDeg: 90 }, base)).toBe(true)
  })

  it('does NOT pulse for a selection-only change', () => {
    expect(changeAffectsShadow({ ...base, selectedItemId: 'x' }, base)).toBe(false)
  })

  it('does NOT pulse for a finish/material-only change', () => {
    expect(changeAffectsShadow({ ...base, finishes: { floor: 'oak' } }, base)).toBe(false)
  })

  it('does NOT pulse when only multiple irrelevant keys change together', () => {
    expect(
      changeAffectsShadow(
        { ...base, selectedItemId: 'x', catalogOpen: true, hoveredItemId: 'y' },
        {
          ...base,
          catalogOpen: false,
          hoveredItemId: null,
        },
      ),
    ).toBe(false)
  })

  it('pulses when a relevant AND an irrelevant key change together (fail-open)', () => {
    expect(changeAffectsShadow({ ...base, items: [1, 2], selectedItemId: 'x' }, base)).toBe(true)
  })

  it('fail-open: an UNLISTED (unknown/new) key change pulses', () => {
    expect(
      changeAffectsShadow({ ...base, someBrandNewKey: 2 }, { ...base, someBrandNewKey: 1 }),
    ).toBe(true)
  })

  it('returns false when nothing changed', () => {
    expect(changeAffectsShadow({ ...base }, { ...base })).toBe(false)
  })

  it('never lists a known geometry/sun key in the irrelevant set', () => {
    for (const k of [
      'items',
      'floorPlan',
      'orientationDeg',
      'doors',
      'hiddenItemIds',
      'isolateActive',
      'viewLevelId',
      'showCeilingFixtures',
    ]) {
      expect(SHADOW_IRRELEVANT_KEYS.has(k)).toBe(false)
    }
  })
})
