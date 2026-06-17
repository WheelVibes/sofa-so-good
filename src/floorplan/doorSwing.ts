/**
 * Door hinge + swing geometry — the single source of truth for which jamb a
 * door pivots on and which way the leaf swings. Pure + testable; consumed by the
 * 2D floor-plan editor (the architectural swing-arc symbol), the clearance check
 * (the keep-clear quarter on the swing side), and any plan-door renderer.
 *
 * Conventions (matching the fixed flat's `DoorSpec`):
 * - `hinge`: which jamb pivots, along the wall's start→end direction.
 * - `swing`: 'right' = the wall's right-hand normal `(-uz, ux)` of the unit
 *   tangent `(ux, uz)`; 'left' = the opposite side.
 */

import { isSlopedWall } from './slopedWall'
import type { FloorPlan, PlanOpening, PlanWall } from './types'
import { pointInRoom, wallLength } from './types'
import { isCurvedWall, pointAtArcLength } from './wallArc'

export type DoorHinge = 'start' | 'end'
export type DoorSwing = 'left' | 'right'

export const DEFAULT_DOOR_HINGE: DoorHinge = 'start'
export const DEFAULT_DOOR_SWING: DoorSwing = 'right'

export function doorHinge(o: PlanOpening): DoorHinge {
  return o.hinge ?? DEFAULT_DOOR_HINGE
}

export function doorSwing(o: PlanOpening): DoorSwing {
  return o.swing ?? DEFAULT_DOOR_SWING
}

export interface DoorSwingGeometry {
  /** Hinge jamb (the pivot point), world metres. */
  hinge: [number, number]
  /** Opposite jamb — the closed leaf tip rests here, world metres. */
  freeJamb: [number, number]
  /** Open (90°) leaf tip, world metres. */
  leafTip: [number, number]
  /** SVG arc sweep flag (0|1) for an arc from `freeJamb` to `leafTip`, radius =
   *  the opening width, drawn in a y-down coordinate space (SVG screen space). */
  sweep: 0 | 1
  /** Unit wall-normal pointing to the swing side. */
  normal: [number, number]
}

/**
 * Resolve the door's hinge/free-jamb/open-leaf-tip points and the SVG arc sweep
 * flag from its `hinge`/`swing` (defaulted). Returns null for a zero-length wall.
 */
export function doorSwingGeometry(wall: PlanWall, o: PlanOpening): DoorSwingGeometry | null {
  // Sloped walls don't host openings (their geometry is a solid prism).
  if (isSlopedWall(wall)) return null
  // Tangent (ux,uz) + the two jamb points. On a curved wall the jambs sit on the
  // arc (positioned by arc-length) and the tangent is taken at the opening's
  // mid-arc; on a straight wall it's the usual linear interpolation.
  let ux: number
  let uz: number
  let sPt: [number, number]
  let ePt: [number, number]
  if (isCurvedWall(wall)) {
    const a = pointAtArcLength(wall, o.offset)
    const b = pointAtArcLength(wall, o.offset + o.width)
    const mid = pointAtArcLength(wall, o.offset + o.width / 2)
    // angle = atan2(dx, dz) → dx = sin(angle), dz = cos(angle).
    ux = Math.sin(mid.angle)
    uz = Math.cos(mid.angle)
    sPt = [a.x, a.z]
    ePt = [b.x, b.z]
  } else {
    const len = wallLength(wall)
    if (len === 0) return null
    ux = (wall.end[0] - wall.start[0]) / len
    uz = (wall.end[1] - wall.start[1]) / len
    sPt = [wall.start[0] + ux * o.offset, wall.start[1] + uz * o.offset]
    ePt = [wall.start[0] + ux * (o.offset + o.width), wall.start[1] + uz * (o.offset + o.width)]
  }
  const hingeAtStart = doorHinge(o) === 'start'
  // The physical swing side flips with the hinge jamb — matching the 3D door
  // leaf (PlanDoorLeaf), where the leaf is offset to the hinge side and rotated,
  // so a 'right' door hinged at the END opens to the side a 'right' door hinged
  // at the START opens away from. Fold the hinge into the sign so the 2D arc,
  // the clearance quarter, and the report all agree with the 3D swing.
  const sign = (doorSwing(o) === 'right' ? 1 : -1) * (hingeAtStart ? 1 : -1)
  // `+ 0` normalises a `-0` (from `-uz * sign` when uz is 0) to `0` so equality
  // checks + downstream consumers never see negative zero.
  const nx = -uz * sign + 0
  const nz = ux * sign + 0
  const hinge = hingeAtStart ? sPt : ePt
  const freeJamb = hingeAtStart ? ePt : sPt
  const leafTip: [number, number] = [hinge[0] + nx * o.width, hinge[1] + nz * o.width]
  // Short-way arc (exactly 90°) from freeJamb to leafTip around the hinge. In
  // SVG's y-down space, sweep=1 is the increasing-angle (visually clockwise)
  // direction, so the sign of the wrapped angle delta picks the flag.
  const a0 = Math.atan2(freeJamb[1] - hinge[1], freeJamb[0] - hinge[0])
  const a1 = Math.atan2(leafTip[1] - hinge[1], leafTip[0] - hinge[0])
  let d = a1 - a0
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  const sweep: 0 | 1 = d > 0 ? 1 : 0
  return { hinge, freeJamb, leafTip, sweep, normal: [nx, nz] }
}

