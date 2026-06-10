import { describe, expect, it } from 'vitest'
import { buildCeiling, ceilingStyleLabel } from './ceilingModel'

describe('ceilingStyleLabel', () => {
  it('labels absent / flat as Flat', () => {
    expect(ceilingStyleLabel(undefined)).toBe('Flat')
    expect(ceilingStyleLabel({ style: 'flat' })).toBe('Flat')
  })
  it('labels coffered with its grid, and a cove suffix', () => {
    expect(ceilingStyleLabel({ style: 'coffered', grid: [3, 2] })).toBe('Coffered 3×2')
    expect(ceilingStyleLabel({ style: 'tray', coveLight: true })).toBe('Tray + cove')
    expect(ceilingStyleLabel({ style: 'dropped' })).toBe('Dropped')
  })
})

const RECT: [number, number][] = [
  [0, 0],
  [4, 0],
  [4, 3],
  [0, 3],
]
const L_SHAPE: [number, number][] = [
  [0, 0],
  [4, 0],
  [4, 2],
  [2, 2],
  [2, 3],
  [0, 3],
]

describe('buildCeiling', () => {
  it('flat → fallback, no parts', () => {
    const m = buildCeiling(RECT, 2.7, { style: 'flat' })
    expect(m.fallback).toBe(true)
    expect(m.parts).toHaveLength(0)
    expect(m.lowestY).toBe(2.7)
  })

  it('non-rectangular room falls back to flat', () => {
    const m = buildCeiling(L_SHAPE, 2.7, { style: 'tray' })
    expect(m.fallback).toBe(true)
  })

  it('tray: lower frame + raised centre, lowestY is dropped', () => {
    const m = buildCeiling(RECT, 2.7, { style: 'tray', drop: 0.2, margin: 0.4 })
    expect(m.fallback).toBe(false)
    const centre = m.parts.filter((p) => p.kind === 'plane' && p.role === 'centre')
    const frame = m.parts.filter((p) => p.kind === 'plane' && p.role === 'frame')
    expect(centre).toHaveLength(1)
    expect(frame).toHaveLength(4)
    expect(m.lowestY).toBeCloseTo(2.5)
    // Centre panel is at the true ceiling, inset by the margin.
    const c = centre[0] as { w: number; d: number; y: number }
    expect(c.y).toBeCloseTo(2.7)
    expect(c.w).toBeCloseTo(4 - 0.8)
    expect(c.d).toBeCloseTo(3 - 0.8)
  })

  it('dropped: full base + lowered soffit + 4 walls', () => {
    const m = buildCeiling(RECT, 2.7, { style: 'dropped', drop: 0.25, margin: 0.5 })
    expect(m.parts.filter((p) => p.kind === 'plane' && p.role === 'base')).toHaveLength(1)
    expect(m.parts.filter((p) => p.kind === 'plane' && p.role === 'soffit')).toHaveLength(1)
    expect(m.parts.filter((p) => p.kind === 'side')).toHaveLength(4)
    expect(m.lowestY).toBeCloseTo(2.45)
  })

  it('coffered: base + beam grid scaled by divisions', () => {
    const m = buildCeiling(RECT, 2.7, { style: 'coffered', drop: 0.15, grid: [2, 2] })
    expect(m.parts.filter((p) => p.kind === 'plane' && p.role === 'base')).toHaveLength(1)
    const beams = m.parts.filter((p) => p.kind === 'plane' && p.role === 'beam')
    // (cols+1) vertical + (rows+1) horizontal beams = 3 + 3 = 6
    expect(beams).toHaveLength(6)
  })

  it('clamps drop so nothing dips below 2.0 m clearance', () => {
    const m = buildCeiling(RECT, 2.1, { style: 'dropped', drop: 0.9 })
    expect(m.lowestY).toBeGreaterThanOrEqual(2.0)
  })

  it('a very low ceiling cannot be dropped → fallback', () => {
    const m = buildCeiling(RECT, 1.95, { style: 'tray' })
    expect(m.fallback).toBe(true)
  })

  it('a too-large margin is clamped, not inverted', () => {
    const m = buildCeiling(RECT, 2.7, { style: 'tray', margin: 99 })
    expect(m.fallback).toBe(false)
    const centre = m.parts.find((p) => p.kind === 'plane' && p.role === 'centre') as {
      w: number
      d: number
    }
    expect(centre.w).toBeGreaterThan(0)
    expect(centre.d).toBeGreaterThan(0)
  })

  it('emits a cove strip only when coveLight is on', () => {
    expect(buildCeiling(RECT, 2.7, { style: 'tray' }).cove).toBeNull()
    expect(buildCeiling(RECT, 2.7, { style: 'tray', coveLight: true }).cove).not.toBeNull()
  })
})
