/**
 * Clearance checks: flag furniture that blocks a door opening's swing zone.
 * Pure + testable; used by the in-app "Checks" overlay. Door swing rectangles
 * are derived from the active floor plan's door openings (works for the seeded
 * default flat and user-authored plans alike).
 */
import { doorSwingClearRect } from '../floorplan/doorSwing'
import { itemsOnLevel, levelAsPlan, planLevels } from '../floorplan/levels'
import type { FloorPlan } from '../floorplan/types'
import { pointInRoom, wallLength } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { CLEARANCE } from './designRules'

export interface Rect {
  x0: number
  z0: number
  x1: number
  z1: number
}

/** A window's keep-out rect (see `windowFrontRects`) plus the sill height
 *  (metres AFL) it was derived from, so a caller can decide whether a given
 *  item is short enough to sit in it. */
export interface WindowFrontRect extends Rect {
  sill: number
}

/**
 * Keep-clear rectangle covering each door's swing arc — the quarter the leaf
 * sweeps on its configured swing side (hinge + swing from the opening, defaulted
 * via `doorSwingClearRect`). Side-correct, so furniture flush against the wall
 * on the door's push side is no longer flagged.
 */
export function doorSwingRects(plan: FloorPlan): Rect[] {
  const rects: Rect[] = []
  for (const o of plan.openings) {
    if (o.kind !== 'door') continue
    const wall = plan.walls.find((w) => w.id === o.wallId)
    if (!wall) continue
    const r = doorSwingClearRect(wall, o)
    if (r) rects.push(r)
  }
  return rects
}

/**
 * Keep-clear rectangle spanning each door's full width, projecting `depth`
 * metres to BOTH sides of the wall (unlike `doorSwingRects`, which only
 * covers the leaf's swing-side quarter). This is a superset of
 * `blockedDoorItems`'s probe points (±0.28/±0.42 m along the wall normal, at
 * the opening's centre) — furniture that would trip that probe check always
 * overlaps this rect, so a `tryPlace` caller including it in `keepOut` never
 * produces a "blocked door" the checks overlay would flag. The approach side
 * matters regardless of which way the leaf swings (you still have to walk
 * through the opening from the non-swing side too), so — unlike
 * `windowFrontRects` — no room-side resolution is needed.
 */
export function doorApproachRects(plan: FloorPlan, depth = 0.45): Rect[] {
  const rects: Rect[] = []
  for (const o of plan.openings) {
    if (o.kind !== 'door') continue
    const wall = plan.walls.find((w) => w.id === o.wallId)
    if (!wall) continue
    const len = wallLength(wall)
    if (len === 0) continue
    const ux = (wall.end[0] - wall.start[0]) / len
    const uz = (wall.end[1] - wall.start[1]) / len
    const nx = -uz
    const nz = ux
    const sPt: [number, number] = [wall.start[0] + ux * o.offset, wall.start[1] + uz * o.offset]
    const ePt: [number, number] = [
      wall.start[0] + ux * (o.offset + o.width),
      wall.start[1] + uz * (o.offset + o.width),
    ]
    const corners: Array<[number, number]> = []
    for (const base of [sPt, ePt]) {
      for (const side of [-1, 1]) {
        corners.push([base[0] + nx * depth * side, base[1] + nz * depth * side])
      }
    }
    const xs = corners.map((c) => c[0])
    const zs = corners.map((c) => c[1])
    rects.push({
      x0: Math.min(...xs),
      z0: Math.min(...zs),
      x1: Math.max(...xs),
      z1: Math.max(...zs),
    })
  }
  return rects
}

/**
 * Keep-clear rectangle projecting `depth` metres INTO the room in front of
 * each window opening — the zone a tall piece (wardrobe, bookcase, tall
 * cabinet) would block if pushed against that wall. The room-side of the wall
 * is resolved the same way `defaultDoorSwing` picks a door's swing side: probe
 * a short distance to each side of the opening's centre and pick whichever
 * side actually lands inside a room (falls back to the wall's right-hand
 * normal when neither/both sides resolve, e.g. an opening with no room data
 * yet). Each rect carries the opening's own `sill` so the caller (the
 * auto-arranger's `tryPlace`) can allow a SHORT item to sit there while
 * rejecting a tall one, and treat a near-zero sill (a full-height window or
 * balcony sliding door) as a hard keep-out for every floor item.
 */
