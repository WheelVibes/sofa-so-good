import { describe, expect, it } from 'vitest'
import { isRectilinear } from '../floorplan/rectilinear'
import { ROOMS, WALLS } from './constants'
import {
  needsTriangulatedFloor,
  type RoomRect,
  roomBounds,
  roomContains,
  roomFloorArea,
  roomOutline,
  roomParts,
} from './roomGeometry'
import type { RoomDef, RoomId } from './types'
import { wallThicknessMetres } from './wallSegments'

const room = (over: Partial<RoomDef>): RoomDef => ({
  id: 'bedroom2',
  name: 'test',
  origin: [0, 0],
  width: 4,
  depth: 4,
  ...over,
})

function overlaps(a: RoomRect, b: RoomRect): boolean {
  const eps = 1e-6
  return a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.z0 < b.z1 - eps && b.z0 < a.z1 - eps
}

function containsPoint(r: RoomRect, x: number, z: number): boolean {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1
}

/** True when a wall body stands over [x, z] — so no floor is visible there,
 *  whichever room does or doesn't claim it. Corners are mitred/extended by the
 *  neighbour's half-thickness at render, so each wall is taken as its
 *  centreline swept by half its thickness on BOTH axes. */
function wallCoversPoint(x: number, z: number): boolean {
  return WALLS.some((w) => {
    const h = wallThicknessMetres(w) / 2
    return (
      x >= Math.min(w.start[0], w.end[0]) - h &&
      x <= Math.max(w.start[0], w.end[0]) + h &&
      z >= Math.min(w.start[1], w.end[1]) - h &&
      z <= Math.max(w.start[1], w.end[1]) + h
    )
  })
}

describe('roomParts — any number of rectangles', () => {
  it('returns the single rect of a plain room', () => {
    expect(roomParts(room({}))).toEqual([{ x0: 0, z0: 0, x1: 4, z1: 4 }])
  })

  it('returns every declared extension, with no cap at one', () => {
    const r = room({
      extensions: [
        { offset: [4, 0], width: 2, depth: 1 },
        { offset: [-2, 1], width: 2, depth: 1 },
        { offset: [1, 4], width: 1, depth: 3 },
      ],
    })
    expect(roomParts(r)).toEqual([
      { x0: 0, z0: 0, x1: 4, z1: 4 },
      { x0: 4, z0: 0, x1: 6, z1: 1 },
      { x0: -2, z0: 1, x1: 0, z1: 2 },
      { x0: 1, z0: 4, x1: 2, z1: 7 },
    ])
  })

  it('decomposes an explicit rectilinear polygon back into rects that tile it', () => {
    // A 4x4 square with a 2x2 bite out of its SE corner.
    const r = room({
      polygon: [
        [0, 0],
        [4, 0],
        [4, 2],
        [2, 2],
        [2, 4],
        [0, 4],
      ],
    })
    const parts = roomParts(r)
    expect(parts.length).toBeGreaterThan(0)
    // Tiles the shape: right area, no overlaps, nothing outside the outline.
    const area = parts.reduce((a, p) => a + (p.x1 - p.x0) * (p.z1 - p.z0), 0)
    expect(area).toBeCloseTo(12, 6)
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) expect(overlaps(parts[i], parts[j])).toBe(false)
    }
    expect(parts.some((p) => containsPoint(p, 1, 3))).toBe(true) // inside
    expect(parts.some((p) => containsPoint(p, 3, 3))).toBe(false) // the bite
  })

  it('falls back to the bounding box for a NON-rectilinear polygon', () => {
    const r = room({
      polygon: [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 2],
      ],
    })
    expect(isRectilinear(r.polygon!.map(([x, z]) => [x, z]))).toBe(false)
    expect(needsTriangulatedFloor(r)).toBe(true)
    expect(roomParts(r)).toEqual([{ x0: 0, z0: 0, x1: 4, z1: 4 }])
    // ...and containment still uses the real polygon, not that box.
    expect(roomContains(r, 0.5, 3.5)).toBe(false)
    expect(roomContains(r, 3.5, 3.5)).toBe(true)
  })
})

