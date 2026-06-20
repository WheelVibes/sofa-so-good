import { describe, expect, it } from 'vitest'
import {
  computeSun,
  hoursToDate,
  orientedSunDirection,
  rotateY,
  sunDirectionToScene,
} from './sunPosition'

const RAD_TO_DEG = 180 / Math.PI

describe('computeSun', () => {
  it('puts the sun high overhead at Singapore noon on equinox', () => {
    // 2026-03-21 (vernal equinox), local 12:00 SGT (UTC+8) → 04:00 UTC
    const d = new Date('2026-03-21T04:00:00.000Z')
    const sun = computeSun(d, 1.35, 103.82)
    // Altitude should be > 70° (high overhead near equator at noon on equinox).
    // SunCalc returns ~71.8° for Singapore at this date/time.
    expect(sun.altitude * RAD_TO_DEG).toBeGreaterThan(70)
  })

  it('returns negative altitude (below horizon) at midnight Singapore', () => {
    const d = new Date('2026-03-20T16:00:00.000Z') // 00:00 SGT next day
    const sun = computeSun(d, 1.35, 103.82)
    expect(sun.altitude).toBeLessThan(0)
  })

  it('London winter solstice noon: sun is low in the south', () => {
    // 2026-12-21 12:00 UTC, London (51.5°N, 0°)
    const d = new Date('2026-12-21T12:00:00.000Z')
    const sun = computeSun(d, 51.5, 0)
    const altDeg = sun.altitude * RAD_TO_DEG
    expect(altDeg).toBeGreaterThan(10)
    expect(altDeg).toBeLessThan(20)
    // Azimuth near south (0 in SunCalc convention) at solar noon.
    expect(Math.abs(sun.azimuth) * RAD_TO_DEG).toBeLessThan(20)
  })

  it('Sydney summer solstice noon: sun is high', () => {
    // 2026-12-21 02:00 UTC = 13:00 AEDT (UTC+11), Sydney (-33.87°, 151.21°)
    const d = new Date('2026-12-21T02:00:00.000Z')
    const sun = computeSun(d, -33.87, 151.21)
    const altDeg = sun.altitude * RAD_TO_DEG
    expect(altDeg).toBeGreaterThan(75)
  })
})

describe('sunDirectionToScene', () => {
  it('returns +Y up when altitude is 90° (sun at zenith)', () => {
    const dir = sunDirectionToScene({ azimuth: 0, altitude: Math.PI / 2 })
    expect(dir[0]).toBeCloseTo(0, 5)
    expect(dir[1]).toBeCloseTo(1, 5)
    expect(dir[2]).toBeCloseTo(0, 5)
  })

  it('returns +Z south at altitude 0 azimuth 0', () => {
    const dir = sunDirectionToScene({ azimuth: 0, altitude: 0 })
    expect(dir[0]).toBeCloseTo(0, 5)
    expect(dir[1]).toBeCloseTo(0, 5)
    expect(dir[2]).toBeCloseTo(1, 5)
  })

  it('azimuth π/2 at altitude 0 points west (−X in scene)', () => {
    const dir = sunDirectionToScene({ azimuth: Math.PI / 2, altitude: 0 })
    expect(dir[0]).toBeCloseTo(-1, 5)
    expect(dir[1]).toBeCloseTo(0, 5)
    expect(dir[2]).toBeCloseTo(0, 5)
  })

  it('azimuth −π/2 at altitude 0 points east (+X in scene)', () => {
    const dir = sunDirectionToScene({ azimuth: -Math.PI / 2, altitude: 0 })
    expect(dir[0]).toBeCloseTo(1, 5)
    expect(dir[1]).toBeCloseTo(0, 5)
    expect(dir[2]).toBeCloseTo(0, 5)
  })

  it('output is a unit vector', () => {
    const dir = sunDirectionToScene({ azimuth: 1.2, altitude: 0.5 })
    const len = Math.hypot(dir[0], dir[1], dir[2])
    expect(len).toBeCloseTo(1, 5)
  })
})

describe('rotateY (compass-clockwise around +Y)', () => {
  it('is identity at 0°', () => {
    const v = rotateY([1, 2, 3], 0)
    expect(v[0]).toBeCloseTo(1, 5)
    expect(v[1]).toBeCloseTo(2, 5)
    expect(v[2]).toBeCloseTo(3, 5)
  })

  it('rotates +Z toward −X at +90° (and leaves Y untouched)', () => {
    const v = rotateY([0, 5, 1], 90)
    expect(v[0]).toBeCloseTo(-1, 5)
    expect(v[1]).toBeCloseTo(5, 5)
    expect(v[2]).toBeCloseTo(0, 5)
  })

  it('preserves length', () => {
    const v = rotateY([0.3, 0.4, 0.8], 37)
    expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(Math.hypot(0.3, 0.4, 0.8), 5)
  })
})

describe('orientedSunDirection', () => {
  it('matches sunDirectionToScene at orientation 0', () => {
    const s = { azimuth: 0.7, altitude: 0.6 }
    const a = orientedSunDirection(s, 0)
    const b = sunDirectionToScene(s)
    for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i], 6)
  })

  it('equals rotateY applied to the raw scene direction', () => {
    const s = { azimuth: -0.4, altitude: 0.3 }
    const a = orientedSunDirection(s, 45)
    const b = rotateY(sunDirectionToScene(s), 45)
    for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i], 6)
  })
})

describe('hoursToDate', () => {
  it('builds a Date for today + the given fractional hour', () => {
    const d = hoursToDate(13.5, new Date('2026-05-01T08:00:00'))
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(4) // May (0-indexed)
    expect(d.getDate()).toBe(1)
    expect(d.getHours()).toBe(13)
    expect(d.getMinutes()).toBe(30)
  })
})
