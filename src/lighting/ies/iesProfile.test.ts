import { describe, expect, it } from 'vitest'
import { iesMetrics } from './iesProfile'
import { parseIes } from './parseIes'
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
