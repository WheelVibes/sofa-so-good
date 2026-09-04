import { ROOMS } from '../apartment/constants'
import { roomContains, roomParts } from '../apartment/roomGeometry'
import type { RoomId } from '../apartment/types'
import { broadphaseNeighbours, canPlace } from '../collision/placement'
import type { CollisionWall } from '../collision/walls'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { GROUND_LEVEL_ID, levelAsPlan, levelOfRoom, planLevels } from '../floorplan/levels'
import { planCollisionWalls } from '../floorplan/planGeometry'
import { roomCategory, toArrangeKind } from '../floorplan/roomCategory'
import { type FloorPlan, type PlanRoom, pointInRoom, wallLength } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import {
  clamp,
  cornersOf,
  type Edge,
  inward,
  nearestEdge,
  opposite,
  planRoomRect,
  type Rect,
  ROOM_INSET,
  rectsOverlap,
} from './arrangeGeometry'
import { type ArrangeRole, roleForCategory, roleOf } from './arrangeRoles'
import {
  doorApproachRects,
  doorSwingRects,
  type WindowFrontRect,
  windowFrontRects,
} from './clearance'
import { CLEARANCE } from './designRules'

// Re-export the arrange-role classification (extracted to ./arrangeRoles) so
// existing importers of these from './autoArrange' keep working.
export { roleForCategory, roleOf }

/**
 * Heuristic per-room auto-arranger ("Tidy up room"). Given the items already
 * in a room it returns a repositioned copy of the FULL item list, applying
 * interior-design rules grounded in the fixed apartment geometry:
 *   - storage / appliances / beds sit flush against walls, facing inward;
 *   - seating faces the focal wall (TV); the TV/console stay on a windowless
 *     wall; a coffee table + rug centre the lounge;
 *   - a dining set occupies the secondary zone with chairs tucked around it;
 *   - plants / floor lamps tuck into corners; walking gaps are preserved.
 * Every placement is collision-checked; an item that can't be placed is left
 * where it was, so the result is always valid.
 */

/** Base (unrotated) footprint from the def + parametric overrides. */
function baseFootprint(item: FurnitureItem, def: FurnitureDef): { w: number; d: number } {
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

/** Which room (by id) an [x,z] point falls in — any of its parts. */
export function roomOf(position: [number, number]): RoomId | null {
  const [x, z] = position
  for (const [id, r] of Object.entries(ROOMS) as [RoomId, (typeof ROOMS)[RoomId]][]) {
    if (roomContains(r, x, z)) return id
  }
  return null
}

/** Nearest room to a point that falls outside every room's rect/extension —
 *  a resilience fallback for an item whose stored [x,z] no longer lands
 *  inside any room after a floor-plan edit (its default coordinate now sits
 *  in a sliver the geometry carved away). Without this, `roomOf` returns
 *  `null` and the item never matches any room's `inRoom` test — invisible to
 *  every "Tidy" pass forever, even a whole-flat `arrangeAllRooms`. Distance
 *  is to the nearest edge of each room's own rect (0 while inside it). */
function nearestRoomTo(position: [number, number]): RoomId {
  const [x, z] = position
  let best: RoomId | null = null
  let bestDist = Infinity
  for (const [id, r] of Object.entries(ROOMS) as [RoomId, (typeof ROOMS)[RoomId]][]) {
    const dx = Math.max(r.origin[0] - x, 0, x - (r.origin[0] + r.width))
    const dz = Math.max(r.origin[1] - z, 0, z - (r.origin[1] + r.depth))
    const dist = Math.hypot(dx, dz)
    if (dist < bestDist) {
      bestDist = dist
      best = id
    }
  }
  // ROOMS is never empty, so `best` is always assigned — the `livingDining`
  // fallback only guards the type against a theoretical empty table.
  return best ?? 'livingDining'
}

interface Ctx {
  catalog: Record<string, FurnitureDef>
  doors: Record<string, { open: boolean }>
  /** Keep-clear rects (door swings + room openings) no item may overlap. */
  keepOut: Rect[]
  /** Window front-clearance rects (RM3): a floor item taller than a rect's
   *  `sill` — or ANY floor item when the sill is near-zero (a full-height
   *  window / balcony sliding door) — may not overlap it. */
  windowKeepOut?: WindowFrontRect[]
  /** World [x,z] centre of every window opening in the plan (bedroom
   *  headboard-edge scoring + the living arranger's focal-wall inference). */
  windows?: Array<[number, number]>
  /** World [x,z] centre of every door opening in the plan (bedroom
   *  foot-to-door scoring). */
  doorPoints?: Array<[number, number]>
  /** Collision walls override for a user-authored plan. When omitted, the
   *  fixed flat's door-aware walls are used (default flat). */
  walls?: CollisionWall[]
  /** Layout-variant seed (LAYOUT-REROLL). `0` = today's deterministic default
   *  (byte-identical output); `> 0` rotates the candidate wall / bed-anchor /
   *  focal-wall / lounge-band choices to produce a DIFFERENT layout. Validity
   *  is unaffected — every placement still goes through `tryPlace`/`settle`,
   *  which reject a colliding/blocked transform, so any seed stays as
   *  collision-clean as the default. */
  seed: number
}

/** How many distinct layout variants a per-room reroll cycles through before
 *  wrapping (LAYOUT-REROLL). Seed 0 is the default "Tidy" layout; 1..N-1 are
 *  alternatives, and the cycle returns to 0 so "the original tidy layout" is
 *  always one tap away in the loop. */
export const LAYOUT_VARIANT_COUNT = 4

/** Rotate an edge-candidate list by `seed` (variant reroll). A seed of 0 — or a
 *  list with fewer than two edges — is returned unchanged, so the default
 *  layout is byte-identical. Rotation only reorders which wall an item TRIES
 *  first; `tryPlace` still validates each candidate, so a rotated order can
 *  never emit an overlapping/blocked layout. */
function rotateEdges(edges: Edge[], seed: number): Edge[] {
  if (seed <= 0 || edges.length < 2) return edges
  const k = seed % edges.length
  return k === 0 ? edges : [...edges.slice(k), ...edges.slice(0, k)]
}

/** Axis-aligned footprint AABB of a candidate (accounts for rotation). */
function aabbOf(item: FurnitureItem, def: FurnitureDef, pos: [number, number], rot: number): Rect {
  const { w, d } = baseFootprint(item, def)
  const c = Math.abs(Math.cos(rot))
  const s = Math.abs(Math.sin(rot))
  const hx = (c * w + s * d) / 2
  const hz = (s * w + c * d) / 2
  return { x0: pos[0] - hx, z0: pos[1] - hz, x1: pos[0] + hx, z1: pos[1] + hz }
}

/** Try to set an item's transform; accept only if it doesn't collide with the
 *  walls or any other item in `world`. Mutates `world` on success. Returns the
 *  (possibly unchanged) item. */
function tryPlace(
  item: FurnitureItem,
  pos: [number, number],
  rot: number,
  world: FurnitureItem[],
  ctx: Ctx,
): FurnitureItem {
  const def = ctx.catalog[item.defId]
  if (!def) return item
  // Never place into a door swing / room opening, or a door's straight-line
  // approach on EITHER side of the wall (RM3 — previously gated to
  // `def.kind === 'parametric'`, which let a GLB/fixed-kind item — e.g. a
  // bathroom sink — skip the check entirely and park in a doorway;
  // `blockedDoorItems`'s "Checks" overlay would then flag it). Applies to
  // every floor item now; mounted (wall/ceiling) and noClip (rugs) items are
  // still exempt — they don't block foot traffic.
  if (!def.mounted && !def.noClip) {
    const box = aabbOf(item, def, pos, rot)
    if (ctx.keepOut.some((k) => rectsOverlap(box, k))) return item
  }
  // Never block a window (RM3): a full-height/balcony-slider opening (sill
  // ≤ 0.05 m) is a hard keep-out for every floor item; a normal window only
  // rejects an item TALLER than its sill (a low console can sit under it, a
  // wardrobe/bookcase can't). Mounted/ceiling AND noClip (rug) items are exempt
  // — exactly like the door-swing check above (a floor rug lies flat under the
  // window and blocks nothing).
  if (!def.mounted && !def.noClip && ctx.windowKeepOut && ctx.windowKeepOut.length > 0) {
    const box = aabbOf(item, def, pos, rot)
    const blocked = ctx.windowKeepOut.some(
      (w) => (w.sill <= 0.05 || def.defaultFootprint.h > w.sill) && rectsOverlap(box, w),
    )
    if (blocked) return item
  }
  const candidate = { ...item, position: pos, rotation: rot }
  // `world` holds only obstacles: other-room items + already-placed items in
  // this room. Items still pending placement are NOT in `world`, so a messy
  // starting layout can't block the tidy target.
  const others = world.filter((w) => w.id !== item.id)
  // Broadphase the per-candidate item scan (ARRANGE-GRID / PERF-003): restrict
  // `others` to the candidate's footprint neighbourhood. An item whose AABB
  // doesn't overlap the candidate can't have an overlapping OBB, so the
  // canPlace boolean is identical to scanning the full list — proven by an
  // equivalence sweep in arrangeBroadphase.test.ts. The wall arm of canPlace
  // is unaffected (it never reads `others`).
  const near = broadphaseNeighbours(candidate, def, others, ctx.catalog)
  if (
    canPlace(candidate, def, {
      others: near,
      defs: ctx.catalog,
      doors: ctx.doors,
      walls: ctx.walls,
    })
  ) {
    const idx = world.findIndex((w) => w.id === item.id)
    if (idx >= 0) world[idx] = candidate
    else world.push(candidate)
    return candidate
  }
  return item
}

/** Per-room usable-rect overrides where origin+width over-reports the free
 *  floor (e.g. the L/D lounge is bounded east of the b3 partition at x≈9.05,
 *  not the room origin at x=8.55). */
const RECT_OVERRIDE: Partial<Record<RoomId, Rect>> = {
  // West bound sits just east of the B3/LD partition face (x=9.225, the
  // windowless focal wall for z<3.775 — see FOCAL below); using the wider
  // household-shelter face (x=8.265, only real south of z≈4.875) here would
  // let a wall-mounted item (TV/console, exempt from real wall collision)
  // land beyond the actual B3/corridor wall in the north band. South/east
  // bounds stay inset off the kitchen/entrance openings, as before.
  livingDining: { x0: 9.275, z0: 1.4, x1: 12.475, z1: 6.625 },
}

/** Usable rect for a room — main rectangle inset from the walls. */
function usableRect(roomId: RoomId): Rect {
  const o = RECT_OVERRIDE[roomId]
  if (o) return o
  const r = ROOMS[roomId]
  const inset = 0.15
  return {
    x0: r.origin[0] + inset,
    z0: r.origin[1] + inset,
    x1: r.origin[0] + r.width - inset,
    z1: r.origin[1] + r.depth - inset,
  }
}

/** A room's non-primary parts as inset rects (the settle fallback's extra search
 *  area — see `settle`), largest first, or `undefined` for a single-rect room.
 *  Not used by the tuned per-kind arrangers (they target the main `usableRect`
 *  only); this only widens the LAST-RESORT safety net, so the biggest secondary
 *  part is the useful one. */
function extensionRectOf(roomId: RoomId): Rect | undefined {
  const inset = 0.15
  const extras = roomParts(ROOMS[roomId])
    .slice(1)
    .map((p) => ({ x0: p.x0 + inset, z0: p.z0 + inset, x1: p.x1 - inset, z1: p.z1 - inset }))
    .filter((r) => r.x1 > r.x0 && r.z1 > r.z0)
    .sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0))
  return extras[0]
}

