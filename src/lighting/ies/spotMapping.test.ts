import { describe, expect, it } from 'vitest'
import { registerUploadedIes, resolveIesProfile, resolveIesSpot } from './iesStore'
import { parseIes } from './parseIes'
import { bundledIesProfile } from './sampleProfiles'
import { mapIesToSpot } from './spotMapping'

const HALF_PI = Math.PI / 2

describe('mapIesToSpot', () => {
  it('maps the narrow downlight to a tight cone', () => {
    const s = mapIesToSpot(bundledIesProfile('narrow-downlight')!)
    expect(s.angle).toBeGreaterThan(0)
    expect(s.angle).toBeLessThan(HALF_PI)
    expect(s.penumbra).toBeGreaterThanOrEqual(0)
    expect(s.penumbra).toBeLessThanOrEqual(1)
    expect(s.intensity).toBeGreaterThan(0)
  })

  it('gives the wide downlight a larger cone than the narrow one', () => {
    const narrow = mapIesToSpot(bundledIesProfile('narrow-downlight')!)
    const wide = mapIesToSpot(bundledIesProfile('wide-downlight')!)
    expect(wide.angle).toBeGreaterThan(narrow.angle)
  })

  it('clamps a very wide beam to a renderable cone (< pi/2)', () => {
    const p = parseIes(`IESNA:LM-63-2002
TILT=NONE
1 1000 1 3 1 1 1 0 0 0 1 1 10
0 80 90
0
100 100 100`)
    const s = mapIesToSpot(p)
    expect(s.angle).toBeLessThan(HALF_PI)
    expect(s.angle).toBeGreaterThan(0)
  })

  it('clamps a degenerate (zero) distribution to a narrow default cone', () => {
    const p = parseIes(`IESNA:LM-63-2002
TILT=NONE
1 1000 1 3 1 1 1 0 0 0 1 1 10
0 45 90
0
0 0 0`)
    const s = mapIesToSpot(p)
    expect(s.angle).toBeGreaterThan(0)
    expect(s.angle).toBeLessThan(HALF_PI)
  })

  it('scales intensity from the supplied base intensity', () => {
    const low = mapIesToSpot(bundledIesProfile('narrow-downlight')!, { baseIntensity: 2 })
    const high = mapIesToSpot(bundledIesProfile('narrow-downlight')!, { baseIntensity: 10 })
    expect(high.intensity).toBeGreaterThan(low.intensity)
  })
})

describe('iesStore', () => {
  it('resolves a bundled profile id', () => {
    expect(resolveIesProfile('narrow-downlight')).not.toBeNull()
    expect(resolveIesProfile('wide-downlight')).not.toBeNull()
  })

  it('returns null for an unknown id (caller falls back to default cone)', () => {
    expect(resolveIesProfile('does-not-exist')).toBeNull()
    expect(resolveIesSpot('does-not-exist', 7)).toBeNull()
  })

  it('caches + resolves an uploaded profile', () => {
    const id = registerUploadedIes(
      'test-upload',
      `IESNA:LM-63-2002
TILT=NONE
1 1000 1 3 1 1 1 0 0 0 1 1 10
0 45 90
0
100 50 0`,
    )
    expect(id).toBe('custom:test-upload')
    expect(resolveIesProfile(id)).not.toBeNull()
    expect(resolveIesSpot(id, 7)).not.toBeNull()
  })

  it('throws when registering a malformed upload', () => {
    expect(() => registerUploadedIes('bad', 'not an ies file')).toThrow()
  })

  it('returns a cached SpotParams (same object) for repeat calls', () => {
    const a = resolveIesSpot('narrow-downlight', 7)
    const b = resolveIesSpot('narrow-downlight', 7)
    expect(a).toBe(b)
  })
})
