/**
 * Inter-room light-bleed through open doorways (R-BLEED) — the *directional*
 * neighbour-contribution term for the 2D lux model (`roomLux.ts` scalar +
 * `luxGrid.ts` spatial heatmap).
 *
 * Motivation: both lux estimators previously treated every room in strict
 * isolation — a light counts only toward the room containing its bulb, a window
 * only toward the room it borders, and interior walls block everything. So a
 * room with no fixture of its own but an OPEN door onto a bright neighbour read
 * a flat 0 lx / "low" (visibly dark in the heatmap), which is wrong: an open
 * doorway borrows a real, if modest, share of the adjacent room's ambient.
 *
 * This module supplies that borrowed term as a **directional** contribution
 * rather than an isotropic room-wide lift: the bleed a floor point receives from
 * a doorway depends on (a) the neighbour room's own ambient level, (b) the
 * doorway aperture (area) and its open/closed state, (c) the point's DISTANCE
 * from the doorway, and (d) whether the point actually FACES the doorway (a cell
 * directly in front of the opening receives far more than one tucked around a
 * corner or off to the side along the same wall). An aperture radiates its light
 * forward into the room, not sideways along its host wall — the facing (cosine)
 * term is what makes the model directional and is what R-BLEED asks for.
 *
 * Design notes:
 * - **First-degree only** (no cascade): a room borrows from each neighbour's
 *   OWN-fixture ambient, never from light that neighbour itself borrowed. This
 *   mirrors the wall-reveal corner-spread rule (publish own strength, not final)
 *   and keeps the model a single cheap pass with no feedback.
 * - **Closed by default → zero bleed**: door open-state comes from the store's
 *   `doors` map, which defaults a door to CLOSED when absent. So out of the box
 *   (all interior doors shut) this term is exactly 0 and the lux output is
 *   byte-identical to the pre-R-BLEED model — bleed only appears once the user
 *   opens a door. No regression, and a clean A/B.
 * - **Mean-preserving spatial spread**: the scalar table adds the borrowed room
 *   MEAN; the grid distributes that same mean across cells with the directional
 *   weight normalised to unit mean — so the heatmap's per-room average still
 *   equals the 2D table number (the existing lumen-method lock-step is kept).
 * - **Fixture ambient only** (not daylight): "neighbouring rooms' light" here is
 *   the installed-fixture wash; daylight already has its own per-room window
 *   model. Daylight door-bleed is a possible future extension.
 *
 * Pure (no three, no React) → fully unit-testable. A documented QC heuristic in
 * the same spirit as `luxGrid.ts`'s daylight wash, not a radiosity simulation.
 */

import type { PlanOpening, PlanRoom, PlanWall } from '../floorplan/types'
import { pointInRoom, wallLength } from '../floorplan/types'

/** Open/closed state of a door, keyed by opening id (the store's `doors` map). */
export type DoorOpenMap = Record<string, { open: boolean } | undefined>

/**
 * Fraction of a neighbour room's own ambient that a *reference* open doorway
 * (a standard ~0.9 × 2.1 m single leaf) contributes to the receiving room's
 * MEAN illuminance. A QC heuristic: an open interior doorway borrows roughly a
 * tenth of the adjacent room's ambient into the room average. Larger apertures
 * scale up (capped), closed doors contribute nothing.
 */
export const BLEED_TRANSMISSION = 0.12

/** Reference doorway aperture (m²) producing the full {@link BLEED_TRANSMISSION}
 *  — a standard 0.9 m × 2.1 m single door leaf. */
export const REFERENCE_APERTURE = 0.9 * 2.1

/** Cap on the aperture scale so a wide opening / cased archway can't run away
 *  (mirrors the daylight glazing-factor cap in `luxGrid.ts`). */
export const APERTURE_FACTOR_CAP = 1.5

/** Distance (m) into the receiving room at which the bleed halves (same shape
 *  and spirit as the daylight wash's half-depth). */
export const BLEED_HALF_DEPTH = 1.8

/** Exponent on the facing (cosine) term. 1 = a plain cosine forward lobe; higher
 *  tightens the lobe directly in front of the doorway. */
export const FACING_EXP = 1

/** How far (m) to probe perpendicular to a doorway's wall when resolving which
 *  two rooms it connects (same trick as `analysis/daylight.ts` / window sources). */
const PROBE_OFFSET = 0.2

/** One neighbour→room bleed source, already resolved into world placement so a
 *  consumer needs no access to the source walls. `inwardNormal` is the unit
 *  wall-normal pointing INTO the receiving room. */
export interface BleedSource {
  /** Room receiving the light. */
  receiverId: string
  /** Neighbour room the light is borrowed from. */
  sourceId: string
  /** World [x,z] centre of the doorway. */
  center: [number, number]
  /** Unit wall-normal pointing into the receiving room. */
  inwardNormal: [number, number]
  /** Doorway aperture, m² (width × (head − sill)). */
  aperture: number
  /** Whether the door is open (closed → no bleed). */
  open: boolean
}

/** Aperture scale for the bleed: doorway area relative to a reference leaf,
 *  clamped to [0, {@link APERTURE_FACTOR_CAP}]. */
export function apertureFactor(aperture: number): number {
  if (!(aperture > 0)) return 0
  return Math.min(APERTURE_FACTOR_CAP, aperture / REFERENCE_APERTURE)
}

