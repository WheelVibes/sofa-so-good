import { describe, expect, it } from 'vitest'
import { ROOMS } from './constants'
import { type ClippedWall, clippedWallCutouts, roomRects, roomShell } from './roomShellGeometry'
import type { WallSpec } from './types'

describe('roomRects', () => {
  it('returns one rect for a plain rectangular room', () => {
    const rects = roomRects(ROOMS.bedroom2)
    expect(rects).toHaveLength(1)
    // bedroom2 interior origin [3.38,0.20], 2.76 x 3.525
    expect(rects[0]).toMatchObject({ x0: 3.38, z0: 0.2 })
    expect(rects[0].x1).toBeCloseTo(6.14, 5)
    expect(rects[0].z1).toBeCloseTo(3.725, 5)
  })

  it('returns two rects for an L-shaped room with an extension', () => {
    const rects = roomRects(ROOMS.mainBedroom)
    expect(rects).toHaveLength(2)
  })
})

describe('roomShell', () => {
  it('includes the room north wall for a north-band bedroom', () => {
    const shell = roomShell('bedroom2')
    expect(shell.walls.map((w) => w.wallId)).toContain('wall-ext-N-west')
    expect(shell.rects.length).toBeGreaterThan(0)
  })

  // REGRESSION (room-overlap bug): livingDining's SOURCE rect reaches west into
  // bedroom3 and the corridor (see floor/floorRects.ts), so building the editor
  // shell from `roomRects` gave the Living/Dining editor a floor slab covering
  // two rooms that weren't being edited. It now builds from the carved rects.
  it('builds livingDining from its carved footprint, not its overlapping source rect', () => {
    const shell = roomShell('livingDining')
    const b3 = roomShell('bedroom3')
    const corridor = roomShell('corridor')
    // Deep inside bedroom3 / the corridor — both inside the RAW livingDining rect.
    expect(shell.contains(8.7, 2.5)).toBe(false)
    expect(shell.contains(8.7, 4.3)).toBe(false)
    // ...but the open strip east of the household shelter is still its own.
    expect(shell.contains(8.7, 6.0)).toBe(true)
    for (const a of shell.rects) {
      for (const b of [...b3.rects, ...corridor.rects]) {
        const overlaps =
          a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6
        expect(overlaps).toBe(false)
      }
    }
    // The bedroom3/LD partition now reads as one of its own walls (the raw rect
    // put its west edge 0.76 m past that wall, so it never matched).
    expect(shell.walls.map((w) => w.wallId)).toContain('wall-int-b3-LD')
  })

  it('clips a shared wall to the room footprint span', () => {
    const shell = roomShell('bedroom2')
    const n = shell.walls.find((w) => w.wallId === 'wall-ext-N-west')
    expect(n).toBeDefined()
    // bedroom2 interior x-span is [3.38, 6.14]; the clipped north wall must not
    // run the full [0.10, 9.175] of the shared segment.
    const lo = Math.min(n!.start[0], n!.end[0])
    const hi = Math.max(n!.start[0], n!.end[0])
    expect(lo).toBeGreaterThan(3.2)
    expect(hi).toBeLessThan(6.2)
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

describe('clippedWallCutouts', () => {
  // A wall from (0,0)→(10,0) with a door at offset 4 and a window at offset 7.
  const spec: WallSpec = {
    id: 'w',
    start: [0, 0],
    end: [10, 0],
    thickness: 'internal',
    cutouts: [
      { kind: 'door', offset: 4, width: 1, sill: 0, head: 2.1 },
      { kind: 'window', offset: 7, width: 1.2, sill: 0.9, head: 2.1 },
    ],
  }

  it('projects full-wall cutouts into a clip centred on the middle of the wall', () => {
    // Clip covers [3, 8]; its centre is at world x=5.5, running +X.
    const clip: ClippedWall = { wallId: 'w', start: [3, 0], end: [8, 0], spec }
    const cuts = clippedWallCutouts(clip)
    // door spans world [4,5] → clip-local [-1.5, -0.5]; window [7,8.2] → [1.5, 2.7]
    expect(cuts).toHaveLength(2)
    expect(cuts[0]).toMatchObject({ bottom: 0, top: 2.1 })
    expect(cuts[0].a).toBeCloseTo(-1.5, 6)
    expect(cuts[0].b).toBeCloseTo(-0.5, 6)
    expect(cuts[1]).toMatchObject({ bottom: 0.9, top: 2.1 })
    expect(cuts[1].a).toBeCloseTo(1.5, 6)
    expect(cuts[1].b).toBeCloseTo(2.7, 6)
  })

  it('keeps openings ordered (a < b) even when the clip runs opposite the wall', () => {
    // Clip endpoints reversed relative to the wall direction.
    const clip: ClippedWall = { wallId: 'w', start: [8, 0], end: [3, 0], spec }
    const cuts = clippedWallCutouts(clip)
    for (const c of cuts) expect(c.b).toBeGreaterThan(c.a)
    // Reversing the axis flips the sign: door centre world x=4.5 → clip-local +1
    const doorMid = (cuts[0].a + cuts[0].b) / 2
    expect(doorMid).toBeCloseTo(1, 6)
  })
})
