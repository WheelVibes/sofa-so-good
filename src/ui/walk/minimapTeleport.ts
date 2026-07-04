/**
 * Pure geometry for the walk-mode minimap tap-to-teleport (MINIMAP-JUMP): a
 * tap/click on `<Minimap>` converts to a world XZ point and lands the walker
 * inside the tapped (or nearest) room, clamped clear of its walls. Kept
 * dependency-free (no React/Three/DOM) so it's unit-testable in isolation;
 * `Minimap.tsx` wires it to a real pointer event + `requestWalkTeleport`.
 */

import { roomLabelPoint } from '../../floorplan/roomCentroid'
import type { FloorPlan, PlanRoom, PlanVec2 } from '../../floorplan/types'
import { pointInPolygon, pointInRoom, roomPolygon } from '../../floorplan/types'
import type { PlanContentBounds } from './minimapGeometry'

/**
 * A tap/click's `clientX`/`clientY` → the minimap SVG's own viewBox-space
 * coordinates, accounting for the `.minimap` box NOT being square (168×132,
 * 144×112 on the mobile breakpoint) while the viewBox IS square (`SIZE ×
 * SIZE`) — the browser's default `preserveAspectRatio="xMidYMid meet"`
 * uniformly scales + centres the square content inside the wider box, so a
 * naive per-axis `rect.width`/`rect.height` divide (fine when box and
 * viewBox share an aspect ratio, e.g. the 2D plan editor) would stretch X and
 * Y by different factors here and misplace the tap. `rect` is whatever
 * `SVGSVGElement.getBoundingClientRect()` returns — passed in rather than
 * read here so this stays DOM-free and testable with a plain object.
 */
export function svgSquareViewBoxPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  viewBoxSize: number,
): [number, number] {
  const rendered = Math.min(rect.width, rect.height)
  if (rendered <= 0) return [0, 0]
  const padX = (rect.width - rendered) / 2
  const padY = (rect.height - rendered) / 2
  const k = viewBoxSize / rendered
  return [(clientX - rect.left - padX) * k, (clientY - rect.top - padY) * k]
}

/**
 * Inverse of `Minimap.tsx`'s world→svg transform (`toX`/`toY`:
 * `toX(m) = (m - bounds.minX + pad) * scale + offX`). Recovers the world XZ
 * metre point a minimap-space coordinate corresponds to. Must be kept in
 * lock-step with `Minimap.tsx`'s forward transform.
 */
export function minimapPointToWorld(
  svgX: number,
  svgY: number,
  bounds: PlanContentBounds,
  scale: number,
  offX: number,
  offY: number,
  pad: number,
): [number, number] {
  const x = (svgX - offX) / scale + bounds.minX - pad
  const z = (svgY - offY) / scale + bounds.minZ - pad
  return [x, z]
}

/** Closest point on segment `a`–`b` to point `(px,pz)`. */
function closestOnSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): [number, number] {
  const abx = bx - ax
  const abz = bz - az
  const len2 = abx * abx + abz * abz
  if (len2 < 1e-9) return [ax, az]
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / len2))
  return [ax + abx * t, az + abz * t]
}

/**
 * Clamp a point into a polygon with a safety margin from every edge, so a
 * teleport can never land in — or flush against — a wall. A point already
 * `margin` clear of every edge (and inside) passes through unchanged;
 * otherwise it is pulled to the nearest boundary point and nudged `margin`
 * further inward along that edge's normal (the inward direction is probed
 * via `pointInPolygon` rather than assumed, so this works for the app's
 * rectangular, L-shaped, AND free-drawn room polygons alike — not just
 * axis-aligned ones). Returns the input unchanged for a degenerate (<3
 * point) polygon.
 */
