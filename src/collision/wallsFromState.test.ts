import { describe, expect, it } from 'vitest'
import { DOORS } from '../apartment/constants'
import { buildCollisionWalls } from './wallsFromState'

const segLen = (s: { ax: number; az: number; bx: number; bz: number }) =>
  Math.hypot(s.bx - s.ax, s.bz - s.az)
const totalLen = (segs: ReturnType<typeof buildCollisionWalls>) =>
  segs.reduce((sum, s) => sum + segLen(s), 0)

const allDoors = (open: boolean) =>
  Object.fromEntries(DOORS.map((d) => [d.id, { open }])) as Record<string, { open: boolean }>

describe('buildCollisionWalls', () => {
  it('produces solid wall segments for the built-in apartment', () => {
    const segs = buildCollisionWalls(allDoors(false))
    expect(segs.length).toBeGreaterThan(0)
  })

  it('every segment has positive length and a positive thickness', () => {
    for (const s of buildCollisionWalls(allDoors(false))) {
      expect(segLen(s)).toBeGreaterThan(0)
      expect(s.thickness).toBeGreaterThan(0)
    }
  })

  it('opening every door removes wall span (less solid length than all-closed)', () => {
    const closed = totalLen(buildCollisionWalls(allDoors(false)))
    const opened = totalLen(buildCollisionWalls(allDoors(true)))
    expect(opened).toBeLessThan(closed)
    // …but the walls don't vanish — plenty of solid wall remains.
    expect(opened).toBeGreaterThan(0)
  })

  it('opening a single door only shortens solid length vs all-closed', () => {
    const closed = totalLen(buildCollisionWalls(allDoors(false)))
    const oneOpen = { ...allDoors(false), [DOORS[0].id]: { open: true } }
    const after = totalLen(buildCollisionWalls(oneOpen))
    expect(after).toBeLessThanOrEqual(closed)
  })

  it('is deterministic for the same door state', () => {
    const a = buildCollisionWalls(allDoors(true))
    const b = buildCollisionWalls(allDoors(true))
    expect(a).toEqual(b)
  })

  it('an empty door state falls back to each door’s defaultOpen', () => {
    const viaEmpty = buildCollisionWalls({})
    const viaDefaults = buildCollisionWalls(
      Object.fromEntries(DOORS.map((d) => [d.id, { open: d.defaultOpen }])),
    )
    expect(viaEmpty).toEqual(viaDefaults)
  })
})
