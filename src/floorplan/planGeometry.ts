/**
 * Geometry helpers that turn an editable FloorPlan into renderable wall boxes
 * and door-aware collision segments. Shared by the 3D PlanShell renderer and
 * furniture collision so both see the same shell.
 */
import type { CollisionWall } from '../collision/walls'
import { isSlopedWall } from './slopedWall'
import type { FloorPlan, PlanOpening, PlanWall } from './types'
import { wallLength } from './types'
import { isCurvedWall, wallChords } from './wallArc'

const EXTERNAL_T = 0.2
const INTERNAL_T = 0.1

/** Resolve a plan wall's thickness (m): the wall's own `thicknessM` override
 *  wins, then the plan-wide `wallThickness` default for its category, then the
 *  built-in 0.2 m external / 0.1 m internal. */
export function planWallThickness(w: PlanWall, plan?: FloorPlan): number {
  if (w.thicknessM != null && w.thicknessM > 0) return w.thicknessM
  const d =
    w.thickness === 'external' ? plan?.wallThickness?.external : plan?.wallThickness?.internal
  if (d != null && d > 0) return d
  return w.thickness === 'external' ? EXTERNAL_T : INTERNAL_T
}

/** A renderable, axis-rotated wall box. */
export interface WallBox {
  /** Centre in world XZ. */
  cx: number
  cz: number
  /** Box size: length along the wall, thickness across, height. */
  length: number
  thickness: number
  height: number
  /** Centre Y of the box. */
  cy: number
  /** Wall heading (radians) so the box can be rotated about Y. */
  angle: number
}

function openingsForWall(plan: FloorPlan, wallId: string): PlanOpening[] {
  return plan.openings.filter((o) => o.wallId === wallId).sort((a, b) => a.offset - b.offset)
}

/**
 * Break a wall into renderable boxes: full-height solid spans between
 * openings, plus a header box over each opening and a sill box under each
 * window. Doors leave a clear gap (floor → head); windows get a sill below
 * and a header above.
 */
export function wallBoxes(plan: FloorPlan, wall: PlanWall): WallBox[] {
  // Sloped-top wall: rendered as a prism by PlanShell (slopedWall.ts), not as a
  // box — emit no boxes here so it isn't double-drawn.
  if (isSlopedWall(wall)) return []
  // Curved wall: boxes follow the chord sub-segments. Openings (placed by
  // arc-length offset) are cut per-chord — each chord applies the same
  // solid/sill/header logic as a straight wall to the portion of any opening
  // that falls within its arc-length span, so a door/window on a curve cuts
  // cleanly across however many chords it spans.
  if (isCurvedWall(wall)) {
    const ceil = wall.topHeight ?? plan.ceilingHeight
    const t = planWallThickness(wall, plan)
    const ops = openingsForWall(plan, wall.id)
    const boxes: WallBox[] = []
    let acc = 0 // arc-length at the chord's start
    for (const c of wallChords(wall)) {
      const cl = wallLength(c)
      if (cl < 1e-4) continue
      const dx = (c.end[0] - c.start[0]) / cl
      const dz = (c.end[1] - c.start[1]) / cl
      const angle = Math.atan2(dx, dz)
      const at = (s: number): [number, number] => [c.start[0] + dx * s, c.start[1] + dz * s]
      const push = (s0: number, s1: number, yBase: number, yTop: number) => {
        if (s1 - s0 < 1e-4 || yTop - yBase < 1e-4) return
        const [ax, az] = at(s0)
        const [bx, bz] = at(s1)
        boxes.push({
          cx: (ax + bx) / 2,
          cz: (az + bz) / 2,
          length: s1 - s0,
          thickness: t,
          height: yTop - yBase,
          cy: (yBase + yTop) / 2,
          angle,
        })
      }
      let cursor = 0
      for (const o of ops) {
        // Opening's local span within this chord (arc-length → chord-local).
        const s0 = Math.max(0, Math.min(cl, o.offset - acc))
        const s1 = Math.max(s0, Math.min(cl, o.offset + o.width - acc))
        if (s1 <= s0) continue
        push(cursor, s0, 0, ceil)
        if (o.kind === 'window' && o.sill > 0) push(s0, s1, 0, o.sill)
        if (o.head < ceil) push(s0, s1, o.head, ceil)
        cursor = Math.max(cursor, s1)
      }
      push(cursor, cl, 0, ceil)
      acc += cl
    }
    return boxes
  }
  const len = wallLength(wall)
  if (len === 0) return []
  const dx = (wall.end[0] - wall.start[0]) / len
  const dz = (wall.end[1] - wall.start[1]) / len
  const angle = Math.atan2(dx, dz) // heading so +Z maps along the wall
  const t = planWallThickness(wall, plan)
  const ceil = wall.topHeight ?? plan.ceilingHeight
  const boxes: WallBox[] = []
  const at = (s: number): [number, number] => [wall.start[0] + dx * s, wall.start[1] + dz * s]

  const push = (s0: number, s1: number, yBase: number, yTop: number) => {
    if (s1 - s0 < 1e-4 || yTop - yBase < 1e-4) return
    const [ax, az] = at(s0)
    const [bx, bz] = at(s1)
    boxes.push({
      cx: (ax + bx) / 2,
      cz: (az + bz) / 2,
      length: s1 - s0,
      thickness: t,
      height: yTop - yBase,
      cy: (yBase + yTop) / 2,
      angle,
    })
  }

  const ops = openingsForWall(plan, wall.id)
  let cursor = 0
  for (const o of ops) {
    const s0 = Math.max(0, Math.min(len, o.offset))
    const s1 = Math.max(s0, Math.min(len, o.offset + o.width))
    // Solid span before the opening.
    push(cursor, s0, 0, ceil)
    // Sill under a window.
    if (o.kind === 'window' && o.sill > 0) push(s0, s1, 0, o.sill)
    // Header above the opening.
    if (o.head < ceil) push(s0, s1, o.head, ceil)
    cursor = Math.max(cursor, s1)
  }
  push(cursor, len, 0, ceil)
  return boxes
}

