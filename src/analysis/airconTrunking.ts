/**
 * Aircon refrigerant-trunking route visualizer (BSJ-2 follow-up) — turns the
 * SYSTEM planner's per-room FCU + condenser placements (or, before anything is
 * placed, its proposal — mirroring how `renovationAllocator.ts`'s aircon line
 * falls back to `buildAirconSystemPlan` before any `aircon-unit` exists) into a
 * modeled 3D route: an orthogonal (axis-aligned) polyline per FCU, running at
 * ceiling height from the condenser out to the served room, through door
 * openings (never through a wall).
 *
 * ROUTER DESIGN (deliberately simple — correctness over optimality):
 *  1. Build a room-adjacency graph over FOUR link classes — a door-only graph
 *     is insufficient on real plans (probe-caught 2026-07-24 on the shipped
 *     default flat: the AC ledge has NO doors, and the living/corridor/kitchen
 *     open-plan boundary has none either, so every run came back unresolved):
 *       a. **Door links** (`doorLinks`) — `planRoomShell`'s per-room openings,
 *          filtered to `kind === 'door'`; two rooms are adjacent when a door's
 *          world-space centre lands inside both rooms' footprints (the shared
 *          threshold point IS the crossing waypoint).
 *       b. **Wall-drill links** (`wallDrillLinks`) — a condenser room with NO
 *          door links at all (the AC ledge/yard: refrigerant lines exit via a
 *          core-drilled wall, not a door) gets an edge to every room sharing a
 *          boundary span with it (footprint edges touching, overlap ≥0.3 m);
 *          the crossing point is the point on the shared span NEAREST the
 *          condenser — that's where an installer actually drills.
 *       c. **Open-plan gap links** (`gapLinks`) — two rooms whose footprints
 *          share a boundary span with an UNCOVERED gap ≥0.6 m along it (no
 *          wall segment spans that stretch — an open-plan living/dining/
 *          kitchen knock-through) get an edge at the gap's midpoint. Computed
 *          per shared axis-aligned edge: the overlap interval on that line,
 *          minus the projections of every plan wall lying on it (± half wall
 *          thickness), keeping the largest uncovered sub-interval.
 *       d. **Overlap links** (`overlapLinks`) — real plans also express some
 *          open-plan boundaries as room footprints that genuinely OVERLAP
 *          rather than touch (the shipped flat's living/dining rect overlaps
 *          the corridor rect by ~0.76 m, so no edge pair is ever within the
 *          touch epsilon); two rooms whose rect decompositions intersect
 *          ≥0.3 m on both axes with NO plan wall running through the
 *          intersection are openly connected at the intersection's centre.
 *     The three edge-based link classes use each room's TRUE axis-aligned outline edges
 *     (`roomEdges`, over `roomPolygon` — the rectilinear union for a rect/L
 *     room, or the room's own authored polygon) for the boundary-span math,
 *     NOT a bounding-box approximation: an L/polygon room's bbox can overlap
 *     an unrelated neighbour's rect while its TRUE shared edge only touches a
 *     different room entirely (probe-caught 2026-07-24 on the shipped
 *     default flat's L-shaped `livingDining`, whose bbox overlapped
 *     `bedroom3` and `corridor` but whose real edges only bordered the
 *     actual corridor). A polygon room's non-axis-aligned edge is skipped
 *     (this router only draws Manhattan routes) — a documented limitation, a
 *     missed link only costs an unresolved run, never a wrong route.
 *  2. BFS the merged graph from the condenser's room to each served room
 *     (fewest hops naturally prefers the corridor/hallway spine over a
 *     room-to-room shortcut, since the spine is what has a path to every
 *     bedroom); door links are tried FIRST class-wise (rooms iterate in a
 *     stable order) but the BFS itself is class-agnostic — any mix of
 *     door/drill/gap hops resolves a route.
 *  3. Waypoints are the room centres + each hop's crossing point, projected to
 *     ceiling height; consecutive waypoints are joined by an L-shaped
 *     (Manhattan two-segment) dogleg so every drawn segment stays
 *     axis-aligned, per the module's brief. This does not verify segment vs.
 *     wall clearance beyond "cross only at a door/gap/drill point" — a true
 *     wall-avoiding path is out of scope (see the module docstring above);
 *     when no path exists between the condenser room and a served room, that
 *     run is `resolved: false` and the caller keeps the existing one-line
 *     advisory instead of drawing a route.
 *
 * Pure — no React, no three (beyond exposing a Y coordinate as a plain
 * number). Consumed by `scene/AirconTrunking.tsx` (3D render), `rcp.ts`/
 * `rcpSvg.ts` (RCP sheet dashed overlay) and `renovationAllocator.ts` (budget
 * quantity).
 */

