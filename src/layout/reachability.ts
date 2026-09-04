/**
 * Furniture-aware floor **reachability** — can you actually walk there once the
 * room is furnished?
 *
 * ## Why this exists
 *
 * Every circulation check in the app so far measures a GAP: `walkway.ts` reports
 * pairs of pieces closer than the walkway thresholds, `accessibility.ts` measures
 * door widths and room dimensions on the EMPTY plan, `templateConnectivity` walks
 * the room graph through doors and never looks at furniture.
 *
 * A gap threshold cannot answer the question a designer actually asks. v0.31.8.51
 * built the obvious fix — drop `walkway.ts`'s 0.40 m floor for large-piece pairs —
 * measured it over the 19 templates and threw it away: it turned every
 * `sofa ↔ coffee-table` adjacency into a "blocked route" and drove median
 * circulation 68 → 28. The finding from that release is the premise of this file:
 *
 * > Two pieces 0.05 m apart are not a route anyone walks, so silence is not wrong.
 * > What no gap threshold can tell is *"jammed together, walk around"* from
 * > *"this pair seals the only way through"*. That is a **route/connectivity**
 * > question — does removing this pair reconnect the floor? — and it wants a
 * > reachability pass over the free floor.
 *
 * This is that pass.
 *
 * ## How it works
 *
 * Standard configuration-space flood fill, per storey:
 *
 * 1. **Rasterise** the storey's rooms into a 0.05 m grid. A cell is *free*
 *    when its centre lies inside some room rectangle, outside every wall body, and
 *    outside every floor-standing item's footprint.
 * 2. **Erode** by half a body width via a chamfer distance transform, so what is
 *    flood-filled is the set of positions a person of {@link BODY_WIDTH_M} can
 *    STAND at. This is why no gap threshold is needed: a 0.05 m slot simply has no
 *    cell that survives erosion, and a 1.2 m one does. The width is the ruler.
 * 3. **Flood fill** (4-connected) the eroded set into components, and attribute
 *    each component's area back to the rooms it covers.
 *
 * A room is then **reachable** if it shares the storey's largest component, and
 * **stranded** if its free floor is real but lives in some other component.
 *
 * ## What it deliberately does NOT do
 *
 * - It does not know where the front door is, so "reachable" means *connected to
 *   the largest walkable region of this storey*, not *reachable from the entrance*.
 *   On a normal plan those coincide; on a pathological one they need not.
 * - It does not cross storeys. Stairs are `stairConnectivity.ts`'s job.
 * - Doors are treated as **open**, matching `walkway.ts`'s route pass: a doorway is
 *   a route, so a closed leaf must not read as a severed home.
 *
 * Pure logic — no React, no three — so the raster maths is unit-testable.
 */

import type { OBB } from '../collision/obb'
import { itemFootprint } from '../collision/placement'
import type { CollisionWall } from '../collision/walls'
import { GROUND_LEVEL_ID, levelAsPlan, planLevels } from '../floorplan/levels'
import { planCollisionWalls } from '../floorplan/planGeometry'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { CLEARANCE, OBSTACLE_AREA_M2 } from './designRules'

/**
 * Raster cell size (m). 0.05 m resolves a 0.6 m walkway into 12 cells, which is
 * ample for a connectivity question, and keeps a whole 100 m² storey under
 * 40 000 cells — cheap enough to run on every design-score build.
 */
const CELL_M = 0.05

/**
 * Body width (m) a route must admit for this check to call it walkable.
 *
 * `CLEARANCE.walkwayMin` (0.6 m) is the app's own "tight minimum" for a main
 * circulation path — below it a designer would not call the gap a route. It is
 * used rather than `CLEARANCE.passage` (0.75) so this check stays CONSERVATIVE:
 * a 0.65 m squeeze is tight and `walkway.ts` already reports it, but it is not a
 * severed floor and must not be reported as one. Erring toward silence is the
 * right direction for a check whose finding is "part of your home is cut off".
 */
