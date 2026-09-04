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
 * - **"Reachable" means reachable FROM THE FRONT DOOR** (v0.31.8.54) — the main
 *   region is the component containing a cell just inside a door on an external
 *   wall. It used to be the LARGEST component, which was a heuristic with a real
 *   failure mode that the culprit search exposed: removing a piece can flip
 *   which region is largest, so a room reads as reconnected when in truth the
 *   rest of the home got cut off instead. Anchoring also changes which SIDE of a
 *   seal is reported — on `tpl-hdb-jumbo` the largest-component reading said
 *   "Bedroom 5 is cut off" where the truth is that only a 5.7 m² pocket by the
 *   front door is reachable and the other 80 m² is not. A storey with no
 *   external door (an upper floor) still falls back to the largest component.
 * - It does not cross storeys. Stairs are `stairConnectivity.ts`'s job.
 * - Doors are treated as **open**, matching `walkway.ts`'s route pass: a doorway is
 *   a route, so a closed leaf must not read as a severed home.
 *
 * Pure logic — no React, no three — so the raster maths is unit-testable.
 */

import type { OBB } from '../collision/obb'
import { findWallClips, itemFootprint, itemHeightAwareClash } from '../collision/placement'
import type { CollisionWall } from '../collision/walls'
import { GROUND_LEVEL_ID, levelAsPlan, planLevels } from '../floorplan/levels'
import { planCollisionWalls } from '../floorplan/planGeometry'
import { type FloorPlan, type PlanRoom, pointInRoom } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { doorProbePoints } from './clearance'
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
  /**
   * Pieces that SEAL this room: removing any ONE of them, on its own,
   * reconnects it. Empty when no single piece does — the room then needs two or
   * more moved, and a single-piece fix should not be expected to open it.
   *
   * Measured over the 19 templates: 19 of 22 severed rooms have at least one,
   * and four defs account for 25 of the 29 attributions (`tv-console` 9,
   * `sofa-3seat` 6, `dining-table-4` 5, `wardrobe-3door` 5) — this is the
   * lounge/dining group parked across an open plan's circulation spine, not a
   * diffuse problem.
   */
  sealedBy: SealingItem[]
}

