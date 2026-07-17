/**
 * GLB Asset Designer — Stage 7b precision III: **live during-drag face snapping**
 * session. A thin stateful wrapper over the pure `snapFaces` engine (faceSnap.ts)
 * that adds the two things a per-frame magnetic drag needs beyond a one-shot
 * commit snap:
 *
 *  1. **Memoised targets.** The parts the drag snaps AGAINST can't move while the
 *     drag is in flight, so their world AABBs are captured ONCE at drag start
 *     (`startDragSnapSession`) instead of being rebuilt every frame — a per-frame
 *     `O(n)` AABB pass over ~50 parts stays cheap.
 *  2. **Hysteresis.** A raw per-frame `snapFaces` would flicker at the threshold
 *     boundary: one frame within 8 mm snaps flush, the next frame (a sub-pixel
 *     jitter past 8 mm) releases, and the object stutters. Instead an axis that
 *     is ALREADY snapped holds until the drag pulls it past a wider RELEASE band
 *     (`releaseFactor × threshold`, ~1.5× = 12 mm). Engaging still needs the tight
 *     threshold, so the classic "jump flush when you get close, let go when you
 *     yank away" feel is preserved without the boundary chatter.
 *
 * Pure — no three, no store, no React. `startDragSnapSession` → per-frame
 * `updateDragSnap` → discard at drag end. The per-axis engaged flags are the only
 * mutable state and live on the returned session object.
 */

import type { Axis3, Bounds3 } from './arrange'
import { FACE_SNAP_THRESHOLD_M, type FaceSnapHit, snapFaces } from './faceSnap'

/** Release-band multiple of the engage threshold. A snapped axis holds flush
 *  until the drag pulls it past `RELEASE_FACTOR × threshold`; below this it stays
 *  snapped (hysteresis, no boundary flicker). 1.5× ≈ 12 mm at the 8 mm default. */
export const DRAG_SNAP_RELEASE_FACTOR = 1.5

const AXES: Axis3[] = ['x', 'y', 'z']
const AXIS_INDEX: Record<Axis3, 0 | 1 | 2> = { x: 0, y: 1, z: 2 }

export interface DragSnapSession {
  /** The static snap targets (other parts' world AABBs), captured at drag start. */
  readonly targets: Bounds3[]
  /** The tight engage threshold (m) — a fresh snap needs to be within this. */
  readonly threshold: number
  /** The wider release threshold (m) — an engaged snap holds until past this. */
  readonly releaseThreshold: number
  /** Per-axis engaged state, carried across frames for the hysteresis. */
  engaged: { x: boolean; y: boolean; z: boolean }
}

export interface DragSnapFrame {
  /** Position delta (m) to add to the moving selection this frame — 0 on every
   *  axis that isn't currently snapped. */
  delta: [number, number, number]
  /** The snaps engaged this frame (for the live hint). Empty when none. */
  hits: FaceSnapHit[]
  /** True when at least one axis is snapped this frame. */
  snapped: boolean
}

/**
 * Open a drag-snap session against a fixed set of target boxes. `targets` are the
 * world AABBs of every part OTHER than the dragged selection — computed once here
 * (they can't move mid-drag) and reused every frame by `updateDragSnap`.
 */
export function startDragSnapSession(
  targets: Bounds3[],
  threshold: number = FACE_SNAP_THRESHOLD_M,
  releaseFactor: number = DRAG_SNAP_RELEASE_FACTOR,
): DragSnapSession {
  return {
    targets,
    threshold,
    releaseThreshold: threshold * releaseFactor,
    engaged: { x: false, y: false, z: false },
  }
}

/**
 * Advance the session one frame: given the dragged selection's live world AABB at
 * its raw (un-snapped) position, return the delta that snaps it flush plus which
 * snaps are engaged — applying per-axis hysteresis against the session's carried
 * engaged state. Mutates `session.engaged` in place.
 *
 * Per axis: a candidate within the tight `threshold` (re)engages the snap; an
 * axis that was already engaged keeps its snap while a candidate stays within the
 * wider `releaseThreshold`; otherwise the axis releases (delta 0). Reuses the
 * pure `snapFaces` engine at each band, so the abut/align/locality rules are
 * exactly the commit-time ones.
 */
export function updateDragSnap(session: DragSnapSession, moving: Bounds3): DragSnapFrame {
  // Candidates within the tight engage band and within the wider release band.
  // Two O(n) passes over the (memoised) targets — trivial at ~50 parts, and it
  // keeps the abut/align/nearest tie-breaking identical to the commit snap.
  const engage = snapFaces(moving, session.targets, session.threshold)
  const release = snapFaces(moving, session.targets, session.releaseThreshold)
  const delta: [number, number, number] = [0, 0, 0]
  const hits: FaceSnapHit[] = []
  for (const axis of AXES) {
    const i = AXIS_INDEX[axis]
    const engageHit = engage.hits.find((h) => h.axis === axis)
    if (engageHit) {
      // Within the tight threshold — (re)engage this axis.
      session.engaged[axis] = true
      delta[i] = engage.delta[i]
      hits.push(engageHit)
      continue
    }
    const releaseHit = session.engaged[axis] ? release.hits.find((h) => h.axis === axis) : undefined
    if (releaseHit) {
      // Was engaged and still within the release band — hold the snap.
      delta[i] = release.delta[i]
      hits.push(releaseHit)
    } else {
      // Pulled past the release band (or never engaged) — let this axis go.
      session.engaged[axis] = false
    }
  }
  return { delta, hits, snapped: hits.length > 0 }
}
