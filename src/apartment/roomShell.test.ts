import { describe, expect, it } from 'vitest'
import { ROOMS } from './constants'
import { roomRects, roomShell } from './roomShell'

describe('roomRects', () => {
  it('returns one rect for a plain rectangular room', () => {
    const rects = roomRects(ROOMS.bedroom2)
    expect(rects).toHaveLength(1)
    // bedroom2 interior origin [3.15,0.20], 2.85 x 3.40
    expect(rects[0]).toMatchObject({ x0: 3.15, z0: 0.2 })
    expect(rects[0].x1).toBeCloseTo(6.0, 5)
    expect(rects[0].z1).toBeCloseTo(3.6, 5)
  })

  it('returns two rects for an L-shaped room with an extension', () => {
    const rects = roomRects(ROOMS.mainBedroom)
    expect(rects).toHaveLength(2)
  })
})

describe('roomShell', () => {
  it('includes the room north wall for a north-band bedroom', () => {
    const shell = roomShell('bedroom2')
    expect(shell.walls.map((w) => w.wallId)).toContain('wall-ext-N')
    expect(shell.rects.length).toBeGreaterThan(0)
  })

  it('clips a shared wall to the room footprint span', () => {
    const shell = roomShell('bedroom2')
    const n = shell.walls.find((w) => w.wallId === 'wall-ext-N')
    expect(n).toBeDefined()
    // bedroom2 interior x-span is [3.15, 6.0]; the clipped north wall must not
    // run the full [0.10, 9.05] of the shared segment.
    const lo = Math.min(n!.start[0], n!.end[0])
    const hi = Math.max(n!.start[0], n!.end[0])
    expect(lo).toBeGreaterThan(3.0)
    expect(hi).toBeLessThan(6.1)
  })

  it('attributes only the room own north window (not neighbours)', () => {
    const shell = roomShell('bedroom2')
    expect(shell.windowIds).toContain('win-bedroom2-N')
    expect(shell.windowIds).not.toContain('win-bedroom3-N')
    expect(shell.windowIds).not.toContain('win-mainBedroom-N')
  })

  it('attributes only the room own door', () => {
    const shell = roomShell('bedroom2')
    expect(shell.doorIds).toContain('door-bedroom2')
    expect(shell.doorIds).not.toContain('door-bedroom3')
  })

  it('contains a point inside the room and rejects one outside', () => {
    const shell = roomShell('bedroom2')
    expect(shell.contains(4.5, 1.5)).toBe(true) // inside B2
    expect(shell.contains(11.0, 7.0)).toBe(false) // far away in kitchen/LD
  })
})