/** One piece whose removal reconnects a severed room. */
interface SealingItem {
  itemId: string
  defId: string
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
 * One storey rasterised, WITHOUT furniture composed in yet.
 *
 * Split out from the solve so the culprit search can reuse it: finding which
 * piece seals a room means re-solving with one item's cells freed, and the
 * expensive part (wall rasterisation + the outside fill) does not depend on the
 * furniture at all. `itemAt` records which obb covers each cell so an item can
 * be excluded without rebuilding anything.
 */
interface LevelGrid {
  w: number
  h: number
  /** World coordinate of cell (0,0)'s min corner — lets callers map a trial
   *  footprint onto cells without rebuilding anything. */
  minX: number
  minZ: number
  /** Inside the envelope and not in a (doors-OPEN) wall. Furniture-independent. */
  openFloor: Uint8Array
  /**
   * Where a piece may legally STAND — inside the envelope and clear of every
   * wall with the doors CLOSED.
   *
   * Deliberately stricter than `openFloor`, which gaps a wall at every open
   * door because a doorway is a ROUTE. It is not a parking space: the first cut
   * of the unseal pass used `openFloor` and slid `tpl-condo-penthouse`'s TV
   * console into a doorway, which `placementSoundness.test.ts` caught as an
   * in-wall item. Walking through a gap and standing furniture in it are
   * different permissions.
   */
  standable: Uint8Array
  /** Index of the first obb covering each cell, or -1. */
  itemAt: Int32Array
  /** Index of the first room rect containing each cell, or -1. */
  roomOf: Int16Array
  roomCount: number
  /**
   * Cell indices just inside the home's ENTRY doors — doors on external walls.
   *
   * The main region is the component containing one of these, not the largest
   * component (v0.31.8.54). "Largest" was a heuristic with a real failure mode,
   * and it showed up in the culprit search: removing a piece can flip WHICH
   * region is largest, so a room reads as reconnected when in truth the rest of
   * the home got cut off instead. Anchoring on the front door is what the
   * question actually means — "can you get here from the entrance" — and it is
   * stable under removing any one piece.
   *
   * Empty when the storey has no external door (an upper floor, a fixture with
   * no openings). The largest component is then the only available answer, and
   * that fallback is what the tests with hand-built walls exercise.
   */
  entries: number[]
}

/** Per-room cell counts from one solve. */
interface GridSolution {
  walkable: number[]
  reachable: number[]
}

function buildLevelGrid(
  rooms: PlanRoom[],
  walls: CollisionWall[],
  obbs: OBB[],
  envelopeWalls: CollisionWall[],
  /** World-space points just inside the home's entry doors. */
  entryPoints: readonly [number, number][] = [],
  /**
   * Points no piece may STAND on — `clearance.ts:doorProbePoints`, the four
   * samples either side of each doorway. They constrain PLACEMENT only; routes
   * are meant to pass straight through a doorway.
   *
   * **This is deliberately the same predicate `dropDoorBlockers` deletes on,**
   * so "legal to stand here" and "survives the drop pass" are one rule. The
   * unseal pass shipped without any door test and slid `tpl-condo-2bed`'s
   * kitchen counter into a doorway once its reach grew to 2.4 m, which
   * `placementSoundness.test.ts` caught; `dropDoorBlockers` runs BEFORE the
   * unseal pass, so nothing downstream re-checks. Using the full
   * `doorKeepOutRects` (swing arc + 0.45 m approach) instead was measured and
   * rejected: it is far stricter than the deletion rule and cost 19 of the
   * fixes (3 rooms left -> 22).
   */
  doorPoints: readonly [number, number][] = [],
): LevelGrid {
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
  const itemAt = new Int32Array(w * h).fill(-1)
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
      for (let o = 0; o < obbs.length; o++) {
        const b = bounds[o] as { x0: number; z0: number; x1: number; z1: number }
        if (px < b.x0 || px > b.x1 || pz < b.z0 || pz > b.z1) continue
        if (pointInObb(px, pz, obbs[o] as OBB)) {
          itemAt[i] = o
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

  const openFloor = new Uint8Array(w * h)
  const standable = new Uint8Array(w * h)
  for (let i = 0; i < openFloor.length; i++) {
    if (outside[i]) continue
    if (!solidOpen[i]) openFloor[i] = 1
    if (!solidClosed[i]) standable[i] = 1
  }
  for (const [px, pz] of doorPoints) {
    const gx = Math.round((px - minX) / CELL_M - 0.5)
    const gz = Math.round((pz - minZ) / CELL_M - 0.5)
    if (gx < 0 || gx >= w || gz < 0 || gz >= h) continue
    standable[gz * w + gx] = 0
  }

  // Entry cells: the grid cell nearest each entry point that is inside the
  // envelope. A door's own cell sits in the wall gap, which IS open floor.
  const entries: number[] = []
  for (const [ex, ez] of entryPoints) {
    const gx = Math.round((ex - minX) / CELL_M - 0.5)
    const gz = Math.round((ez - minZ) / CELL_M - 0.5)
    if (gx < 0 || gx >= w || gz < 0 || gz >= h) continue
    const i = gz * w + gx
    if (openFloor[i]) entries.push(i)
  }

  return {
    w,
    h,
    minX,
    minZ,
    openFloor,
    standable,
    itemAt,
    roomOf,
    roomCount: rooms.length,
    entries,
  }
}

/** Cell indices whose centre falls inside `o`, bounded by its AABB. */
function cellsUnder(g: LevelGrid, o: OBB): number[] {
  const b = obbBounds(o)
  const x0 = Math.max(0, Math.floor((b.x0 - g.minX) / CELL_M))
  const x1 = Math.min(g.w - 1, Math.ceil((b.x1 - g.minX) / CELL_M))
  const z0 = Math.max(0, Math.floor((b.z0 - g.minZ) / CELL_M))
  const z1 = Math.min(g.h - 1, Math.ceil((b.z1 - g.minZ) / CELL_M))
  const out: number[] = []
  for (let z = z0; z <= z1; z++) {
    const pz = g.minZ + (z + 0.5) * CELL_M
    for (let x = x0; x <= x1; x++) {
      const px = g.minX + (x + 0.5) * CELL_M
      if (pointInObb(px, pz, o)) out.push(z * g.w + x)
    }
  }
  return out
}

/**
 * Erode by half a body width, flood-fill, and count each room's walkable and
 * main-region-connected cells. `exclude` frees one obb's cells, which is how the
 * culprit search asks "does the room reconnect without this piece?" without
 * rebuilding the grid.
 */
function solveGrid(
  g: LevelGrid,
  bodyWidthM: number,
  exclude = -1,
  /** Trial footprint to block INSTEAD of the excluded one — this is how the
   *  mover asks "what if this piece stood here?" for ~2 ms, against ~60 ms to
   *  rebuild the grid. */
  placed: OBB | null = null,
): GridSolution {
  const { w, h, openFloor, itemAt, roomOf } = g
  const free = new Uint8Array(w * h)
  for (let i = 0; i < free.length; i++) {
    if (openFloor[i] && (itemAt[i] === -1 || itemAt[i] === exclude)) free[i] = 1
  }
  if (placed) for (const i of cellsUnder(g, placed)) free[i] = 0

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

  // The MAIN region is the one you enter the home into. `g.entries` are cells
  // just inside the external doors; a door cell itself may not be standable
  // (a 0.9 m opening is exactly at the body-width bar), so the search widens to
  // the nearest standable cell around it. Falls back to the largest component
  // when the storey has no external door at all — see `LevelGrid.entries`.
  let main = -1
  for (const e of g.entries) {
    if (comp[e] >= 0) {
      main = comp[e] as number
      break
    }
    const ex = e % w
    const ez = (e / w) | 0
    const R = Math.ceil(1.0 / CELL_M)
    let bestD = Infinity
    for (let dz = -R; dz <= R && main < 0; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const nx = ex + dx
        const nz = ez + dz
        if (nx < 0 || nx >= w || nz < 0 || nz >= h) continue
        const j = nz * w + nx
        if (comp[j] < 0) continue
        const d = dx * dx + dz * dz
        if (d < bestD) {
          bestD = d
          main = comp[j] as number
        }
      }
    }
    if (main >= 0) break
  }
  if (main < 0) {
    let best = 0
    for (let c = 0; c < compArea.length; c++) {
      const a = compArea[c] as number
      if (a > best) {
        best = a
        main = c
      }
    }
  }

  const walkable = new Array(g.roomCount).fill(0)
  const reachable = new Array(g.roomCount).fill(0)
  for (let i = 0; i < stand.length; i++) {
    if (!stand[i]) continue
    const ri = roomOf[i] as number
    if (ri < 0) continue
    walkable[ri]++
    if (comp[i] === main) reachable[ri]++
  }
  return { walkable, reachable }
}

function rowsFrom(rooms: PlanRoom[], level: string, sol: GridSolution): RoomReachability[] {
  const cellArea = CELL_M * CELL_M
  return rooms.map((r, i) => {
    const walkableAreaM2 = (sol.walkable[i] as number) * cellArea
    const reachableAreaM2 = (sol.reachable[i] as number) * cellArea
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
   *  pass both sets (see the per-level sweep). */
  envelopeWalls: CollisionWall[] = walls,
): RoomReachability[] {
  if (rooms.length === 0) return []
  const g = buildLevelGrid(rooms, walls, obbs, envelopeWalls)
  return rowsFrom(rooms, level, solveGrid(g, bodyWidthM))
}

/** One storey's rasterisable inputs, resolved from the plan + items. */
interface LevelInputs {
  level: string
  rooms: PlanRoom[]
  walls: CollisionWall[]
  envelope: CollisionWall[]
  obbs: OBB[]
  /** The item behind each obb, index-aligned with `obbs`. */
  sources: FurnitureItem[]
  /** Midpoints of doors on EXTERNAL walls — where you come in. */
  entries: [number, number][]
  /** Door probe points: placement keep-outs, not route blockers. */
  doorPoints: [number, number][]
}

/**
 * Resolve every storey's rooms, walls and blocking footprints. Doors are treated
 * as OPEN for routes and CLOSED for the envelope (see the module docs).
 */
function levelInputs(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  plan: FloorPlan,
): LevelInputs[] {
  const out: LevelInputs[] = []
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
    const sources: FurnitureItem[] = []
    for (const it of items) {
      if ((it.levelId ?? GROUND_LEVEL_ID) !== level.id) continue
      const def = defs[it.defId]
      if (!participates(def)) continue
      obbs.push(itemFootprint(it, def))
      sources.push(it)
    }
    // Entry doors: a door opening on an EXTERNAL wall. Its world midpoint is
    // the wall's start plus its direction times (offset + width/2).
    const entries: [number, number][] = []
    for (const o of Array.isArray(lp.openings) ? lp.openings : []) {
      if (o.kind !== 'door') continue
      const wl = (Array.isArray(lp.walls) ? lp.walls : []).find((x) => x.id === o.wallId)
      if (wl?.thickness !== 'external') continue
      const [ax, az] = wl.start
      const [bx, bz] = wl.end
      const len = Math.hypot(bx - ax, bz - az)
      if (len < 1e-6) continue
      const t = (o.offset + o.width / 2) / len
      entries.push([ax + (bx - ax) * t, az + (bz - az) * t])
    }
    out.push({
      level: level.id,
      rooms,
      walls,
      envelope: planCollisionWalls(lp, {}),
      obbs,
      sources,
      entries,
      doorPoints: doorProbePoints(lp),
    })
  }
  return out
}

/** Every storey's walkable floor, furniture included. */
function analyseReachability(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  plan: FloorPlan,
  bodyWidthM: number = BODY_WIDTH_M,
): RoomReachability[] {
  const out: RoomReachability[] = []
  for (const li of levelInputs(items, defs, plan)) {
    const g = buildLevelGrid(li.rooms, li.walls, li.obbs, li.envelope, li.entries, li.doorPoints)
    out.push(...rowsFrom(li.rooms, li.level, solveGrid(g, bodyWidthM)))
  }
  return out
}

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

/**
 * Rooms the FURNITURE severed — walkable on the empty plan, unreachable once the
 * layout is placed — each with the pieces that seal it. Sorted worst first.
 *
 * **The empty-plan baseline is the load-bearing part.** Measured over the 19
 * templates, 21 rooms come back isolated *with nothing in them at all* —
 * `tpl-hdb-4room`'s entire bedroom half has no interior door, which
 * `templateConnectivity.test.ts` independently records as
 * `'tpl-hdb-4room/ground': 2`. Blaming a layout for a plan that was never
 * connected would be wrong and unactionable, so the baseline is subtracted.
 *
 * **Culprit attribution reuses the raster** rather than re-running the whole
 * pipeline per item: `buildLevelGrid` is furniture-independent apart from an
 * `itemAt` lookup, so asking "does the room reconnect without this piece?" is
 * one `solveGrid` call with that obb's cells freed — about 1 ms, against ~60 ms
 * for a full pass. One solve per candidate answers it for EVERY severed room on
 * that storey at once, so the cost is linear in obstacles, not in
 * obstacles × rooms.
 */
export function findFurnitureSeveredRooms(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  plan: FloorPlan,
  bodyWidthM: number = BODY_WIDTH_M,
): SeveredRoom[] {
  const baseline = isolatedWhenEmpty(defs, plan, bodyWidthM)
  const out: SeveredRoom[] = []

  for (const li of levelInputs(items, defs, plan)) {
    const g = buildLevelGrid(li.rooms, li.walls, li.obbs, li.envelope, li.entries, li.doorPoints)
    const rows = rowsFrom(li.rooms, li.level, solveGrid(g, bodyWidthM))
    const targets = rows
      .map((r, i) => ({ r, i }))
      .filter(
        ({ r }) =>
          r.isolated &&
          r.walkableAreaM2 >= MIN_STRANDED_M2 &&
          !baseline.has(`${r.level}/${r.roomId}`),
      )
    if (targets.length === 0) continue

    // One solve per obstacle, read off for every target room.
    const sealedBy = targets.map(() => [] as SealingItem[])
    for (let o = 0; o < li.obbs.length; o++) {
      const without = solveGrid(g, bodyWidthM, o)
      for (let t = 0; t < targets.length; t++) {
        const ri = (targets[t] as { i: number }).i
        if ((without.reachable[ri] as number) > 0) {
          const src = li.sources[o] as FurnitureItem
          ;(sealedBy[t] as SealingItem[]).push({ itemId: src.id, defId: String(src.defId) })
        }
      }
    }

    targets.forEach(({ r }, t) => {
      out.push({
        roomId: r.roomId,
        roomName: r.roomName,
        level: r.level,
        areaM2: r.walkableAreaM2,
        sealedBy: sealedBy[t] as SealingItem[],
      })
    })
  }

  return out.sort((a, b) => b.areaM2 - a.areaM2)
}

// ---------------------------------------------------------------------------
// UNSEAL — move the piece that seals a room, rather than only reporting it
// ---------------------------------------------------------------------------

/**
 * How far (m) a sealing piece may be slid to open a route, and in what steps.
 *
 * **The reach was measured, not chosen (v0.31.8.56).** Over the 19 templates:
 * 1.2 m leaves 18 rooms unreachable, 1.8 m leaves 11, **2.4 m leaves 10**, and
 * 3.0 m gains nothing further, so 2.4 is where the curve flattens.
 *
 * A bigger ceiling does NOT mean bigger moves, because candidates are tried
 * nearest-first — the reach only says how far the pass may go when nothing
 * closer works. Measured at 2.4: **12 moves, median 0.45 m, max 1.95 m, 11 of
 * 12 within 1.2 m.** The one long move is `tpl-hdb-jumbo`'s COFFEE TABLE, the
 * most movable object in the room, and it opens 8 rooms / 55 m².
 *
 * 0.15 m steps are fine enough to find a 0.6 m gap and coarse enough to keep
 * the trial count bounded.
 */
/**
 * How far a small piece can sit from a big one and still count as ITS satellite
 * — a dining chair tucked at ~0.90 m, an end slot at ~1.02 m. Matches
 * `diningChairTuck.test.ts`'s `TUCKED`, which is the invariant this protects.
 */
const SATELLITE_REACH_M = 1.2
const UNSEAL_STEP_M = 0.15
const UNSEAL_REACH_M = 2.4

/**
 * Candidate translations, nearest first — a DISC, not a cross (v0.31.8.86).
 *
 * This was ±X and ±Z only (16 distances × 4 directions = 64 candidates), which
 * cannot move a piece out of a corner. `tpl-hdb-5room` is exactly that case:
 * a `bed-single` and a `wardrobe-3door` pinch the corridor into the bedroom
 * half, stranding FOUR rooms (master 3.8 m², common bath 3.0, master bath 2.6,
 * bedroom 2 2.5), and each piece on its own reconnects all four if removed — so
 * a translation should have opened it. Instrumenting the gates showed why it
 * didn't: of the 64 axis-aligned offsets, **53 failed `trialFits`** (the
 * bedroom is packed, so a pure slide has nowhere to land) and the other **11
 * fitted but did not reconnect** (still inside the pinch). Not one was rejected
 * by the don't-sever-anything-new guard — the search simply never looked
 * diagonally, where the free floor was.
 *
 * The disc is **strictly better on both axes**, which is why it needs no flag:
 *   - severed rooms across the 19 templates **7 -> 2** (5room's four and
 *     `tpl-1bed`'s Dining now open);
 *   - and it is FASTER on the worst cases — `tpl-hdb-maisonette` 1115 -> 917 ms,
 *     `tpl-hdb-jumbo` 616 -> 533 ms, `tpl-hdb-2room` 547 -> 498 ms.
 *
 * Faster despite ~17x the candidates because the cost is `solveGrid`, not the
 * candidate list: `trialFits` is a cheap raster test that rejects most offsets
 * without solving, and nearest-first ordering means a fixable room commits early
 * instead of exhausting all 64 misses and re-running the culprit sweep. The
 * cross paid full price for every room it then failed to open.
 */
function unsealOffsets(): [number, number][] {
  const out: [number, number][] = []
  const n = Math.round(UNSEAL_REACH_M / UNSEAL_STEP_M)
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      if (i === 0 && j === 0) continue
      const dx = i * UNSEAL_STEP_M
      const dz = j * UNSEAL_STEP_M
      if (Math.hypot(dx, dz) > UNSEAL_REACH_M + 1e-9) continue
      out.push([dx, dz])
    }
  }
  out.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]))
  return out
}

