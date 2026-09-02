import { describe, expect, it } from 'vitest'
import { iesMetrics, relativeIntensityAt } from './iesProfile'
import { type IesProfile, parseIes } from './parseIes'
import { BUNDLED_IES_PROFILES, bundledIesProfile } from './sampleProfiles'

describe('iesMetrics', () => {
  it('derives peak / beam / field for the narrow downlight', () => {
    const p = bundledIesProfile('narrow-downlight')!
    const m = iesMetrics(p)
    expect(m.peakCandela).toBe(1000)
    expect(m.peakAngle).toBe(0)
    // Narrow beam: 50% crossing is well inside the 10% field.
    expect(m.beamAngle).toBeGreaterThan(0)
    expect(m.fieldAngle).toBeGreaterThan(m.beamAngle)
    // Sanity: a ~24deg field-ish accent beam stays well under the wide one.
    expect(m.fieldAngle).toBeLessThan(80)
  })

  it('the wide downlight has a larger field angle than the narrow one', () => {
    const narrow = iesMetrics(bundledIesProfile('narrow-downlight')!)
    const wide = iesMetrics(bundledIesProfile('wide-downlight')!)
    expect(wide.fieldAngle).toBeGreaterThan(narrow.fieldAngle)
    expect(wide.beamAngle).toBeGreaterThan(narrow.beamAngle)
  })

  it('interpolates the 50% crossing between sampled angles', () => {
    // Peak 100 at 0deg, 50 at 10deg → 50% (==50) crossing falls right at 10deg.
    const p = parseIes(`IESNA:LM-63-2002
TILT=NONE
1 1000 1 3 1 1 1 0 0 0 1 1 10
0 10 20
0
100 50 0`)
    const m = iesMetrics(p)
    expect(m.beamAngle).toBeCloseTo(20, 1) // full angle = 2 * 10deg half
  })

  it('degrades gracefully on an all-zero distribution', () => {
    const p = parseIes(`IESNA:LM-63-2002
TILT=NONE
1 1000 1 3 1 1 1 0 0 0 1 1 10
0 45 90
0
0 0 0`)
    const m = iesMetrics(p)
    expect(m.peakCandela).toBe(0)
    expect(m.beamAngle).toBe(0)
    expect(m.fieldAngle).toBe(0)
  })

  it('returns finite metrics for every bundled profile', () => {
    for (const prof of BUNDLED_IES_PROFILES) {
      const m = iesMetrics(bundledIesProfile(prof.id)!)
      for (const v of [m.peakCandela, m.peakAngle, m.beamAngle, m.fieldAngle]) {
        expect(Number.isFinite(v)).toBe(true)
      }
    }
  })
})

describe('relativeIntensityAt', () => {
  /** Vertical slice: full at nadir, half at 30 deg, zero at 60 deg. */
  const prof = {
    keywords: {},
    lampCount: 1,
    lumensPerLamp: 1000,
    candelaMultiplier: 1,
    verticalAngles: [0, 30, 60],
    horizontalAngles: [0],
    photometricType: 'C',
    candela: [[1000, 500, 0]],
  } as unknown as IesProfile

  it('is 1 at the peak direction', () => {
    expect(relativeIntensityAt(prof, 0)).toBeCloseTo(1, 9)
  })

  it('normalises to the profile peak, not to an absolute candela', () => {
    // 500/1000 — a SHAPE factor, so the app's calibrated magnitude survives.
    expect(relativeIntensityAt(prof, 30)).toBeCloseTo(0.5, 9)
  })

  it('interpolates linearly between sampled angles', () => {
    expect(relativeIntensityAt(prof, 15)).toBeCloseTo(0.75, 9)
    expect(relativeIntensityAt(prof, 45)).toBeCloseTo(0.25, 9)
  })

  it('clamps outside the sampled range instead of extrapolating', () => {
    // An IES file stopping at 60 deg says nothing above it — hold the last value.
    expect(relativeIntensityAt(prof, 90)).toBeCloseTo(0, 9)
    expect(relativeIntensityAt(prof, 180)).toBeCloseTo(0, 9)
  })

  it('treats a negative angle as its magnitude', () => {
    expect(relativeIntensityAt(prof, -30)).toBeCloseTo(0.5, 9)
  })

  it('falls back to 1 for a degenerate profile rather than zeroing a fixture', () => {
    const empty = { ...prof, verticalAngles: [], candela: [[]] }
    expect(relativeIntensityAt(empty, 0)).toBe(1)
    const flat = { ...prof, candela: [[0, 0, 0]] }
    expect(relativeIntensityAt(flat, 0)).toBe(1)
  })

  it('always returns a factor within [0, 1]', () => {
    for (let a = 0; a <= 180; a += 7) {
      const f = relativeIntensityAt(prof, a)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(1)
    }
  })
})