/** Rooms whose seating should face a focal (TV) wall, and which edge it is.
 *  livingDining's focal wall is the WEST side (B3/household-shelter
 *  partitions), matching the curated default layout — the north wall is
 *  glazed and the west partitions give the dining zone the east wall. */
const FOCAL: Partial<Record<RoomId, Edge>> = { livingDining: 'W' }

/** The fixed default flat as a `FloorPlan` (RM3) — same coordinate system as
 *  `ROOMS`/`WINDOWS`/`DOORS` in apartment/constants.ts (`buildDefaultPlan`
 *  derives it directly from those tables), computed once so the fixed-flat
 *  arranger (`arrangeRoom`/`arrangeAllRooms`) gets the SAME window keep-out +
 *  door/window-position rules as a user-authored plan, instead of a second,
 *  hand-maintained copy. */
const DEFAULT_FLOOR_PLAN = buildDefaultPlan()
const DEFAULT_WINDOW_KEEPOUT = windowFrontRects(DEFAULT_FLOOR_PLAN)
const DEFAULT_WINDOWS = windowCentres(DEFAULT_FLOOR_PLAN)
const DEFAULT_DOOR_POINTS = doorCentres(DEFAULT_FLOOR_PLAN)
/** Door approach keep-outs (RM3 pt.2) — a superset of `blockedDoorItems`'s
 *  probe points on BOTH sides of every door, so the arranger never produces a
 *  layout the "Checks" overlay would flag as blocking a doorway. */
const DEFAULT_DOOR_APPROACH = doorApproachRects(DEFAULT_FLOOR_PLAN)

/** Lounge-cluster bands (fraction of the room depth) a living-room reroll
 *  cycles the sofa/console/coffee zone through (LAYOUT-REROLL). Index 0 is the
 *  default north band; the rest slide the lounge to give a distinct layout. */
const LIVING_LOUNGE_BANDS = [0.28, 0.62, 0.44, 0.74]

/** Keep-clear rects per room: door swings + open passages between rooms, so
 *  the auto-arranger never blocks an entrance. Grounded in the fixed apartment
 *  geometry (DOORS/WALLS in apartment/constants.ts). */
const KEEPOUT: Partial<Record<RoomId, Rect[]>> = {
  livingDining: [
    { x0: 10.7, z0: 6.95, x1: 12.1, z1: 8.0 }, // main entrance + door swing
    { x0: 8.5, z0: 3.65, x1: 9.15, z1: 4.5 }, // corridor → L/D opening (SW)
    { x0: 8.9, z0: 6.25, x1: 10.2, z1: 6.95 }, // kitchen → L/D opening (S)
  ],
  bedroom2: [{ x0: 4.95, z0: 2.7, x1: 6.0, z1: 3.65 }], // bedroom-2 door swing
  bedroom3: [{ x0: 6.05, z0: 2.7, x1: 7.05, z1: 3.65 }], // bedroom-3 door swing
}

/** Beyond this the edge is open-plan and there is no wall to be flush with. */
const SHORTFALL_SEARCH_M = 0.3

/**
 * Does this rect edge have a wall behind it at all?
 *
 * **WALL-BACKED-EDGE (v0.31.8.75).** `snapToWall` chose its edge from the piece's
 * SEEDED position, which says nothing about whether that edge is a wall. Measured
 * on `tpl-hdb-3room`'s Service Yard — flush to a wall on its NORTH edge, no wall
 * within **0.80 m** on the other three — the washing machine took the west one
 * and stood 0.50 m from any wall. A washing machine needs a wall for its
 * plumbing, a fridge for its coils; standing one against a rect edge that is not
 * a wall is wrong in the render and unbuildable as a drawing.
 *
 * A PREFERENCE, exactly like the `windowed(edge)` reordering below and for the
 * same reason: every edge is still attempted, so it can never leave a piece
 * unplaced.
 */
function edgeHasWall(rect: Rect, edge: Edge, walls: CollisionWall[] | undefined): boolean {
  if (!walls || walls.length === 0) return true
  const seg =
    edge === 'N'
      ? [rect.x0, rect.z0, rect.x1, rect.z0]
      : edge === 'S'
        ? [rect.x0, rect.z1, rect.x1, rect.z1]
        : edge === 'W'
          ? [rect.x0, rect.z0, rect.x0, rect.z1]
          : [rect.x1, rect.z0, rect.x1, rect.z1]
  const ax = seg[0] as number
  const az = seg[1] as number
  const bx = seg[2] as number
  const bz = seg[3] as number
  const elen = Math.hypot(bx - ax, bz - az)
  if (elen <= 0) return true
  const eux = (bx - ax) / elen
  const euz = (bz - az) / elen
  for (let k = 1; k <= 5; k++) {
    const t = k / 6
    const px = ax + (bx - ax) * t
    const pz = az + (bz - az) * t
    for (const w of walls) {
      const wl = Math.hypot(w.bx - w.ax, w.bz - w.az)
      if (wl <= 0) continue
      if (Math.abs(((w.bx - w.ax) / wl) * eux + ((w.bz - w.az) / wl) * euz) <= 0.966) continue
      const vx = w.bx - w.ax
      const vz = w.bz - w.az
      const l2 = vx * vx + vz * vz
      const u = l2 > 0 ? Math.max(0, Math.min(1, ((px - w.ax) * vx + (pz - w.az) * vz) / l2)) : 0
      const d = Math.hypot(px - (w.ax + u * vx), pz - (w.az + u * vz)) - w.thickness / 2
      if (d - ROOM_INSET <= SHORTFALL_SEARCH_M) return true
    }
  }
  return false
}

/**
 * How far a rect edge falls short of its wall FACE (0 when there is no wall
 * within {@link SHORTFALL_SEARCH_M}, or when the rect already overlaps the wall
 * body — 58 shipped edges do, and pulling a piece further in would take floor
 * away for no gain).
 *
 * **WALL-SNAP-SHORTFALL (v0.31.8.71).** Room rectangles are authored against the
 * wall CENTRELINE with a constant offset while a wall's half-thickness varies
 * (internal 0.05, external 0.10), so one constant cannot be flush against both.
 * Over the 570 shipped rect edges with a wall within 0.3 m: 226 flush, **186
 * short by 0.05, 86 short by 0.15** (`floorplan/roomRectWalls.test.ts`).
 * Everything snapped inherits that error — eight kitchen appliances stood 0.32 m
 * from their wall, 0.18 m of intended gap plus 0.15 m of rect shortfall.
 *
 * This corrects the DISTANCE, not the rect. v0.31.8.61 fixed `planRoomRect`
 * instead, which moves the rect's CENTRE — the arranger centres dining groups on
 * it, so a table slid onto the rect edge and its chairs were flung to the room's
 * ends. Only wall-snapped pieces move here, and only outward.
 *
 * Only walls roughly PARALLEL to the edge count: the nearest wall to a short edge
 * is often a perpendicular one near its end, and using it pushes the piece
 * straight through the real wall.
 */
function edgeShortfall(rect: Rect, edge: Edge, walls: CollisionWall[] | undefined): number {
  if (!walls || walls.length === 0) return 0
  const seg =
    edge === 'N'
      ? [rect.x0, rect.z0, rect.x1, rect.z0]
      : edge === 'S'
        ? [rect.x0, rect.z1, rect.x1, rect.z1]
        : edge === 'W'
          ? [rect.x0, rect.z0, rect.x0, rect.z1]
          : [rect.x1, rect.z0, rect.x1, rect.z1]
  const ax = seg[0] as number
  const az = seg[1] as number
  const bx = seg[2] as number
  const bz = seg[3] as number
  const elen = Math.hypot(bx - ax, bz - az)
  if (elen <= 0) return 0
  const eux = (bx - ax) / elen
  const euz = (bz - az) / elen
  const parallel = walls.filter((w) => {
    const wl = Math.hypot(w.bx - w.ax, w.bz - w.az)
    if (wl <= 0) return false
    return Math.abs(((w.bx - w.ax) / wl) * eux + ((w.bz - w.az) / wl) * euz) > 0.966
  })
  if (parallel.length === 0) return 0
  // Median of five samples so a doorway or a stub cannot swing it.
  const ds: number[] = []
  for (let k = 1; k <= 5; k++) {
    const t = k / 6
    const px = ax + (bx - ax) * t
    const pz = az + (bz - az) * t
    let best = Number.POSITIVE_INFINITY
    for (const w of parallel) {
      const vx = w.bx - w.ax
      const vz = w.bz - w.az
      const l2 = vx * vx + vz * vz
      const u = l2 > 0 ? Math.max(0, Math.min(1, ((px - w.ax) * vx + (pz - w.az) * vz) / l2)) : 0
      const d = Math.hypot(px - (w.ax + u * vx), pz - (w.az + u * vz)) - w.thickness / 2
      if (d < best) best = d
    }
    ds.push(best)
  }
  ds.sort((a, b) => a - b)
  const short = (ds[2] as number) - ROOM_INSET
  return short <= 0.01 || short > SHORTFALL_SEARCH_M ? 0 : short
}

/** Snap an item flush against `edge`, keeping its along-wall coordinate
 *  (clamped), facing inward. Tries the given edge then falls back to others. */