export function windowFrontRects(plan: FloorPlan, depth = 0.65): WindowFrontRect[] {
  const rects: WindowFrontRect[] = []
  for (const o of plan.openings) {
    if (o.kind !== 'window') continue
    const wall = plan.walls.find((w) => w.id === o.wallId)
    if (!wall) continue
    const len = wallLength(wall)
    if (len === 0) continue
    const ux = (wall.end[0] - wall.start[0]) / len
    const uz = (wall.end[1] - wall.start[1]) / len
    const sPt: [number, number] = [wall.start[0] + ux * o.offset, wall.start[1] + uz * o.offset]
    const ePt: [number, number] = [
      wall.start[0] + ux * (o.offset + o.width),
      wall.start[1] + uz * (o.offset + o.width),
    ]
    const cx = (sPt[0] + ePt[0]) / 2
    const cz = (sPt[1] + ePt[1]) / 2
    const rawNx = -uz
    const rawNz = ux
    const probe = 0.5
    const rightInside = plan.rooms.some((r) =>
      pointInRoom(r, cx + rawNx * probe, cz + rawNz * probe),
    )
    const leftInside = plan.rooms.some((r) =>
      pointInRoom(r, cx - rawNx * probe, cz - rawNz * probe),
    )
    const [nx, nz] = leftInside && !rightInside ? [-rawNx, -rawNz] : [rawNx, rawNz]
    const farS: [number, number] = [sPt[0] + nx * depth, sPt[1] + nz * depth]
    const farE: [number, number] = [ePt[0] + nx * depth, ePt[1] + nz * depth]
    const xs = [sPt[0], ePt[0], farS[0], farE[0]]
    const zs = [sPt[1], ePt[1], farS[1], farE[1]]
    rects.push({
      x0: Math.min(...xs),
      z0: Math.min(...zs),
      x1: Math.max(...xs),
      z1: Math.max(...zs),
      sill: o.sill ?? CLEARANCE.windowSillTall,
    })
  }
  return rects
}

/** Every rect a door's keep-out covers: its swing quarter (`doorSwingRects`)
 *  plus its two-sided approach strip (`doorApproachRects`) — the full set the
 *  auto-arranger avoids and `blockedDoorItems` probes for. A convenience for
 *  callers (e.g. `furnishPlan.ts`'s post-arrange safety filter) that want
 *  "every door keep-out" without importing + merging both themselves. */
export function doorKeepOutRects(plan: FloorPlan): Rect[] {
  return [...doorSwingRects(plan), ...doorApproachRects(plan)]
}

/** Unrotated footprint width/depth of an item (accounts for parametric size). */
function footprintSize(item: FurnitureItem, def: FurnitureDef): { w: number; d: number } {
  let w = def.defaultFootprint.w
  let d = def.defaultFootprint.d
  if (def.kind === 'parametric') {
    const map = def.footprintParams ?? {}
    const wv = item.props[map.w ?? 'width']
    const dv = item.props[map.d ?? 'depth']
    if (typeof wv === 'number') w = wv
    if (typeof dv === 'number') d = dv
  }
  return { w, d }
}

/** Footprint AABB of an item (accounts for rotation + parametric size). */
export function footprintAabb(item: FurnitureItem, def: FurnitureDef): Rect {
  const { w, d } = footprintSize(item, def)
  const c = Math.abs(Math.cos(item.rotation))
  const s = Math.abs(Math.sin(item.rotation))
  const hx = (c * w + s * d) / 2
  const hz = (s * w + c * d) / 2
  return {
    x0: item.position[0] - hx,
    z0: item.position[1] - hz,
    x1: item.position[0] + hx,
    z1: item.position[1] + hz,
  }
}

/**
 * Keep-clear strip directly IN FRONT of an item (its facing direction), as an
 * AABB. Furniture faces local +Z, so at yaw `rotation` the front unit vector is
 * `(sin, cos)` in (x,z). The strip starts at the item's front face
 * (centre + front·d/2) and reaches `def.frontClearance` metres further forward,
 * spanning the item's full width `w` across the front. Returns `null` when the
 * def has no positive `frontClearance`. The returned AABB is the bounding box of
 * the oriented strip — coarse but consistent with `doorSwingRects`, fine for the
 * overlay + a rough blocker check.
 */
