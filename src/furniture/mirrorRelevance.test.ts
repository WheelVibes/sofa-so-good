import { describe, expect, it } from 'vitest'
import {
  MIRROR_REAL_BUDGET,
  MIRROR_REAL_OFF_FRACTION,
  MIRROR_REAL_ON_FRACTION,
  mirrorScreenFraction,
  rankRealMirrors,
  shouldRenderRealMirror,
} from './mirrorRelevance'

describe('mirrorScreenFraction', () => {
  it('shrinks with distance', () => {
    const near = mirrorScreenFraction(0.9, 1.5, 45)
    const far = mirrorScreenFraction(0.9, 9, 45)
    expect(near).toBeGreaterThan(far)
  })

  it('is inversely proportional to distance', () => {
    // Doubling the distance halves the screen size — the projection identity the
    // thresholds are calibrated against.
    const a = mirrorScreenFraction(0.9, 4, 45)
    const b = mirrorScreenFraction(0.9, 8, 45)
    expect(a / b).toBeCloseTo(2, 4)
  })

  it('is proportional to physical size', () => {
    const small = mirrorScreenFraction(0.5, 5, 45)
    const big = mirrorScreenFraction(1.0, 5, 45)
    expect(big / small).toBeCloseTo(2, 4)
  })

  it('shrinks as the field of view widens', () => {
    expect(mirrorScreenFraction(0.9, 5, 30)).toBeGreaterThan(mirrorScreenFraction(0.9, 5, 90))
  })

  it('matches the calibration the thresholds assume', () => {
    // A 0.9m pane must land below the RELEASE threshold across the orbit range
    // (so a mirror that went real in walk mode drops back to cheap when the user
    // pulls out to the dollhouse view, instead of carrying the cost with them),
    // and above the ENGAGE threshold when the user walks up to it.
    expect(mirrorScreenFraction(0.9, 12, 45)).toBeLessThan(MIRROR_REAL_OFF_FRACTION)
    expect(mirrorScreenFraction(0.9, 9, 45)).toBeLessThan(MIRROR_REAL_OFF_FRACTION)
    expect(mirrorScreenFraction(0.9, 2.5, 70)).toBeGreaterThan(MIRROR_REAL_ON_FRACTION)
    expect(mirrorScreenFraction(0.9, 1.5, 70)).toBeGreaterThan(MIRROR_REAL_ON_FRACTION)
  })

  it('never exceeds 1', () => {
    expect(mirrorScreenFraction(50, 0.4, 45)).toBe(1)
  })

  it('treats a mirror at/behind the camera as maximally relevant, not infinite', () => {
    expect(mirrorScreenFraction(0.9, 0, 45)).toBe(1)
    expect(mirrorScreenFraction(0.9, -3, 45)).toBe(1)
  })

  it('returns 0 for degenerate inputs rather than NaN', () => {
    // A NaN screen fraction would silently satisfy neither threshold and pin the
    // mirror to whatever it already was.
    expect(mirrorScreenFraction(Number.NaN, 5, 45)).toBe(0)
    expect(mirrorScreenFraction(0.9, Number.NaN, 45)).toBe(0)
    expect(mirrorScreenFraction(0.9, 5, Number.NaN)).toBe(0)
    expect(mirrorScreenFraction(0, 5, 45)).toBe(0)
    expect(mirrorScreenFraction(0.9, 5, 0)).toBe(0)
  })
})