export const BODY_WIDTH_M = CLEARANCE.walkwayMin

/** A room's share of the storey's walkable floor. Areas are in m². */
export interface RoomReachability {
  roomId: string
  roomName: string
  /** Storey id this room sits on (`GROUND_LEVEL_ID` for the ground floor). */
  level: string
  /** Free floor a {@link BODY_WIDTH_M} body can stand on, anywhere in the room. */
  walkableAreaM2: number
  /** Of that, the part connected to the storey's largest walkable region. */
  reachableAreaM2: number
  /** `walkableAreaM2 - reachableAreaM2` — real floor you cannot get to. */
  strandedAreaM2: number
  /**
   * True when the room has walkable floor but NONE of it is connected to the
   * storey's main region — you cannot walk into this room at all.
   */
  isolated: boolean
}

/**
 * A room the FURNITURE cut off: walkable when the plan is empty, unreachable
 * once the layout is placed.
 */
export interface SeveredRoom {
  roomId: string
  roomName: string
  level: string
  /** Walkable floor now stranded behind the furniture (m²). */
  areaM2: number
}

/**
 * A stranded pocket smaller than this (m²) is not reported. Half a square metre
 * is about the floor behind a wardrobe pushed into a corner — real, unreachable,
 * and of no consequence to anybody. Reporting it would bury the case that
 * matters (a whole bedroom you cannot walk into) in noise, which is the failure
 * mode v0.31.8.51 measured and rejected.
 */
const MIN_STRANDED_M2 = 0.5

/**
 * How far (m) a room's rectangle is expanded for the CONNECTIVITY pass only.
 *
 * Room rectangles stop at the wall face, so two rooms either side of a wall do
 * not touch — the wall band belongs to no room. Rasterising strict room rects
 * therefore gives every room its own disconnected component and reports the
 * whole flat as severed, which is exactly what the first cut of this check did
 * (98 "isolated" rooms across 19 templates, including `tpl-hdb-jumbo`'s
 * 17 m² living room).
 *
 * So the flood fill runs on rects expanded by this margin, which bridges the
 * band, while AREA is attributed against the strict rects so the join cells are
 * credited to no room. 0.25 m clears an HDB internal wall (0.1 m) and an
 * external one (0.2 m) with room to spare. Expanding cannot leak the fill
 * outdoors, because the exterior walls themselves still block — and where a
 * real door pierces one (the main door) the pocket beyond it simply joins the
 * main region, which is true.
 */
const ROOM_JOIN_M = 0.25

/** Axis-aligned bounds of an OBB (cheap reject before the exact test). */
function obbBounds(o: OBB): { x0: number; z0: number; x1: number; z1: number } {
  const c = Math.abs(Math.cos(o.rot))
  const s = Math.abs(Math.sin(o.rot))
  const hx = c * o.hx + s * o.hz
  const hz = s * o.hx + c * o.hz
  return { x0: o.cx - hx, z0: o.cz - hz, x1: o.cx + hx, z1: o.cz + hz }
}

/** Is a point inside an OBB? (Rotate into the box's frame.) */
function pointInObb(x: number, z: number, o: OBB): boolean {
  const dx = x - o.cx
  const dz = z - o.cz
  const c = Math.cos(-o.rot)
  const s = Math.sin(-o.rot)
  return Math.abs(dx * c - dz * s) <= o.hx && Math.abs(dx * s + dz * c) <= o.hz
}

/** Distance from a point to a segment. */
function pointSegDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const vx = bx - ax
  const vz = bz - az
  const len2 = vx * vx + vz * vz
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / len2)) : 0
  const dx = px - (ax + t * vx)
  const dz = pz - (az + t * vz)
  return Math.hypot(dx, dz)
}