import { allPlanRooms } from '../floorplan/levels'
import { planWallThickness } from '../floorplan/planGeometry'
import { planRoomRects, planRoomShell } from '../floorplan/planRoomShell'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import { pointInRoom, roomPolygon, wallLength } from '../floorplan/types'
import { planAirconPlacements } from './airconPlacement'
import type { AirconSystemPlan } from './airconSystem'

/** A placed (or proposed) aircon item's plan position, minimal shape so this
 *  module has no dependency on `furniture/types.ts`. */
export interface AirconTrunkingPoint {
  roomId: string
  position: [number, number]
}

/** Input placements — either the live scene's placed FCUs/condensers, or the
 *  planner's raw proposal positions (the caller resolves which). */
export interface AirconTrunkingInput {
  fcus: AirconTrunkingPoint[]
  condensers: AirconTrunkingPoint[]
}

/** One routed run: a single condenser → single FCU trunking path. */
export interface AirconTrunkingRun {
  /** 1-based system index (matches `AirconSystem.index`). */
  systemIndex: number
  /** Room the FCU serves. */
  roomId: string
  roomName: string
  /** True when a door-connected path was found; `waypoints`/`lengthM` are only
   *  meaningful when true. */
  resolved: boolean
  /** [x, y, z] world waypoints at (near-)ceiling height, condenser → FCU. */
  waypoints: [number, number, number][]
  /** Total polyline length, metres (0 when unresolved). */
  lengthM: number
  /** Room ids traversed, condenser room first, FCU room last. */
  roomsTraversed: string[]
}

/** Whole-flat trunking plan: one run per FCU. */
export interface AirconTrunkingPlan {
  runs: AirconTrunkingRun[]
  /** Sum of every RESOLVED run's length, metres. */
  totalLengthM: number
}

/** How far below the ceiling plane the trunking centreline runs (m) — clears
 *  the ceiling surface (and any cornice/light fixture) without touching a
 *  false-ceiling drop; matches the header brief. */
const TRUNKING_DROP_M = 0.15

interface RoomLink {
  roomA: string
  roomB: string
  /** World [x, z] of the crossing point (door threshold / drill point / gap
   *  midpoint) shared by both rooms. */
  at: [number, number]
}

/** Every door threshold that borders two DIFFERENT rooms — the graph edges a
 *  route may cross. A door with only one bordering room (opens onto no
 *  neighbour, e.g. a plan gap) contributes no edge. */
function doorLinks(plan: FloorPlan, roomIds: string[]): RoomLink[] {
  const links: RoomLink[] = []
  // A door is attributed (by `planRoomShell`) to every room whose footprint it
  // borders — usually exactly two, the rooms it connects. Collect that
  // membership + the door's world centre in one pass per room.
  const roomsByDoor = new Map<string, string[]>()
  const centreOf = new Map<string, [number, number]>()
  for (const roomId of roomIds) {
    const shell = planRoomShell(plan, roomId)
    if (!shell) continue
    for (const entry of shell.openings) {
      if (entry.opening.kind !== 'door') continue
      const list = roomsByDoor.get(entry.opening.id) ?? []
      list.push(roomId)
      roomsByDoor.set(entry.opening.id, list)
      centreOf.set(entry.opening.id, entry.center)
    }
  }
  for (const [doorId, rooms] of roomsByDoor) {
    const unique = [...new Set(rooms)]
    if (unique.length < 2) continue
    const at = centreOf.get(doorId)
    if (!at) continue
    // A door bounding >2 rooms (degenerate/overlapping plan) links every pair —
    // harmless, BFS just sees extra edges through the same threshold point.
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        links.push({ roomA: unique[i]!, roomB: unique[j]!, at })
      }
    }
  }
  return links
}

/** Tolerance (m) for two room edges being considered to share a boundary span
 *  (their lines within this of touching) — a hair above typical wall
 *  thickness so a pair separated by only its dividing wall still counts as
 *  adjacent (the live default flat's separations run ~0.1 m). */
