import { describe, expect, it } from 'vitest'
import { lightingFromAltitude } from '../lighting/altitudeCurve'
import { exteriorDayBoost } from './Estate'

const deg = (d: number) => (d * Math.PI) / 180

/**
 * WINDOW-BLOWOUT — the exterior/interior contrast must FOLLOW THE ENVIRONMENT, not be a constant.
 *
 * A window blows out because the outside is receiving the whole sky plus the direct beam while the
 * room gets only what one aperture admits. That contrast therefore falls as the sun drops, and the
 * obvious hook — `daylightFromAltitude` — cannot express it: it is pinned at 1.0 everywhere from
 * 8° to 90°, so a boost scaled by it alone would blow the window out exactly as hard at 08:00 as
 * at 13:00. These tests pin the property that makes this a derivation rather than a magic number.
 */
describe('exteriorDayBoost', () => {
  it('is the untouched legacy constant when the feature is off', () => {
    for (const alt of [90, 60, 30, 10, 0, -10]) expect(exteriorDayBoost(deg(alt), false)).toBe(1.1)
  })

  it('does NOT flatten across the day the way daylightFromAltitude does', () => {
    // The bug this guards: `daylightFromAltitude` reads 1 at BOTH 30° and 83°, so anything keyed
    // on it alone gives a low morning sun the same blowout as noon.
    const noon = exteriorDayBoost(deg(83.9), true)
    const mid = exteriorDayBoost(deg(30), true)
    expect(noon).toBeGreaterThan(mid)
  })

  it('falls monotonically as the sun drops', () => {
    const alts = [83.9, 60, 45, 30, 15, 8, 0]
    const boosts = alts.map((a) => exteriorDayBoost(deg(a), true))
    for (let i = 1; i < boosts.length; i++) expect(boosts[i]).toBeLessThanOrEqual(boosts[i - 1])
  })

  it('reproduces the calibrated ratio at the altitude it was measured at', () => {
    // 13:00 Singapore, the pose every reference figure in this round was taken at.
    expect(exteriorDayBoost(deg(83.907), true)).toBeCloseTo(8, 6)
  })

  it('applies only when the camera is INSIDE a room', () => {
    // The premise is "a camera exposed for a ROOM". In orbit/dollhouse the camera is outside the
    // building looking at the estate, and in the per-room editor it is outside a cut-away room --
    // in both the estate is the subject, exposed for itself. Applying the blown ratio there
    // washed the whole view out (orbit frame mean 170.6 -> 208.7, near-white 3.1 % -> 17.6 %),
    // which is the v0.34.1.11 regression this argument exists to prevent.
    expect(exteriorDayBoost(deg(83.907), true, false)).toBe(1.1)
    expect(exteriorDayBoost(deg(83.907), true, true)).toBeCloseTo(8, 6)
    // Defaults to inside, so an un-updated caller keeps the behaviour it was measured with.
    expect(exteriorDayBoost(deg(83.907), true)).toBeCloseTo(8, 6)
  })

  it('never dims the view below the legacy constant', () => {
    // The feature exists to ADD contrast; a low or negative sun must not make the outside darker
    // than it was before the flag existed.
    for (const alt of [10, 0, -5, -20])
      expect(exteriorDayBoost(deg(alt), true)).toBeGreaterThanOrEqual(1.1)
  })

  it("tracks the app's own sun + ambient terms, not an invented curve", () => {
    // Derivation check rather than a value check: the ratio between two altitudes must equal the
    // ratio of the daylight model's own (sun + ambient) at those altitudes, wherever the floor is
    // not active.
    const a = deg(83.907)
    const b = deg(45)
    const la = lightingFromAltitude(a)
    const lb = lightingFromAltitude(b)
    const expected = (lb.sun + lb.ambient) / (la.sun + la.ambient)
    expect(exteriorDayBoost(b, true) / exteriorDayBoost(a, true)).toBeCloseTo(expected, 6)
  })
})