function snapToWall(
  item: FurnitureItem,
  rect: Rect,
  edges: Edge[],
  world: FurnitureItem[],
  ctx: Ctx,
  gap = 0.06,
): FurnitureItem {
  const def = ctx.catalog[item.defId]
  if (!def) return item
  const { w, d } = baseFootprint(item, def)
  // WINDOW-SIGHTLINE: a piece taller than a window sill tries WINDOWLESS edges
  // first. This only reorders preferences — every edge is still attempted, so
  // unlike a deeper keep-out (.117) it can never leave a piece unplaced.
  const ordered = rotateEdges(edges, ctx.seed)
  // STORAGE only — a wardrobe or bookcase is what `designRules.windowSillTall`
  // is written about. Applying this to every tall item pushed bathroom fixtures
  // off their walls (caught by `autoArrange.test.ts`'s "fixtures along the
  // walls" case, which a sightline-only metric never saw).
  const tall =
    roleOf(item.defId, ctx.catalog) === 'storage' &&
    (ctx.windowKeepOut?.some((k) => def.defaultFootprint.h > k.sill) ?? false)
  const windowed = (edge: Edge) => {
    if (!tall || !ctx.windowKeepOut) return false
    const band: Rect =
      edge === 'N'
        ? { x0: rect.x0, x1: rect.x1, z0: rect.z0 - 0.3, z1: rect.z0 + 0.3 }
        : edge === 'S'
          ? { x0: rect.x0, x1: rect.x1, z0: rect.z1 - 0.3, z1: rect.z1 + 0.3 }
          : edge === 'W'
            ? { x0: rect.x0 - 0.3, x1: rect.x0 + 0.3, z0: rect.z0, z1: rect.z1 }
            : { x0: rect.x1 - 0.3, x1: rect.x1 + 0.3, z0: rect.z0, z1: rect.z1 }
    return ctx.windowKeepOut.some((k) => rectsOverlap(band, k))
  }
  const byWindow = [...ordered.filter((e) => !windowed(e)), ...ordered.filter(windowed)]
  // WALL-BACKED-EDGE: within the window ordering, an edge with a real wall behind
  // it comes first. Preference only, so nothing can go unplaced.
  const backed = (e: Edge) => edgeHasWall(rect, e, ctx.walls)
  const byWall = [...byWindow.filter(backed), ...byWindow.filter((e) => !backed(e))]
  for (const sweep of [false, true]) {
    for (const edge of byWall) {
      const rot = inward(edge)
      // Perpendicular half-extent (depth d faces the wall) and along-wall half (w).
      const along = w / 2
      const out = edgeShortfall(rect, edge, ctx.walls)
      // ALONG-WALL SWEEP (v0.31.9.22). The along-wall coordinate used to be just
      // `clamp(item.position[…])` — the seed point, i.e. the ROOM CENTRE — so a
      // piece was offered exactly one spot per wall and refused the wall outright
      // if anything sat there. `tpl-studio/st-kit` is the case that forced this: a
      // door swings into the galley with a 0.9 x 0.9 keep-out dead centre of its
      // only long wall, and the counter was refused on every edge while 1.88 m of
      // that wall stood clear (v0.31.9.20/.21). Shrinking the counter to fit was
      // measured and found INERT for exactly this reason — it stayed centred.
      //
      // The clamped position is still tried FIRST, so any piece that placed before
      // places identically; the sweep only reaches spots that were previously
      // unreachable. Same shape as `placeSeededMounts`' rescue sweep, which has
      // done this since v0.31.5.107 — this brings the primary path in line with it.
      const sideways = edge === 'W' || edge === 'E'
      const lo = (sideways ? rect.z0 : rect.x0) + along
      const hi = (sideways ? rect.z1 : rect.x1) - along
      const start = clamp(item.position[sideways ? 1 : 0], lo, hi)
      const perp = sideways
        ? edge === 'W'
          ? rect.x0 + d / 2 + gap - out
          : rect.x1 - d / 2 - gap + out
        : edge === 'N'
          ? rect.z0 + d / 2 + gap - out
          : rect.z1 - d / 2 - gap + out
      const step = Math.max(0.1, along)
      // STRICTNESS SITS OUTSIDE THE WALL LOOP — the same rule v0.31.8.75 had to
      // learn for the window relaxation, and for the same reason. Sweeping INSIDE
      // the edge loop lets a swept spot on the first wall beat the CLAMPED spot on
      // a later one, which reshuffles pieces that were placing fine: measured over
      // the 19 templates, that variant cost `tpl-condo-1bed` its counter AND stove
      // (a kitchen that only wanted a fridge), `tpl-hdb-2room` its fridge, and
      // `tpl-condo-2bed` its desk. With `sweep` as an outer pass every piece is
      // offered all four clamped positions first, so anything that placed before
      // places IDENTICALLY and the sweep is purely additive.
      if (!sweep) {
        const pos: [number, number] = sideways ? [perp, start] : [start, perp]
        const placed = tryPlace(item, pos, rot, world, ctx)
        if (placed !== item) return placed
        continue
      }
      for (let k = 1; k <= 16; k++) {
        for (const dir of [1, -1]) {
          const t = start + dir * k * step
          if (t < lo - 1e-9 || t > hi + 1e-9) continue
          const pos: [number, number] = sideways ? [perp, t] : [t, perp]
          // Contain the SWEPT candidates only. `perp` adds `edgeShortfall`,
          // which pushes a piece OUT past the rect edge to meet the real wall
          // face — so an edge can be geometrically legal and still leave the
          // footprint half a metre into the room next door. That used to be
          // unreachable: with one clamped along-position per edge the
          // overshooting edge was simply blocked, and the sweep is what finds a
          // free spot on it. Measured on `tpl-condo-2bed/c2-bed2`, whose
          // `bed-single` came out 0.49 m through the south side of the bedroom.
          // The clamped pass is left unguarded on purpose, so anything that
          // placed before places identically.
          if (!settleContained(item, pos, rot, rect, ctx)) continue
          const placed = tryPlace(item, pos, rot, world, ctx)
          if (placed !== item) return placed
        }
      }
    }
  }
  return item
}

/** Place the main seating flush against the wall opposite the focal (TV) wall,
 *  facing it — but if that wall is blocked there (e.g. a window's front
 *  clearance the sofa is too tall to sit under: RM, the LD's east/north walls
 *  now carry windows), step the sofa inward off the wall and try a spread of
 *  Z bands, always at the SAME fixed rotation so it keeps facing the focal
 *  wall even when it ends up freestanding rather than wall-backed. */
function placeSeatingFacingFocal(
  item: FurnitureItem,
  rect: Rect,
  rot: number,
  fs: number,
  oppX: number,
  d: number,
  preferredZ: number,
  world: FurnitureItem[],
  ctx: Ctx,
): FurnitureItem {
  const baseX = oppX + fs * (d / 2 + CLEARANCE.wallGap)
  const zOffsets = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2, -2]
  for (let depthStep = 0; depthStep < 12; depthStep++) {
    const x = baseX + fs * depthStep * 0.25
    if (fs > 0 ? x > rect.x1 - 0.3 : x < rect.x0 + 0.3) break
    for (const dz of zOffsets) {
      const z = clamp(preferredZ + dz, rect.z0 + 0.3, rect.z1 - 0.3)
      const placed = tryPlace(item, [x, z], rot, world, ctx)
      if (placed !== item) return placed
    }
  }
  return item
}

type RoomKind = 'living' | 'bedroom' | 'kitchen' | 'bath' | 'generic'
function roomKind(roomId: RoomId): RoomKind {
  if (roomId === 'livingDining') return 'living'
  if (roomId === 'mainBedroom' || roomId === 'bedroom2' || roomId === 'bedroom3') return 'bedroom'
  if (roomId === 'kitchen') return 'kitchen'
  if (roomId === 'bath1' || roomId === 'bath2') return 'bath'
  return 'generic'
}

type Getter = (roles: ArrangeRole[]) => FurnitureItem[]

/** Place an item flush to `edge` at an explicit along-wall coordinate. */
function placeFlush(
  item: FurnitureItem,
  rect: Rect,
  edge: Edge,
  along: number,
  world: FurnitureItem[],
  ctx: Ctx,
  gap: number = CLEARANCE.wallGap,
): FurnitureItem {
  const def = ctx.catalog[item.defId]
  if (!def) return item
  const { d } = baseFootprint(item, def)
  const perpHalf = d / 2
  // Same correction as `snapToWall`. BOTH paths need it: the kitchen
  // work-triangle comes through here (`arrangeKitchen`'s `toEnd`), and all eight
  // of the 0.32 m fridges and stoves take this path, not that one.
  const out = edgeShortfall(rect, edge, ctx.walls)
  let pos: [number, number]
  if (edge === 'N') pos = [along, rect.z0 + perpHalf + gap - out]
  else if (edge === 'S') pos = [along, rect.z1 - perpHalf - gap + out]
  else if (edge === 'W') pos = [rect.x0 + perpHalf + gap - out, along]
  else pos = [rect.x1 - perpHalf - gap + out, along]
  return tryPlace(item, pos, inward(edge), world, ctx)
}

/** Corners of the rect, slightly inset, for tucking accents. */
/** Last-resort placement within ONE rect: corners, then a coarse grid sweep,
 *  then a finer sweep, each across a few rotations. Returns `true` once
 *  placed. */
/**
 * SETTLE-CONTAINMENT (v0.31.9.22) — does this candidate keep the piece's
 * FOOTPRINT inside the room?
 *
 * `settleInRect` bounds the item's CENTRE to `rect` inset 0.3 and never looked
 * at its extent, which is the v0.31.5.112 defect ("`tryPlace` has no notion of
 * the room rectangle") in the one place that never got the guard. A 1.90 m deep
 * `bed-single` centred at z 5.62 in a rect ending at 6.08 passes the centre
 * test and puts 0.49 m of bed out through the south side of the bedroom.
 *
 * Measured over the 19 templates, **12 pieces overhang their room by more than
 * `TOL`** — up to 0.60 m of `tpl-condo-penthouse`'s TV console.
 *
 * `TOL` is 0.2 for the reason the chair-slot guard uses the same number: room
 * rects sit 0.1-0.2 m inside their wall centrelines, so a few centimetres past
 * an edge is still within the room's own walls, while half a metre is
 * demonstrably on the floor next door.
 */
const SETTLE_TOL = 0.2

function settleContained(
  item: FurnitureItem,
  pos: [number, number],
  rot: number,
  rect: Rect,
  ctx: Ctx,
): boolean {
  const def = ctx.catalog[item.defId]
  if (!def) return true
  const { w, d } = baseFootprint(item, def)
  // Axis-aligned rotations only (the settle tries exactly those four), so the
  // half-extents just swap on the quarter turns.
  const quarter = Math.abs(Math.cos(rot)) < 0.5
  const hx = (quarter ? d : w) / 2
  const hz = (quarter ? w : d) / 2
  return (
    pos[0] - hx >= rect.x0 - SETTLE_TOL &&
    pos[0] + hx <= rect.x1 + SETTLE_TOL &&
    pos[1] - hz >= rect.z0 - SETTLE_TOL &&
    pos[1] + hz <= rect.z1 + SETTLE_TOL
  )
}

function settleInRect(item: FurnitureItem, rect: Rect, world: FurnitureItem[], ctx: Ctx): boolean {
  // CONTAINMENT IS DELIBERATELY *NOT* APPLIED HERE YET (v0.31.9.22).
  //
  // `settleContained` above is the right predicate for this function too — the
  // settle bounds the item's CENTRE to `rect` inset 0.3 and never looks at its
  // extent, which is where 5 of the corpus's 12 room overhangs come from,
  // including 0.60 m of `tpl-condo-penthouse`'s TV console. Applying it here was
  // built and measured: **overhang 12 -> 7**, with the same two-pass shape used
  // elsewhere so nothing can be left unplaced.
  //
  // It is held back because it strands dining chairs. Skipping the
  // previously-first candidate makes the scan land on a different cell, and two
  // of `tpl-hdb-maisonette`'s chairs settled 1.62 m and **4.21 m** from their
  // table — precisely what `diningChairTuck.test.ts` exists to catch, and a
  // defect a user SEES against overhangs a check reports. Ordering the grid
  // NEAREST-FIRST instead of from the rect's north-west corner was tried in the
  // same session and does not fix it (one chair still settles 4.88 m out), so
  // the cause is upstream of the scan order: a chair that reaches the settle can
  // start OUTSIDE the rect being searched, and "nearest" is then measured from
  // the wrong place. That needs its own release.
  return settlePass(item, rect, world, ctx, () => true)
}

function settlePass(
  item: FurnitureItem,
  rect: Rect,
  world: FurnitureItem[],
  ctx: Ctx,
  ok: (pos: [number, number], rot: number) => boolean,
): boolean {
  for (const c of cornersOf(rect))
    if (ok(c, item.rotation) && tryPlace(item, c, item.rotation, world, ctx) !== item) return true
  const rots = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
  for (const rot of rots) {
    const step = 0.3
    for (let x = rect.x0 + 0.3; x <= rect.x1 - 0.3; x += step) {
      for (let z = rect.z0 + 0.3; z <= rect.z1 - 0.3; z += step) {
        if (ok([x, z], rot) && tryPlace(item, [x, z], rot, world, ctx) !== item) return true
      }
    }
  }
  // Finer last-resort pass (RM3): the coarse 0.3 m grid can straddle a real
  // but NARROW gap between two obstacles (e.g. a corner accent squeezed
  // between a rerolled bed and an already-placed plant) without ever
  // sampling a point actually inside it. Only reached when everything above
  // fails — rare — so the extra density is worth the cost.
  const fineStep = 0.05
  for (const rot of rots) {
    for (let x = rect.x0 + 0.3; x <= rect.x1 - 0.3; x += fineStep) {
      for (let z = rect.z0 + 0.3; z <= rect.z1 - 0.3; z += fineStep) {
        if (ok([x, z], rot) && tryPlace(item, [x, z], rot, world, ctx) !== item) return true
      }
    }
  }
  return false
}

