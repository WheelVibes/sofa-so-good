import { describe, expect, it } from 'vitest'
import {
  ELECTRICAL_MOUNT_DEFAULTS_MM,
  electricalMountDefaultMm,
  isDuplicateMepPoint,
  PLUMBING_MOUNT_DEFAULTS_MM,
  plumbingMountDefaultMm,
} from './mepPoints'
import type { ElectricalKind, PlumbingKind } from './types'

/** Generic point shape for `isDuplicateMepPoint` tests (works for either
 *  family — the fn itself doesn't care which). */
interface MepTestPoint {
  x: number
  z: number
  kind: string
  levelId?: string
}

describe('ELECTRICAL_MOUNT_DEFAULTS_MM / electricalMountDefaultMm', () => {
  it('has a default for every electrical kind', () => {
    const kinds: ElectricalKind[] = [
      'socket',
      'socket-double',
      'switch',
      'data',
      'tv-point',
      'aircon',
      'water-heater',
    ]
    for (const k of kinds) {
      expect(typeof ELECTRICAL_MOUNT_DEFAULTS_MM[k]).toBe('number')
    }
  })

  it('matches the doc-specified defaults per kind', () => {
    expect(electricalMountDefaultMm('socket')).toBe(300)
    expect(electricalMountDefaultMm('switch')).toBe(1200)
    expect(electricalMountDefaultMm('tv-point')).toBe(400)
    expect(electricalMountDefaultMm('aircon')).toBe(2400)
    expect(electricalMountDefaultMm('water-heater')).toBe(1800)
  })
})

describe('PLUMBING_MOUNT_DEFAULTS_MM / plumbingMountDefaultMm', () => {
  it('has a default for every plumbing kind', () => {
    const kinds: PlumbingKind[] = [
      'water-point',
      'drainage',
      'floor-trap',
      'soil-pipe',
      'water-heater',
    ]
    for (const k of kinds) {
      expect(typeof PLUMBING_MOUNT_DEFAULTS_MM[k]).toBe('number')
    }
  })

  it('matches the doc-specified defaults per kind', () => {
    expect(plumbingMountDefaultMm('water-point')).toBe(600)
    expect(plumbingMountDefaultMm('floor-trap')).toBe(0)
    expect(plumbingMountDefaultMm('soil-pipe')).toBe(0)
  })
})

describe('isDuplicateMepPoint', () => {
  it('is false against an empty existing list', () => {
    expect(isDuplicateMepPoint([] as MepTestPoint[], { x: 1, z: 1, kind: 'socket' })).toBe(false)
  })

  it('flags a same-kind point within the dedupe radius', () => {
    const existing: MepTestPoint[] = [{ x: 1, z: 1, kind: 'socket' }]
    expect(isDuplicateMepPoint(existing, { x: 1.1, z: 1, kind: 'socket' })).toBe(true)
  })

  it('is false just outside the dedupe radius boundary', () => {
    const existing: MepTestPoint[] = [{ x: 0, z: 0, kind: 'socket' }]
    // Exactly at the boundary (0.3m, a 0.18/0.24/0.3 right triangle to avoid
    // float-subtraction noise) is a duplicate (<=); just past it is not.
    expect(isDuplicateMepPoint(existing, { x: 0.18, z: 0.24, kind: 'socket' }, 0.3)).toBe(true)
    expect(isDuplicateMepPoint(existing, { x: 0.18, z: 0.25, kind: 'socket' }, 0.3)).toBe(false)
  })

  it('does not flag a different kind at the same position', () => {
    const existing: MepTestPoint[] = [{ x: 1, z: 1, kind: 'socket' }]
    expect(isDuplicateMepPoint(existing, { x: 1, z: 1, kind: 'switch' })).toBe(false)
  })

  it('gates by level — a same-position point on a different storey is not a duplicate', () => {
    const existing: MepTestPoint[] = [{ x: 1, z: 1, kind: 'socket', levelId: 'lvl-2' }]
    expect(isDuplicateMepPoint(existing, { x: 1, z: 1, kind: 'socket' })).toBe(false)
    expect(isDuplicateMepPoint(existing, { x: 1, z: 1, kind: 'socket', levelId: 'lvl-2' })).toBe(
      true,
    )
  })

  it('treats absent levelId on both sides as matching (ground)', () => {
    const existing: MepTestPoint[] = [{ x: 1, z: 1, kind: 'socket' }]
    expect(isDuplicateMepPoint(existing, { x: 1, z: 1, kind: 'socket' })).toBe(true)
  })

  it('respects a custom radius', () => {
    const existing: MepTestPoint[] = [{ x: 0, z: 0, kind: 'water-point' }]
    expect(isDuplicateMepPoint(existing, { x: 1, z: 0, kind: 'water-point' }, 1.5)).toBe(true)
    expect(isDuplicateMepPoint(existing, { x: 1, z: 0, kind: 'water-point' }, 0.5)).toBe(false)
  })
})