/**
 * Borrowed MEAN illuminance (lx) a receiving room gains from one doorway: the
 * neighbour's own ambient × transmission × aperture scale, or 0 when the door is
 * shut or the neighbour is dark. This is the room-average lift; the spatial grid
 * redistributes it directionally via {@link directionalBleedWeight}.
 */
export function bleedMeanLux(neighbourOwnLux: number, aperture: number, open: boolean): number {
  if (!open || !(neighbourOwnLux > 0)) return 0
  return neighbourOwnLux * BLEED_TRANSMISSION * apertureFactor(aperture)
}

/**
 * Directional, distance-graded weight (unnormalised, ≥ 0) for how much a floor
 * point at (px, pz) receives from a doorway at `center` whose inward normal
 * (into the receiving room) is `normal`. Combines a forward-facing cosine lobe
 * with an inverse-square-ish distance falloff:
 *
 *   w = max(0, cosθ)^FACING_EXP · 1 / (1 + (d / BLEED_HALF_DEPTH)²)
 *
 * where θ is the angle between the inward normal and the door→point direction
 * and d is their distance. A point directly in front of the opening gets the
 * full lobe; one beside it along the wall (θ → 90°) or behind the door plane
 * (θ > 90°) gets ~0 — this is the directional term. Points on the doorway line
 * itself (d ≈ 0) get the full undecayed weight.
 */
export function directionalBleedWeight(
  center: readonly [number, number],
  normal: readonly [number, number],
  px: number,
  pz: number,
): number {
  const vx = px - center[0]
  const vz = pz - center[1]
  const d = Math.hypot(vx, vz)
  const falloff = 1 / (1 + (d / BLEED_HALF_DEPTH) ** 2)
  if (d < 1e-6) return falloff // on the threshold → full forward weight
  const facing = Math.max(0, (vx * normal[0] + vz * normal[1]) / d)
  const lobe = FACING_EXP === 1 ? facing : facing ** FACING_EXP
  return lobe * falloff
}

/** Unit tangent (start→end direction) of a wall, or null if degenerate. Shared
 *  by {@link wallNormal} and {@link openingCenter} so the length/direction math
 *  lives in one place. */
function wallTangent(w: PlanWall): [number, number] | null {
  const len = wallLength(w)
  if (len <= 0) return null
  return [(w.end[0] - w.start[0]) / len, (w.end[1] - w.start[1]) / len]
}

/** Unit interior-facing perpendicular of a wall, or null if degenerate. */
function wallNormal(w: PlanWall): [number, number] | null {
  const t = wallTangent(w)
  if (!t) return null
  return [-t[1], t[0]] // rotate the tangent 90°
}

/** World [x,z] centre of an opening along its parent wall, or null if degenerate. */
function openingCenter(op: PlanOpening, w: PlanWall): [number, number] | null {
  const t = wallTangent(w)
  if (!t) return null
  const at = op.offset + op.width / 2
  return [w.start[0] + t[0] * at, w.start[1] + t[1] * at]
}

/**
 * Resolve every OPEN interior doorway into a pair of bleed sources (each doorway
 * feeds light BOTH ways — A borrows from B and B borrows from A). A doorway
 * qualifies when its host wall separates two distinct rooms, found by probing a
 * short distance either side of the opening centre. Closed doors and doorways
 * that don't bridge two rooms (e.g. an external door) are dropped.
 *
 * Pure over the plan geometry; `neighbourOwnLux` is applied later by the caller
 * (which knows the fixture level), so this only carries geometry + open-state.
 */
export function interRoomDoorwaySources(
  rooms: readonly PlanRoom[],
  walls: readonly PlanWall[],
  openings: readonly PlanOpening[],
  doors: DoorOpenMap,
): BleedSource[] {
  const wallById = new Map(walls.map((w) => [w.id, w]))
  const out: BleedSource[] = []
  for (const op of openings) {
    if (op.kind !== 'door') continue
    const open = doors[op.id]?.open ?? false
    if (!open) continue // closed default → no bleed
    const w = wallById.get(op.wallId)
    if (!w) continue
    const n = wallNormal(w)
    const c = openingCenter(op, w)
    if (!n || !c) continue
    const plus: [number, number] = [c[0] + n[0] * PROBE_OFFSET, c[1] + n[1] * PROBE_OFFSET]
    const minus: [number, number] = [c[0] - n[0] * PROBE_OFFSET, c[1] - n[1] * PROBE_OFFSET]
    const roomPlus = rooms.find((r) => pointInRoom(r, plus[0], plus[1]))
    const roomMinus = rooms.find((r) => pointInRoom(r, minus[0], minus[1]))
    if (!roomPlus || !roomMinus || roomPlus.id === roomMinus.id) continue
    const aperture = Math.max(0, op.width) * Math.max(0, op.head - op.sill)
    if (aperture <= 0) continue
    // roomPlus lies on the +normal side → its interior-facing normal is +n.
    out.push({
      receiverId: roomPlus.id,
      sourceId: roomMinus.id,
      center: c,
      inwardNormal: [n[0], n[1]],
      aperture,
      open,
    })
    out.push({
      receiverId: roomMinus.id,
      sourceId: roomPlus.id,
      center: c,
      inwardNormal: [-n[0], -n[1]],
      aperture,
      open,
    })
  }
  return out
}