/**
 * Pick the swing side for a newly-placed door so it opens *into* the room it
 * serves — the architectural convention. Probes a short distance to each side of
 * the opening's centre: if exactly one side lands inside a room, swing toward it;
 * otherwise (both sides rooms, or neither) fall back to the default. Pure: takes
 * the would-be opening's wall + offset + width, before the opening exists.
 */
export function defaultDoorSwing(
  plan: FloorPlan,
  wall: PlanWall,
  offset: number,
  width: number,
): DoorSwing {
  const len = wallLength(wall)
  if (len === 0) return DEFAULT_DOOR_SWING
  const ux = (wall.end[0] - wall.start[0]) / len
  const uz = (wall.end[1] - wall.start[1]) / len
  const cx = wall.start[0] + ux * (offset + width / 2)
  const cz = wall.start[1] + uz * (offset + width / 2)
  const probe = 0.5
  // 'right' is the (-uz, ux) normal; 'left' the opposite.
  const rightInside = plan.rooms.some((r) => pointInRoom(r, cx - uz * probe, cz + ux * probe))
  const leftInside = plan.rooms.some((r) => pointInRoom(r, cx + uz * probe, cz - ux * probe))
  if (rightInside && !leftInside) return 'right'
  if (leftInside && !rightInside) return 'left'
  return DEFAULT_DOOR_SWING
}

export interface SwingRect {
  x0: number
  z0: number
  x1: number
  z1: number
}

/**
 * Axis-aligned keep-clear box covering the quarter-disc the leaf sweeps on its
 * swing side (the square bounded by the hinge, both jambs, and the open leaf
 * tip). Tighter and side-correct compared with a both-sides box.
 */
export function doorSwingClearRect(wall: PlanWall, o: PlanOpening): SwingRect | null {
  const g = doorSwingGeometry(wall, o)
  if (!g) return null
  const far: [number, number] = [
    g.freeJamb[0] + g.leafTip[0] - g.hinge[0],
    g.freeJamb[1] + g.leafTip[1] - g.hinge[1],
  ]
  const xs = [g.hinge[0], g.freeJamb[0], g.leafTip[0], far[0]]
  const zs = [g.hinge[1], g.freeJamb[1], g.leafTip[1], far[1]]
  return {
    x0: Math.min(...xs),
    z0: Math.min(...zs),
    x1: Math.max(...xs),
    z1: Math.max(...zs),
  }
}