/**
 * Pieces that can SEAL a route.
 *
 * Floor-standing (not mounted, not `noClip`) **and** a circulation obstacle —
 * `OBSTACLE_AREA_M2` (0.5 m²), the app's own bar for something you walk around
 * rather than step past.
 *
 * **The area bar is a correction to v0.31.8.52's first cut (v0.31.8.53).**
 * Without it, the culprit sweep over the 19 templates named `potted-plant`
 * (3 rooms), `nightstand` (3) and `floor-lamp` (1) as pieces that walled a room
 * off. They do not: a floor lamp does not seal a doorway, you step past it or
 * move it. `layoutCritique`'s `bed-access` check draws the identical line for
 * the identical reason, with the identical constant, and its docstring is worth
 * reading — a nightstand is part of the bedside arrangement, not an obstruction
 * to it.
 *
 * Note this is the OPPOSITE direction to v0.31.8.51, where the same bar was
 * measured as WRONG for `walkway.ts`'s arm's-reach floor because `coffee-table`
 * (0.605 m²) sits above it. Both readings are right: the bar answers "does this
 * define a walkway", which is this check's question and was not that one's.
 */
function participates(def: FurnitureDef | undefined): def is FurnitureDef {
  if (!def || def.mounted || def.noClip) return false
  const fp = def.defaultFootprint
  return !!fp && fp.w * fp.d >= OBSTACLE_AREA_M2
}

/** Room rectangle in plan metres (rooms are axis-aligned). */
function roomRect(r: PlanRoom) {
  return {
    x0: r.origin[0],
    z0: r.origin[1],
    x1: r.origin[0] + r.width,
    z1: r.origin[1] + r.depth,
  }
}

/**
 * Two-pass chamfer distance transform: for every cell, the approximate Euclidean
 * distance (in cells) to the nearest blocked cell. Cheaper than an exact EDT and
 * accurate to a few percent, which is far inside the tolerance of a check whose
 * threshold is a rule of thumb.
 */
function distanceToBlocked(free: Uint8Array, w: number, h: number): Float32Array {
  const D = new Float32Array(w * h)
  const BIG = 1e9
  const d1 = 1
  const d2 = Math.SQRT2
  for (let i = 0; i < D.length; i++) D[i] = free[i] ? BIG : 0
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const i = z * w + x
      if (D[i] === 0) continue
      let m = D[i] as number
      if (x > 0) m = Math.min(m, (D[i - 1] as number) + d1)
      if (z > 0) m = Math.min(m, (D[i - w] as number) + d1)
      if (x > 0 && z > 0) m = Math.min(m, (D[i - w - 1] as number) + d2)
      if (x < w - 1 && z > 0) m = Math.min(m, (D[i - w + 1] as number) + d2)
      D[i] = m
    }
  }
  for (let z = h - 1; z >= 0; z--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = z * w + x
      if (D[i] === 0) continue
      let m = D[i] as number
      if (x < w - 1) m = Math.min(m, (D[i + 1] as number) + d1)
      if (z < h - 1) m = Math.min(m, (D[i + w] as number) + d1)
      if (x < w - 1 && z < h - 1) m = Math.min(m, (D[i + w + 1] as number) + d2)
      if (x > 0 && z < h - 1) m = Math.min(m, (D[i + w - 1] as number) + d2)
      D[i] = m
    }
  }
  return D
}

/**
 * Analyse one storey's walkable floor. Exported for tests; callers normally want
 * the per-level sweep, which sweeps every storey.
 */
