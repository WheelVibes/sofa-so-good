import { describe, expect, it } from 'vitest'
import { boundsFromCenterExtent } from './arrange'
import { DRAG_SNAP_RELEASE_FACTOR, startDragSnapSession, updateDragSnap } from './dragSnapSession'
import { FACE_SNAP_THRESHOLD_M } from './faceSnap'

/** A unit box centred at `c`. */
const box = (c: [number, number, number], size: [number, number, number] = [1, 1, 1]) =>
  boundsFromCenterExtent(c, size)

/** The moving box's world max on X after applying a frame's delta. */
const movedMaxX = (moving: ReturnType<typeof box>, dx: number) => moving.max[0] + dx

describe('dragSnapSession — memoised targets + engage', () => {
  it('engages a flush snap when the raw drag comes within the tight threshold', () => {
    const target = box([1, 0, 0]) // x-span [0.5, 1.5]
    const session = startDragSnapSession([target])
    // Moving max 0.506 vs target.min 0.5 → 6 mm, inside the 8 mm engage band.
    const moving = box([0.006, 0, 0])
    const frame = updateDragSnap(session, moving)
    expect(frame.snapped).toBe(true)
    expect(frame.delta[0]).toBeCloseTo(-0.006, 6)
    expect(frame.hits[0]).toMatchObject({ axis: 'x', kind: 'abut' })
    // Face lands exactly flush.
    expect(movedMaxX(moving, frame.delta[0])).toBeCloseTo(target.min[0], 6)
    expect(session.engaged.x).toBe(true)
  })

  it('does NOT engage while still outside the tight threshold', () => {
    const target = box([1, 0, 0])
    const session = startDragSnapSession([target])
    // 10 mm gap — inside the 12 mm release band but outside the 8 mm engage band.
    const moving = box([0.0, 0, 0]) // max 0.5? centre 0 → max 0.5, target.min 0.5 → 0 gap
    // Re-place clearly: max at 0.49 → 10 mm from 0.5.
    const moving10 = box([-0.01, 0, 0])
    const frame = updateDragSnap(session, moving10)
    expect(frame.snapped).toBe(false)
    expect(frame.delta).toEqual([0, 0, 0])
    expect(session.engaged.x).toBe(false)
    void moving
  })
})

describe('dragSnapSession — hysteresis (no boundary flicker)', () => {
  it('holds an engaged snap between the engage and release thresholds', () => {
    const target = box([1, 0, 0])
    const session = startDragSnapSession([target])
    // Frame 1: engage at 6 mm.
    updateDragSnap(session, box([0.006, 0, 0]))
    expect(session.engaged.x).toBe(true)
    // Frame 2: pull back to 10 mm — past engage (8 mm) but inside release (12 mm).
    // A raw snapFaces would release here; the session HOLDS it flush.
    const moving = box([-0.01, 0, 0]) // max 0.49, 10 mm from target.min 0.5
    const frame = updateDragSnap(session, moving)
    expect(frame.snapped).toBe(true)
    expect(frame.hits[0].axis).toBe('x')
    expect(movedMaxX(moving, frame.delta[0])).toBeCloseTo(target.min[0], 6)
    expect(session.engaged.x).toBe(true)
  })

  it('releases once the drag pulls past the release band, then re-engages near', () => {
    const target = box([1, 0, 0])
    const session = startDragSnapSession([target])
    updateDragSnap(session, box([0.006, 0, 0])) // engage
    // Pull to 15 mm — past the 12 mm release band → let go.
    const far = updateDragSnap(session, box([-0.015, 0, 0])) // max 0.485, 15 mm
    expect(far.snapped).toBe(false)
    expect(far.delta).toEqual([0, 0, 0])
    expect(session.engaged.x).toBe(false)
    // Come back within the tight band → engages again.
    const near = updateDragSnap(session, box([0.004, 0, 0])) // 4 mm
    expect(near.snapped).toBe(true)
    expect(session.engaged.x).toBe(true)
  })

  it('the release band is releaseFactor × the engage threshold', () => {
    expect(DRAG_SNAP_RELEASE_FACTOR).toBe(1.5)
    const target = box([1, 0, 0])
    const session = startDragSnapSession([target])
    expect(session.threshold).toBeCloseTo(FACE_SNAP_THRESHOLD_M, 9)
    expect(session.releaseThreshold).toBeCloseTo(FACE_SNAP_THRESHOLD_M * 1.5, 9)
  })
})

describe('dragSnapSession — axis independence + targets stay fixed', () => {
  it('engages and releases per axis independently', () => {
    // Target overlapping on all axes; approach flush on X only, far on Y.
    const target = box([1, 0, 0])
    const session = startDragSnapSession([target])
    const frame = updateDragSnap(session, box([0.006, 0, 0]))
    expect(session.engaged.x).toBe(true)
    expect(session.engaged.y).toBe(false)
    expect(session.engaged.z).toBe(false)
    expect(frame.delta[1]).toBe(0)
    expect(frame.delta[2]).toBe(0)
  })

  it('reuses the SAME target list across frames (memoised, not recomputed)', () => {
    const targets = [box([1, 0, 0])]
    const session = startDragSnapSession(targets)
    expect(session.targets).toBe(targets)
    updateDragSnap(session, box([0.006, 0, 0]))
    // The session must never mutate or replace the captured targets.
    expect(session.targets).toBe(targets)
    expect(session.targets).toHaveLength(1)
  })

  it('a custom threshold scales both bands', () => {
    const target = box([1, 0, 0])
    const session = startDragSnapSession([target], 0.004)
    expect(session.threshold).toBeCloseTo(0.004, 9)
    expect(session.releaseThreshold).toBeCloseTo(0.006, 9)
    // 6 mm is outside the 4 mm engage band → no snap.
    expect(updateDragSnap(session, box([0.006, 0, 0])).snapped).toBe(false)
  })
})