const EDGE_TOUCH_EPS = 0.25
/** Minimum shared-span overlap (m) for a wall-drill link (BSJ-2 follow-up
 *  probe fix #1) — short enough to cover a slim AC-ledge wall, long enough to
 *  reject a corner-only touch. */
const MIN_DRILL_OVERLAP_M = 0.3
/** Minimum UNCOVERED gap (m) along a shared span for an open-plan link
 *  (BSJ-2 follow-up probe fix #2) — below this a "gap" is just construction
 *  tolerance / a doorway already covered by a door link, not a real
 *  knock-through. */
const MIN_GAP_M = 0.6

/** One axis-aligned edge of a room's TRUE outline (not its bbox). */
interface RoomEdge {
  axis: 'x' | 'z'
  /** The edge's constant coordinate on `axis` (a vertical edge's X, or a
   *  horizontal edge's Z). */
  at: number
  /** The edge's span along the OTHER axis, as [lo, hi]. */
  lo: number
  hi: number
}

/** A room's axis-aligned boundary edges, from its TRUE outline —
 *  `roomPolygon(room)` (the rectilinear union for a rect/L room via its main
 *  rect + extension, or the room's own authored polygon) — NOT the bbox
 *  `planRoomRects` falls back to for a polygon room (an L/polygon room's bbox
 *  can overlap an unrelated neighbour's rect while the TRUE shared edge only
 *  touches a different room entirely — probe-caught 2026-07-24 on the
 *  shipped default flat's L-shaped `livingDining`). A polygon room's edge is
 *  skipped when it isn't axis-aligned (within `EDGE_TOUCH_EPS`) — this router
 *  only draws Manhattan routes, so a diagonal boundary simply can't host a
 *  crossing point; DOCUMENTED LIMITATION: a genuinely diagonal-walled room
 *  can miss a real adjacency here (same "missed link → unresolved run, never
 *  a wrong route" trade-off as the rest of this module). */
function roomEdges(room: PlanRoom): RoomEdge[] {
  const poly = roomPolygon(room)
  const edges: RoomEdge[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    const dx = Math.abs(b[0] - a[0])
    const dz = Math.abs(b[1] - a[1])
    if (dz < EDGE_TOUCH_EPS && dx >= EDGE_TOUCH_EPS) {
      edges.push({
        axis: 'z',
        at: (a[1] + b[1]) / 2,
        lo: Math.min(a[0], b[0]),
        hi: Math.max(a[0], b[0]),
      })
    } else if (dx < EDGE_TOUCH_EPS && dz >= EDGE_TOUCH_EPS) {
      edges.push({
        axis: 'x',
        at: (a[0] + b[0]) / 2,
        lo: Math.min(a[1], b[1]),
        hi: Math.max(a[1], b[1]),
      })
    }
    // Neither near-horizontal nor near-vertical (a genuinely diagonal edge,
    // or a degenerate zero-length one) — skipped, see the doc above.
  }
  return edges
}

/** The best (largest-overlap) shared boundary span between two rooms' TRUE
 *  edge sets, if any: which axis they face across + the touching coordinate
 *  + the overlap interval along the other axis. Checks every edge-pair
 *  combination (cheap — a room has at most ~6 edges) rather than a single
 *  rect-vs-rect test, so an L-shaped room's notch doesn't hide its real
 *  facing edge. `null` when no edge pair overlaps at least
 *  `MIN_DRILL_OVERLAP_M` (the looser of this module's two minimums — the gap
 *  class re-checks its own tighter `MIN_GAP_M` after subtracting wall
 *  coverage). */
function sharedBoundarySpan(
  roomA: PlanRoom,
  roomB: PlanRoom,
): { axis: 'x' | 'z'; at: number; lo: number; hi: number } | null {
  let best: { axis: 'x' | 'z'; at: number; lo: number; hi: number } | null = null
  for (const ea of roomEdges(roomA)) {
    for (const eb of roomEdges(roomB)) {
      if (ea.axis !== eb.axis) continue
      if (Math.abs(ea.at - eb.at) >= EDGE_TOUCH_EPS) continue
      const lo = Math.max(ea.lo, eb.lo)
      const hi = Math.min(ea.hi, eb.hi)
      if (hi - lo < MIN_DRILL_OVERLAP_M) continue
      if (!best || hi - lo > best.hi - best.lo) {
        best = { axis: ea.axis, at: (ea.at + eb.at) / 2, lo, hi }
      }
    }
  }
  return best
}