export function clampPointToPolygon(
  poly: PlanVec2[],
  x: number,
  z: number,
  margin: number,
): [number, number] {
  if (poly.length < 3) return [x, z]
  let bestDist = Number.POSITIVE_INFINITY
  let bestPt: [number, number] = [x, z]
  let bestA: PlanVec2 = poly[0]
  let bestB: PlanVec2 = poly[1]
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const c = closestOnSegment(x, z, a[0], a[1], b[0], b[1])
    const d = Math.hypot(c[0] - x, c[1] - z)
    if (d < bestDist) {
      bestDist = d
      bestPt = c
      bestA = a
      bestB = b
    }
  }
  const inside = pointInPolygon(x, z, poly)
  if (inside && bestDist >= margin) return [x, z]
  const ex = bestB[0] - bestA[0]
  const ez = bestB[1] - bestA[1]
  const elen = Math.hypot(ex, ez) || 1
  let nx = -ez / elen
  let nz = ex / elen
  const probe = Math.max(margin, 1e-3)
  if (!pointInPolygon(bestPt[0] + nx * probe, bestPt[1] + nz * probe, poly)) {
    nx = -nx
    nz = -nz
  }
  return [bestPt[0] + nx * margin, bestPt[1] + nz * margin]
}

/**
 * Which room a world XZ point should teleport into: the room containing it,
 * else the room nearest by boundary distance (so a tap on a wall gap / just
 * outside every room still resolves to somewhere sensible instead of a
 * no-op). `null` for a plan with no rooms.
 */
export function nearestTeleportRoom(plan: FloorPlan, x: number, z: number): PlanRoom | null {
  for (const r of plan.rooms) {
    if (pointInRoom(r, x, z)) return r
  }
  let best: PlanRoom | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const r of plan.rooms) {
    const poly = roomPolygon(r)
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      const c = closestOnSegment(x, z, a[0], a[1], b[0], b[1])
      const d = Math.hypot(c[0] - x, c[1] - z)
      if (d < bestDist) {
        bestDist = d
        best = r
      }
    }
  }
  return best
}

/** Yaw (radians) to face from `(x,z)` toward `(fx,fz)`, in the SAME
 *  convention `FirstPersonCamera`'s look refs use (`Euler(pitch, yaw, 0,
 *  'YXZ')`) — the inverse of how the minimap's own camera arrow derives its
 *  rotation from `cameraForwardXZ` (`atan2(forward.x, -forward.z)`), so a
 *  point at `(fx,fz)` really ends up dead ahead. Faces −Z (yaw 0) when the two
 *  points coincide (degenerate). */
export function computeFacingYaw(x: number, z: number, fx: number, fz: number): number {
  const dx = fx - x
  const dz = fz - z
  if (Math.hypot(dx, dz) < 1e-6) return 0
  return Math.atan2(dx, -dz)
}

export interface MinimapTeleportTarget {
  x: number
  z: number
  yaw: number
}

/**
 * The whole tap→teleport resolution: pick the target room, clamp the tapped
 * point inside it (clear of its walls by `margin`), and face the room's
 * centre (`roomLabelPoint` — always interior for rect/L-shape rooms, the
 * area centroid for a polygon room; the SAME point the minimap already uses
 * for its live room-name label, so facing lines up with what the label
 * calls "the room"). Facing the room (not preserving the walker's prior
 * heading) matches how every other walk-mode (re)spawn in
 * `FirstPersonCamera` already orients — looking into the space, not wherever
 * the camera happened to point before — and avoids a jarring "teleported
 * into a room, now staring at a wall" landing after the clamp nudges the
 * point off a tapped-too-close-to-a-wall spot. Returns `null` for a plan
 * with no rooms (nothing to teleport into).
 */
export function resolveMinimapTeleport(
  plan: FloorPlan,
  tapX: number,
  tapZ: number,
  margin: number,
): MinimapTeleportTarget | null {
  const room = nearestTeleportRoom(plan, tapX, tapZ)
  if (!room) return null
  const [x, z] = clampPointToPolygon(roomPolygon(room), tapX, tapZ, margin)
  const [fx, fz] = roomLabelPoint(room)
  return { x, z, yaw: computeFacingYaw(x, z, fx, fz) }
}