/** Last-resort placement: original transform, then corners/grid/fine sweeps
 *  across `rect` — and, if given, the room's EXTENSION rect too (RM: an
 *  L-shaped room's sub-wing, e.g. livingDining's entrance foyer / kitchen's
 *  east strip, isn't covered by the tuned arranger's main `rect`; without
 *  this an item that starts there and goes invalid — e.g. a stale default
 *  too close to a wall after a floor-plan edit — had NO fallback at all and
 *  stayed invalid). Pushes the item into `world` wherever it first fits
 *  (leaves it out only if nothing fits anywhere). */
function settle(
  item: FurnitureItem,
  rect: Rect,
  world: FurnitureItem[],
  ctx: Ctx,
  extensionRect?: Rect,
) {
  if (tryPlace(item, item.position, item.rotation, world, ctx) !== item) return
  if (settleInRect(item, rect, world, ctx)) return
  if (extensionRect && settleInRect(item, extensionRect, world, ctx)) return
}

/**
 * Place a dining table and return where it ACTUALLY ended up.
 *
 * DINING-PHANTOM (v0.31.5.111): `tryPlace` signals failure by returning the
 * item UNCHANGED and leaving `world` untouched, so its return value is the
 * table's pre-placement position whenever the ideal spot is blocked. Both
 * dining routines then slotted the chairs around that phantom position — and
 * `arrangeCore`'s safety settle moved the table somewhere else afterwards,
 * leaving the chairs stranded around a spot the table never occupied. Settling
 * the table HERE, before any chair is slotted, means the slots are always
 * measured from its final transform.
 */
function placeDiningTable(
  table: FurnitureItem,
  pos: [number, number],
  rot: number,
  rect: Rect,
  world: FurnitureItem[],
  ctx: Ctx,
): FurnitureItem {
  const placed = tryPlace(table, pos, rot, world, ctx)
  if (placed !== table) return placed
  settle(table, rect, world, ctx)
  return world.find((w) => w.id === table.id) ?? table
}

function tuckCorners(items: FurnitureItem[], rect: Rect, world: FurnitureItem[], ctx: Ctx) {
  for (const it of items) {
    const sorted = [...cornersOf(rect)].sort(
      (a, b) =>
        Math.hypot(a[0] - it.position[0], a[1] - it.position[1]) -
        Math.hypot(b[0] - it.position[0], b[1] - it.position[1]),
    )
    for (const c of sorted) if (tryPlace(it, c, it.rotation, world, ctx) !== it) break
  }
}

/**
 * Re-arrange the items in `roomId` and return the full updated item list.
 * Pure: input items are not mutated (copies are returned for moved items).
 * Strategy adapts to the room type (living / bedroom / generic).
 */
export function arrangeRoom(
  roomId: RoomId,
  allItems: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  doors: Record<string, { open: boolean }>,
  seed = 0,
): FurnitureItem[] {
  return arrangeCore({
    rect: usableRect(roomId),
    extensionRect: extensionRectOf(roomId),
    keepOut: [...(KEEPOUT[roomId] ?? []), ...DEFAULT_DOOR_APPROACH],
    windowKeepOut: DEFAULT_WINDOW_KEEPOUT,
    windows: DEFAULT_WINDOWS,
    doorPoints: DEFAULT_DOOR_POINTS,
    inRoom: (i) => {
      const r = roomOf(i.position)
      // A stale item outside every room (see `nearestRoomTo`) is claimed by
      // whichever room's pass it's nearest to, so it's never permanently
      // invisible to "Tidy" — only reached when `r` is null (the common,
      // in-room case short-circuits on the direct match).
      return r === roomId || (r === null && nearestRoomTo(i.position) === roomId)
    },
    kind: roomKind(roomId),
    focal: FOCAL[roomId],
    allItems,
    catalog,
    doors,
    seed,
  })
}

/** Shared arranger core: place every item matching `inRoom` within `rect`
 *  using the strategy for `kind`, against the other items as obstacles. */
function arrangeCore(opts: {
  rect: Rect
  /** The room's L-shape extension, inset (see `extensionRectOf`) — widens the
   *  safety-net `settle` fallback's search area for an item that starts in a
   *  sub-wing the tuned per-kind arranger doesn't target (e.g. an entrance
   *  foyer). Undefined for a plain rectangular room. */
  extensionRect?: Rect
  keepOut: Rect[]
  /** Window front-clearance rects (RM3) — see `Ctx.windowKeepOut`. */
  windowKeepOut?: WindowFrontRect[]
  /** World window centres (RM3 bedroom scoring + living focal inference). */
  windows?: Array<[number, number]>
  /** World door centres (RM3 bedroom foot-to-door scoring). */
  doorPoints?: Array<[number, number]>
  inRoom: (i: FurnitureItem) => boolean
  kind: RoomKind
  focal: Edge | undefined
  /** Use the edge-generic living arranger (custom plans) vs the tuned default. */
  genericLiving?: boolean
  /** Edge of `rect` a kitchen room adjoins (RM3 dining-adjacency bias, plan
   *  rooms only — undefined for the fixed default flat / no adjoining kitchen). */
  kitchenEdge?: Edge
  allItems: FurnitureItem[]
  catalog: Record<string, FurnitureDef>
  doors: Record<string, { open: boolean }>
  /** Custom-plan collision walls (omitted → fixed flat walls). */
  walls?: CollisionWall[]
  /** Layout-variant seed (LAYOUT-REROLL); default 0 = today's exact output. */
  seed?: number
}): FurnitureItem[] {
  const {
    rect,
    extensionRect,
    keepOut,
    windowKeepOut,
    windows,
    doorPoints,
    inRoom,
    kind,
    focal,
    genericLiving,
    kitchenEdge,
    allItems,
    catalog,
    doors,
    walls,
    seed = 0,
  } = opts
  const ctx: Ctx = { catalog, doors, keepOut, windowKeepOut, windows, doorPoints, walls, seed }
  const isFixed = (i: FurnitureItem) => {
    const r = roleOf(i.defId, catalog)
    return r === 'mounted' || r === 'ceiling' || i.locked === true
  }
  // `world` starts with the OTHER rooms' items + this room's FIXED pieces
  // (wall/ceiling mounts — aircon, range hood, sconces… — AND any user-LOCKED
  // item, which must stay exactly where the user left it), all kept at their
  // current transform as obstacles so floor furniture isn't parked under them.
  const world: FurnitureItem[] = allItems
    .filter((i) => !inRoom(i) || isFixed(i))
    .map((i) => ({ ...i }))
  // Movable room items are placed one-by-one so pending ones can't block.
  const roomItems = allItems.filter((i) => inRoom(i) && !isFixed(i)).map((i) => ({ ...i }))
  const get: Getter = (roles) => roomItems.filter((i) => roles.includes(roleOf(i.defId, catalog)))

  if (kind === 'living') {
    if (genericLiving) arrangeLivingAnyEdge(rect, focal, get, world, ctx, catalog, kitchenEdge)
    else arrangeLiving(rect, focal, get, world, ctx, catalog)
  } else if (kind === 'bedroom') arrangeBedroom(rect, get, world, ctx, catalog)
  else if (kind === 'kitchen') arrangeKitchen(rect, get, world, ctx, catalog)
  else if (kind === 'bath') arrangeFixtures(rect, get, world, ctx, catalog)
  else arrangeGeneric(rect, get, world, ctx)

  // Safety settle: any room item not yet placed (unhandled role or no slot)
  // gets a valid spot — original first, then corners, then a coarse grid —
  // so the result stays collision-free for floor items.
  const inWorld = new Set(world.map((w) => w.id))
  for (const it of roomItems) {
    if (inWorld.has(it.id)) continue
    if (roleOf(it.defId, catalog) === 'mounted' || roleOf(it.defId, catalog) === 'ceiling') continue
    settle(it, rect, world, ctx, extensionRect)
  }

  // Rebuild the full list in original order: a placed item takes its new
  // transform from `world`; an unplaced room item keeps its original transform.
  const byId = new Map(world.map((w) => [w.id, w]))
  return allItems.map((orig) => byId.get(orig.id) ?? orig)
}

/**
 * Place armchairs (RM3): group them with the sofa/coffee-table cluster —
 * flanking the sofa's placed position, angled at ~90° to it and facing the
 * coffee table's centre — so they read as a conversation nook instead of a
 * stray chair pushed against a wall. Falls back to the nearest free wall when
 * the grouped slot doesn't fit (`tryPlace` validates every candidate either
 * way, so this can never emit a colliding placement).
 */
function placeArmchairs(
  armchairs: FurnitureItem[],
  sofa: FurnitureItem | undefined,
  coffeeTable: FurnitureItem | undefined,
  rect: Rect,
  world: FurnitureItem[],
  ctx: Ctx,
  catalog: Record<string, FurnitureDef>,
) {
  if (armchairs.length === 0) return
  // Use the sofa/table's PLACED transform (already snapped in `world`), not
  // the original pre-arrange one.
  const sofaPlaced = sofa ? (world.find((w) => w.id === sofa.id) ?? sofa) : undefined
  const tablePlaced = coffeeTable
    ? (world.find((w) => w.id === coffeeTable.id) ?? coffeeTable)
    : undefined
  armchairs.forEach((ch, i) => {
    if (sofaPlaced && tablePlaced) {
      const sofaDef = catalog[sofaPlaced.defId]
      const sofaFp = sofaDef ? baseFootprint(sofaPlaced, sofaDef) : { w: 1.8, d: 0.9 }
      const chDef = catalog[ch.defId]
      const chFp = chDef ? baseFootprint(ch, chDef) : { w: 0.75, d: 0.8 }
      // Sofa's local +X ("right") in world (x,z): (cos, -sin).
      const rx = Math.cos(sofaPlaced.rotation)
      const rz = -Math.sin(sofaPlaced.rotation)
      // Alternate sides for a 2nd/3rd armchair; just past the sofa's own end,
      // room for the chair's own half-width.
      const side = i % 2 === 0 ? 1 : -1
      const off = sofaFp.w / 2 + chFp.w / 2 + 0.15
      const px = sofaPlaced.position[0] + rx * off * side
      const pz = sofaPlaced.position[1] + rz * off * side
      // Face the coffee table's centre (local +Z forward = (sin θ, cos θ)).
      const rot = Math.atan2(tablePlaced.position[0] - px, tablePlaced.position[1] - pz)
      if (tryPlace(ch, [px, pz], rot, world, ctx) !== ch) return
    }
    snapToWall(ch, rect, [nearestEdge(ch.position, rect)], world, ctx)
  })
}