describe('roomOutline / roomFloorArea', () => {
  it('counts a shared edge once across many parts', () => {
    const r = room({
      extensions: [
        { offset: [4, 0], width: 2, depth: 4 },
        { offset: [6, 0], width: 2, depth: 4 },
      ],
    })
    // Three abutting rects = one 8x4 room, not three separately-counted ones.
    expect(roomFloorArea(r)).toBeCloseTo(32, 6)
    expect(roomOutline(r)).toHaveLength(4)
  })

  it('takes an explicit polygon verbatim', () => {
    const poly: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 2],
      [2, 2],
      [2, 4],
      [0, 4],
    ]
    const r = room({ polygon: poly })
    expect(roomOutline(r)).toEqual(poly)
    expect(roomFloorArea(r)).toBeCloseTo(12, 6)
    expect(roomBounds(r)).toEqual({ x0: 0, z0: 0, x1: 4, z1: 4 })
  })
})

/**
 * The two invariants the whole flat's floor rests on. Both were broken before
 * v0.30.3.2, when livingDining could only be declared as ONE oversized rect:
 * it overlapped bedroom3 + the corridor (resolved only by a render-time
 * overlap-carve, so the hover highlight and room editor still spilled), and it
 * left two bands of nothing against the kitchen that showed through as white.
 */
describe('the flat as a whole', () => {
  const ids = Object.keys(ROOMS) as RoomId[]

  it('has no two rooms overlapping', () => {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        for (const a of roomParts(ROOMS[ids[i]])) {
          for (const b of roomParts(ROOMS[ids[j]])) {
            expect(overlaps(a, b), `${ids[i]} vs ${ids[j]}`).toBe(false)
          }
        }
      }
    }
  })

  it('has no room overlapping itself', () => {
    for (const id of ids) {
      const parts = roomParts(ROOMS[id])
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          expect(overlaps(parts[i], parts[j]), id).toBe(false)
        }
      }
    }
  })

  it('leaves no enclosed cell without either a floor or a wall over it', () => {
    // Every square metre enclosed by the external walls is either floor a room
    // paints or a wall standing on it. "Enclosed" is decided by flooding the
    // OUTSIDE in: a cell is exterior only if it reaches the sampled border
    // through cells that are neither floor nor wall. Anything left unpainted
    // and unwalled after that is a hole — a visible white gap.
    const painted = ids.flatMap((id) => roomParts(ROOMS[id]))
    const step = 0.05
    const nx = Math.ceil(13 / step)
    const nz = Math.ceil(9.5 / step)
    const isVoid = (i: number, j: number) => {
      const x = i * step + step / 2
      const z = j * step + step / 2
      return !painted.some((r) => containsPoint(r, x, z)) && !wallCoversPoint(x, z)
    }
    const outside = new Set<number>()
    const stack: number[] = []
    const push = (i: number, j: number) => {
      if (i < 0 || j < 0 || i >= nx || j >= nz) return
      const k = j * nx + i
      if (outside.has(k) || !isVoid(i, j)) return
      outside.add(k)
      stack.push(k)
    }
    for (let i = 0; i < nx; i++) {
      push(i, 0)
      push(i, nz - 1)
    }
    for (let j = 0; j < nz; j++) {
      push(0, j)
      push(nx - 1, j)
    }
    while (stack.length) {
      const k = stack.pop() as number
      const i = k % nx
      const j = (k - i) / nx
      push(i + 1, j)
      push(i - 1, j)
      push(i, j + 1)
      push(i, j - 1)
    }
    const holes: string[] = []
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        if (isVoid(i, j) && !outside.has(j * nx + i)) {
          holes.push(`(${(i * step + step / 2).toFixed(3)}, ${(j * step + step / 2).toFixed(3)})`)
        }
      }
    }
    expect(holes).toEqual([])
  })

  it('declares living/dining as three parts covering the open strip east of the shelter', () => {
    const ld = ROOMS.livingDining
    expect(roomParts(ld)).toHaveLength(3)
    // Inside bedroom3 / the corridor — both were inside its old single rect.
    expect(roomContains(ld, 8.7, 2.5)).toBe(false)
    expect(roomContains(ROOMS.bedroom3, 8.7, 2.5)).toBe(true)
    expect(roomContains(ld, 8.7, 4.3)).toBe(false)
    expect(roomContains(ROOMS.corridor, 8.7, 4.3)).toBe(true)
    // ...while the circulation strip east of the shelter IS its own.
    expect(roomContains(ld, 8.7, 6.0)).toBe(true)
    // ...and it meets the kitchen exactly at the shelter's south face.
    expect(roomContains(ld, 9.4, 6.9)).toBe(true)
    expect(roomContains(ROOMS.kitchen, 9.4, 7.05)).toBe(true)
  })
})
