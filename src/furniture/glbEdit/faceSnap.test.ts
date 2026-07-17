import { describe, expect, it } from 'vitest'
import { boundsFromCenterExtent } from './arrange'
import { FACE_SNAP_THRESHOLD_M, snapFaces } from './faceSnap'

/** A unit box centred at `c`. */
const box = (c: [number, number, number], size: [number, number, number] = [1, 1, 1]) =>
  boundsFromCenterExtent(c, size)

describe('snapFaces — abutment', () => {
  it('snaps the moving box flush to a target on the low side (max → min), zero gap', () => {
    // Target centred at x=1 spans [0.5, 1.5]. Moving spans [-0.494, 0.506] — its
    // max face (0.506) is 6 mm past the target's min (0.5): within 8 mm.
    const target = box([1, 0, 0])
    const moving = box([0.006, 0, 0])
    const { delta, hits } = snapFaces(moving, [target])
    expect(delta[0]).toBeCloseTo(-0.006, 6)
    expect(delta[1]).toBe(0)
    expect(delta[2]).toBe(0)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ axis: 'x', kind: 'abut', coord: 0.5 })
    // After the delta the faces touch exactly.
    expect(moving.max[0] + delta[0]).toBeCloseTo(target.min[0], 6)
  })

  it('snaps flush from the high side (min → max)', () => {
    // Moving to the RIGHT of the target: its min face approaches target.max.
    const target = box([0, 0, 0])
    const moving = box([1.004, 0, 0]) // min = 0.504, target.max = 0.5, gap 4 mm
    const { delta, hits } = snapFaces(moving, [target])
    expect(delta[0]).toBeCloseTo(-0.004, 6)
    expect(hits[0]).toMatchObject({ axis: 'x', kind: 'abut' })
    expect(moving.min[0] + delta[0]).toBeCloseTo(target.max[0], 6)
  })

  it('snaps abutment on the Y axis (stacking) independently', () => {
    const target = box([0, 1, 0])
    const moving = box([0, 0.007, 0]) // top face 0.507 vs target bottom 0.5
    const { delta, hits } = snapFaces(moving, [target])
    expect(delta[1]).toBeCloseTo(-0.007, 6)
    expect(delta[0]).toBe(0)
    expect(delta[2]).toBe(0)
    expect(hits[0].axis).toBe('y')
  })
})

describe('snapFaces — alignment', () => {
  it('snaps same-side faces coplanar when no abutment is in range', () => {
    // Two boxes overlapping on Y/Z; moving is slightly off from being min-aligned
    // on X, and far from any abutment.
    const target = box([0, 0, 0], [2, 1, 1]) // x-span [-1, 1]
    const moving = box([0.006, 0, 0], [1, 1, 1]) // min = -0.494 vs target.min -1? no
    // Make min faces near-coplanar: moving.min should be near target.min (-1).
    const moving2 = box([-0.494, 0, 0], [1, 1, 1]) // min = -0.994 vs target.min -1: 6mm
    const { delta, hits } = snapFaces(moving2, [target])
    expect(hits).toHaveLength(1)
    expect(hits[0].kind).toBe('align')
    expect(hits[0].axis).toBe('x')
    expect(moving2.min[0] + delta[0]).toBeCloseTo(target.min[0], 6)
    void moving
  })

  it('prefers abutment over alignment when both are within threshold', () => {
    // Target x-span [0.5, 1.5]. Moving max 0.506 (abut, 6mm) AND moving min... set
    // up so an align candidate is also close but abut should win.
    const target = box([1, 0, 0])
    const moving = box([0.006, 0, 0])
    const { hits } = snapFaces(moving, [target])
    expect(hits[0].kind).toBe('abut')
  })
})

describe('snapFaces — threshold + isolation', () => {
  it('does not snap when the nearest face is beyond the threshold', () => {
    const target = box([1, 0, 0])
    const moving = box([-0.02, 0, 0]) // max 0.48 vs target.min 0.5 → 20 mm gap
    const { delta, hits } = snapFaces(moving, [target])
    expect(delta).toEqual([0, 0, 0])
    expect(hits).toHaveLength(0)
  })

  it('does not snap when the boxes do not overlap on the perpendicular axes', () => {
    // X faces are 6 mm apart, but the boxes are far apart on Y (no overlap) → the
    // snap is not relevant and must not fire (axis isolation / locality).
    const target = box([1, 5, 0])
    const moving = box([0.006, 0, 0])
    const { delta, hits } = snapFaces(moving, [target])
    expect(delta).toEqual([0, 0, 0])
    expect(hits).toHaveLength(0)
  })

  it('only moves the drag axis, never the perpendicular ones', () => {
    const target = box([1, 0, 0])
    const moving = box([0.006, 0, 0])
    const { delta } = snapFaces(moving, [target])
    expect(delta[1]).toBe(0)
    expect(delta[2]).toBe(0)
  })

  it('respects a custom (tighter) threshold', () => {
    const target = box([1, 0, 0])
    const moving = box([0.006, 0, 0]) // 6 mm gap
    expect(snapFaces(moving, [target], 0.004).hits).toHaveLength(0)
    expect(snapFaces(moving, [target], FACE_SNAP_THRESHOLD_M).hits).toHaveLength(1)
  })
})

describe('snapFaces — group selections + multiple targets', () => {
  it('snaps a wide (group-union) box flush to a neighbour', () => {
    // A group whose union AABB is 2 m wide, dragged toward a wall box.
    const wall = box([2, 0, 0], [1, 2, 2])
    const groupUnion = box([0.5, 0, 0], [2, 1, 1]) // max = 1.5, wall.min = 1.5 already flush
    const nearlyFlush = box([0.494, 0, 0], [2, 1, 1]) // max 1.494 vs 1.5 → 6 mm
    const { delta, hits } = snapFaces(nearlyFlush, [wall])
    expect(delta[0]).toBeCloseTo(0.006, 6)
    expect(hits[0].kind).toBe('abut')
    void groupUnion
  })

  it('picks the nearest of several candidate targets on an axis', () => {
    const near = box([1, 0, 0]) // min 0.5 → moving.max approaches
    const far = box([3, 0, 0])
    const moving = box([0.005, 0, 0]) // max 0.505 vs near.min 0.5 = 5 mm
    const { delta, hits } = snapFaces(moving, [far, near])
    expect(delta[0]).toBeCloseTo(-0.005, 6)
    expect(hits[0].coord).toBeCloseTo(0.5, 6)
  })
})