/**
 * Edge-generic living/dining arranger (any focal wall, not just east). Used for
 * user-authored plans whose TV wall can face any direction. Places media flush
 * to the focal wall, seating flush to the opposite wall facing it, rug+coffee
 * between them, the dining set at the far end, accents to walls/corners.
 */
function arrangeLivingAnyEdge(
  rect: Rect,
  focal: Edge | undefined,
  get: Getter,
  world: FurnitureItem[],
  ctx: Ctx,
  catalog: Record<string, FurnitureDef>,
  kitchenEdge?: Edge,
) {
  const cx = (rect.x0 + rect.x1) / 2
  const cz = (rect.z0 + rect.z1) / 2
  const fpOf = (it: FurnitureItem) => baseFootprint(it, catalog[it.defId])

  const vertical = focal === 'E' || focal === 'W' // focal wall runs along Z
  const alongMin = vertical ? rect.z0 : rect.x0
  const alongMax = vertical ? rect.z1 : rect.x1
  const depthMin = vertical ? rect.x0 : rect.z0
  const depthMax = vertical ? rect.x1 : rect.z1
  const depthOf = (p: [number, number]) => (vertical ? p[0] : p[1])
  const alongOf = (p: [number, number]) => (vertical ? p[1] : p[0])
  const build = (along: number, depth: number): [number, number] =>
    vertical ? [depth, along] : [along, depth]
  const inSign = (e: Edge) => (e === 'E' || e === 'S' ? -1 : 1)

  const sofa = get(['seating'])[0]
  const alongCenter = sofa
    ? clamp(alongOf(sofa.position), alongMin + 1, alongMax - 1)
    : (alongMin + alongMax) / 2

  // 1. Media + TV + feature wall flush to the focal wall.
  let consoleFront: number | null = null
  if (focal) {
    const console = get(['mediaConsole'])[0]
    if (console) {
      const placed = placeFlush(console, rect, focal, alongCenter, world, ctx)
      if (placed !== console)
        consoleFront = depthOf(placed.position) + inSign(focal) * (fpOf(console).d / 2)
    }
    for (const m of get(['media', 'featureWall'])) {
      placeFlush(m, rect, focal, alongCenter, world, ctx, m.defId === 'feature-wall' ? 0.02 : 0.1)
    }
  }

  // 2. Seating flush to the opposite wall, facing the focal wall.
  let sofaFront: number | null = null
  if (sofa) {
    let placed: FurnitureItem | null = null
    if (focal) placed = placeFlush(sofa, rect, opposite(focal), alongCenter, world, ctx)
    if (placed && placed !== sofa)
      sofaFront = depthOf(placed.position) + inSign(opposite(focal!)) * (fpOf(sofa).d / 2)
    else snapToWall(sofa, rect, [nearestEdge(sofa.position, rect)], world, ctx)
  }

  // 3. Rug + coffee between sofa and media (long side parallel to the sofa).
  const depthMid =
    consoleFront != null && sofaFront != null
      ? (consoleFront + sofaFront) / 2
      : (depthMin + depthMax) / 2
  for (const rug of get(['rug'])) tryPlace(rug, build(alongCenter, depthMid), 0, world, ctx)
  for (const t of get(['lowTable'])) {
    const fp = fpOf(t)
    const rot = vertical ? (fp.w > fp.d ? Math.PI / 2 : 0) : fp.w > fp.d ? 0 : Math.PI / 2
    tryPlace(t, build(alongCenter, depthMid), rot, world, ctx)
  }

  // 4. Dining at the far end of the along axis; chairs on the two depth sides.
  const dining = get(['diningTable'])[0]
  if (dining) {
    const mid = (alongMin + alongMax) / 2
    const span = alongMax - alongMin
    // RM3: a dining set flows from the kitchen (SG norm — food comes straight
    // from the kitchen to the table). When this room adjoins a kitchen along
    // one of the two "along-axis end" walls (the ones perpendicular to the
    // focal wall — N/S when the focal wall runs along Z, else W/E), bias the
    // dining band toward THAT end. Otherwise fall back to the pre-existing
    // heuristic: opposite the lounge band.
    const alongMinEdge: Edge = vertical ? 'N' : 'W'
    const alongMaxEdge: Edge = vertical ? 'S' : 'E'
    const kitchenAlong =
      kitchenEdge === alongMinEdge ? alongMin : kitchenEdge === alongMaxEdge ? alongMax : null
    const diningAlong =
      kitchenAlong != null
        ? kitchenAlong === alongMin
          ? alongMin + span * 0.26
          : alongMax - span * 0.26
        : alongCenter < mid
          ? alongMax - span * 0.26
          : alongMin + span * 0.26
    const diningDepth = clamp((depthMin + depthMax) / 2, depthMin + 1, depthMax - 1)
    const fp0 = fpOf(dining)
    const tableRot = vertical ? (fp0.w > fp0.d ? Math.PI / 2 : 0) : fp0.w > fp0.d ? 0 : Math.PI / 2
    const placed = placeDiningTable(
      dining,
      build(diningAlong, diningDepth),
      tableRot,
      rect,
      world,
      ctx,
    )
    const fp = fpOf(placed)
    // Read the rotation BACK off the placed table: a settled fallback may have
    // turned it, and the chair-side extents below must follow the real one.
    const placedRot = placed.rotation
    const c = Math.abs(Math.cos(placedRot))
    const s = Math.abs(Math.sin(placedRot))
    const exAlong = vertical ? (s * fp.w + c * fp.d) / 2 : (c * fp.w + s * fp.d) / 2
    const exDepth = vertical ? (c * fp.w + s * fp.d) / 2 : (s * fp.w + c * fp.d) / 2
    const tAlong = alongOf(placed.position)
    const tDepth = depthOf(placed.position)
    const chairs = get(['diningChair'])
    const nA = Math.ceil(chairs.length / 2)
    const spread = (n: number, w: number) =>
      Array.from({ length: n }, (_, i) => (n === 1 ? 0 : -w / 2 + (w * i) / (n - 1)))
    const sideA = spread(nA, exAlong * 2 - 0.4)
    const sideB = spread(chairs.length - nA, exAlong * 2 - 0.4)
    const faceToward = (sign: number): number =>
      vertical ? (sign > 0 ? Math.PI / 2 : -Math.PI / 2) : sign > 0 ? 0 : Math.PI
    const slots: { pos: [number, number]; rot: number }[] = [
      ...sideA.map((off) => ({
        pos: build(tAlong + off, tDepth - (exDepth + 0.32)),
        rot: faceToward(1),
      })),
      ...sideB.map((off) => ({
        pos: build(tAlong + off, tDepth + (exDepth + 0.32)),
        rot: faceToward(-1),
      })),
    ]
    // The two ENDS are spare slots, not preferred ones. Without them a chair
    // whose long-side slot is blocked fails `tryPlace` and falls through to
    // `arrangeCore`'s room-wide safety settle, which grid-searches the WHOLE
    // room and can park it metres from its own table (measured: 7.6 m in
    // `tpl-hdb-5room`, 7.7 m in `tpl-hdb-3gen`).
    const endRot = vertical ? 0 : Math.PI / 2
    slots.push(
      { pos: build(tAlong - (exAlong + 0.32), tDepth), rot: endRot },
      { pos: build(tAlong + (exAlong + 0.32), tDepth), rot: endRot + Math.PI },
    )
    // A slot outside the room is not a slot. `tryPlace` only rejects walls,
    // collisions and keep-outs — it has no notion of the room rectangle, so on a
    // NARROW room (`cp-living` is 2.6 m wide, less than a 4-seat table plus
    // chairs on both sides) a slot can be physically valid yet stand on the
    // circulation floor beyond the room's open edge, on a different floor
    // finish. Measured in v0.31.5.111 before this guard: two penthouse chairs
    // 0.08 m and 0.52 m outside `cp-living`.
    // Room rects sit ~0.1-0.2 m inside their wall centrelines, so a slot a few
    // centimetres past an edge is still within the room's walls. Half that
    // margin is the point past which a chair is demonstrably on another floor.
    const TOL = 0.2
    const insideRoom = (p: [number, number]) =>
      p[0] >= rect.x0 - TOL &&
      p[0] <= rect.x1 + TOL &&
      p[1] >= rect.z0 - TOL &&
      p[1] <= rect.z1 + TOL
    const taken = new Set<number>()
    chairs.forEach((ch, i) => {
      // Preferred slot first, then any slot no other chair has claimed.
      for (const k of [i, ...slots.map((_, n) => n).filter((n) => n !== i)]) {
        const slot = slots[k]
        if (!slot || taken.has(k) || !insideRoom(slot.pos)) continue
        if (tryPlace(ch, slot.pos, slot.rot, world, ctx) !== ch) {
          taken.add(k)
          return
        }
      }
    })
  }

  // 5. Storage / desk / shoe / accents → walls + corners.
  for (const it of get(['storage', 'desk'])) {
    snapToWall(it, rect, [nearestEdge(it.position, rect), 'N', 'S', 'W', 'E'], world, ctx)
  }
  // A WFH desk in an open lounge gets its chair tucked in front of it.
  placeDeskChairs(get(['desk']), get(['deskChair']), rect, world, ctx)
  for (const it of get(['shoe'])) snapToWall(it, rect, [nearestEdge(it.position, rect)], world, ctx)
  tuckCorners(get(['plant', 'floorLamp', 'barCart']), rect, world, ctx)
  placeArmchairs(get(['armchair']), sofa, get(['lowTable'])[0], rect, world, ctx, catalog)
  void cx
  void cz
}

/** Living/dining: media on focal wall, seating facing it, coffee+rug centred,
 *  dining set in the secondary zone, storage flush, accents in corners. */
