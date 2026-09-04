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

import { planLevels, withLevelGeometry } from './levels'
import { roomCategory } from './roomCategory'
import type { FloorPlan, PlanOpening, PlanRoom, PlanWall } from './types'
import { planRoomArea, pointInRoom, wallLength } from './types'
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

/** A door that slides along the wall (SG kitchen/yard/balcony norm) rather than
 *  swinging on a hinge — its 2D symbol is a leaf bar + slide arrow, NOT a swing
 *  arc, and it contributes no quarter-circle keep-out (only the both-sides
 *  approach strip). */
export function isSlidingDoor(o: PlanOpening): boolean {
  return o.kind === 'door' && o.style === 'sliding'
}

/** A double-leaf door — two half-width leaves hinged at BOTH jambs, swinging the
 *  same side (condo main doors, larger-unit master bedrooms). Its 2D symbol is
 *  two quarter-arcs and its keep-out is a conservative full-width swing rect. */
export function isDoubleDoor(o: PlanOpening): boolean {
  return o.kind === 'door' && o.style === 'double'
}

/** Direction a sliding leaf parks/retracts along its wall: toward whichever
 *  adjacent segment has more room, so the open leaf always overlaps real wall
 *  rather than floating past the end. `-1` = toward the wall start, `+1` = toward
 *  the wall end. The 3D leaf (`PlanDoorLeaf`) and the 2D slide arrow
 *  (`doorPlanSymbol`) MUST derive their direction from this one helper — keying
 *  the arrow off `hinge` instead let the plan point the opposite way from the
 *  actual 3D motion. */