/** Wall-drill links (BSJ-2 follow-up, probe fix #1): a room with NO door
 *  links at all — the AC ledge/yard/balcony, whose refrigerant lines exit via
 *  a core-drilled wall, never a door — gets an edge to every OTHER room
 *  sharing a boundary span with it. The crossing point is the point on the
 *  shared span NEAREST the given anchor position (the condenser) — that's
 *  where an installer actually drills, not the span's midpoint. Only called
 *  for rooms that need it (door-less condenser rooms), not every room, so a
 *  normal door-connected room's graph is unaffected. */
function wallDrillLinksFor(
  roomId: string,
  anchor: [number, number],
  rooms: PlanRoom[],
): RoomLink[] {
  const room = rooms.find((r) => r.id === roomId)
  if (!room) return []
  const links: RoomLink[] = []
  for (const other of rooms) {
    if (other.id === roomId) continue
    const span = sharedBoundarySpan(room, other)
    if (!span) continue
    const clamped = Math.max(span.lo, Math.min(span.hi, span.axis === 'x' ? anchor[1] : anchor[0]))
    const at: [number, number] = span.axis === 'x' ? [span.at, clamped] : [clamped, span.at]
    links.push({ roomA: roomId, roomB: other.id, at })
  }
  return links
}

/** Every plan wall's projection onto a shared span's line, as `[lo, hi]`
 *  intervals along the span's free axis, expanded by half the wall's own
 *  thickness on each side (a wall "covers" a little beyond its centreline).
 *  Only walls whose centreline lies ON the span's touching coordinate
 *  (within `EDGE_TOUCH_EPS`) count — a wall on a different line can't be
 *  covering this boundary. */
function wallCoverageOnSpan(
  plan: FloorPlan,
  span: { axis: 'x' | 'z'; at: number },
): { lo: number; hi: number }[] {
  const out: { lo: number; hi: number }[] = []
  for (const w of plan.walls) {
    if (wallLength(w) < 1e-4) continue
    const horizontal = Math.abs(w.start[1] - w.end[1]) < EDGE_TOUCH_EPS
    const vertical = Math.abs(w.start[0] - w.end[0]) < EDGE_TOUCH_EPS
    // A wall covering an X-facing span (side-by-side rooms) runs along Z at a
    // near-constant X; a Z-facing span (stacked rooms) is covered by a wall
    // running along X at a near-constant Z.
    if (span.axis === 'x' && !vertical) continue
    if (span.axis === 'z' && !horizontal) continue
    const wallCoord = span.axis === 'x' ? (w.start[0] + w.end[0]) / 2 : (w.start[1] + w.end[1]) / 2
    if (Math.abs(wallCoord - span.at) > EDGE_TOUCH_EPS) continue
    const half = planWallThickness(w, plan) / 2
    const a = span.axis === 'x' ? w.start[1] : w.start[0]
    const b = span.axis === 'x' ? w.end[1] : w.end[0]
    out.push({ lo: Math.min(a, b) - half, hi: Math.max(a, b) + half })
  }
  return out
}

/** The largest UNCOVERED sub-interval of `[lo, hi]` after subtracting every
 *  wall-coverage interval (merged first so overlapping walls don't
 *  double-subtract). `null` when nothing uncovered reaches `MIN_GAP_M`. */
function largestUncoveredGap(
  lo: number,
  hi: number,
  coverage: { lo: number; hi: number }[],
): { lo: number; hi: number } | null {
  const relevant = coverage
    .map((c) => ({ lo: Math.max(lo, c.lo), hi: Math.min(hi, c.hi) }))
    .filter((c) => c.hi > c.lo)
    .sort((a, b) => a.lo - b.lo)
  const merged: { lo: number; hi: number }[] = []
  for (const c of relevant) {
    const last = merged[merged.length - 1]
    if (last && c.lo <= last.hi) last.hi = Math.max(last.hi, c.hi)
    else merged.push({ ...c })
  }
  let cursor = lo
  let best: { lo: number; hi: number } | null = null
  for (const c of merged) {
    if (c.lo - cursor >= MIN_GAP_M && (!best || c.lo - cursor > best.hi - best.lo)) {
      best = { lo: cursor, hi: c.lo }
    }
    cursor = Math.max(cursor, c.hi)
  }
  if (hi - cursor >= MIN_GAP_M && (!best || hi - cursor > best.hi - best.lo)) {
    best = { lo: cursor, hi }
  }
  return best
}

