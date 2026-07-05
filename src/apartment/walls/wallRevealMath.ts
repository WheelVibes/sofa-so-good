/**
 * Pure geometry for the camera-facing "dollhouse" wall reveal.
 *
 * The old heuristic faded a wall by comparing its outward normal to the
 * direction of the plan's **bounding-box centre**. That breaks on
 * non-rectangular plans (L/U/notched shapes, and the default HDB flat): the
 * bbox centre can land in a notch or sit far off the room mass, so a wall's
 * "outward" side is mis-judged and it never fades when you orbit to face it.
 *
 * This module decides everything **per wall**, with no global centre:
 *  - `orientOutward` finds which way is "out" by probing a short step off each
 *    face of the wall midpoint against an `isInterior(x, z)` test (point-in-room).
 *  - `wallRevealFactor` fades a wall when the camera sits on that outward side
 *    (i.e. the wall is between the camera and the rooms), using the wall's own
 *    midpoint as the reference — correct for any plan shape.
 *
 * Dependency-free so it is fully unit-tested without the R3F/scene stack.
 */

/**
 * Minimum opacity a faded wall keeps in the default **translucent** reveal mode
 * (both orbit `WallSegment` and the per-room editor). It never fully disappears
 * (that's the separate `auto-hide` mode) — but it's kept low so a revealed wall
 * is strongly see-through, letting you look right into the room. (`auto-hide`
 * ignores this and can fade to 0.)
 */
export const WALL_TRANSLUCENT_MIN = 0.07

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Orient a wall's face normal `(nx, nz)` so it points **outward** (away from the
 * interior). Probes a point `probe` metres off each face of the wall midpoint:
 *  - if the +normal side is interior → outward is the negated normal,
 *  - if the −normal side is interior → outward is the normal as-is.
 * Returns `null` when both sides read interior (an internal partition between
 * two rooms) or neither does (ambiguous) — the caller then leaves the wall solid.
 * `probe` should clear the wall's half-thickness so it lands inside the room.
 */
export function orientOutward(
  midX: number,
  midZ: number,
  nx: number,
  nz: number,
  isInterior: (x: number, z: number) => boolean,
  probe = 0.3,
): { nx: number; nz: number } | null {
  const plus = isInterior(midX + nx * probe, midZ + nz * probe)
  const minus = isInterior(midX - nx * probe, midZ - nz * probe)
  if (plus === minus) return null // both/neither interior → not a clear exterior wall
  return plus ? { nx: -nx, nz: -nz } : { nx, nz }
}

/**
 * Reveal opacity factor for a wall: `1` (opaque) when the camera is on the
 * interior side, ramping to `0` (faded) as the camera moves to the wall's
 * outward side — so a wall between the camera and the rooms goes translucent.
 * Per-wall (uses the wall midpoint), independent of plan shape. The ramp keeps
 * grazing/side walls partially faded (opening the dollhouse) while walls clearly
 * on the far/interior side stay solid.
 */
export function wallRevealFactor(
  camX: number,
  camZ: number,
  midX: number,
  midZ: number,
  outNx: number,
  outNz: number,
  centerX?: number,
  centerZ?: number,
): number {
  const tx = camX - midX
  const tz = camZ - midZ
  const len = Math.hypot(tx, tz) || 1
  const dot = (outNx * tx + outNz * tz) / len // >0 → camera on the outward side → fade
  // Facing term: a wall fades once it's perpendicular-or-facing the camera
  // (dot ≥ 0); walls whose outward normal points clearly AWAY (dot ≤ −0.4, the
  // far "back" of the dollhouse) stay solid so the model still reads as a box.
  const facing = 1 - smoothstep(-0.4, 0, dot)
  if (centerX === undefined || centerZ === undefined) return facing
  // Proximity term: a near SIDE wall (a room's perpendicular wall, edge-on to
  // the view) has no camera-facing outward normal, so the facing term alone
  // leaves it as an awkward opaque fin. Fade any wall that sits clearly NEARER
  // the camera than the plan centre does; walls past the centre (the far half)
  // keep their facing-based opacity. Taking the min means a wall fades if it
  // EITHER faces the camera OR is a near wall — opening up the near rooms fully.
  const camToCenter = Math.hypot(camX - centerX, camZ - centerZ) || 1
  const ratio = (len - camToCenter) / camToCenter // <0 nearer than centre, >0 farther
  const proximity = smoothstep(-0.2, 0.05, ratio) // near → 0 (faded), far → 1 (opaque)
  return Math.min(facing, proximity)
}

