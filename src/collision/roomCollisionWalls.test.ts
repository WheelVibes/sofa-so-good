import { describe, expect, it } from 'vitest'
import { roomShell } from '../apartment/roomShell'
import { buildRoomCollisionWalls } from './roomCollisionWalls'

describe('buildRoomCollisionWalls', () => {
  it('produces collision segments only within the room footprint', () => {
    const shell = roomShell('bedroom2')
    const segs = buildRoomCollisionWalls('bedroom2', {})
    expect(segs.length).toBeGreaterThan(0)
    // Every segment endpoint must lie within (or on) the room bounding box,
    // not span the whole shared apartment wall.
    const x0 = Math.min(...shell.rects.map((r) => r.x0)) - 0.3
    const x1 = Math.max(...shell.rects.map((r) => r.x1)) + 0.3
    const z0 = Math.min(...shell.rects.map((r) => r.z0)) - 0.3
    const z1 = Math.max(...shell.rects.map((r) => r.z1)) + 0.3
    for (const s of segs) {
      for (const [x, z] of [
        [s.ax, s.az],
        [s.bx, s.bz],
      ]) {
        expect(x).toBeGreaterThanOrEqual(x0)
        expect(x).toBeLessThanOrEqual(x1)
        expect(z).toBeGreaterThanOrEqual(z0)
        expect(z).toBeLessThanOrEqual(z1)
      }
    }
  })

  it('carves an open door out of its wall span (door open ⇒ a gap)', () => {
    // bedroom2 has one door (door-bedroom2) on its south wall. With it shut the
    // south wall is one continuous segment; open, it splits into two.
    const shut = buildRoomCollisionWalls('bedroom2', { 'door-bedroom2': { open: false } })
    const open = buildRoomCollisionWalls('bedroom2', { 'door-bedroom2': { open: true } })
    expect(open.length).toBeGreaterThan(shut.length)
  })
})