/** Does this trial footprint stand on clear floor? Tested on the SAME raster
 *  the route check uses, so "legal" cannot drift from "walkable": every cell it
 *  covers must be inside the envelope, out of every wall, and not already held
 *  by another piece. */
function trialFits(g: LevelGrid, o: OBB, moving: number): boolean {
  // Inflated by one cell: the raster samples CELL CENTRES, so a footprint can
  // overlap a wall by up to half a cell without any centre landing in it. The
  // margin costs 5 cm of reach and removes the whole class.
  const grown: OBB = { ...o, hx: o.hx + CELL_M, hz: o.hz + CELL_M }
  const cells = cellsUnder(g, grown)
  if (cells.length === 0) return false
  for (const i of cells) {
    if (!g.standable[i]) return false
  }
  for (const i of cellsUnder(g, o)) {
    const held = g.itemAt[i] as number
    if (held !== -1 && held !== moving) return false
  }
  return true
}

/** Which rooms are severed in a given solution (indices into the level's rooms). */
function severedIndices(sol: GridSolution, skip: ReadonlySet<number>): Set<number> {
  const out = new Set<number>()
  const cellArea = CELL_M * CELL_M
  for (let i = 0; i < sol.walkable.length; i++) {
    if (skip.has(i)) continue
    const walk = (sol.walkable[i] as number) * cellArea
    if (walk >= MIN_STRANDED_M2 && (sol.reachable[i] as number) === 0) out.add(i)
  }
  return out
}