/** Open-plan gap links (BSJ-2 follow-up, probe fix #2): two rooms whose
 *  footprints share a boundary span with an UNCOVERED run (no plan wall
 *  spanning it) of at least `MIN_GAP_M` get an edge at the gap's midpoint — a
 *  living/dining/kitchen open-plan knock-through has no door object, just a
 *  wall that stops short. Computed for every room pair once (cheap at HDB
 *  room counts); a pair already linked by a door only gains a SECOND edge
 *  here when the gap is elsewhere on the same boundary — harmless (BFS just
 *  sees an extra path to the same neighbour). */
function gapLinks(plan: FloorPlan, rooms: PlanRoom[]): RoomLink[] {
  const links: RoomLink[] = []
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i]!
      const b = rooms[j]!
      const span = sharedBoundarySpan(a, b)
      if (!span) continue
      const coverage = wallCoverageOnSpan(plan, span)
      const gap = largestUncoveredGap(span.lo, span.hi, coverage)
      if (!gap) continue
      const mid = (gap.lo + gap.hi) / 2
      const at: [number, number] = span.axis === 'x' ? [span.at, mid] : [mid, span.at]
      links.push({ roomA: a.id, roomB: b.id, at })
    }
  }
  return links
}

/** Minimum footprint-overlap extent (m, per axis) treated as a genuine
 *  open-plan overlap — matches `MIN_DRILL_OVERLAP_M`'s "narrower is noise"
 *  reasoning. */
const MIN_OVERLAP_M = 0.3

/** Does an axis-aligned plan wall run THROUGH the given rect for at least
 *  `MIN_OVERLAP_M` of its length? Used to reject an overlap link where a real
 *  wall crosses the shared region. */
function wallCrossesRect(plan: FloorPlan, x0: number, z0: number, x1: number, z1: number): boolean {
  for (const w of plan.walls) {
    if (wallLength(w) < 1e-4) continue
    const horizontal = Math.abs(w.start[1] - w.end[1]) < EDGE_TOUCH_EPS
    const vertical = Math.abs(w.start[0] - w.end[0]) < EDGE_TOUCH_EPS
    if (horizontal) {
      const z = (w.start[1] + w.end[1]) / 2
      if (z <= z0 || z >= z1) continue
      const lo = Math.min(w.start[0], w.end[0])
      const hi = Math.max(w.start[0], w.end[0])
      if (Math.min(hi, x1) - Math.max(lo, x0) >= MIN_OVERLAP_M) return true
    } else if (vertical) {
      const x = (w.start[0] + w.end[0]) / 2
      if (x <= x0 || x >= x1) continue
      const lo = Math.min(w.start[1], w.end[1])
      const hi = Math.max(w.start[1], w.end[1])
      if (Math.min(hi, z1) - Math.max(lo, z0) >= MIN_OVERLAP_M) return true
    }
  }
  return false
}

/** Overlap links (BSJ-2 follow-up, probe fix #3): real plans express some
 *  open-plan boundaries as room footprints that OVERLAP rather than touch —
 *  the shipped default flat's living/dining rect overlaps the corridor rect
 *  by ~0.76 m, so no edge pair ever comes within `EDGE_TOUCH_EPS` and neither
 *  the gap nor the drill class fires (probe-caught 2026-07-25). Two rooms
 *  whose rect decompositions (`planRoomRects` — main + L-extension; a bare
 *  bbox only for a polygon room) intersect by ≥ `MIN_OVERLAP_M` on BOTH axes,
 *  with no plan wall running through the intersection, are treated as openly
 *  connected at the intersection's centre. A wall through the overlap (a
 *  plan whose rooms merely encroach under a partition) rejects the link. */
