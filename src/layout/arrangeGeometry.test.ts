import { describe, expect, it } from 'vitest'
import type { PlanRoom } from '../floorplan/types'
import {
  clamp,
  cornersOf,
  type Edge,
  inward,
  nearestEdge,
  opposite,
  planRoomRect,
  type Rect,
  rectsOverlap,
} from './arrangeGeometry'

const rect = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0, z0, x1, z1 })

describe('rectsOverlap', () => {
  it('detects overlapping rectangles', () => {
    expect(rectsOverlap(rect(0, 0, 2, 2), rect(1, 1, 3, 3))).toBe(true)
  })
  it('treats touching edges as NOT overlapping (open intervals)', () => {
    expect(rectsOverlap(rect(0, 0, 2, 2), rect(2, 0, 4, 2))).toBe(false)
    expect(rectsOverlap(rect(0, 0, 2, 2), rect(0, 2, 2, 4))).toBe(false)
  })
  it('detects fully-separated rectangles as no overlap', () => {
    expect(rectsOverlap(rect(0, 0, 1, 1), rect(5, 5, 6, 6))).toBe(false)
  })
  it('is symmetric', () => {
    const a = rect(0, 0, 3, 3)
    const b = rect(2, 2, 5, 5)
    expect(rectsOverlap(a, b)).toBe(rectsOverlap(b, a))
  })
})

describe('inward', () => {
  it('faces into the room from each wall', () => {
    expect(inward('N')).toBe(0)
    expect(inward('S')).toBeCloseTo(Math.PI)
    expect(inward('W')).toBeCloseTo(Math.PI / 2)
    expect(inward('E')).toBeCloseTo(-Math.PI / 2)
  })
  it('opposite edges face opposite directions (π apart)', () => {
    expect(Math.abs(inward('N') - inward('S'))).toBeCloseTo(Math.PI)
    expect(Math.abs(inward('W') - inward('E'))).toBeCloseTo(Math.PI)
  })
})

describe('clamp', () => {
  it('clamps below, within, and above the range', () => {
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(99, 0, 10)).toBe(10)
  })
  it('returns a bound when the value equals it', () => {
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })
})

describe('nearestEdge', () => {
  const r = rect(0, 0, 10, 10)
  it('picks the closest edge for an off-centre point', () => {
    expect(nearestEdge([5, 1], r)).toBe('N') // near top
    expect(nearestEdge([5, 9], r)).toBe('S') // near bottom
    expect(nearestEdge([1, 5], r)).toBe('W') // near left
    expect(nearestEdge([9, 5], r)).toBe('E') // near right
  })
  it('resolves a centre-point tie to the first edge in N,S,W,E order', () => {
    // Equidistant from all four edges — stable insertion-order tie-break.
    expect(nearestEdge([5, 5], r)).toBe('N')
  })
})

describe('cornersOf', () => {
  it('returns the four corners inset 0.3 m', () => {
    expect(cornersOf(rect(0, 0, 10, 10))).toEqual([
      [0.3, 0.3],
      [9.7, 0.3],
      [0.3, 9.7],
      [9.7, 9.7],
    ])
  })
})

describe('opposite', () => {
  it('maps each edge to its opposite', () => {
    const pairs: [Edge, Edge][] = [
      ['N', 'S'],
      ['S', 'N'],
      ['E', 'W'],
      ['W', 'E'],
    ]
    for (const [e, o] of pairs) expect(opposite(e)).toBe(o)
  })
  it('is an involution (applying twice is identity)', () => {
    for (const e of ['N', 'S', 'E', 'W'] as Edge[]) expect(opposite(opposite(e))).toBe(e)
  })
})

describe('planRoomRect', () => {
  it('insets the room footprint 0.12 m on every side', () => {
    const room = { id: 'r', name: 'Room', origin: [2, 3], width: 4, depth: 5 } as PlanRoom
    expect(planRoomRect(room)).toEqual({ x0: 2.12, z0: 3.12, x1: 5.88, z1: 7.88 })
  })
  it('produces an inverted (empty) rect for a room narrower than the inset', () => {
    const tiny = { id: 't', name: 'T', origin: [0, 0], width: 0.1, depth: 0.1 } as PlanRoom
    const r = planRoomRect(tiny)
    // Degenerate input → x1 < x0 (caller treats as no usable area, never throws).
    expect(r.x1).toBeLessThan(r.x0)
  })
})