function arrangeLiving(
  rect: Rect,
  focal: Edge | undefined,
  get: Getter,
  world: FurnitureItem[],
  ctx: Ctx,
  catalog: Record<string, FurnitureDef>,
) {
  const cx = (rect.x0 + rect.x1) / 2
  const cz = (rect.z0 + rect.z1) / 2
  // The tuned lounge layout supports the focal (TV) wall on EITHER vertical
  // side — `fs` is the sign toward the focal wall along X: +1 when it's the
  // EAST wall, -1 when it's the WEST wall (RM: the default flat's east wall
  // now carries a 3.4 m window, so the TV/focal wall moved to the windowless
  // west side — B3/HS partitions). `focalX`/`oppX` are the focal and opposite
  // wall's X coordinate; every east-hardcoded offset below is expressed via
  // `fs` so it mirrors correctly for a west focal wall.
  const focalVertical = focal === 'E' || focal === 'W'
  const fs = focal === 'W' ? -1 : 1
  const focalX = fs > 0 ? rect.x1 : rect.x0
  const oppX = fs > 0 ? rect.x0 : rect.x1

  // 1. Media console + TV + feature wall + cove → focal wall (flush).
  let consoleFrontX = focalX // for placing seating opposite
  let consoleZ = cz
  if (focal) {
    const console = get(['mediaConsole'])[0]
    const seatingRef = get(['seating'])[0]
    // Seed 0 keeps today's lounge band (aligned to the sofa's current z, or a
    // default north band). A reroll (seed > 0) slides the whole lounge cluster
    // — console + sofa + coffee/rug — to a different band along the TV wall.
    consoleZ =
      ctx.seed > 0
        ? clamp(
            rect.z0 +
              (rect.z1 - rect.z0) * LIVING_LOUNGE_BANDS[ctx.seed % LIVING_LOUNGE_BANDS.length],
            rect.z0 + 1,
            rect.z1 - 1,
          )
        : seatingRef
          ? clamp(seatingRef.position[1], rect.z0 + 1, rect.z1 - 1)
          : rect.z0 + (rect.z1 - rect.z0) * 0.28
    if (console) {
      const def = catalog[console.defId]
      const d = def ? baseFootprint(console, def).d : 0.4
      snapToWall(console, rect, [focal], world, ctx)
      // shift to the seating z band (only if it actually got placed)
      const placedConsole = world.find((w) => w.id === console.id)
      if (placedConsole) {
        tryPlace(placedConsole, [focalX - fs * (d / 2 + 0.06), consoleZ], inward(focal), world, ctx)
        consoleFrontX = focalX - fs * (d + 0.06)
      }
    }
    for (const m of get(['media', 'featureWall'])) {
      const off = m.defId === 'feature-wall' ? 0.02 : 0.12
      tryPlace(m, [focalX - fs * off, consoleZ], inward(focal), world, ctx)
    }
  }

  // 2. Seating → face the focal wall, opposite side; else face room centre.
  const sofa = get(['seating'])[0]
  let sofaFrontX = oppX
  if (sofa && focalVertical) {
    const def = catalog[sofa.defId]
    const d = def ? baseFootprint(sofa, def).d : 0.9
    // Facing the focal wall: inward('W') = +PI/2 (facing E, focal on E);
    // inward('E') = -PI/2 (facing W, focal on W) — i.e. inward(opposite(focal)).
    const rot = inward(opposite(focal!))
    const placed = placeSeatingFacingFocal(sofa, rect, rot, fs, oppX, d, consoleZ, world, ctx)
    if (placed !== sofa) sofaFrontX = placed.position[0] + fs * (d / 2)
  } else if (sofa) {
    snapToWall(sofa, rect, [nearestEdge(sofa.position, rect)], world, ctx)
  }

  // 3. Low table + rug between sofa and console (long side parallel to sofa).
  const midX = focalVertical ? (sofaFrontX + consoleFrontX) / 2 : cx
  for (const rug of get(['rug'])) tryPlace(rug, [midX, consoleZ], 0, world, ctx)
  for (const t of get(['lowTable'])) {
    // A coffee table's long side should be parallel to the (N-S) sofa → rot 90°.
    const def = catalog[t.defId]
    const fp = def ? baseFootprint(t, def) : { w: 1, d: 1 }
    const rot = focalVertical && fp.w > fp.d ? Math.PI / 2 : 0
    tryPlace(t, [midX, consoleZ], rot, world, ctx)
  }

  // 4. Dining table + chairs → secondary zone (far half from the lounge).
  const dining = get(['diningTable'])[0]
  if (dining) {
    // Seed 0: dining in the far (south) half. Reroll: put the dining zone at
    // whichever end is OPPOSITE the (possibly-moved) lounge band, so the two
    // zones don't collide as the lounge slides around.
    const dz =
      ctx.seed > 0
        ? consoleZ < cz
          ? rect.z0 + (rect.z1 - rect.z0) * 0.8
          : rect.z0 + (rect.z1 - rect.z0) * 0.2
        : focalVertical
          ? rect.z0 + (rect.z1 - rect.z0) * 0.74
          : cz
    const dx = clamp(dining.position[0], rect.x0 + 1, rect.x1 - 1)
    const placed = placeDiningTable(dining, [dx, dz], 0, rect, world, ctx)
    const def = catalog[placed.defId]
    const fp = def ? baseFootprint(placed, def) : { w: 1.4, d: 0.85 }
    const chairs = get(['diningChair'])
    // Distribute: long (north/south) sides first, then ends.
    const slots: { pos: [number, number]; rot: number }[] = []
    const nNorth = Math.ceil(chairs.length / 2)
    const spread = (n: number, span: number) =>
      Array.from({ length: n }, (_, i) => (n === 1 ? 0 : -span / 2 + (span * i) / (n - 1)))
    const northXs = spread(nNorth, fp.w - 0.4)
    const southXs = spread(chairs.length - nNorth, fp.w - 0.4)
    for (const ox of northXs)
      slots.push({ pos: [placed.position[0] + ox, placed.position[1] - fp.d / 2 - 0.32], rot: 0 })
    for (const ox of southXs)
      slots.push({
        pos: [placed.position[0] + ox, placed.position[1] + fp.d / 2 + 0.32],
        rot: Math.PI,
      })
    chairs.forEach((ch, i) => {
      const slot = slots[i]
      if (slot) tryPlace(ch, slot.pos, slot.rot, world, ctx)
    })
  }

  // 5. Storage / desk / appliances → flush to nearest wall, facing in.
  for (const it of get(['storage', 'desk'])) {
    snapToWall(it, rect, [nearestEdge(it.position, rect), 'N', 'S', 'W', 'E'], world, ctx)
  }
  // A WFH desk in a living/dining room gets its chair tucked in front of it.
  placeDeskChairs(get(['desk']), get(['deskChair']), rect, world, ctx)
  for (const it of get(['shoe'])) snapToWall(it, rect, [nearestEdge(it.position, rect)], world, ctx)

  // 6. Plants + floor lamps + armchairs → corners / nearest wall.
  tuckCorners(get(['plant', 'floorLamp', 'barCart']), rect, world, ctx)
  placeArmchairs(get(['armchair']), sofa, get(['lowTable'])[0], rect, world, ctx, catalog)
  void cx
}

/**
 * Score each wall edge of `rect` as a headboard candidate for a bed of width
 * `bedW`, best (lowest score) first (RM3 — SG bedroom placement norms):
 *  - HARD-reject an edge whose span holds a window — a headboard shouldn't
 *    sit under/against a window when a windowless wall is available —
 *    UNLESS every edge has one, in which case the reject is dropped so a bed
 *    is never left without a candidate.
 *  - Penalise "foot-to-door": a door on the OPPOSITE wall whose along-span
 *    lines up with the bed's own width — the "bed foot points straight at
 *    the door" placement Singaporean placement guides (feng shui + plain
 *    practicality) advise against.
 *  - Penalise a cross-dimension too tight for `CLEARANCE.bedSurround` walking
 *    clearance on both long sides of the bed.
 * Ties fall back to the point-nearest edge (today's pre-RM3 behaviour), so a
 * bed with no distinguishing factor keeps its original wall. Deterministic:
 * the same room + bed position always sorts the same way.
 */
function scoreBedroomEdges(bed: FurnitureItem, rect: Rect, bedW: number, ctx: Ctx): Edge[] {
  const ALL: Edge[] = ['N', 'E', 'S', 'W']
  const alongFor = (e: Edge): number =>
    e === 'N' || e === 'S' ? (rect.x0 + rect.x1) / 2 : (rect.z0 + rect.z1) / 2
  const windows = ctx.windows ?? []
  const doors = ctx.doorPoints ?? []
  const windowed = (e: Edge) => edgeHasOpening(rect, windows, e)
  // A door on the OPPOSITE wall whose along-position lines up with the bed's
  // own width span (narrower than `edgeHasOpening`'s whole-wall tolerance —
  // this only cares about a door directly ahead of the bed's foot).
  const footToDoor = (e: Edge): boolean => {
    const opp = opposite(e)
    const along = alongFor(e)
    const halfW = bedW / 2 + 0.2
    const wallTol = 0.5
    return doors.some(([dx, dz]) => {
      if (opp === 'N') return Math.abs(dz - rect.z0) < wallTol && Math.abs(dx - along) < halfW
      if (opp === 'S') return Math.abs(dz - rect.z1) < wallTol && Math.abs(dx - along) < halfW
      if (opp === 'W') return Math.abs(dx - rect.x0) < wallTol && Math.abs(dz - along) < halfW
      return Math.abs(dx - rect.x1) < wallTol && Math.abs(dz - along) < halfW
    })
  }
  const sideClearance = (e: Edge): number => {
    const crossSpan = e === 'N' || e === 'S' ? rect.x1 - rect.x0 : rect.z1 - rect.z0
    return (crossSpan - bedW) / 2
  }
  const distToEdge = (e: Edge): number => {
    if (e === 'N') return bed.position[1] - rect.z0
    if (e === 'S') return rect.z1 - bed.position[1]
    if (e === 'W') return bed.position[0] - rect.x0
    return rect.x1 - bed.position[0]
  }
  const allWindowed = ALL.every(windowed)
  const score = (e: Edge): number => {
    let s = 0
    if (!allWindowed && windowed(e)) s += 1000 // hard reject unless it's every edge
    if (footToDoor(e)) s += 10
    const clearance = sideClearance(e)
    if (clearance < CLEARANCE.bedSurround) s += (CLEARANCE.bedSurround - clearance) * 5
    return s
  }
  return [...ALL].sort((a, b) => {
    const d = score(a) - score(b)
    return Math.abs(d) > 1e-9 ? d : distToEdge(a) - distToEdge(b)
  })
}

/**
 * Try to flush-place the bed's headboard along `edge`, centred at `along`
 * first; if that collides (most often a door's approach strip bleeding into
 * a short room — the door itself may be nowhere near the CENTRE of the wall)
 * nudge sideways along the same wall in increasing steps, alternating
 * direction, until a clear along-position is found or the wall's full run is
 * exhausted. `placeFlush` still validates every candidate, so this can only
 * ever return a collision-valid placement or the bed unchanged.
 */
function placeBedHeadboard(
  bed: FurnitureItem,
  rect: Rect,
  edge: Edge,
  along: number,
  bedW: number,
  world: FurnitureItem[],
  ctx: Ctx,
): FurnitureItem {
  const direct = placeFlush(bed, rect, edge, along, world, ctx)
  if (direct !== bed) return direct
  const alongMin = edge === 'N' || edge === 'S' ? rect.x0 : rect.z0
  const alongMax = edge === 'N' || edge === 'S' ? rect.x1 : rect.z1
  const reach = (alongMax - alongMin) / 2
  const step = 0.15
  for (let d = step; d <= reach; d += step) {
    for (const sign of [1, -1]) {
      const a = clamp(along + sign * d, alongMin + bedW / 2, alongMax - bedW / 2)
      const p = placeFlush(bed, rect, edge, a, world, ctx)
      if (p !== bed) return p
    }
  }
  return bed
}

/** Bedroom: bed centred & headboard flush to a wall, nightstands flanking,
 *  wardrobe/storage on another wall (door-swing clearance via collision),
 *  a foot-of-bed bench if it fits, accents in corners. */
