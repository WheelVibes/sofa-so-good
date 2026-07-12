/**
 * Shared "which room(s) does this wall opening touch" probe (R-BLEED-PROBE-DEDUP).
 *
 * Three consumers previously each carried their own copy of the same geometry:
 * take a wall opening (door or window), find its centre on the wall line, then
 * probe a short distance PERPENDICULAR to the wall on each side and test which
 * room polygon each probe lands in (`pointInRoom`). This module is the single
 * pure home for that math:
 *   - {@link wallTangent} / {@link wallNormal} — unit direction + interior-facing
 *     perpendicular of a wall (null for a zero-length wall).
 *   - {@link openingCenter} — the opening's centre point along its wall.
 *   - {@link openingProbePoints} — centre + normal + the two ± probe points.
 *   - {@link roomsAcrossOpening} — the rooms on each side of the opening.
 *
 * Callers keep their OWN transmission / aperture / assignment semantics; this only
 * owns the geometry. Two documented behavioural knobs let each caller reproduce
 * its exact prior result:
 *
 *   - **`offset`** — how far (m) to probe either side of the centre. All three
 *     callers use 0.2 m today (enough to clear a wall's thickness, small enough
 *     to land inside a shallow room); it stays a parameter so each keeps its own
 *     constant.
 *   - **`clampCenter`** — whether to clamp the along-wall centre distance into
 *     `[0, wallLength]`. `analysis/daylight.ts` and `lighting2d/luxGrid.ts` clamp
 *     (guarding a malformed opening whose offset overruns the wall);
 *     `lighting2d/doorwayBleed.ts` does NOT (its openings are wall-threaded
 *     upstream). For a well-formed opening (`offset + width/2 ∈ [0, len]`) the two
 *     agree exactly — the flag only matters for a degenerate opening, so it is
 *     preserved per-caller rather than unified.
 *
 * The wall normal is `tangent` rotated +90° (`[-t.z, t.x]`); `plus` is the room on
 * the `+normal` side, `minus` the `-normal` side. Room membership uses the first
 * matching room (`Array.find`), so a caller wanting a single room resolves
 * `plus ?? minus` (probe the +side first), and one wanting both sides reads them
 * directly.
 *
 * Pure (no three, no React) → fully unit-testable.
 */

import type { PlanOpening, PlanRoom, PlanWall } from './types'
import { pointInRoom, wallLength } from './types'

export type Vec2 = [number, number]

/** Unit tangent (start→end direction) of a wall, or null if degenerate (zero length). */
export function wallTangent(w: PlanWall): Vec2 | null {
  const len = wallLength(w)
  if (len <= 0) return null
  return [(w.end[0] - w.start[0]) / len, (w.end[1] - w.start[1]) / len]
}

/** Unit wall normal — the tangent rotated +90° (`[-t.z, t.x]`), or null if degenerate. */
export function wallNormal(w: PlanWall): Vec2 | null {
  const t = wallTangent(w)
  if (!t) return null
  return [-t[1], t[0]]
}

/**
 * World `[x, z]` centre of an opening along its parent wall, or null if the wall
 * is degenerate. When `clampCenter` is true the along-wall distance is clamped
 * into `[0, wallLength]` (see the module doc); otherwise the raw
 * `offset + width/2` is used.
 */
export function openingCenter(op: PlanOpening, w: PlanWall, clampCenter = false): Vec2 | null {
  const len = wallLength(w)
  if (len <= 0) return null
  const tx = (w.end[0] - w.start[0]) / len
  const tz = (w.end[1] - w.start[1]) / len
  let at = op.offset + op.width / 2
  if (clampCenter) at = Math.max(0, Math.min(len, at))
  return [w.start[0] + tx * at, w.start[1] + tz * at]
}

/** Centre, unit normal, and the two probe points a short `offset` either side of an
 *  opening's centre, perpendicular to its wall. `plus` sits on the `+normal` side,
 *  `minus` on the `-normal` side. Null if the wall is degenerate. */
export interface OpeningProbe {
  center: Vec2
  normal: Vec2
  plus: Vec2
  minus: Vec2
}

export function openingProbePoints(
  wall: PlanWall,
  opening: PlanOpening,
  offset: number,
  clampCenter = false,
): OpeningProbe | null {
  const normal = wallNormal(wall)
  const center = openingCenter(opening, wall, clampCenter)
  if (!normal || !center) return null
  return {
    center,
    normal,
    plus: [center[0] + normal[0] * offset, center[1] + normal[1] * offset],
    minus: [center[0] - normal[0] * offset, center[1] - normal[1] * offset],
  }
}

/** Rooms on each side of an opening, resolved by probing `offset` metres either
 *  side of its centre. `plus`/`minus` are the first matching room on the `±normal`
 *  side (null if none / outside). Null when the wall is degenerate. */
export interface OpeningRooms {
  /** World `[x, z]` centre of the opening. */
  center: Vec2
  /** Unit wall normal; `plus` lies on this side. */
  normal: Vec2
  /** First room containing the `+normal`-side probe, or null. */
  plus: PlanRoom | null
  /** First room containing the `-normal`-side probe, or null. */
  minus: PlanRoom | null
}

export function roomsAcrossOpening(
  rooms: readonly PlanRoom[],
  wall: PlanWall,
  opening: PlanOpening,
  offset: number,
  clampCenter = false,
): OpeningRooms | null {
  const probe = openingProbePoints(wall, opening, offset, clampCenter)
  if (!probe) return null
  const plus = rooms.find((r) => pointInRoom(r, probe.plus[0], probe.plus[1])) ?? null
  const minus = rooms.find((r) => pointInRoom(r, probe.minus[0], probe.minus[1])) ?? null
  return { center: probe.center, normal: probe.normal, plus, minus }
}