export function analyseLevelReachability(
  rooms: PlanRoom[],
  walls: CollisionWall[],
  obbs: OBB[],
  level: string,
  bodyWidthM: number = BODY_WIDTH_M,
  /** Walls with every door CLOSED, used to find the storey's envelope. Defaults
   *  to `walls`, which is right for a fixture with no doors; real plans must
   *  pass both sets (see {@link analyseReachability}). */
  envelopeWalls: CollisionWall[] = walls,
): RoomReachability[] {
  if (rooms.length === 0) return []

  // Grid bounds: the union of the storey's room rectangles, padded one cell so a
  // room edge never lands exactly on the border.
  const rects = rooms.map(roomRect)
  const xs = [...rects.map((r) => r.x0), ...rects.map((r) => r.x1)]
  const zs = [...rects.map((r) => r.z0), ...rects.map((r) => r.z1)]
  for (const wl of envelopeWalls) {
    xs.push(wl.ax, wl.bx)
    zs.push(wl.az, wl.bz)
  }
  // Two cells of slack all round, so the border ring is unambiguously OUTSIDE
  // the envelope and the outside-fill below has somewhere to start.
  const PAD = ROOM_JOIN_M + 2 * CELL_M
  const minX = Math.min(...xs) - PAD
  const minZ = Math.min(...zs) - PAD
  const maxX = Math.max(...xs) + PAD
  const maxZ = Math.max(...zs) + PAD
  const w = Math.max(1, Math.ceil((maxX - minX) / CELL_M))
  const h = Math.max(1, Math.ceil((maxZ - minZ) / CELL_M))

  const cx = (x: number) => minX + (x + 0.5) * CELL_M
  const cz = (z: number) => minZ + (z + 0.5) * CELL_M

  // ── The storey's INTERIOR ────────────────────────────────────────────────
  //
  // "Inside a room rectangle" is NOT the floor. Measured on the 19 templates,
  // the circulation space between rooms is largely UNDECLARED — there is no
  // `corridor` RoomCategory and templates do not author one, so a corridor
  // belongs to no room. A mask built from room rects therefore gives every room
  // its own component and calls the whole flat severed: the first cut of this
  // check reported 74-98 "isolated" rooms across 19 templates, including
  // `tpl-hdb-jumbo`'s 17 m² living room.
  //
  // So the interior is found the way it is actually defined — by the ENVELOPE.
  // Flood the border ring inward across everything that is not a wall, with
  // every door CLOSED; whatever that fill cannot reach is inside the home. Room
  // rectangles are then used only to ATTRIBUTE area, never to bound the route.
  const isWall = (px: number, pz: number, set: CollisionWall[]) => {
    for (const wl of set) {
      if (pointSegDist(px, pz, wl.ax, wl.az, wl.bx, wl.bz) <= wl.thickness / 2) return true
    }
    return false
  }

  const solidClosed = new Uint8Array(w * h)
  const solidOpen = new Uint8Array(w * h)
  const roomOf = new Int16Array(w * h).fill(-1)
  const bounds = obbs.map(obbBounds)

  for (let z = 0; z < h; z++) {
    const pz = cz(z)
    for (let x = 0; x < w; x++) {
      const px = cx(x)
      const i = z * w + x
      if (isWall(px, pz, envelopeWalls)) solidClosed[i] = 1
      if (isWall(px, pz, walls)) solidOpen[i] = 1
      for (let r = 0; r < rects.length; r++) {
        const q = rects[r] as { x0: number; z0: number; x1: number; z1: number }
        if (px >= q.x0 && px <= q.x1 && pz >= q.z0 && pz <= q.z1) {
          roomOf[i] = r
          break
        }
      }
    }
  }

  // Outside = reachable from the border ring without crossing a closed-door wall.
  const outside = new Uint8Array(w * h)
  {
    const q = new Int32Array(w * h)
    let head = 0
    let tail = 0
    const push = (i: number) => {
      if (solidClosed[i] || outside[i]) return
      outside[i] = 1
      q[tail++] = i
    }
    for (let x = 0; x < w; x++) {
      push(x)
      push((h - 1) * w + x)
    }
    for (let z = 0; z < h; z++) {
      push(z * w)
      push(z * w + w - 1)
    }
    while (head < tail) {
      const i = q[head++] as number
      const x = i % w
      const z = (i / w) | 0
      if (x > 0) push(i - 1)
      if (x < w - 1) push(i + 1)
      if (z > 0) push(i - w)
      if (z < h - 1) push(i + w)
    }
  }

  // Free floor: inside the envelope, not in a wall (doors OPEN now), not under
  // a piece of furniture.
  const free = new Uint8Array(w * h)
  for (let z = 0; z < h; z++) {
    const pz = cz(z)
    for (let x = 0; x < w; x++) {
      const i = z * w + x
      if (outside[i] || solidOpen[i]) continue
      const px = cx(x)
      let blocked = false
      for (let o = 0; o < obbs.length; o++) {
        const b = bounds[o] as { x0: number; z0: number; x1: number; z1: number }
        if (px < b.x0 || px > b.x1 || pz < b.z0 || pz > b.z1) continue
        if (pointInObb(px, pz, obbs[o] as OBB)) {
          blocked = true
          break
        }
      }
      if (!blocked) free[i] = 1
    }
  }

  // Configuration space: a body of `bodyWidthM` can stand where the distance to
  // the nearest blocked cell is at least half its width.
  const D = distanceToBlocked(free, w, h)
  const radiusCells = bodyWidthM / 2 / CELL_M
  const stand = new Uint8Array(w * h)
  for (let i = 0; i < stand.length; i++) if ((D[i] as number) >= radiusCells) stand[i] = 1

  // Flood fill the standable set into components (4-connected).
  const comp = new Int32Array(w * h).fill(-1)
  const compArea: number[] = []
  const queue = new Int32Array(w * h)
  for (let s = 0; s < stand.length; s++) {
    if (!stand[s] || comp[s] >= 0) continue
    const id = compArea.length
    let head = 0
    let tail = 0
    queue[tail++] = s
    comp[s] = id
    let n = 0
    while (head < tail) {
      const i = queue[head++] as number
      n++
      const x = i % w
      const z = (i / w) | 0
      if (x > 0 && stand[i - 1] && comp[i - 1] < 0) {
        comp[i - 1] = id
        queue[tail++] = i - 1
      }
      if (x < w - 1 && stand[i + 1] && comp[i + 1] < 0) {
        comp[i + 1] = id
        queue[tail++] = i + 1
      }
      if (z > 0 && stand[i - w] && comp[i - w] < 0) {
        comp[i - w] = id
        queue[tail++] = i - w
      }
      if (z < h - 1 && stand[i + w] && comp[i + w] < 0) {
        comp[i + w] = id
        queue[tail++] = i + w
      }
    }
    compArea.push(n)
  }

  // The storey's MAIN region is its largest component. See the module docs for
  // why this stands in for "reachable from the front door".
  let main = -1
  let best = 0
  for (let c = 0; c < compArea.length; c++) {
    const a = compArea[c] as number
    if (a > best) {
      best = a
      main = c
    }
  }

  const cellArea = CELL_M * CELL_M
  const walkable = new Array(rooms.length).fill(0)
  const reachable = new Array(rooms.length).fill(0)
  for (let i = 0; i < stand.length; i++) {
    if (!stand[i]) continue
    const ri = roomOf[i] as number
    if (ri < 0) continue
    walkable[ri]++
    if (comp[i] === main) reachable[ri]++
  }

  return rooms.map((r, i) => {
    const walkableAreaM2 = (walkable[i] as number) * cellArea
    const reachableAreaM2 = (reachable[i] as number) * cellArea
    return {
      roomId: r.id,
      roomName: r.name ?? r.id,
      level,
      walkableAreaM2,
      reachableAreaM2,
      strandedAreaM2: walkableAreaM2 - reachableAreaM2,
      isolated: walkableAreaM2 > 0 && reachableAreaM2 === 0,
    }
  })
}