function overlapLinks(plan: FloorPlan, rooms: PlanRoom[]): RoomLink[] {
  const links: RoomLink[] = []
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i]!
      const b = rooms[j]!
      let linked = false
      for (const ra of planRoomRects(a)) {
        if (linked) break
        for (const rb of planRoomRects(b)) {
          const x0 = Math.max(ra.x0, rb.x0)
          const x1 = Math.min(ra.x1, rb.x1)
          const z0 = Math.max(ra.z0, rb.z0)
          const z1 = Math.min(ra.z1, rb.z1)
          if (x1 - x0 < MIN_OVERLAP_M || z1 - z0 < MIN_OVERLAP_M) continue
          if (wallCrossesRect(plan, x0, z0, x1, z1)) continue
          links.push({ roomA: a.id, roomB: b.id, at: [(x0 + x1) / 2, (z0 + z1) / 2] })
          linked = true
          break
        }
      }
    }
  }
  return links
}

/** BFS shortest hop-count path of room ids from `startRoomId` to
 *  `endRoomId`, returning the crossing point (door threshold / drill point /
 *  gap midpoint / overlap centre) at each hop (length = path.length - 1).
 *  `null` when no path exists. */
function shortestRoomPath(
  links: RoomLink[],
  startRoomId: string,
  endRoomId: string,
): { rooms: string[]; crossings: [number, number][] } | null {
  if (startRoomId === endRoomId) return { rooms: [startRoomId], crossings: [] }
  const adj = new Map<string, { to: string; at: [number, number] }[]>()
  const add = (from: string, to: string, at: [number, number]) => {
    const list = adj.get(from) ?? []
    list.push({ to, at })
    adj.set(from, list)
  }
  for (const l of links) {
    add(l.roomA, l.roomB, l.at)
    add(l.roomB, l.roomA, l.at)
  }
  const visited = new Set([startRoomId])
  const queue: string[] = [startRoomId]
  const prev = new Map<string, { room: string; at: [number, number] }>()
  while (queue.length > 0) {
    const cur = queue.shift()!
    if (cur === endRoomId) break
    for (const edge of adj.get(cur) ?? []) {
      if (visited.has(edge.to)) continue
      visited.add(edge.to)
      prev.set(edge.to, { room: cur, at: edge.at })
      queue.push(edge.to)
    }
  }
  if (!visited.has(endRoomId)) return null
  const rooms: string[] = [endRoomId]
  const crossings: [number, number][] = []
  let cur = endRoomId
  while (cur !== startRoomId) {
    const p = prev.get(cur)
    if (!p) return null
    crossings.unshift(p.at)
    rooms.unshift(p.room)
    cur = p.room
  }
  return { rooms, crossings }
}

/** Room id containing a plan point, else the id whose CENTRE is nearest (a
 *  condenser/FCU nudged just outside its nominal room by wall offset math
 *  still resolves to the room it visually belongs to). */
function roomIdAt(plan: FloorPlan, pos: [number, number], candidateRoomId: string): string {
  const rooms = allPlanRooms(plan)
  for (const r of rooms) {
    if (pointInRoom(r, pos[0], pos[1])) return r.id
  }
  return candidateRoomId
}

/** Room id at a point with NO prior candidate: point-in-room, else the room
 *  whose footprint centre is nearest. Used to attribute placed scene items
 *  (`FurnitureItem` has no roomId field). */
function roomIdNearest(plan: FloorPlan, pos: [number, number]): string {
  const rooms = allPlanRooms(plan)
  for (const r of rooms) {
    if (pointInRoom(r, pos[0], pos[1])) return r.id
  }
  let bestId = rooms[0]?.id ?? ''
  let bestD = Number.POSITIVE_INFINITY
  for (const r of rooms) {
    const cx = r.origin[0] + r.width / 2
    const cz = r.origin[1] + r.depth / 2
    const d = (cx - pos[0]) ** 2 + (cz - pos[1]) ** 2
    if (d < bestD) {
      bestD = d
      bestId = r.id
    }
  }
  return bestId
}

/** Manhattan L-shaped dogleg between two [x,z] points: one interior corner
 *  point so both drawn segments stay axis-aligned. Picks the corner that
 *  keeps the FIRST leg along whichever axis has the larger delta (a longer
 *  straight run reads cleaner along a corridor than a short jog). Returns
 *  just `[b]` when the points already share an axis (no corner needed). */
