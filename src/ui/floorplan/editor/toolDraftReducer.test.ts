import { describe, expect, it } from 'vitest'
import {
  type Draft,
  dimensionCommit,
  draftLength,
  polygonClick,
  rectFromDraft,
  rectFromVerts,
  roomCommit,
  rotateWallTransform,
  scaleCommits,
  wallCommit,
  wallTapCommits,
} from './toolDraftReducer'

const draft = (x0: number, z0: number, x: number, z: number): Draft => ({ x0, z0, x, z })
const id = (m: number) => m
// A coarse 0.5 m grid snap, like the editor's `snap` when gridSize = 0.5.
const half = (m: number) => Math.round(m / 0.5) * 0.5

describe('draftLength', () => {
  it('is the euclidean span of the draft', () => {
    expect(draftLength(draft(0, 0, 3, 4))).toBe(5)
    expect(draftLength(draft(1, 1, 1, 1))).toBe(0)
  })
})

describe('rectFromVerts', () => {
  it('returns the bbox of the vertices', () => {
    const r = rectFromVerts([
      [1, 2],
      [4, 2],
      [4, 6],
      [1, 6],
    ])
    expect(r).toEqual({ origin: [1, 2], width: 3, depth: 4 })
  })

  it('floors a degenerate (collinear) polygon to 0.1 m on each axis', () => {
    const r = rectFromVerts([
      [0, 0],
      [2, 0],
    ])
    expect(r.origin).toEqual([0, 0])
    expect(r.width).toBe(2)
    expect(r.depth).toBe(0.1)
  })
})

describe('rectFromDraft', () => {
  it('normalises an inverted drag to a min-corner rect', () => {
    expect(rectFromDraft(draft(5, 5, 2, 1))).toEqual({ origin: [2, 1], width: 3, depth: 4 })
  })
})

describe('wallCommit', () => {
  it('rejects a draft at or under the 0.2 m threshold', () => {
    expect(wallCommit(draft(0, 0, 0.2, 0), null)).toBeNull()
    expect(wallCommit(draft(0, 0, 0.1, 0), null)).toBeNull()
  })

  it('commits a long-enough draft with its endpoints', () => {
    expect(wallCommit(draft(1, 1, 1, 3), null)).toEqual({ start: [1, 1], end: [1, 3] })
  })

  it('uses the numeric-entry endpoint when present (overriding a tiny drag)', () => {
    expect(wallCommit(draft(0, 0, 0.01, 0), [2, 0])).toEqual({ start: [0, 0], end: [2, 0] })
  })

  it('rejects when even the numeric endpoint is too short', () => {
    expect(wallCommit(draft(0, 0, 5, 5), [0.1, 0])).toBeNull()
  })
})

describe('wallTapCommits', () => {
  it('matches the > 0.2 m threshold', () => {
    expect(wallTapCommits(draft(0, 0, 0.2, 0))).toBe(false)
    expect(wallTapCommits(draft(0, 0, 0.3, 0))).toBe(true)
  })
})

describe('roomCommit', () => {
  it('rejects a rect with either side at or under 0.3 m', () => {
    expect(roomCommit(draft(0, 0, 0.3, 5))).toBeNull()
    expect(roomCommit(draft(0, 0, 5, 0.3))).toBeNull()
  })

  it('commits a big-enough rect (normalised)', () => {
    expect(roomCommit(draft(5, 5, 1, 1))).toEqual({ origin: [1, 1], width: 4, depth: 4 })
  })
})

describe('dimensionCommit', () => {
  it('rejects a draft at or under 0.1 m', () => {
    expect(dimensionCommit(draft(0, 0, 0.1, 0), id)).toBeNull()
  })

  it('snaps both endpoints when long enough', () => {
    const out = dimensionCommit(draft(0.1, 0.1, 1.9, 0.1), half)
    expect(out).toEqual({ a: [0, 0], b: [2, 0] })
  })
})

describe('scaleCommits', () => {
  it('matches the > 0.05 m threshold', () => {
    expect(scaleCommits(draft(0, 0, 0.05, 0))).toBe(false)
    expect(scaleCommits(draft(0, 0, 0.06, 0))).toBe(true)
  })
})

describe('polygonClick', () => {
  it('adds a vertex when below the close count', () => {
    expect(polygonClick([[0, 0]], [1, 1])).toEqual({ type: 'add', point: [1, 1] })
  })

  it('adds when far from the first vertex even with enough points', () => {
    const verts: [number, number][] = [
      [0, 0],
      [2, 0],
      [2, 2],
    ]
    expect(polygonClick(verts, [5, 5])).toEqual({ type: 'add', point: [5, 5] })
  })

  it('closes when near the first vertex with >= 3 points', () => {
    const verts: [number, number][] = [
      [0, 0],
      [2, 0],
      [2, 2],
    ]
    expect(polygonClick(verts, [0.1, 0.1])).toEqual({ type: 'close' })
  })

  it('does not close with only 2 points even on the first vertex', () => {
    const verts: [number, number][] = [
      [0, 0],
      [2, 0],
    ]
    expect(polygonClick(verts, [0, 0])).toEqual({ type: 'add', point: [0, 0] })
  })

  it('honours custom minToClose / closeRadius', () => {
    const verts: [number, number][] = [
      [0, 0],
      [1, 0],
    ]
    expect(polygonClick(verts, [0, 0], { minToClose: 2, closeRadius: 0.1 })).toEqual({
      type: 'close',
    })
  })
})

describe('rotateWallTransform', () => {
  it('rotates a wall 90° about its pivot (no snap)', () => {
    // Wall from (1,0) to (-1,0), pivot at origin, start bearing 0 (pointer on +x).
    // Pointer now on +z axis → 90° turn.
    const out = rotateWallTransform([0, 0], 0, 0, 1, [1, 0], [-1, 0], id)
    expect(out.start[0]).toBeCloseTo(0, 6)
    expect(out.start[1]).toBeCloseTo(1, 6)
    expect(out.end[0]).toBeCloseTo(0, 6)
    expect(out.end[1]).toBeCloseTo(-1, 6)
  })

  it('clamps the turn to +90° even for a larger pointer swing', () => {
    // Pointer at angle ~135° (−x,+z) but the turn clamps to +90°.
    const out = rotateWallTransform([0, 0], 0, -1, 1, [1, 0], [-1, 0], id)
    expect(out.start[0]).toBeCloseTo(0, 6)
    expect(out.start[1]).toBeCloseTo(1, 6)
  })

  it('is identity (within snap) when the pointer keeps the start bearing', () => {
    const out = rotateWallTransform([0, 0], 0, 1, 0, [1, 0], [-1, 0], id)
    expect(out.start[0]).toBeCloseTo(1, 6)
    expect(out.start[1]).toBeCloseTo(0, 6)
    expect(out.end[0]).toBeCloseTo(-1, 6)
  })

  it('runs each rotated coordinate through snap', () => {
    // 90° turn would put start at (0,1); a 0.5 m snap leaves it unchanged but
    // proves snap is applied to a slightly-off pivot offset.
    const out = rotateWallTransform([0, 0], 0, 0, 1, [0.9, 0], [-0.9, 0], half)
    expect(out.start).toEqual([0, 1])
  })
})