function arrangeBedroom(
  rect: Rect,
  get: Getter,
  world: FurnitureItem[],
  ctx: Ctx,
  catalog: Record<string, FurnitureDef>,
) {
  const bed = get(['bed'])[0]
  let bedEdge: Edge = 'N'
  let bedAlong = (rect.x0 + rect.x1) / 2
  let bedW = 1.4
  let bedFootZ = rect.z1 // foot plane (for the bench)
  if (bed) {
    const def = catalog[bed.defId]
    const fp = def ? baseFootprint(bed, def) : { w: 1.4, d: 2.0 }
    bedW = fp.w
    // Headboard wall (RM3): candidate edges are SCORED — hard-reject a
    // windowed span, penalise foot-to-door + tight bedSurround clearance —
    // best first. Seed 0 tries the best-scoring edge first (a deterministic
    // improvement over the old "just the nearest wall"); a reroll (seed > 0)
    // rotates the SAME scored order so later seeds still prefer a better edge
    // over a worse one, cycling to a genuinely different (still valid —
    // `placeFlush` validates every candidate) headboard wall.
    const alongFor = (e: Edge): number =>
      e === 'N' || e === 'S' ? (rect.x0 + rect.x1) / 2 : (rect.z0 + rect.z1) / 2
    const scored = scoreBedroomEdges(bed, rect, bedW, ctx)
    const candidates = rotateEdges(scored, ctx.seed)
    bedEdge = scored[0]
    bedAlong = alongFor(scored[0])
    let placed = bed
    for (const e of candidates) {
      const p = placeBedHeadboard(bed, rect, e, alongFor(e), bedW, world, ctx)
      if (p !== bed) {
        bedEdge = e
        // The nudge fallback may have shifted the along-position off-centre —
        // read it back from where the bed actually landed, not the (possibly
        // blocked) centred candidate, so nightstands/rug/bench key off the
        // REAL headboard position.
        bedAlong = e === 'N' || e === 'S' ? p.position[0] : p.position[1]
        placed = p
        break
      }
    }
    // Foot plane = bed centre + half-length away from the headboard wall.
    const len = fp.d
    if (bedEdge === 'N') bedFootZ = placed.position[1] + len / 2
    else if (bedEdge === 'S') bedFootZ = placed.position[1] - len / 2

    // Nightstands flank the headboard along the same wall.
    const stands = get(['nightstand'])
    stands.forEach((ns, i) => {
      const nsDef = catalog[ns.defId]
      const nsW = nsDef ? baseFootprint(ns, nsDef).w : 0.45
      const side = i === 0 ? -1 : 1
      const along = bedAlong + side * (bedW / 2 + nsW / 2 + 0.05)
      placeFlush(ns, rect, bedEdge, along, world, ctx)
    })
  }

  // Wardrobe / storage / desk → a wall other than the headboard wall if it
  // fits there, else the nearest wall. Collision enforces door-swing gaps.
  const otherEdges: Edge[] = (['S', 'W', 'E', 'N'] as Edge[]).filter((e) => e !== bedEdge)
  for (const it of get(['storage', 'desk'])) {
    snapToWall(it, rect, [...otherEdges, bedEdge], world, ctx)
  }
  // Additional beds / cribs (e.g. a cot in the parents' room) snap to a free
  // wall — they aren't the primary bed so they read as a secondary sleeping
  // station against the perimeter.
  for (const extra of get(['bed']).slice(1)) {
    snapToWall(extra, rect, [...otherEdges, bedEdge], world, ctx)
  }
  placeDeskChairs(get(['desk']), get(['deskChair']), rect, world, ctx)

  // Rug: centred under the lower half of the bed, extending toward the foot
  // (noClip, so it always places — it just sits under everything).
  for (const rug of get(['rug'])) {
    if (bedEdge === 'N' || bedEdge === 'S') {
      const rz = bedEdge === 'N' ? bedFootZ - 0.4 : bedFootZ + 0.4
      tryPlace(rug, [bedAlong, rz], 0, world, ctx)
    } else {
      tryPlace(rug, [(rect.x0 + rect.x1) / 2, bedAlong], 0, world, ctx)
    }
  }

  // Foot-of-bed bench, centred at the foot if there's room.
  for (const b of get(['lowTable'])) {
    if (bedEdge === 'N' || bedEdge === 'S') {
      const bz = bedEdge === 'N' ? bedFootZ + 0.25 : bedFootZ - 0.25
      if (tryPlace(b, [bedAlong, bz], 0, world, ctx) !== b) continue
    }
    snapToWall(b, rect, [nearestEdge(b.position, rect)], world, ctx)
  }

  tuckCorners(get(['plant', 'floorLamp', 'barCart']), rect, world, ctx)
}

/** Place each desk chair just in front of its nearest desk, facing it (so a
 *  study nook reads as a set rather than a chair stranded against a wall). */
function placeDeskChairs(
  desks: FurnitureItem[],
  chairs: FurnitureItem[],
  rect: Rect,
  world: FurnitureItem[],
  ctx: Ctx,
) {
  for (const ch of chairs) {
    // Use the desk's PLACED transform from `world` where available.
    let best: FurnitureItem | undefined
    let bestD = Infinity
    for (const d of desks) {
      const placed = world.find((w) => w.id === d.id) ?? d
      const dist = Math.hypot(
        placed.position[0] - ch.position[0],
        placed.position[1] - ch.position[1],
      )
      if (dist < bestD) {
        bestD = dist
        best = placed
      }
    }
    if (best) {
      // Offset from the desk centre to its front face plus the chair's own
      // half-depth (+ a small gap) so the chair sits in front rather than
      // overlapping the desk (which a fixed offset did, failing collision and
      // stranding the chair against a wall).
      const deskDef = ctx.catalog[best.defId]
      const chairDef = ctx.catalog[ch.defId]
      const deskHalf = deskDef ? baseFootprint(best, deskDef).d / 2 : 0.35
      const chairHalf = chairDef ? baseFootprint(ch, chairDef).d / 2 : 0.3
      const off = deskHalf + chairHalf + 0.04
      const f: [number, number] = [Math.sin(best.rotation), Math.cos(best.rotation)]
      const pos: [number, number] = [best.position[0] + f[0] * off, best.position[1] + f[1] * off]
      if (tryPlace(ch, pos, best.rotation + Math.PI, world, ctx) !== ch) continue
    }
    snapToWall(ch, rect, [nearestEdge(ch.position, rect)], world, ctx)
  }
}

/** Generic (kitchen / bathroom / utility): push wall-backed pieces flush to
 *  their nearest wall facing in, tuck accents into corners. */
function arrangeGeneric(rect: Rect, get: Getter, world: FurnitureItem[], ctx: Ctx) {
  for (const it of get(['storage', 'desk', 'bed', 'mediaConsole', 'shoe'])) {
    snapToWall(it, rect, [nearestEdge(it.position, rect), 'N', 'S', 'W', 'E'], world, ctx)
  }
  placeDeskChairs(get(['desk']), get(['deskChair']), rect, world, ctx)
  for (const it of get(['seating', 'armchair', 'diningChair'])) {
    snapToWall(it, rect, [nearestEdge(it.position, rect)], world, ctx)
  }
  tuckCorners(get(['plant', 'floorLamp', 'barCart']), rect, world, ctx)
}

/** Kitchen: a work-triangle layout. The counter run + other big fixtures go
 *  flush to walls (largest first), then the **fridge and stove are biased to
 *  opposite ends of the longest wall run**, leaving the sink (mid-counter)
 *  between them — the classic refrigerator → sink → range work triangle, so the
 *  two heat/cold appliances aren't crammed side-by-side. Door swings stay clear
 *  via ctx.keepOut. Falls back to a plain wall-snap if an end slot is taken. */
function arrangeKitchen(
  rect: Rect,
  get: Getter,
  world: FurnitureItem[],
  ctx: Ctx,
  catalog: Record<string, FurnitureDef>,
) {
  const fixtures = get(['storage', 'other', 'shoe', 'lowTable'])
  const isFridge = (it: FurnitureItem) => it.defId === 'refrigerator'
  const isStove = (it: FurnitureItem) => it.defId === 'stove'
  const area = (it: FurnitureItem) => {
    const def = catalog[it.defId]
    if (!def) return 0
    const { w, d } = baseFootprint(it, def)
    return w * d
  }

  // 1. Counters + remaining big fixtures flush to their nearest wall, biggest
  //    first so the counter run claims the longest wall.
  const big = fixtures
    .filter((it) => !isFridge(it) && !isStove(it))
    .sort((a, b) => area(b) - area(a))
  for (const it of big) {
    snapToWall(it, rect, [nearestEdge(it.position, rect), 'N', 'S', 'W', 'E'], world, ctx)
  }

  // 2. Work triangle: push the fridge to one end of the longest run and the
  //    stove to the other, on a long wall.
  const horizontal = rect.x1 - rect.x0 >= rect.z1 - rect.z0
  // WALL-BACKED-EDGE, kitchen half (v0.31.8.76). The work triangle picked its
  // two candidate walls from the rect's ASPECT alone, so a fridge or stove could
  // take the long edge that has no wall behind it while a walled one went spare:
  // `tpl-condo-1bed`'s Open Kitchen is flush on S and W and 0.49-0.67 m from any
  // wall on N and E, and its stove sat on N; `tpl-hdb-2room`'s is flush on N and
  // E and its stove sat on S, 0.77 m from anything. A stove needs a wall for its
  // hood and flue. Wall-backed first, aspect preserved as the tie-break — a
  // preference, and both edges are still tried.
  const aspect: Edge[] = horizontal ? ['S', 'N'] : ['W', 'E']
  const backedEdge = (e: Edge) => edgeHasWall(rect, e, ctx.walls)
  const longWalls: Edge[] = [...aspect.filter(backedEdge), ...aspect.filter((e) => !backedEdge(e))]
  const M = 0.4 // end margin
  const toEnd = (it: FurnitureItem | undefined, low: boolean) => {
    if (!it) return
    const def = catalog[it.defId]
    if (!def) return
    const half = baseFootprint(it, def).w / 2
    const along = horizontal
      ? low
        ? rect.x0 + M + half
        : rect.x1 - M - half
      : low
        ? rect.z0 + M + half
        : rect.z1 - M - half
    for (const e of longWalls) {
      if (placeFlush(it, rect, e, along, world, ctx) !== it) return
    }
    // Couldn't take the end slot (counter there) → any free wall.
    snapToWall(it, rect, [nearestEdge(it.position, rect), 'N', 'S', 'W', 'E'], world, ctx)
  }
  toEnd(fixtures.find(isFridge), true)
  toEnd(fixtures.find(isStove), false)

  tuckCorners(get(['plant', 'floorLamp']), rect, world, ctx)
}

/** Bathroom: line the fixtures along the walls. These rooms' pieces (toilet,
 *  basin, shower, bathtub) are category 'bathroom' → role 'other'/'storage',
 *  and we want them flush to a wall facing in, not merely settled where they
 *  were. Largest fixtures claim wall space first (the shower / bathtub), so the
 *  smaller ones (toilet, basin) fill the rest; door swings stay clear. */
function arrangeFixtures(
  rect: Rect,
  get: Getter,
  world: FurnitureItem[],
  ctx: Ctx,
  catalog: Record<string, FurnitureDef>,
) {
  const fixtures = get(['storage', 'other', 'shoe', 'lowTable'])
  const area = (it: FurnitureItem) => {
    const def = catalog[it.defId]
    if (!def) return 0
    const { w, d } = baseFootprint(it, def)
    return w * d
  }
  // Biggest first so the counter run / shower take their wall before the rest.
  fixtures.sort((a, b) => area(b) - area(a))
  for (const it of fixtures) {
    snapToWall(it, rect, [nearestEdge(it.position, rect), 'N', 'S', 'W', 'E'], world, ctx)
  }
  tuckCorners(get(['plant', 'floorLamp']), rect, world, ctx)
}

/** Rooms the "Tidy home" action arranges (every furnished interior room;
 *  skips the corridor passage and the external AC ledge). */
const ARRANGEABLE_ROOMS: RoomId[] = [
  'livingDining',
  'mainBedroom',
  'bedroom2',
  'bedroom3',
  'kitchen',
  'bath1',
  'bath2',
  'householdShelter',
  'serviceYard',
]