export function frontClearanceRect(
  item: FurnitureItem,
  def: FurnitureDef | undefined,
): Rect | null {
  if (!def) return null
  const clearance = def.frontClearance
  if (!clearance || clearance <= 0) return null
  const { w, d } = footprintSize(item, def)
  const r = item.rotation
  // Front (local +Z) and width (local +X) unit vectors in world (x,z).
  const fx = Math.sin(r)
  const fz = Math.cos(r)
  const rx = Math.cos(r)
  const rz = -Math.sin(r)
  // Strip centre: front face of item, pushed out by half the clearance depth.
  const cx = item.position[0] + fx * (d / 2 + clearance / 2)
  const cz = item.position[1] + fz * (d / 2 + clearance / 2)
  const hf = clearance / 2 // half-extent along front
  const hw = w / 2 // half-extent across width
  const pts: Array<[number, number]> = []
  for (const sf of [-hf, hf]) {
    for (const sw of [-hw, hw]) {
      pts.push([cx + fx * sf + rx * sw, cz + fz * sf + rz * sw])
    }
  }
  return {
    x0: Math.min(...pts.map((p) => p[0])),
    z0: Math.min(...pts.map((p) => p[1])),
    x1: Math.max(...pts.map((p) => p[0])),
    z1: Math.max(...pts.map((p) => p[1])),
  }
}

function contains(r: Rect, x: number, z: number): boolean {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1
}

/**
 * Probe points directly in front of each door opening (centre line, both
 * sides). An item whose footprint covers one is squarely in the doorway path
 * — a real blocker — unlike an item merely beside the door.
 */
/** Exported so `layout/reachability.ts` can constrain the unseal pass with the
 *  SAME predicate `dropDoorBlockers` deletes on — "legal to stand here" and
 *  "survives the drop pass" must be one rule, or the mover re-creates work the
 *  drop pass already did (v0.31.8.56). */
export function doorProbePoints(plan: FloorPlan): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  // Guard partial plans: a level projection or a hand-built fixture may omit
  // these arrays entirely, and `reachability.ts` calls this on every furnish.
  const openings = Array.isArray(plan.openings) ? plan.openings : []
  const walls = Array.isArray(plan.walls) ? plan.walls : []
  for (const o of openings) {
    if (o.kind !== 'door') continue
    const wall = walls.find((w) => w.id === o.wallId)
    if (!wall) continue
    const len = wallLength(wall)
    if (len === 0) continue
    const ux = (wall.end[0] - wall.start[0]) / len
    const uz = (wall.end[1] - wall.start[1]) / len
    const nx = -uz
    const nz = ux
    const cx = wall.start[0] + ux * (o.offset + o.width / 2)
    const cz = wall.start[1] + uz * (o.offset + o.width / 2)
    for (const d of [-0.42, -0.28, 0.28, 0.42]) {
      pts.push([cx + nx * d, cz + nz * d])
    }
  }
  return pts
}

/**
 * Ids of floor-standing items sitting directly in a door's path. Mounted items
 * (wall/ceiling) and noClip floor coverings (rugs) are exempt.
 */
export function blockedDoorItems(
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  plan: FloorPlan,
): string[] {
  // PER STOREY (F13). Five callers pass the WHOLE plan and the WHOLE item list
  // (`ui/report`, `ClearancePanel`, `ToolsMenu`, `analysis/designScore`,
  // `scene/ClearanceOverlay`), and this used to probe `plan.openings` against
  // every item — wrong in BOTH directions on a maisonette:
  //
  //  - an upstairs door blocked by a wardrobe was never checked at all, because
  //    `plan.openings` is ground-only; and
  //  - every upstairs item was tested against GROUND door swings, so a bed
  //    sitting above a ground doorway was flagged as blocking a door on another
  //    floor.
  //
  // The second is the worse of the two: a false positive on a design score and
  // a red overlay on an innocent piece, with no way for the user to tell why.
  const flagged: string[] = []
  for (const level of planLevels(plan)) {
    const probes = doorProbePoints(levelAsPlan(plan, level))
    if (probes.length === 0) continue
    for (const it of itemsOnLevel(items, level.id)) {
      const def = catalog[it.defId]
      if (!def || def.mounted || def.noClip) continue
      const box = footprintAabb(it, def)
      if (probes.some((p) => contains(box, p[0], p[1]))) flagged.push(it.id)
    }
  }
  return flagged
}
