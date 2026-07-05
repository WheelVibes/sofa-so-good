/**
 * Pure geometry for the camera-facing "dollhouse" wall reveal.
 *
 *  - `orientOutward` finds which way is "out" by probing a short step off each
 *    face of the wall midpoint against an `isInterior(x, z)` test (point-in-room),
 *    correct on non-rectangular plans where a bbox-centre heuristic would fail.
 *  - `wallRevealFacing` fades a wall from the camera's LOOK DIRECTION only (its
 *    outward normal vs the camera forward), so a wall the camera looks through
 *    goes translucent while a far/back wall stays solid — and, crucially, zoom
 *    and pan never change the fade (only orbiting does).
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
export const WALL_TRANSLUCENT_MIN = 0.1

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
 * Reveal opacity from the camera's look DIRECTION only (ORIENTATION-ONLY reveal):
 * fade a wall ONLY when it clearly faces AWAY from the view — i.e. the camera is
 * looking at its BACK / through it (its outward normal turned toward the camera,
 * `dot` well below 0). `(fwdX, fwdZ)` is the camera forward vector's horizontal
 * (XZ) part; `(outNx, outNz)` the wall's unit outward normal; `dot` is their
 * cosine.
 *
 *  - `dot > 0` (outward normal points away with the view → a FAR/back wall): opaque.
 *  - `dot ≈ 0` (outward normal ⟂ the view → a SIDE wall you're skimming): opaque.
 *    Critically NOT half-faded: a rectangular room's two side walls both sit near
 *    `dot ≈ 0`, so a `(-0.4, 0.4)` band left them ~50% translucent and, as you
 *    orbited past the axis, flipped which side read "bluer" (opaque) vs "whiter"
 *    (faded). Fading only clearly-back-facing walls keeps side walls solid.
 *  - `dot << 0` (outward normal toward the camera → a NEAR/front wall between you
 *    and the room): fades, so the dollhouse isn't blocked.
 *
 * Crucially this depends ONLY on the camera's orientation — NOT its distance
 * (zoom/dolly moves along the look direction, leaving it unchanged) nor a pan
 * (translating camera+target leaves the look direction unchanged). Only orbiting
 * rotates the camera, so only orbiting changes the fade. A near-vertical (top-
 * down) view has no meaningful horizontal facing, so every wall stays opaque
 * (you read the plan from above). Pure.
 */
export function wallRevealFacing(fwdX: number, fwdZ: number, outNx: number, outNz: number): number {
  const len = Math.hypot(fwdX, fwdZ)
  if (len < 0.15) return 1 // looking (nearly) straight down/up → keep walls solid
  const dot = (outNx * fwdX + outNz * fwdZ) / len
  // Only walls clearly turned away from the view fade (dot ≤ −0.75 → 0); side
  // walls (dot ≈ 0) and far walls (dot > 0) stay opaque (≥ −0.25 → 1).
  return smoothstep(-0.75, -0.25, dot)
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
