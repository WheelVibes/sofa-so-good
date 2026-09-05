/**
 * ESTATE-DOOR-SIDE — which face of the plan the common corridor fronts, and the rigid
 * transform that puts the (canonical) estate layout there.
 *
 * `estateLayout.ts` builds ONE estate: the corridor on the +z face of a footprint whose
 * width runs along +x. That is the only frame its maths knows, and keeping it that way is
 * deliberate — every placement rule (wing ends, `winSign`, the two roads, the neighbour
 * stagger) stays a single set of numbers instead of four mirrored copies. What varies per
 * plan is where that frame is BOLTED ON, so this module answers two questions:
 *
 *  1. {@link corridorFromPlan} — which exterior face carries the main door (HDB templates put
 *     it on +z, but `tpl-hdb-5room` opens on −z and `tpl-hdb-3gen` on +x), and what run along
 *     that face the corridor should cover. The door itself comes from
 *     `apartment/fittings/fittingModel.ts:mainDoor` — the same widest-external-door rule the
 *     distribution board already uses, shared rather than re-derived.
 *  2. {@link estateFrame} — the canonical extent (width/depth swapped for the ±x faces), the
 *     canonical corridor span, and a yaw about the plan's footprint centre in multiples of
 *     90° that `Estate.tsx` applies to the whole `estate-surround` group. Rigid, never a
 *     reflection, so the corridor is always on the far side of the main door and the window
 *     façade always on the opposite face — the invariant `winSign` encodes.
 */
import { mainDoor } from '../../apartment/fittings/fittingModel'
import { planExtent } from '../../floorplan/planExtent'
import type { FloorPlan } from '../../floorplan/types'

export type CorridorSide = '+x' | '-x' | '+z' | '-z'

export interface EstateCorridor {
  /** Exterior face of the plan the main door — and so the common corridor — lies on. */
  side: CorridorSide
  /** Run the corridor fronts, in PLAN metres along that face's own axis (x for ±z, z for ±x). */
  span: [number, number]
}

/** Clear corridor either side of the main-door leaf, metres. */
export const CORRIDOR_DOOR_CLEAR_M = 1.5

/**
 * Fallback corridor for a plan with no door at all: the +z face, the run the default 4-room
 * flat used before this module existed (`[min(w − 3.2, 9.5), w]`).
 */
function fallbackCorridor(w: number): EstateCorridor {
  return { side: '+z', span: [Math.min(w - 3.2, 9.5), w] }
}

/**
 * The exterior face the main door's wall sits on: its own axis picks the pair (a wall running
 * along x can only front ±z), and the nearer plan-extent edge picks the sign. A wall that is
 * not axis-aligned falls back to whichever of the four edges the door centre is nearest.
 */
function sideOfDoor(
  ux: number,
  uz: number,
  cx: number,
  cz: number,
  w: number,
  d: number,
): CorridorSide {
  const alongX = Math.abs(ux) >= Math.abs(uz)
  const axisKnown = Math.abs(Math.abs(ux) - Math.abs(uz)) > 1e-6
  const zSide: CorridorSide = d - cz <= cz ? '+z' : '-z'
  const xSide: CorridorSide = w - cx <= cx ? '+x' : '-x'
  if (axisKnown) return alongX ? zSide : xSide
  return Math.min(cz, d - cz) <= Math.min(cx, w - cx) ? zSide : xSide
}

/**
 * The corridor face + run for a plan: the main door's exterior face, and a run covering the
 * door leaf plus {@link CORRIDOR_DOOR_CLEAR_M} either side, clamped to the face and extended
 * to whichever block end the door is nearer — a common corridor runs to the lift lobby, it
 * does not stop two metres past the last flat.
 */
export function corridorFromPlan(plan: FloorPlan): EstateCorridor {
  const [w, d] = planExtent(plan)
  const md = mainDoor(plan)
  if (!md) return fallbackCorridor(w)
  const { opening, wall } = md
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const len = Math.hypot(dx, dz)
  if (len < 1e-6) return fallbackCorridor(w)
  const t = opening.offset + opening.width / 2
  const cx = wall.start[0] + (dx / len) * t
  const cz = wall.start[1] + (dz / len) * t
  const side = sideOfDoor(dx / len, dz / len, cx, cz, w, d)
  const faceLen = side === '+z' || side === '-z' ? w : d
  const centre = side === '+z' || side === '-z' ? cx : cz
  const pad = CORRIDOR_DOOR_CLEAR_M + opening.width / 2
  const span: [number, number] = [Math.max(0, centre - pad), Math.min(faceLen, centre + pad)]
  if (centre < faceLen / 2) span[0] = 0
  else span[1] = faceLen
  return { side, span }
}

/**
 * Where to bolt the canonical estate on. `yaw` is a rotation about +Y in multiples of 90°
 * and `offset` the translation that follows it, so a canonical point `(x, z)` renders at
 * `R(yaw)·(x, z) + offset` — exactly what a three `<group position rotation>` does.
 * `extent`/`span` are the canonical inputs {@link import('./estateLayout').buildEstateLayout}
 * wants: width along the corridor face first, depth second.
 */
export interface EstateFrame {
  yaw: number
  offset: [number, number]
  extent: [number, number]
  span: [number, number]
}

export function estateFrame(
  corridor: EstateCorridor,
  extent: readonly [number, number],
): EstateFrame {
  const [w, d] = extent
  const [a, b] = corridor.span
  switch (corridor.side) {
    case '+z':
      return { yaw: 0, offset: [0, 0], extent: [w, d], span: [a, b] }
    case '-z':
      return { yaw: Math.PI, offset: [w, d], extent: [w, d], span: [w - b, w - a] }
    case '+x':
      return { yaw: Math.PI / 2, offset: [0, d], extent: [d, w], span: [d - b, d - a] }
    case '-x':
      return { yaw: -Math.PI / 2, offset: [w, 0], extent: [d, w], span: [a, b] }
  }
}

/** Canonical (x, z) → world (x, z) under {@link EstateFrame}. Matches three's Y rotation. */
export function frameToWorld(frame: EstateFrame, x: number, z: number): [number, number] {
  const c = Math.cos(frame.yaw)
  const s = Math.sin(frame.yaw)
  return [x * c + z * s + frame.offset[0], -x * s + z * c + frame.offset[1]]
}