/** Arrange every room in turn, threading each result into the next. */
export function arrangeAllRooms(
  allItems: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  doors: Record<string, { open: boolean }>,
): FurnitureItem[] {
  return ARRANGEABLE_ROOMS.reduce(
    (items, room) => arrangeRoom(room, items, catalog, doors),
    allItems,
  )
}

// ── User-authored floor plans ──────────────────────────────────────────────

/** Is a point inside a plan room (polygon-aware: explicit polygon, else the
 *  main rect + its L-shape extension)? */
function pointInPlanRoom(r: PlanRoom, x: number, z: number): boolean {
  return pointInRoom(r, x, z)
}

/** A plan room's raw origin/width/depth rect (main rectangle only — no
 *  polygon/extension; adjacency only needs to know which perimeter WALL a
 *  neighbour shares, and every room has a rectangular main body). */
function rawRoomRect(r: PlanRoom): Rect {
  return { x0: r.origin[0], z0: r.origin[1], x1: r.origin[0] + r.width, z1: r.origin[1] + r.depth }
}

/** Which edge of `room`'s rect a KITCHEN room among `siblingRooms` shares a
 *  boundary with (RM3 dining-adjacency bias) — the two rects overlap on the
 *  cross axis and their edges sit within a wall-thickness tolerance of each
 *  other. Returns null when no kitchen adjoins (a kitchen elsewhere in the
 *  plan, an open-kitchen layout, or a plan with no kitchen at all). */
function kitchenAdjacentEdge(room: PlanRoom, siblingRooms: PlanRoom[]): Edge | undefined {
  const a = rawRoomRect(room)
  const tol = 0.4 // generous enough to span a partition wall's thickness
  for (const other of siblingRooms) {
    if (other.id === room.id) continue
    if (roomCategory(other) !== 'kitchen') continue
    const b = rawRoomRect(other)
    const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
    const overlapZ = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0)
    if (overlapX > 0.3 && Math.abs(a.z0 - b.z1) < tol) return 'N'
    if (overlapX > 0.3 && Math.abs(a.z1 - b.z0) < tol) return 'S'
    if (overlapZ > 0.3 && Math.abs(a.x0 - b.x1) < tol) return 'W'
    if (overlapZ > 0.3 && Math.abs(a.x1 - b.x0) < tol) return 'E'
  }
  return undefined
}

/** Classify a custom room from the items currently in it. */
/**
 * Classify a custom-plan room from its **name** (a strong, explicit signal the
 * user gave) — case-insensitive keyword match. Returns null when nothing matches
 * so the caller can fall back to inferring from contents. Lets custom plans use
 * the kitchen work-triangle + bath-fixture arrangers, which item-inference alone
 * (bed/seating only) never reaches.
 */
export function roomKindFromName(name: string | undefined): RoomKind | null {
  if (!name) return null
  const n = name.toLowerCase()
  if (/\b(kitchen|kitchenette|pantry)\b/.test(n)) return 'kitchen'
  if (/(bath|\bwc\b|toilet|powder|en-?suite|shower)/.test(n)) return 'bath'
  if (/(bed\s?room|\bbed\b|master|nursery|guest)/.test(n)) return 'bedroom'
  if (/(living|dining|lounge|family\s?room|great\s?room)/.test(n)) return 'living'
  return null
}

function roomKindFromItems(
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  name?: string,
  category?: PlanRoom['category'],
): RoomKind {
  // Explicit room category (RM1) wins over name, which wins over content
  // inference — a renamed room ("Ella's room") with an explicit category
  // still arranges with the right strategy.
  if (category) return toArrangeKind(category)
  const byName = roomKindFromName(name)
  if (byName) return byName
  const roles = new Set(items.map((i) => roleOf(i.defId, catalog)))
  if (roles.has('bed')) return 'bedroom'
  if (roles.has('seating') || roles.has('media') || roles.has('mediaConsole')) return 'living'
  return 'generic'
}

/** World centre of every opening of `kind` in the plan. */
function openingCentres(plan: FloorPlan, kind: 'window' | 'door'): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  for (const o of plan.openings) {
    if (o.kind !== kind) continue
    const wall = plan.walls.find((w) => w.id === o.wallId)
    if (!wall) continue
    const len = wallLength(wall)
    if (len === 0) continue
    const ux = (wall.end[0] - wall.start[0]) / len
    const uz = (wall.end[1] - wall.start[1]) / len
    pts.push([
      wall.start[0] + ux * (o.offset + o.width / 2),
      wall.start[1] + uz * (o.offset + o.width / 2),
    ])
  }
  return pts
}

/** World centre of a window opening (for focal-wall inference + bedroom
 *  headboard scoring). */
function windowCentres(plan: FloorPlan): Array<[number, number]> {
  return openingCentres(plan, 'window')
}

/** World centre of a door opening (for bedroom foot-to-door scoring). */
function doorCentres(plan: FloorPlan): Array<[number, number]> {
  return openingCentres(plan, 'door')
}

/** Pick a windowless edge of `rect` for a TV/media wall (prefer E, N, S, W).
 *  A reroll (`seed > 0`) picks the seed-th windowless edge instead of always
 *  the first, so a custom-plan lounge faces a different wall each variant;
 *  seed 0 returns the first windowless edge (identical to before). */
function inferFocal(rect: Rect, windows: Array<[number, number]>, seed = 0): Edge | undefined {
  const windowless = (['E', 'N', 'S', 'W'] as Edge[]).filter(
    (e) => !edgeHasOpening(rect, windows, e),
  )
  if (windowless.length === 0) return undefined
  return windowless[seed % windowless.length]
}

/** Does an edge of `rect` have an opening (window/door) point on it, within a
 *  tolerance? Shared by the living-room focal-wall inference above and the
 *  bedroom headboard-edge scoring below. */
function edgeHasOpening(
  rect: Rect,
  points: Array<[number, number]>,
  edge: Edge,
  tol = 0.5,
): boolean {
  return points.some(([px, pz]) => {
    if (edge === 'N')
      return Math.abs(pz - rect.z0) < tol && px > rect.x0 - tol && px < rect.x1 + tol
    if (edge === 'S')
      return Math.abs(pz - rect.z1) < tol && px > rect.x0 - tol && px < rect.x1 + tol
    if (edge === 'W')
      return Math.abs(px - rect.x0) < tol && pz > rect.z0 - tol && pz < rect.z1 + tol
    return Math.abs(px - rect.x1) < tol && pz > rect.z0 - tol && pz < rect.z1 + tol
  })
}

/** Arrange a single custom-plan room (shared by the per-room "Tidy" + the
 *  whole-plan "Tidy home"). `keepOut`/`windows`/`walls` are precomputed so the
 *  whole-plan loop builds them once. `levelId` is the storey the room sits on —
 *  the `inRoom` predicate gates on it (F13) so an item directly above/below this
 *  room on another storey (a `duplicateLevel` clone shares the same x/z) is not
 *  dragged against this storey's geometry. */
function arrangeOnePlanRoom(
  room: PlanRoom,
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  doors: Record<string, { open: boolean }>,
  keepOut: Rect[],
  windows: Array<[number, number]>,
  walls: CollisionWall[],
  levelId: string = GROUND_LEVEL_ID,
  seed = 0,
  windowKeepOut: WindowFrontRect[] = [],
  doorPoints: Array<[number, number]> = [],
  siblingRooms: PlanRoom[] = [],
): FurnitureItem[] {
  const inRoom = (i: FurnitureItem) =>
    (i.levelId ?? GROUND_LEVEL_ID) === levelId &&
    pointInPlanRoom(room, i.position[0], i.position[1])
  if (!items.some(inRoom)) return items
  const rect = planRoomRect(room)
  const kind = roomKindFromItems(items.filter(inRoom), catalog, room.name, room.category)
  return arrangeCore({
    rect,
    keepOut,
    windowKeepOut,
    windows,
    doorPoints,
    inRoom,
    kind,
    // Custom living rooms use the edge-generic arranger, facing seating to a
    // windowless wall in whatever direction it lies.
    focal: kind === 'living' ? inferFocal(rect, windows, seed) : undefined,
    genericLiving: true,
    // Dining-band bias toward a kitchen adjoining this room (RM3).
    kitchenEdge: kind === 'living' ? kitchenAdjacentEdge(room, siblingRooms) : undefined,
    allItems: items,
    catalog,
    doors,
    walls,
    seed,
  })
}

/**
 * Tidy ONE room of a user-authored floor plan (the per-room "Tidy up room" in a
 * custom plan). `arrangeRoom` can't be used here — it's keyed on the fixed
 * apartment's `RoomId` tables and throws on an arbitrary plan room id.
 */
export function arrangePlanRoom(
  plan: FloorPlan,
  roomId: string,
  allItems: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  doors: Record<string, { open: boolean }>,
  seed = 0,
): FurnitureItem[] {
  // Resolve the room across ALL storeys (room ids are plan-unique): on a
  // multi-storey plan an upper-floor room id is absent from `plan.rooms`
  // (ground only), so look it up via its level (F13). Build that level's own
  // geometry so an upper room arranges against its own walls/windows/door-swings.
  const level = levelOfRoom(plan, roomId)
  if (!level) return allItems
  const room = level.rooms.find((r) => r.id === roomId)
  if (!room) return allItems
  const lp = levelAsPlan(plan, level)
  return arrangeOnePlanRoom(
    room,
    allItems,
    catalog,
    doors,
    [...doorSwingRects(lp), ...doorApproachRects(lp)],
    windowCentres(lp),
    planCollisionWalls(lp, doors),
    level.id,
    seed,
    windowFrontRects(lp),
    doorCentres(lp),
    level.rooms,
  )
}

/**
 * Tidy a user-authored floor plan: arrange each plan room with the room-type
 * strategy (inferred from its contents), keeping clear of every door swing.
 * Used by "Tidy home" when a non-default plan is active.
 */
export function arrangeAllRoomsForPlan(
  plan: FloorPlan,
  allItems: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  doors: Record<string, { open: boolean }>,
  /** Layout-variant seed (LAYOUT-REROLL), forwarded to every room. `0` — the
   *  default — reproduces the previous output exactly; a non-zero seed rotates
   *  each piece's edge-candidate list, so the same furniture lands against
   *  different walls. This is what lets a caller generate genuinely different
   *  LAYOUTS of one plan rather than restyled copies of one layout. */
  seed = 0,
): FurnitureItem[] {
  let items = allItems
  // Iterate EVERY storey (F13): `plan.rooms`/`walls`/`openings` are ground-only,
  // so a multi-storey plan must arrange each level's rooms against that level's
  // own geometry. `levelAsPlan` returns the plan itself for a single-storey plan
  // (common case) → identical output to the old ground-only loop.
  for (const level of planLevels(plan)) {
    const lp = levelAsPlan(plan, level)
    const keepOut = [...doorSwingRects(lp), ...doorApproachRects(lp)]
    const windows = windowCentres(lp)
    const windowKeepOut = windowFrontRects(lp)
    const doorPoints = doorCentres(lp)
    // Collide against this level's own walls, not the fixed flat's or ground's.
    const walls = planCollisionWalls(lp, doors)
    for (const room of level.rooms) {
      items = arrangeOnePlanRoom(
        room,
        items,
        catalog,
        doors,
        keepOut,
        windows,
        walls,
        level.id,
        seed,
        windowKeepOut,
        doorPoints,
        level.rooms,
      )
    }
  }
  return items
}