function manhattanDogleg(a: [number, number], b: [number, number]): [number, number][] {
  const dx = Math.abs(b[0] - a[0])
  const dz = Math.abs(b[1] - a[1])
  if (dx < 1e-4 || dz < 1e-4) return [b]
  const corner: [number, number] = dx >= dz ? [b[0], a[1]] : [a[0], b[1]]
  return [corner, b]
}

/**
 * Build the whole-flat trunking route plan: one run per served room, tracing
 * condenser → FCU through door openings. `input` supplies the placed (or
 * proposed) FCU/condenser plan positions per system — the caller resolves
 * which (placed items when present, else the planner's proposal, mirroring
 * `renovationAllocator.ts`'s aircon-line fallback). A run whose rooms aren't
 * door-connected (or whose FCU/condenser room has no resolvable geometry)
 * comes back `resolved: false` with empty waypoints — the caller keeps
 * showing the existing one-line advisory for that system instead.
 */
export function buildAirconTrunkingPlan(
  plan: FloorPlan,
  systemPlan: AirconSystemPlan,
  input: AirconTrunkingInput,
): AirconTrunkingPlan {
  const rooms = allPlanRooms(plan)
  const roomIds = rooms.map((r) => r.id)
  const links = doorLinks(plan, roomIds)
  // Rooms that already have at least one door link (either side) — a
  // door-less room (the AC ledge/yard/balcony) needs the wall-drill fallback
  // class; a normal door-connected room never does (avoids inventing a
  // spurious drill edge alongside a real door).
  const roomsWithDoors = new Set<string>()
  for (const l of links) {
    roomsWithDoors.add(l.roomA)
    roomsWithDoors.add(l.roomB)
  }
  links.push(...gapLinks(plan, rooms))
  links.push(...overlapLinks(plan, rooms))
  const ceilingHeight =
    Number.isFinite(plan.ceilingHeight) && (plan.ceilingHeight as number) > 0
      ? (plan.ceilingHeight as number)
      : 2.6
  // Wall-drill links are keyed per (door-less condenser room, anchor position)
  // — cached so the same ledge isn't re-scanned for every FCU in a system.
  const drillLinksCache = new Map<string, RoomLink[]>()
  const drillLinksFor = (roomId: string, anchor: [number, number]): RoomLink[] => {
    if (roomsWithDoors.has(roomId)) return []
    const key = `${roomId}:${anchor[0]}:${anchor[1]}`
    const hit = drillLinksCache.get(key)
    if (hit) return hit
    const built = wallDrillLinksFor(roomId, anchor, rooms)
    drillLinksCache.set(key, built)
    return built
  }

  const runs: AirconTrunkingRun[] = []
  let totalLengthM = 0

  for (const system of systemPlan.systems) {
    // One condenser per system, in placement order (index-aligned with the
    // planner: `planAirconPlacements` emits condensers after all FCUs, one per
    // system, so the Nth condenser in `input.condensers` belongs to the Nth
    // system — same assumption `findLedgeRoom`/`placeCondensers` bake in: every
    // condenser for this flat sits on the ONE ledge room).
    const condenser = input.condensers[system.index - 1] ?? input.condensers[0]
    for (const fcu of system.fcus) {
      const fcuPoint = input.fcus.find((f) => f.roomId === fcu.roomId)
      if (!condenser || !fcuPoint) {
        runs.push({
          systemIndex: system.index,
          roomId: fcu.roomId,
          roomName: fcu.roomName,
          resolved: false,
          waypoints: [],
          lengthM: 0,
          roomsTraversed: [],
        })
        continue
      }
      const condenserRoomId = roomIdAt(plan, condenser.position, condenser.roomId)
      const fcuRoomId = roomIdAt(plan, fcuPoint.position, fcu.roomId)
      const y = Math.max(0.3, ceilingHeight - TRUNKING_DROP_M)
      // Wall-drill links, added ONLY for this condenser room when it has no
      // door of its own — the crossing point depends on the condenser's own
      // position (nearest point on the shared span), so it's per-condenser.
      const runLinks = [...links, ...drillLinksFor(condenserRoomId, condenser.position)]
      const path = shortestRoomPath(runLinks, condenserRoomId, fcuRoomId)
      if (!path) {
        runs.push({
          systemIndex: system.index,
          roomId: fcu.roomId,
          roomName: fcu.roomName,
          resolved: false,
          waypoints: [],
          lengthM: 0,
          roomsTraversed: [],
        })
        continue
      }
      // Waypoints: condenser position, then each crossing, then the FCU
      // position, each leg expanded into an axis-aligned dogleg.
      const flatPoints: [number, number][] = [
        condenser.position,
        ...path.crossings,
        fcuPoint.position,
      ]
      const routed2d: [number, number][] = [flatPoints[0]!]
      for (let i = 1; i < flatPoints.length; i++) {
        routed2d.push(...manhattanDogleg(routed2d[routed2d.length - 1]!, flatPoints[i]!))
      }
      let lengthM = 0
      for (let i = 1; i < routed2d.length; i++) {
        lengthM += Math.hypot(
          routed2d[i]![0] - routed2d[i - 1]![0],
          routed2d[i]![1] - routed2d[i - 1]![1],
        )
      }
      runs.push({
        systemIndex: system.index,
        roomId: fcu.roomId,
        roomName: fcu.roomName,
        resolved: true,
        waypoints: routed2d.map(([x, z]) => [x, y, z] as [number, number, number]),
        lengthM,
        roomsTraversed: path.rooms,
      })
      totalLengthM += lengthM
    }
  }

  return { runs, totalLengthM }
}