/**
 * Move the pieces that seal rooms off, so the home is walkable end to end.
 *
 * This is the fix for what v0.31.8.52–.54 measured: 43 rooms across 10 of 19
 * templates that you cannot reach from the front door once the arranger has
 * placed the furniture. It does not re-arrange anything — it slides a SEALING
 * piece (`sealedBy`) along X or Z, nearest offset first, and takes the first
 * position that opens the route without severing anything new.
 *
 * **It is cheap because the grid is built once.** The 60–120 ms figure that made
 * this look unaffordable is `buildLevelGrid` — wall rasterisation, the outside
 * fill, room attribution — and none of it depends on the furniture. A trial
 * placement is one `solveGrid` at ~2 ms, so a few hundred candidates cost less
 * than one rebuild.
 *
 * **It never deletes and never resizes.** The item count is invariant; only
 * `position` changes. A route bought by removing the sofa is not a fix, and the
 * surrounding pipeline (`dropOverlaps`, `dropDoorBlockers`, `dropWallClippers`)
 * already owns deletion.
 *
 * Guarantees, in the order they are checked per candidate:
 *   1. the footprint stands on clear floor (same raster as the check, so
 *      "legal" cannot drift from "walkable");
 *   2. the target room reconnects;
 *   3. no room that was reachable becomes severed.
 *
 * (3) is what stops it trading one sealed room for another — the failure mode
 * that killed v0.31.8.7's clearance objective and v0.31.8.51's threshold change.
 */
