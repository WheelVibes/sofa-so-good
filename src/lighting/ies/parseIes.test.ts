import { describe, expect, it } from 'vitest'
import { IesParseError, parseIes } from './parseIes'
import { BUNDLED_IES_PROFILES } from './sampleProfiles'

const SAMPLE = BUNDLED_IES_PROFILES[0].source // narrow downlight

describe('parseIes', () => {
  it('parses the bundled narrow-downlight sample', () => {
    const p = parseIes(SAMPLE)
    expect(p.lampCount).toBe(1)
    expect(p.lumensPerLamp).toBe(1200)
    expect(p.photometricType).toBe('C')
    expect(p.units).toBe('meters')
    expect(p.verticalAngles).toHaveLength(19)
    expect(p.horizontalAngles).toHaveLength(1)
    expect(p.verticalAngles[0]).toBe(0)
    expect(p.verticalAngles[18]).toBe(90)
    // One horizontal plane → one candela row of 19 values.
    expect(p.candela).toHaveLength(1)
    expect(p.candela[0]).toHaveLength(19)
    // Peak at nadir.
    expect(Math.max(...p.candela[0])).toBe(1000)
    expect(p.candela[0][0]).toBe(1000)
  })

  it('collects header keywords', () => {
    const p = parseIes(SAMPLE)
    expect(p.keywords.MANUFAC).toBe('Sofa So Good')
    expect(p.keywords.LUMCAT).toBe('SSG-DL-NARROW')
  })

  it('applies the candela multiplier to values', () => {
    const src = `IESNA:LM-63-2002
TILT=NONE
1 1000 2 3 1 1 1 0 0 0 1 1 10
0 45 90
0
100 50 0`
    const p = parseIes(src)
    expect(p.candelaMultiplier).toBe(2)
    expect(p.candela[0]).toEqual([200, 100, 0])
  })

  it('handles a file with no IESNA magic line (1986-style)', () => {
    const src = `[TEST] legacy
TILT=NONE
1 1000 1 3 1 1 1 0 0 0 1 1 10
0 45 90
0
100 50 0`
    const p = parseIes(src)
    expect(p.candela[0]).toEqual([100, 50, 0])
  })

  it('skips an inline TILT=INCLUDE block', () => {
    const src = `IESNA:LM-63-2002
TILT=INCLUDE
1 2 0 90 1.0 1.0
1 1000 1 3 1 1 1 0 0 0 1 1 10
0 45 90
0
100 50 0`
    const p = parseIes(src)
    expect(p.candela[0]).toEqual([100, 50, 0])
    expect(p.verticalAngles).toEqual([0, 45, 90])
  })

  it('tolerates arbitrary whitespace/newline wrapping of the number stream', () => {
    const src = `IESNA:LM-63-2002
TILT=NONE
1 1000 1
3 1 1 1
0 0 0 1 1 10
0
45
90
0
100   50
0`
    const p = parseIes(src)
    expect(p.verticalAngles).toEqual([0, 45, 90])
    expect(p.candela[0]).toEqual([100, 50, 0])
  })

  it('detects photometric type B and A', () => {
    const mk = (type: number) => `IESNA:LM-63-2002
TILT=NONE
1 1000 1 3 1 ${type} 1 0 0 0 1 1 10
0 45 90
0
100 50 0`
    expect(parseIes(mk(2)).photometricType).toBe('B')
    expect(parseIes(mk(3)).photometricType).toBe('A')
    expect(parseIes(mk(1)).photometricType).toBe('C')
  })

  describe('malformed input', () => {
    it('throws on empty input', () => {
      expect(() => parseIes('')).toThrow(IesParseError)
      expect(() => parseIes('   \n  ')).toThrow(IesParseError)
    })

    it('throws when the TILT line is missing', () => {
      expect(() => parseIes('IESNA:LM-63-2002\n[TEST] x\n1 1000 1 3 1 1 1')).toThrow(/TILT/)
    })

    it('throws on truncated photometric data', () => {
      const src = `IESNA:LM-63-2002
TILT=NONE
1 1000 1 3 1 1 1 0 0 0 1 1 10
0 45 90
0
100 50`
      expect(() => parseIes(src)).toThrow(IesParseError)
    })

    it('throws on a non-numeric token where a number is required', () => {
      const src = `IESNA:LM-63-2002
TILT=NONE
1 oops 1 3 1 1 1 0 0 0 1 1 10
0 45 90
0
100 50 0`
      expect(() => parseIes(src)).toThrow(/number/)
    })

    it('throws on invalid angle counts', () => {
      const src = `IESNA:LM-63-2002
TILT=NONE
1 1000 1 0 1 1 1 0 0 0 1 1 10`
      expect(() => parseIes(src)).toThrow(/angle counts/)
    })
  })

  it('parses every bundled profile without error', () => {
    for (const prof of BUNDLED_IES_PROFILES) {
      expect(() => parseIes(prof.source)).not.toThrow()
    }
  })
})