describe('shouldRenderRealMirror', () => {
  it('engages only above the ON threshold', () => {
    expect(shouldRenderRealMirror(MIRROR_REAL_ON_FRACTION, false)).toBe(true)
    expect(shouldRenderRealMirror(MIRROR_REAL_ON_FRACTION - 0.001, false)).toBe(false)
  })

  it('releases only below the OFF threshold', () => {
    expect(shouldRenderRealMirror(MIRROR_REAL_OFF_FRACTION, true)).toBe(true)
    expect(shouldRenderRealMirror(MIRROR_REAL_OFF_FRACTION - 0.001, true)).toBe(false)
  })

  it('holds its state inside the hysteresis band', () => {
    // The whole point: each flip is a material swap (shader recompile), so a
    // camera hovering mid-band must not oscillate.
    const mid = (MIRROR_REAL_ON_FRACTION + MIRROR_REAL_OFF_FRACTION) / 2
    expect(shouldRenderRealMirror(mid, false)).toBe(false)
    expect(shouldRenderRealMirror(mid, true)).toBe(true)
  })

  it('has a band wide enough to be worth having', () => {
    expect(MIRROR_REAL_ON_FRACTION).toBeGreaterThan(MIRROR_REAL_OFF_FRACTION * 1.25)
  })

  it('defaults to cheap on a NaN fraction', () => {
    expect(shouldRenderRealMirror(Number.NaN, false)).toBe(false)
  })
})

describe('rankRealMirrors', () => {
  const c = (id: string, screenFraction: number) => ({ id, screenFraction })

  it('grants the budget to the largest on screen', () => {
    expect(rankRealMirrors([c('a', 0.25), c('b', 0.5), c('c', 0.3)], [], 1)).toEqual(['b'])
  })

  it('respects the budget', () => {
    // Each real reflection is a whole extra scene pass, so the cap is the thing
    // that stops a mirrored bedroom rendering the scene four times a frame.
    expect(rankRealMirrors([c('a', 0.5), c('b', 0.4), c('c', 0.3)], [], 2)).toEqual(['a', 'b'])
  })

  it('excludes candidates under the release threshold', () => {
    expect(rankRealMirrors([c('a', MIRROR_REAL_OFF_FRACTION - 0.001)], ['a'], 4)).toEqual([])
  })

  it('is stable for equal sizes, so the material never thrashes', () => {
    const tie = [c('z', 0.4), c('a', 0.4)]
    expect(rankRealMirrors(tie, [], 1)).toEqual(rankRealMirrors(tie.slice().reverse(), [], 1))
  })

  it('returns nothing for a zero or negative budget', () => {
    expect(rankRealMirrors([c('a', 0.9)], [], 0)).toEqual([])
    expect(rankRealMirrors([c('a', 0.9)], [], -1)).toEqual([])
  })

  it('ignores non-finite fractions', () => {
    expect(rankRealMirrors([c('a', Number.NaN), c('b', 0.3)], [], 2)).toEqual(['b'])
  })

  it('handles an empty candidate set', () => {
    expect(rankRealMirrors([], [], MIRROR_REAL_BUDGET)).toEqual([])
  })

  it('defaults to the shipped budget', () => {
    expect(rankRealMirrors([c('a', 0.5), c('b', 0.4)])).toHaveLength(MIRROR_REAL_BUDGET)
  })

  it('applies hysteresis per candidate against its own previous state', () => {
    const mid = (MIRROR_REAL_ON_FRACTION + MIRROR_REAL_OFF_FRACTION) / 2
    // Mid-band: an already-granted pane keeps its reflection, a new one does not
    // get one. Resolved here rather than per-pane so the two can't disagree.
    expect(rankRealMirrors([c('a', mid)], ['a'], 1)).toEqual(['a'])
    expect(rankRealMirrors([c('a', mid)], [], 1)).toEqual([])
  })

  it('never grants two panes at once under a budget of one', () => {
    // The regression this centralisation fixes: two bathroom mirrors, each
    // deciding for itself, both rendered a full extra scene pass.
    const two = [c('a', 0.34), c('b', 0.37)]
    expect(rankRealMirrors(two, [], 1)).toEqual(['b'])
    // …and an incumbent does not get to keep it once a bigger pane appears.
    expect(rankRealMirrors(two, ['a'], 1)).toEqual(['b'])
  })
})
