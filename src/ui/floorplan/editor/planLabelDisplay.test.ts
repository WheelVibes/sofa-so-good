import { describe, expect, it } from 'vitest'
import {
  dimFontPx,
  roomFontPx,
  roomLabelDetail,
  showOpeningDim,
  showWallDim,
  wrapLabel,
} from './planLabelDisplay'

describe('wrapLabel', () => {
  it('keeps a short name on one line', () => {
    expect(wrapLabel('Kitchen', 12)).toEqual(['Kitchen'])
  })

  it('wraps a two-word name onto two lines when it would overflow', () => {
    expect(wrapLabel('Household Shelter', 10)).toEqual(['Household', 'Shelter'])
  })

  it('hyphenates a single word that is too long for the line', () => {
    expect(wrapLabel('Household', 6)).toEqual(['House-', 'hold'])
  })

  it('always returns at least one line', () => {
    expect(wrapLabel('', 8)).toEqual([''])
  })
})

describe('dimFontPx / roomFontPx', () => {
  it('scale with zoom but stay within legible bounds', () => {
    expect(dimFontPx(10)).toBe(8) // clamped to min when zoomed far out
    expect(dimFontPx(1000)).toBe(13) // clamped to max when zoomed far in
    expect(dimFontPx(62.5)).toBeCloseTo(10) // mid range scales linearly
    expect(roomFontPx(10)).toBe(9)
    expect(roomFontPx(1000)).toBe(15)
    expect(roomFontPx(50)).toBeCloseTo(10)
  })

  it('room font is never smaller than the dimension font at the same zoom', () => {
    for (const px of [10, 30, 60, 120, 400]) {
      expect(roomFontPx(px)).toBeGreaterThanOrEqual(dimFontPx(px))
    }
  })
})

describe('showWallDim', () => {
  it('hides labels on walls too short to fit them on screen', () => {
    expect(showWallDim(1, 20)).toBe(false) // 20px span — too small
    expect(showWallDim(1, 46)).toBe(true) // 46px span — fits
    expect(showWallDim(4, 40)).toBe(true) // long wall, modest zoom
  })

  it('a short wall becomes labelled once zoomed in enough', () => {
    expect(showWallDim(0.8, 30)).toBe(false)
    expect(showWallDim(0.8, 80)).toBe(true)
  })
})

describe('showOpeningDim', () => {
  it('requires more space on mobile than desktop', () => {
    expect(showOpeningDim(0.9, 60, false)).toBe(true) // 54px — ok on desktop
    expect(showOpeningDim(0.9, 60, true)).toBe(false) // 54px — too small on mobile
    expect(showOpeningDim(0.9, 90, true)).toBe(true) // 81px — ok on mobile
  })
})

describe('roomLabelDetail', () => {
  it('drops detail progressively as the room shrinks on screen', () => {
    expect(roomLabelDetail(10, 40)).toBe('full') // 16000 px² — name + area
    expect(roomLabelDetail(10, 25)).toBe('name') // 6250 px² — name only
    expect(roomLabelDetail(10, 14)).toBe('none') // 1960 px² — hidden
  })

  it('a small room regains its label when zoomed in', () => {
    expect(roomLabelDetail(3.3, 30)).toBe('name') // 2970 px² — name only
    expect(roomLabelDetail(3.3, 60)).toBe('full') // 11880 px² — full
  })
})