/**
 * Every storey's walkable floor, furniture included. Doors are treated as OPEN
 * (a doorway is a route — see the module docs).
 */
function analyseReachability(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  plan: FloorPlan,
  bodyWidthM: number = BODY_WIDTH_M,
): RoomReachability[] {
  const out: RoomReachability[] = []
  for (const level of planLevels(plan)) {
    const lp = levelAsPlan(plan, level)
    const rooms = Array.isArray(lp.rooms) ? lp.rooms : []
    if (rooms.length === 0) continue
    const walls = planCollisionWalls(
      lp,
      Object.fromEntries(
        (Array.isArray(lp.openings) ? lp.openings : [])
          .filter((o) => o.kind === 'door')
          .map((o) => [o.id, { open: true }] as const),
      ),
    )
    const obbs: OBB[] = []
    for (const it of items) {
      if ((it.levelId ?? GROUND_LEVEL_ID) !== level.id) continue
      const def = defs[it.defId]
      if (!participates(def)) continue
      obbs.push(itemFootprint(it, def))
    }
    // Doors CLOSED for the envelope, OPEN for the routes — see the module docs.
    const envelope = planCollisionWalls(lp, {})
    out.push(...analyseLevelReachability(rooms, walls, obbs, level.id, bodyWidthM, envelope))
  }
  return out
}