/** Convenience: resolve the [x,z] positions the trunking router needs, given
 *  placed furniture items (preferred) or the planner's own proposal — the
 *  SAME fallback `renovationAllocator.ts` applies to the FCU count. Kept here
 *  (rather than duplicated per call site) so the 3D renderer, the RCP sheet
 *  and the budget line all resolve inputs identically. */
export function resolveAirconTrunkingInput(
  plan: FloorPlan,
  systemPlan: AirconSystemPlan,
  placedItems: { defId: string; roomId?: string; position: [number, number] }[],
): AirconTrunkingInput {
  const placedFcus = placedItems.filter((it) => it.defId === 'aircon-unit')
  const placedCondensers = placedItems.filter((it) => it.defId === 'aircon-condenser')
  // ANY placed aircon item means the user owns this system — describe what is
  // actually in the scene, even when one side is missing (E2E-r2 P2-1: the
  // earlier `fcus && condensers` gate fell back to the PROPOSAL after the user
  // deleted their condensers, so the ducts, the RCP overlay and a
  // dollar-carrying budget line kept quoting a route from equipment that no
  // longer existed). A half-edited system now yields empty condensers/FCUs →
  // unresolved runs → the honest one-line advisory.
  if (placedFcus.length > 0 || placedCondensers.length > 0) {
    // Placed scene items are plain `FurnitureItem`s, which carry NO roomId —
    // derive it from the position (point-in-room, else nearest room centre:
    // a wall-flush FCU or a ledge condenser can sit marginally outside its
    // room's footprint after wall-offset math). Dropping roomId-less items
    // here (the first cut) made every run silently unresolved the moment
    // "Plan aircon" actually applied its items — probe-caught 2026-07-24.
    const locate = (it: { roomId?: string; position: [number, number] }): AirconTrunkingPoint => ({
      roomId: it.roomId ?? roomIdNearest(plan, it.position),
      position: it.position,
    })
    return {
      fcus: placedFcus.map(locate),
      condensers: placedCondensers.map(locate),
    }
  }
  // Fall back to the planner's own proposal geometry (mirrors
  // `airconPlacement.planAirconPlacements`'s FCU wall-pick, re-run here purely
  // to get a position — cheap, and this module never mutates the plan).
  return proposalTrunkingInput(plan, systemPlan)
}

/** Re-derive proposal FCU/condenser positions from the planner (no items
 *  placed yet) by re-running the same placement logic used for the "Plan
 *  aircon" action, discarding its collision context (none needed — this is
 *  read-only geometry, not a commit). */
function proposalTrunkingInput(plan: FloorPlan, systemPlan: AirconSystemPlan): AirconTrunkingInput {
  const { items } = planAirconPlacements(plan, systemPlan)
  const fcus: AirconTrunkingPoint[] = []
  const condensers: AirconTrunkingPoint[] = []
  for (const it of items) {
    if (it.defId === 'aircon-unit') fcus.push({ roomId: it.roomId, position: it.position })
    else if (it.defId === 'aircon-condenser')
      condensers.push({ roomId: it.roomId, position: it.position })
  }
  return { fcus, condensers }
}