export function unsealRoutes(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  plan: FloorPlan,
  bodyWidthM: number = BODY_WIDTH_M,
): FurnitureItem[] {
  const baseline = isolatedWhenEmpty(defs, plan, bodyWidthM)
  const moved = new Map<string, [number, number]>()
  const offsets = unsealOffsets()

  /** Positions as the pieces currently stand, so a clash test sees committed moves. */
  const livePos = (it: FurnitureItem): FurnitureItem => {
    const at = moved.get(it.id)
    return at ? { ...it, position: at } : it
  }

  for (const li of levelInputs(items, defs, plan)) {
    const g = buildLevelGrid(li.rooms, li.walls, li.obbs, li.envelope, li.entries, li.doorPoints)
    // Rooms the PLAN never connected are not this pass's business.
    const skip = new Set<number>()
    li.rooms.forEach((r, i) => {
      if (baseline.has(`${li.level}/${r.id}`)) skip.add(i)
    })

    const levelItems = items.filter((it) => (it.levelId ?? GROUND_LEVEL_ID) === li.level)

    /**
     * Small pieces that travel WITH an obstacle — the chairs of a dining table.
     *
     * A piece under `OBSTACLE_AREA_M2` is not in the raster, so it can neither
     * seal a route nor be seen by `trialFits`, and v0.31.8.86's disc slid
     * `tpl-hdb-maisonette`'s dining table ~1.5 m and left three chairs around a
     * spot the table no longer occupied — the exact defect `diningChairTuck`
     * was built for in v0.31.5.111. A designer clearing a route with a table
     * takes the chairs; so does this pass.
     *
     * Assigned to the NEAREST obstacle within `SATELLITE_REACH_M`, so a lamp
     * beside a sofa follows the sofa rather than a table on the other side.
     */
    const satellites = new Map<number, FurnitureItem[]>()
    for (const it of levelItems) {
      const def = defs[it.defId]
      if (!def || def.mounted || def.noClip || participates(def)) continue
      let best = -1
      let bestD = SATELLITE_REACH_M
      for (let o = 0; o < li.obbs.length; o++) {
        const obb = li.obbs[o] as OBB
        const d = Math.hypot(obb.cx - it.position[0], obb.cz - it.position[1])
        if (d <= bestD) {
          bestD = d
          best = o
        }
      }
      if (best >= 0) {
        const list = satellites.get(best)
        if (list) list.push(it)
        else satellites.set(best, [it])
      }
    }
    /** Accumulated translation per obstacle — a piece can be a culprit twice. */
    const shifted = new Map<number, [number, number]>()

    /**
     * Would this trial land the piece ON another one?
     *
     * `trialFits` only reads the route raster, and the raster holds just the
     * pieces `participates()` admits — big, floor-standing, clipping. Anything
     * under `OBSTACLE_AREA_M2` is invisible to it, so a slide could park a sofa
     * on a side table with every grid gate satisfied. This asks the SAME
     * narrowphase `findItemOverlaps` uses, which is why `tpl-1bed` gains a route
     * without gaining an overlapping pair.
     */
    /**
     * The room a piece was arranged INTO, so a route fix cannot evict it.
     *
     * `unsealRoutes` slides a sealing piece up to 2.4 m across a disc, and
     * nothing kept that slide inside the piece's own room. Measured on
     * `tpl-hdb-5room`: a `bed-single` moved (5.08, 5.00) -> (7.33, 5.30), out of
     * `h5-bed3` and into `h5-living` — 2.25 m, across a wall, into the living
     * room. The item count never changed, so no ratchet saw it; it surfaced as
     * "a bedroom with no bed" in `roomCompleteness.test.ts` (v0.31.9.15).
     *
     * A route bought by putting the bed in the living room is not a fix, for the
     * same reason v0.31.8.55 refused to buy one by deleting the sofa.
     */
    const roomAt = (x: number, z: number): PlanRoom | undefined =>
      li.rooms.find((r) => pointInRoom(r, x, z))

    const clashesAt = (
      o: number,
      src: FurnitureItem,
      dx: number,
      dz: number,
      prev: [number, number] | undefined,
    ): boolean => {
      const def = defs[src.defId]
      if (!def) return false
      const base = prev ?? [0, 0]
      const probe: FurnitureItem = {
        ...src,
        position: [src.position[0] + base[0] + dx, src.position[1] + base[1] + dz],
      }
      const riders = satellites.get(o) ?? []
      const others = othersFor(o)
      if (itemHeightAwareClash(probe, def, others, defs)) return true
      // The riders come too, so they must land clear of the other pieces AND of
      // the walls. `trialFits` only rasterises the OBSTACLE, so without this a
      // carried chair goes through a wall — measured on `tpl-condo-1study`.
      const shiftedRiders: FurnitureItem[] = []
      for (const r of riders) {
        const rdef = defs[r.defId]
        if (!rdef) continue
        const at: FurnitureItem = {
          ...r,
          position: [r.position[0] + base[0] + dx, r.position[1] + base[1] + dz],
        }
        if (itemHeightAwareClash(at, rdef, others, defs)) return true
        shiftedRiders.push(at)
      }
      if (shiftedRiders.length > 0 && findWallClips(shiftedRiders, defs, li.walls).length > 0) {
        return true
      }
      return false
    }

    /**
     * The pieces a trial must clear, cached per obstacle.
     *
     * This list depends only on which piece is moving and on the moves already
     * committed, so rebuilding it per CANDIDATE — hundreds of times per
     * obstacle now the search is a disc — cost `tpl-hdb-maisonette` ~350 ms in
     * list allocation alone. Invalidated on every commit.
     */
    let othersCacheKey = -1
    let othersCache: FurnitureItem[] = []
    const othersFor = (o: number): FurnitureItem[] => {
      if (othersCacheKey === o) return othersCache
      const riders = satellites.get(o) ?? []
      const movingIds = new Set([(li.sources[o] as FurnitureItem).id, ...riders.map((r) => r.id)])
      othersCache = levelItems.filter((it) => !movingIds.has(it.id)).map(livePos)
      othersCacheKey = o
      return othersCache
    }

    let sol = solveGrid(g, bodyWidthM)
    let targets = severedIndices(sol, skip)
    if (targets.size === 0) continue

    /**
     * Culprits for EVERY target in one obstacle sweep.
     *
     * One `solveGrid` with an obstacle excluded answers "does this piece seal
     * it?" for every room at once, so the sweep is O(obstacles), not
     * O(rooms × obstacles). The first cut looped per room and cost
     * `tpl-hdb-jumbo` — 8 unfixable rooms, so every trial runs and fails —
     * **883 ms on top of a 434 ms furnish**. Sweeping once takes that back.
     */
    const sweep = () => {
      const byRoom = new Map<number, number[]>()
      for (const ri of targets) byRoom.set(ri, [])
      for (let o = 0; o < li.obbs.length; o++) {
        const without = solveGrid(g, bodyWidthM, o)
        for (const ri of targets) {
          if ((without.reachable[ri] as number) > 0) (byRoom.get(ri) as number[]).push(o)
        }
      }
      return byRoom
    }
    let culpritsByRoom = sweep()

    // Worst first — the biggest stranded room is the one most worth opening,
    // and opening it often reconnects the rooms behind it in one move.
    const order = [...targets].sort(
      (a, b) => (sol.walkable[b] as number) - (sol.walkable[a] as number),
    )

    for (const ri of order) {
      if (!targets.has(ri)) continue // already opened by an earlier move
      const culprits = culpritsByRoom.get(ri) ?? []
      let done = false
      for (const o of culprits) {
        if (done) break
        const obb = li.obbs[o] as OBB
        for (const [dx, dz] of offsets) {
          const trial: OBB = { ...obb, cx: obb.cx + dx, cz: obb.cz + dz }
          if (!trialFits(g, trial, o)) continue
          if (clashesAt(o, li.sources[o] as FurnitureItem, dx, dz, shifted.get(o))) continue
          // ROOM-CONTAINMENT: never slide a piece out of the room it was
          // arranged into. A piece that started in no declared room (undeclared
          // circulation) is unconstrained, as before.
          const from = roomAt(obb.cx, obb.cz)
          if (from && roomAt(trial.cx, trial.cz)?.id !== from.id) continue
          const next = solveGrid(g, bodyWidthM, o, trial)
          if ((next.reachable[ri] as number) === 0) continue
          // Must not sever anything that is currently fine.
          const before = severedIndices(sol, skip)
          const after = severedIndices(next, skip)
          let regressed = false
          for (const i of after) {
            if (!before.has(i)) {
              regressed = true
              break
            }
          }
          if (regressed) continue
          // Commit: update the raster in place so later rooms see the new state.
          for (const i of cellsUnder(g, obb)) if (g.itemAt[i] === o) g.itemAt[i] = -1
          for (const i of cellsUnder(g, trial)) g.itemAt[i] = o
          li.obbs[o] = trial
          const src = li.sources[o] as FurnitureItem
          const prev = shifted.get(o) ?? [0, 0]
          const total: [number, number] = [prev[0] + dx, prev[1] + dz]
          shifted.set(o, total)
          othersCacheKey = -1
          moved.set(src.id, [src.position[0] + total[0], src.position[1] + total[1]])
          for (const r of satellites.get(o) ?? []) {
            moved.set(r.id, [r.position[0] + total[0], r.position[1] + total[1]])
          }
          sol = next
          targets = after
          culpritsByRoom = targets.size > 0 ? sweep() : new Map()
          done = true
          break
        }
      }
    }
  }

  if (moved.size === 0) return items
  return items.map((it) => {
    const at = moved.get(it.id)
    return at ? { ...it, position: at as [number, number] } : it
  })
}