/**
 * Reveal opacity for an **isolated room** (the per-room editor dollhouse), based
 * on how much CLOSER a wall is to the camera than the room centre — normalised by
 * the room's own size, NOT the camera distance. `wallRevealFactor`'s proximity
 * term divides by `camToCenter`, which is fine for the whole flat but wrong for a
 * single small room framed to fill the viewport: there every wall sits at nearly
 * the same (large) fit-distance, so that ratio is ~0 for all of them and even the
 * far/back walls drift translucent (and flip on tiny camera moves). Here we
 * measure nearness against the wall's own offset from centre (≈ the room's half-
 * extent toward it), so the walls actually closest to the camera fade while the
 * far walls stay solidly opaque.
 *
 * Returns 1 (opaque) for a wall at/behind the centre, ramping to 0 (faded) as it
 * moves in front of the centre toward the camera. Pure.
 */
export function nearWallRevealFactor(
  camX: number,
  camZ: number,
  midX: number,
  midZ: number,
  centerX: number,
  centerZ: number,
): number {
  const camToWall = Math.hypot(camX - midX, camZ - midZ)
  const camToCenter = Math.hypot(camX - centerX, camZ - centerZ)
  const halfExtent = Math.hypot(midX - centerX, midZ - centerZ) || 1
  // >0 when the wall is between the camera and the centre (a near wall), in units
  // of the room's half-extent toward that wall; <0 when it's on the far side.
  const nearness = (camToCenter - camToWall) / halfExtent
  // Near (nearness → 1) fades to 0; a side wall (~0) or far wall (<0) stays opaque.
  return 1 - smoothstep(0.1, 0.7, nearness)
}

/**
 * Orient a wall's face normal `(nx, nz)` so it points **toward the camera**.
 * Used for interior partitions (which have rooms on both sides, so there is no
 * single "outward"): in the all-walls reveal scope a partition fades when the
 * camera faces it, revealing the room behind. Feeding this into
 * `wallRevealFactor` makes a head-on partition fade and an edge-on one stay.
 */
export function cameraFacingNormal(
  midX: number,
  midZ: number,
  nx: number,
  nz: number,
  camX: number,
  camZ: number,
): { nx: number; nz: number } {
  const towardCam = nx * (camX - midX) + nz * (camZ - midZ)
  return towardCam < 0 ? { nx: -nx, nz: -nz } : { nx, nz }
}

/** A rectangle (+ optional L-shaped extension) in plan metres — the shape both
 *  the fixed-apartment `RoomDef` and the custom-plan `PlanRoom` reduce to for a
 *  point-in-room test. */
export interface RoomRect {
  x: number
  z: number
  w: number
  d: number
  ext?: { x: number; z: number; w: number; d: number }
}

/** True if `(x, z)` lies inside any room rectangle (or its L-extension). A small
 *  `pad` lets a probe just inside a wall still register as interior. */
export function pointInRooms(x: number, z: number, rooms: readonly RoomRect[], pad = 0): boolean {
  for (const r of rooms) {
    if (x >= r.x - pad && x <= r.x + r.w + pad && z >= r.z - pad && z <= r.z + r.d + pad)
      return true
    const e = r.ext
    if (e && x >= e.x - pad && x <= e.x + e.w + pad && z >= e.z - pad && z <= e.z + e.d + pad)
      return true
  }
  return false
}
