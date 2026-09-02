import { describe, expect, it } from 'vitest'
import { LUX_STOPS, luxGridRgba, luxToRgb } from './luxColor'
import { MASKED, type RoomLuxGrid } from './luxGrid'

const grid = (cols: number, rows: number, values: number[]): RoomLuxGrid => ({
  roomId: 'r',
  x0: 0,
  z0: 0,
  cols,
  rows,
  cell: 0.25,
  values: Float32Array.from(values),
  minLux: 0,
  meanLux: 0,
  uniformity: 0,
  planeHeight: 0,
  maxLux: Math.max(0, ...values),
})

describe('luxToRgb', () => {
  it('hits the exact stop colours at the breakpoints', () => {
    for (const stop of LUX_STOPS) {
      expect(luxToRgb(stop.lux)).toEqual(stop.color)
    }
  })

  it('clamps below the first and above the last stop', () => {
    expect(luxToRgb(-10)).toEqual(LUX_STOPS[0]!.color)
    expect(luxToRgb(99999)).toEqual(LUX_STOPS[LUX_STOPS.length - 1]!.color)
  })

  it('interpolates between stops', () => {
    const a = LUX_STOPS[0]!
    const b = LUX_STOPS[1]!
    const mid = luxToRgb((a.lux + b.lux) / 2)
    for (let c = 0; c < 3; c++) {
      expect(mid[c]).toBe(Math.round((a.color[c]! + b.color[c]!) / 2))
    }
  })

  it('treats NaN/Infinity as the 0-lx stop (no garbage in the texture)', () => {
    expect(luxToRgb(Number.NaN)).toEqual(LUX_STOPS[0]!.color)
    expect(luxToRgb(Number.NEGATIVE_INFINITY)).toEqual(LUX_STOPS[0]!.color)
  })

  it('stops ascend in lux (legend renders in order)', () => {
    for (let i = 1; i < LUX_STOPS.length; i++) {
      expect(LUX_STOPS[i]!.lux).toBeGreaterThan(LUX_STOPS[i - 1]!.lux)
    }
  })
})

describe('luxGridRgba', () => {
  it('writes opaque heat colours for in-room cells and alpha 0 for masked cells', () => {
    const g = grid(2, 1, [0, MASKED])
    const rgba = luxGridRgba(g)
    expect(rgba).toHaveLength(8)
    // Cell 0: the 0-lx colour, opaque.
    expect([rgba[0], rgba[1], rgba[2]]).toEqual(LUX_STOPS[0]!.color)
    expect(rgba[3]).toBe(255)
    // Cell 1: masked → fully transparent.
    expect(rgba[7]).toBe(0)
  })

  it('flips rows so texture row 0 is the max-z grid row (floor-plane UV mapping)', () => {
    // 1×2 grid: grid row 0 (min z) bright (750 lx), row 1 (max z) dark (0 lx).
    const g = grid(1, 2, [750, 0])
    const rgba = luxGridRgba(g)
    const bright = LUX_STOPS[LUX_STOPS.length - 1]!.color
    // Texture row 0 = max-z row = dark; texture row 1 = min-z row = bright.
    expect([rgba[0], rgba[1], rgba[2]]).toEqual(LUX_STOPS[0]!.color)
    expect([rgba[4], rgba[5], rgba[6]]).toEqual(bright)
  })

  it('honours a custom alpha for in-room cells', () => {
    const g = grid(1, 1, [100])
    expect(luxGridRgba(g, 128)[3]).toBe(128)
  })
})