/**
 * Door-aware collision segments for the plan (floor-level footprint).
 * Mirrors collision/wallsFromState: solid wall spans, with open doors leaving
 * gaps. Windows are solid at floor level (you can't walk through them).
 */
export function planCollisionWalls(
  plan: FloorPlan,
  doorState: Record<string, { open: boolean }>,
): CollisionWall[] {
  const segs: CollisionWall[] = []
  // Guard partial plans whose arrays may be absent.
  const walls = Array.isArray(plan.walls) ? plan.walls : []
  const openings = Array.isArray(plan.openings) ? plan.openings : []
  for (const wall of walls) {
    // Curved wall: a straight collision segment per chord, with gaps where an
    // OPEN door's arc-length span falls within the chord (mirrors the straight path).
    if (isCurvedWall(wall)) {
      const thickness = planWallThickness(wall, plan)
      const openDoors = openings.filter(
        (o) => o.wallId === wall.id && o.kind === 'door' && doorState[o.id]?.open,
      )
      let acc = 0
      for (const c of wallChords(wall)) {
        const cl = wallLength(c)
        if (cl < 1e-4) continue
        const dxc = (c.end[0] - c.start[0]) / cl
        const dzc = (c.end[1] - c.start[1]) / cl
        const atc = (s: number): [number, number] => [c.start[0] + dxc * s, c.start[1] + dzc * s]
        const gaps = openDoors
          .map((o) => ({
            start: Math.max(0, Math.min(cl, o.offset - acc)),
            end: Math.max(0, Math.min(cl, o.offset + o.width - acc)),
          }))
          .filter((g) => g.end > g.start)
          .sort((a, b) => a.start - b.start)
        let cur = 0
        for (const g of gaps) {
          if (g.start > cur) {
            const [ax, az] = atc(cur)
            const [bx, bz] = atc(g.start)
            segs.push({ ax, az, bx, bz, thickness })
          }
          cur = Math.max(cur, g.end)
        }
        if (cur < cl) {
          const [ax, az] = atc(cur)
          const [bx, bz] = atc(cl)
          segs.push({ ax, az, bx, bz, thickness })
        }
        acc += cl
      }
      continue
    }
    const len = wallLength(wall)
    if (len === 0) continue
    const dx = (wall.end[0] - wall.start[0]) / len
    const dz = (wall.end[1] - wall.start[1]) / len
    const thickness = planWallThickness(wall, plan)
    const at = (s: number): [number, number] => [wall.start[0] + dx * s, wall.start[1] + dz * s]

    // Gaps come from OPEN doors only.
    const gaps: Array<{ start: number; end: number }> = []
    for (const o of openings) {
      if (o.wallId !== wall.id || o.kind !== 'door') continue
      if (doorState[o.id]?.open) gaps.push({ start: o.offset, end: o.offset + o.width })
    }
    gaps.sort((a, b) => a.start - b.start)

    let cursor = 0
    for (const g of gaps) {
      if (g.start > cursor) {
        const [ax, az] = at(cursor)
        const [bx, bz] = at(g.start)
        segs.push({ ax, az, bx, bz, thickness })
      }
      cursor = Math.max(cursor, g.end)
    }
    if (cursor < len) {
      const [ax, az] = at(cursor)
      const [bx, bz] = at(len)
      segs.push({ ax, az, bx, bz, thickness })
    }
  }
  return segs
}

/** Is this the seeded default flat (curated apartment renders it)? */
export const DEFAULT_PLAN_ID = 'default-hdb-4room'
export function isDefaultPlan(plan: FloorPlan): boolean {
  return plan.id === DEFAULT_PLAN_ID
}