export function slidingParkDir(offset: number, width: number, wallLen: number): -1 | 1 {
  const spaceBefore = offset
  const spaceAfter = Math.max(0, wallLen - (offset + width))
  return spaceBefore >= spaceAfter ? -1 : 1
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

/** The opening's along-wall unit tangent `(ux,uz)` + its two jamb points
 *  (`sPt` at `offset`, `ePt` at `offset+width`), arc-aware for curved walls.
 *  The single source of the wall-frame math shared by the swing geometry, the
 *  plan symbol, and the sliding/double keep-out. Returns null for a zero-length
 *  straight wall. */
function openingAxis(
  wall: PlanWall,
  o: PlanOpening,
): { ux: number; uz: number; sPt: [number, number]; ePt: [number, number] } | null {
  if (isCurvedWall(wall)) {
    const a = pointAtArcLength(wall, o.offset)
    const b = pointAtArcLength(wall, o.offset + o.width)
    const mid = pointAtArcLength(wall, o.offset + o.width / 2)
    // angle = atan2(dx, dz) → dx = sin(angle), dz = cos(angle).
    return { ux: Math.sin(mid.angle), uz: Math.cos(mid.angle), sPt: [a.x, a.z], ePt: [b.x, b.z] }
  }
  const len = wallLength(wall)
  if (len === 0) return null
  const ux = (wall.end[0] - wall.start[0]) / len
  const uz = (wall.end[1] - wall.start[1]) / len
  return {
    ux,
    uz,
    sPt: [wall.start[0] + ux * o.offset, wall.start[1] + uz * o.offset],
    ePt: [wall.start[0] + ux * (o.offset + o.width), wall.start[1] + uz * (o.offset + o.width)],
  }
}

/**
 * Resolve the door's hinge/free-jamb/open-leaf-tip points and the SVG arc sweep
 * flag from its `hinge`/`swing` (defaulted). Returns null for a zero-length wall.
 */
export function doorSwingGeometry(wall: PlanWall, o: PlanOpening): DoorSwingGeometry | null {
  const axis = openingAxis(wall, o)
  if (!axis) return null
  const { ux, uz, sPt, ePt } = axis
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

/** Rooms a door never opens INTO: circulation/shared space. A door between a
 *  corridor (or the living/dining space) and a room it serves opens into the
 *  SERVED room — the architectural convention, and the one users read as
 *  "inward". */
const CIRCULATION: ReadonlySet<string> = new Set(['foyer', 'living', 'dining', 'other'])

/** Wet rooms — a bath/WC door opens inward (into the bathroom), never out into
 *  the corridor where the swinging/folding leaf blocks the walkway. */
const WET: ReadonlySet<string> = new Set(['bath', 'powder'])

/**
 * Which of two rooms a door between them SERVES — i.e. the side its leaf should
 * open into. A wet room always wins (a bath/WC door opens inward); otherwise
 * circulation space loses to a served room; otherwise the smaller room wins (the
 * served space is the smaller of a room + the space it opens off). `null` when
 * neither side is preferable (two rooms of the same class + area).
 */
export function servedRoom(a: PlanRoom, b: PlanRoom): PlanRoom | null {
  const ca = roomCategory(a)
  const cb = roomCategory(b)
  if (WET.has(ca) !== WET.has(cb)) return WET.has(ca) ? a : b
  if (CIRCULATION.has(ca) !== CIRCULATION.has(cb)) return CIRCULATION.has(ca) ? b : a
  const aa = planRoomArea(a)
  const ab = planRoomArea(b)
  if (Math.abs(aa - ab) < 1e-6) return null
  return aa < ab ? a : b
}

/**
 * Pick the swing side for a newly-placed door so it opens *into* the room it
 * serves — the architectural convention. Probes a short distance to each side of
 * the opening's centre: if exactly one side lands inside a room, swing toward
 * it; if BOTH sides are rooms (a bath off a corridor, a bedroom off the hall)
 * the served room wins (`servedRoom`) — a bathroom door in particular always
 * opens inward rather than folding out into the walkway. Falls back to the
 * default only when neither side is a room (or the two are indistinguishable).
 * Pure: takes the would-be opening's wall + offset + width, before the opening
 * exists.
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
  const right = plan.rooms.find((r) => pointInRoom(r, cx - uz * probe, cz + ux * probe))
  const left = plan.rooms.find((r) => pointInRoom(r, cx + uz * probe, cz - ux * probe))
  if (right && !left) return 'right'
  if (left && !right) return 'left'
  if (right && left) {
    const served = servedRoom(right, left)
    if (served) return served === right ? 'right' : 'left'
  }
  return DEFAULT_DOOR_SWING
}

/**
 * Convert a desired PHYSICAL swing side (the `(-uz, ux)` right-hand normal =
 * `'right'`) into the `swing` value to STORE on an opening with this `hinge`.
 * `doorSwingGeometry` (and the 3D leaves that match it) fold the hinge jamb into
 * the swing sign — a `'right'` door hinged at the END physically opens to the
 * side a `'right'` door hinged at the START opens away from — so a side computed
 * from room geometry has to be flipped for an end-hinged door or the leaf lands
 * on the wrong face of the wall.
 */
export function swingForPhysicalSide(side: DoorSwing, hinge: DoorHinge): DoorSwing {
  if (hinge === 'start') return side
  return side === 'right' ? 'left' : 'right'
}

/**
 * Fill in `swing` on every door opening that doesn't declare one, so the leaf
 * opens INTO the room it serves (`defaultDoorSwing`) — a bath/WC door in
 * particular folds/slides into the bathroom instead of out into the corridor.
 *
 * Applied when a plan is BUILT (the template registry's `cat()`), not at render
 * time: baking the resolved side into the data keeps the 3D leaf, the 2D symbol,
 * the clearance keep-out and the schedule reading one value, and leaves a
 * user-set swing untouched. Pure — returns a new plan, or the same object when
 * nothing needed filling.
 */
export function withInwardDoorSwings(plan: FloorPlan): FloorPlan {
  // EVERY STOREY (F13, v0.31.9.8). This used to read `plan.walls`/`.openings`
  // only — the GROUND FLOOR — and templates/shared.ts applies it to whole
  // template plans, so upper-storey doors never received a default swing at all.
  // Measured before the fix, a perfectly clean split: ground floors 0 doors
  // without a swing, upper storeys ALL of them —
  // `tpl-hdb-maisonette` 5/5, `tpl-loft` 2/2, `tpl-terrace-ground` 6/6.
  //
  // A door with no `swing` has no swing arc on the drawings and no swing rect for
  // the clearance/keep-out checks, so this was silently exempting every upstairs
  // door from both.
  let next = plan
  for (const level of planLevels(plan)) {
    const byId = new Map(level.walls.map((w) => [w.id, w]))
    let changed = false
    const openings = level.openings.map((o) => {
      if (o.kind !== 'door' || o.swing) return o
      const wall = byId.get(o.wallId)
      if (!wall) return o
      // `defaultDoorSwing` needs the ROOMS of the SAME storey to decide which
      // side is inward, so it is handed this level's geometry, not the plan's.
      const side = defaultDoorSwing(
        { ...plan, walls: level.walls, openings: level.openings, rooms: level.rooms },
        wall,
        o.offset,
        o.width,
      )
      changed = true
      return { ...o, swing: swingForPhysicalSide(side, doorHinge(o)) }
    })
    // Only touch a storey that gained a swing, so a plan with nothing to fill
    // comes back as the SAME object — callers rely on that identity and two
    // tests assert it.
    if (changed) next = withLevelGeometry(next, level.id, () => ({ openings }))
  }
  return next
}

/** SVG short-way (exactly 90°) arc sweep flag from `freeJamb` to `leafTip`
 *  around `hinge`, in SVG's y-down space — the sign of the wrapped angle delta
 *  (shared by every swing leaf so single + double doors agree). */
function arcSweep(
  hinge: [number, number],
  freeJamb: [number, number],
  leafTip: [number, number],
): 0 | 1 {
  const a0 = Math.atan2(freeJamb[1] - hinge[1], freeJamb[0] - hinge[0])
  const a1 = Math.atan2(leafTip[1] - hinge[1], leafTip[0] - hinge[0])
  let d = a1 - a0
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d > 0 ? 1 : 0
}

/** One swing leaf of a door's 2D architectural symbol: a leaf line
 *  `hinge → leafTip` plus a quarter-arc `freeJamb → leafTip` of `radius`. */
interface SwingLeaf {
  hinge: [number, number]
  freeJamb: [number, number]
  leafTip: [number, number]
  sweep: 0 | 1
  radius: number
}

/**
 * The 2D floor-plan symbol for a door, in world metres, so every consumer (the
 * editor's `OpeningsLayer`, the report/plan SVG, the DXF export) draws the SAME
 * symbol from one source. A `swing` door yields one leaf (`panel`/`flush`/
 * `glazed`/`bifold` — a bifold keeps the standard full-width quarter envelope,
 * see `PlanDoorLeaf`) or two mirror leaves (`double`); a `sliding` door yields
 * NO arc — a leaf bar drawn just off the wall on the room side plus a slide-
 * direction arrow along the wall.
 */
export type DoorPlanSymbol =
  | { kind: 'swing'; leaves: SwingLeaf[] }
  | {
      kind: 'sliding'
      /** Leaf bar (offset a hair to the room side), world metres. */
      bar: [[number, number], [number, number]]
      /** Slide-direction arrow shaft `from → to` (arrowhead at `to`). */
      arrow: [[number, number], [number, number]]
    }

export function doorPlanSymbol(wall: PlanWall, o: PlanOpening): DoorPlanSymbol | null {
  const axis = openingAxis(wall, o)
  if (!axis) return null
  const { ux, uz, sPt, ePt } = axis

  if (isSlidingDoor(o)) {
    // Sliding door: no swing arc. Draw the leaf as a bar offset a hair to the
    // swing/room side of the wall, plus an arrow along the wall showing the
    // slide-open direction (toward the hinge jamb — the side the leaf parks/
    // retracts over the adjacent wall).
    const sign = doorSwing(o) === 'right' ? 1 : -1
    const off = 0.06
    const nx = -uz * sign + 0
    const nz = ux * sign + 0
    const bar: [[number, number], [number, number]] = [
      [sPt[0] + nx * off, sPt[1] + nz * off],
      [ePt[0] + nx * off, ePt[1] + nz * off],
    ]
    // Arrow along the wall toward the park jamb — derived from the SAME roomier-
    // side heuristic the 3D leaf uses (`slidingParkDir`), so the plan arrow can
    // never point opposite to the actual 3D slide direction (keying it off
    // `hinge` did just that when the roomier side wasn't the hinge side).
    const c: [number, number] = [(sPt[0] + ePt[0]) / 2 + nx * off, (sPt[1] + ePt[1]) / 2 + nz * off]
    const dir = slidingParkDir(o.offset, o.width, wallLength(wall))
    const half = o.width / 2
    const arrow: [[number, number], [number, number]] = [
      [c[0] - ux * dir * half * 0.7, c[1] - uz * dir * half * 0.7],
      [c[0] + ux * dir * half * 0.7, c[1] + uz * dir * half * 0.7],
    ]
    return { kind: 'sliding', bar, arrow }
  }

  if (isDoubleDoor(o)) {
    // Two half-width leaves hinged at BOTH jambs, swinging to the same side.
    // The swing side follows `swing` alone (both jambs hinge, so hinge doesn't
    // pick a side here).
    const sign = doorSwing(o) === 'right' ? 1 : -1
    const nx = -uz * sign + 0
    const nz = ux * sign + 0
    const half = o.width / 2
    const midS: [number, number] = [sPt[0] + ux * half, sPt[1] + uz * half]
    const midE: [number, number] = [ePt[0] - ux * half, ePt[1] - uz * half]
    const tipS: [number, number] = [sPt[0] + nx * half, sPt[1] + nz * half]
    const tipE: [number, number] = [ePt[0] + nx * half, ePt[1] + nz * half]
    return {
      kind: 'swing',
      leaves: [
        {
          hinge: sPt,
          freeJamb: midS,
          leafTip: tipS,
          radius: half,
          sweep: arcSweep(sPt, midS, tipS),
        },
        {
          hinge: ePt,
          freeJamb: midE,
          leafTip: tipE,
          radius: half,
          sweep: arcSweep(ePt, midE, tipE),
        },
      ],
    }
  }

  // Single-leaf swing (panel / flush / glazed / bifold).
  const g = doorSwingGeometry(wall, o)
  if (!g) return null
  return {
    kind: 'swing',
    leaves: [
      {
        hinge: g.hinge,
        freeJamb: g.freeJamb,
        leafTip: g.leafTip,
        sweep: g.sweep,
        radius: o.width,
      },
    ],
  }
}

export interface SwingRect {
  x0: number
  z0: number
  x1: number
  z1: number
}

/**
 * Axis-aligned keep-clear box for a door's swing zone.
 *
 * - `panel`/`flush`/`glazed`/`bifold`: the quarter-disc the leaf sweeps on its
 *   swing side (the square bounded by hinge, both jambs, and the open leaf tip).
 * - `double`: a **conservative full-width** rect spanning both jambs and
 *   projecting `width/2` (each half-width leaf's reach) into the swing side — a
 *   superset of the two quarter-discs, deliberately coarse (both quarters + the
 *   gap between them) rather than a literal two-arc trace.
 * - `sliding`: **null** — a sliding leaf sweeps nothing, so it contributes no
 *   swing keep-out at all (only `clearance.ts:doorApproachRects`' both-sides
 *   walk-through strip applies). `doorSwingRects` skips a null result.
 */
export function doorSwingClearRect(wall: PlanWall, o: PlanOpening): SwingRect | null {
  if (isSlidingDoor(o)) return null
  if (isDoubleDoor(o)) {
    const axis = openingAxis(wall, o)
    if (!axis) return null
    const { ux, uz, sPt, ePt } = axis
    const sign = doorSwing(o) === 'right' ? 1 : -1
    const nx = -uz * sign + 0
    const nz = ux * sign + 0
    const depth = o.width / 2
    const xs = [sPt[0], ePt[0], sPt[0] + nx * depth, ePt[0] + nx * depth]
    const zs = [sPt[1], ePt[1], sPt[1] + nz * depth, ePt[1] + nz * depth]
    return {
      x0: Math.min(...xs),
      z0: Math.min(...zs),
      x1: Math.max(...xs),
      z1: Math.max(...zs),
    }
  }
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