/**
 * Rooms the FURNITURE severed — walkable on the empty plan, unreachable once the
 * layout is placed. Sorted worst first.
 *
 * **The empty-plan baseline is the load-bearing part.** Measured over the 19
 * templates, 67 rooms come back isolated when furnished, but **21 of those are
 * already isolated with no furniture in them at all** — `tpl-hdb-4room`'s entire
 * bedroom half has no interior door, which `templateConnectivity.test.ts`
 * independently records as `'tpl-hdb-4room/ground': 2`. Blaming a layout for a
 * plan that was never connected would be wrong and unactionable, so the baseline
 * is subtracted. The remaining **46 are genuinely the arranger's** — including
 * `tpl-terrace-ground`'s master bedroom (5.05 m² walled off by its own
 * furniture) and `tpl-condo-penthouse`'s master bath (4.54 m²).
 *
 * Costs two raster passes per storey. Callers should treat it like the rest of
 * `layoutCritique` — on demand, behind an open panel or a report build.
 */
const baselineCache = new WeakMap<FloorPlan, Map<number, Set<string>>>()

/**
 * The empty-plan baseline for `plan`, memoised on the plan object.
 *
 * It depends only on the PLAN, never on the items — and `schemeOptions` builds a
 * dozen candidate layouts against one plan, each calling
 * {@link findFurnitureSeveredRooms}. Without this the baseline raster ran once
 * per candidate, which measured 100 ms a call on `tpl-hdb-jumbo`, all of it
 * recomputing the same answer.
 */
function isolatedWhenEmpty(
  defs: Record<string, FurnitureDef>,
  plan: FloorPlan,
  bodyWidthM: number,
): Set<string> {
  let byWidth = baselineCache.get(plan)
  if (!byWidth) {
    byWidth = new Map()
    baselineCache.set(plan, byWidth)
  }
  const hit = byWidth.get(bodyWidthM)
  if (hit) return hit
  const set = new Set(
    analyseReachability([], defs, plan, bodyWidthM)
      .filter((r) => r.isolated)
      .map((r) => `${r.level}/${r.roomId}`),
  )
  byWidth.set(bodyWidthM, set)
  return set
}

export function findFurnitureSeveredRooms(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  plan: FloorPlan,
  bodyWidthM: number = BODY_WIDTH_M,
): SeveredRoom[] {
  const baseline = isolatedWhenEmpty(defs, plan, bodyWidthM)
  return analyseReachability(items, defs, plan, bodyWidthM)
    .filter((r) => {
      if (!r.isolated || r.walkableAreaM2 < MIN_STRANDED_M2) return false
      // Already unreachable with nothing in the room → a plan defect, not this
      // layout's doing. `templateConnectivity.test.ts` owns that case.
      return !baseline.has(`${r.level}/${r.roomId}`)
    })
    .map((r) => ({
      roomId: r.roomId,
      roomName: r.roomName,
      level: r.level,
      areaM2: r.walkableAreaM2,
    }))
    .sort((a, b) => b.areaM2 - a.areaM2)
}
