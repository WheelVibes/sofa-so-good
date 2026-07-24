import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanOpening, PlanRoom, PlanWall, RoomCategory } from '../floorplan/types'
import { planAirconPlacements } from './airconPlacement'
import { buildAirconSystemPlan } from './airconSystem'
import { buildAirconTrunkingPlan, resolveAirconTrunkingInput } from './airconTrunking'

function rectRoom(
  id: string,
  name: string,
  x: number,
  z: number,
  w: number,
  d: number,
  category: RoomCategory,
): PlanRoom {
  return { id, name, origin: [x, z], width: w, depth: d, category }
}

function rectWalls(prefix: string, x: number, z: number, w: number, d: number): PlanWall[] {
  return [
    { id: `${prefix}-n`, start: [x, z], end: [x + w, z], thickness: 'external' },
    { id: `${prefix}-s`, start: [x, z + d], end: [x + w, z + d], thickness: 'internal' },
    { id: `${prefix}-w`, start: [x, z], end: [x, z + d], thickness: 'internal' },
    { id: `${prefix}-e`, start: [x + w, z], end: [x + w, z + d], thickness: 'internal' },
  ]
}

function plan(rooms: PlanRoom[], walls: PlanWall[], openings: PlanOpening[]): FloorPlan {
  return {
    id: 'test',
    name: 'Test',
    ceilingHeight: 2.8,
    extent: [40, 40],
    walls,
    openings,
    rooms,
  }
}

/**
 * A small synthetic flat: Living (with the AC ledge attached, sharing the
 * ledge's south wall) — Corridor — Master bedroom. Doors: living↔corridor,
 * corridor↔master. The condenser sits on the ledge (attached to living), the
 * FCUs in living + master.
 *
 *   Ledge  [10,0]..[12,1.2]        (shares its south wall x=10..12,z=1.2 with living's north wall)
 *   Living [0,0]..[5,4]     door on east wall (x=5) into Corridor
 *   Corridor [5,1]..[7,3]   door on west wall (x=5) from Living, door on east wall (x=7) into Master
 *   Master [7,0]..[11,4]    door on west wall (x=7) from Corridor
 */
function twoRoomCorridorPlan(): FloorPlan {
  const rooms = [
    rectRoom('living', 'Living / Dining', 0, 0, 5, 4, 'living'),
    rectRoom('corridor', 'Corridor', 5, 1, 2, 2, 'foyer'),
    rectRoom('master', 'Master Bedroom', 7, 0, 4, 4, 'masterBedroom'),
    rectRoom('ledge', 'AC Ledge', 0, -1.2, 5, 1.2, 'other'),
  ]
  const walls = [
    ...rectWalls('living', 0, 0, 5, 4),
    ...rectWalls('corridor', 5, 1, 2, 2),
    ...rectWalls('master', 7, 0, 4, 4),
    ...rectWalls('ledge', 0, -1.2, 5, 1.2),
  ]
  const openings: PlanOpening[] = [
    // Living north wall (z=0, x 0..5) / ledge south wall (z=1.2, x 0..5): the
    // AC ledge's own service door back into the living room.
    {
      id: 'd-living-ledge',
      kind: 'door',
      wallId: 'living-n',
      offset: 1,
      width: 1,
      sill: 0,
      head: 2.1,
    },
    // Living east wall (x=5, z 0..4) / corridor west wall (x=5, z 1..3): door
    // centred at z=2.
    {
      id: 'd-living-corridor',
      kind: 'door',
      wallId: 'living-e',
      offset: 1,
      width: 1,
      sill: 0,
      head: 2.1,
    },
    // Corridor east wall (x=7, z 1..3) / master west wall (x=7, z 0..4): door
    // centred at z=2.
    {
      id: 'd-corridor-master',
      kind: 'door',
      wallId: 'corridor-e',
      offset: 0.5,
      width: 1,
      sill: 0,
      head: 2.1,
    },
  ]
  return plan(rooms, walls, openings)
}

describe('buildAirconTrunkingPlan', () => {
  it('routes each FCU from the condenser through door thresholds, sane lengths', () => {
    const p = twoRoomCorridorPlan()
    const systemPlan = buildAirconSystemPlan(p)
    const { items } = planAirconPlacements(p, systemPlan)
    const input = resolveAirconTrunkingInput(p, systemPlan, items)

    const trunking = buildAirconTrunkingPlan(p, systemPlan, input)
    expect(trunking.runs.length).toBeGreaterThan(0)
    for (const run of trunking.runs) {
      expect(run.resolved).toBe(true)
      expect(run.waypoints.length).toBeGreaterThanOrEqual(2)
      // Sane length: within the plan's overall extent, never zero.
      expect(run.lengthM).toBeGreaterThan(0)
      expect(run.lengthM).toBeLessThan(40)
      // Ceiling-height Y on every waypoint.
      for (const [, y] of run.waypoints) {
        expect(y).toBeCloseTo(2.8 - 0.15, 5)
      }
    }
    expect(trunking.totalLengthM).toBeGreaterThan(0)

    // The master-bedroom run must cross the corridor (fewest-doors path),
    // not attempt to phase through a wall directly from the ledge.
    const masterRun = trunking.runs.find((r) => r.roomId === 'master')
    expect(masterRun?.resolved).toBe(true)
    expect(masterRun?.roomsTraversed).toContain('corridor')
  })

  it('every drawn segment stays axis-aligned (Manhattan)', () => {
    const p = twoRoomCorridorPlan()
    const systemPlan = buildAirconSystemPlan(p)
    const { items } = planAirconPlacements(p, systemPlan)
    const input = resolveAirconTrunkingInput(p, systemPlan, items)
    const trunking = buildAirconTrunkingPlan(p, systemPlan, input)

    for (const run of trunking.runs) {
      for (let i = 1; i < run.waypoints.length; i++) {
        const [x0, , z0] = run.waypoints[i - 1]!
        const [x1, , z1] = run.waypoints[i]!
        const dx = Math.abs(x1 - x0)
        const dz = Math.abs(z1 - z0)
        // One of the two deltas must be ~0 (segment runs along a single axis).
        expect(Math.min(dx, dz)).toBeLessThan(1e-3)
      }
    }
  })

  it('falls back to the planner proposal when nothing is placed yet', () => {
    const p = twoRoomCorridorPlan()
    const systemPlan = buildAirconSystemPlan(p)
    // No placed items at all — resolveAirconTrunkingInput must fall back to
    // the planner's own proposal geometry (mirrors the allocator's fallback).
    const input = resolveAirconTrunkingInput(p, systemPlan, [])
    expect(input.fcus.length).toBeGreaterThan(0)
    expect(input.condensers.length).toBeGreaterThan(0)

    const trunking = buildAirconTrunkingPlan(p, systemPlan, input)
    expect(trunking.runs.every((r) => r.resolved)).toBe(true)
  })

  it('does NOT fall back to the proposal once ANY aircon item is placed (E2E-r2 P2-1)', () => {
    const p = twoRoomCorridorPlan()
    const systemPlan = buildAirconSystemPlan(p)
    const { items } = planAirconPlacements(p, systemPlan)
    // The user planned the system, then deleted their condenser(s). The route
    // must NOT keep quoting the planner's proposal (which would draw ducts and
    // charge a budget line for equipment that no longer exists) — it drops to
    // unresolved so every surface falls back to the honest advisory.
    const fcusOnly = items.filter((it) => it.defId === 'aircon-unit')
    expect(fcusOnly.length).toBeGreaterThan(0)
    const input = resolveAirconTrunkingInput(p, systemPlan, fcusOnly)
    expect(input.condensers).toEqual([])
    expect(input.fcus.length).toBe(fcusOnly.length)

    const trunking = buildAirconTrunkingPlan(p, systemPlan, input)
    expect(trunking.runs.every((r) => !r.resolved)).toBe(true)
    expect(trunking.totalLengthM).toBe(0)
  })

  it('reports resolved:false when a served room has no door/gap/drill path to the condenser', () => {
    // No doors anywhere, AND the ledge is set back 2m from living (no shared
    // boundary span for either the gap-link or wall-drill classes — a true
    // physical gap between the rooms' footprints, not just a solid wall) —
    // no run can resolve.
    const rooms = [
      rectRoom('living', 'Living / Dining', 0, 0, 5, 4, 'living'),
      rectRoom('corridor', 'Corridor', 5, 1, 2, 2, 'foyer'),
      rectRoom('master', 'Master Bedroom', 7, 0, 4, 4, 'masterBedroom'),
      rectRoom('ledge', 'AC Ledge', 0, -3.2, 5, 1.2, 'other'),
    ]
    const walls = [
      ...rectWalls('living', 0, 0, 5, 4),
      ...rectWalls('corridor', 5, 1, 2, 2),
      ...rectWalls('master', 7, 0, 4, 4),
      ...rectWalls('ledge', 0, -3.2, 5, 1.2),
    ]
    const p = plan(rooms, walls, [])
    const systemPlan = buildAirconSystemPlan(p)
    const { items } = planAirconPlacements(p, systemPlan)
    const input = resolveAirconTrunkingInput(p, systemPlan, items)
    const trunking = buildAirconTrunkingPlan(p, systemPlan, input)

    expect(trunking.runs.length).toBeGreaterThan(0)
    // No door, no shared boundary span (gap-link or drill) anywhere — every
    // run must be unresolved, none contribute to totalLengthM.
    expect(trunking.runs.every((r) => !r.resolved)).toBe(true)
    expect(trunking.runs.every((r) => r.waypoints.length === 0)).toBe(true)
    expect(trunking.totalLengthM).toBe(0)
  })
})

/**
 * Regression fixture modeled on the REAL shipped-default-flat probe
 * (2026-07-24) that first surfaced the door-only graph's gap: the AC ledge
 * has NO doors at all (`doorsByRoom.acLedge: []`), and the living/corridor
 * open-plan boundary has none either — every run came back `resolved:false`
 * until the wall-drill + open-plan-gap link classes were added.
 *
 *   acLedge      [0,-1.2]..[10,0]     NO doors — condenser exits via a wall drill
 *   livingDining [0,0]..[10,4]        open-plan gap (no wall/door) into corridor at x=10..12,z=2..4
 *   corridor     [10,0]..[12,4]       real doors into each bedroom
 *   mainBedroom  [12,0]..[16,4]       door on corridor's east wall
 *   bedroom2     [10,4]..[13,7]       door on corridor's south wall
 *   bedroom3     [13,4]..[16,7]       door on corridor's south wall
 */
function realTopologyPlan(): FloorPlan {
  const rooms = [
    rectRoom('acLedge', 'AC Ledge', 0, -1.2, 10, 1.2, 'other'),
    rectRoom('livingDining', 'Living / Dining', 0, 0, 10, 4, 'living'),
    rectRoom('corridor', 'Corridor', 10, 0, 2, 4, 'foyer'),
    rectRoom('mainBedroom', 'Main Bedroom', 12, 0, 4, 4, 'masterBedroom'),
    rectRoom('bedroom2', 'Bedroom 2', 10, 4, 3, 3, 'bedroom'),
    rectRoom('bedroom3', 'Bedroom 3', 13, 4, 3, 3, 'bedroom'),
  ]
  const walls: PlanWall[] = [
    ...rectWalls('ledge', 0, -1.2, 10, 1.2),
    // livingDining: full perimeter EXCEPT its east wall (x=10) is omitted
    // entirely — an open-plan knock-through into the corridor, no wall at
    // all across the shared span (the gap-link class's target case).
    { id: 'living-n', start: [0, 0], end: [10, 0], thickness: 'internal' },
    { id: 'living-s', start: [0, 4], end: [10, 4], thickness: 'internal' },
    { id: 'living-w', start: [0, 0], end: [0, 4], thickness: 'internal' },
    // corridor: same open-plan gap — its WEST wall (x=10, the boundary shared
    // with livingDining) is omitted too, so neither room's own wall covers
    // that span (a doorless knock-through needs BOTH sides open).
    { id: 'corridor-n', start: [10, 0], end: [12, 0], thickness: 'internal' },
    { id: 'corridor-s', start: [10, 4], end: [12, 4], thickness: 'internal' },
    { id: 'corridor-e', start: [12, 0], end: [12, 4], thickness: 'internal' },
    ...rectWalls('mainbed', 12, 0, 4, 4),
    ...rectWalls('bed2', 10, 4, 3, 3),
    ...rectWalls('bed3', 13, 4, 3, 3),
  ]
  const openings: PlanOpening[] = [
    // Corridor east wall (x=12, z 0..4) / mainBedroom west wall: real door.
    {
      id: 'd-corridor-main',
      kind: 'door',
      wallId: 'corridor-e',
      offset: 1,
      width: 1,
      sill: 0,
      head: 2.1,
    },
    // Corridor south wall (z=4, x 10..12) / bedroom2 north wall: real door.
    {
      id: 'd-corridor-bed2',
      kind: 'door',
      wallId: 'corridor-s',
      offset: 0.5,
      width: 1,
      sill: 0,
      head: 2.1,
    },
    // bedroom2 east wall (x=13) / bedroom3 west wall: real door (so bedroom3
    // — sharing NO wall with corridor directly — reaches it via bedroom2).
    { id: 'd-bed2-bed3', kind: 'door', wallId: 'bed2-e', offset: 1, width: 1, sill: 0, head: 2.1 },
  ]
  return {
    id: 'real-topo',
    name: 'Real topology probe',
    ceilingHeight: 2.8,
    extent: [16, 7],
    walls,
    openings,
    rooms,
  }
}

describe('buildAirconTrunkingPlan — real shipped-flat topology regression (2026-07-24 probe)', () => {
  it('resolves every FCU run: door-less AC ledge (wall-drill) + open-plan living/corridor (gap link)', () => {
    const p = realTopologyPlan()
    const systemPlan = buildAirconSystemPlan(p)
    const { items } = planAirconPlacements(p, systemPlan)
    const input = resolveAirconTrunkingInput(p, systemPlan, items)
    const trunking = buildAirconTrunkingPlan(p, systemPlan, input)

    // Every served room (livingDining + the 3 bedrooms) gets a resolved run —
    // the exact probe failure mode (all 4 runs `resolved:false`) must not
    // reproduce.
    expect(trunking.runs.length).toBeGreaterThanOrEqual(4)
    for (const run of trunking.runs) {
      expect(run.resolved).toBe(true)
      expect(run.lengthM).toBeGreaterThan(0)
      expect(run.lengthM).toBeLessThan(60)
      expect(run.waypoints.length).toBeGreaterThanOrEqual(2)
    }
    expect(trunking.totalLengthM).toBeGreaterThan(0)

    // The living run crosses the open-plan gap into the corridor without a
    // door object — confirms the gap-link class actually fired (not just the
    // drill link happening to reach living directly).
    const livingRun = trunking.runs.find((r) => r.roomId === 'livingDining')
    expect(livingRun?.resolved).toBe(true)

    // Every segment stays axis-aligned (Manhattan) — the router never draws
    // a diagonal "through the wall" shortcut.
    for (const run of trunking.runs) {
      for (let i = 1; i < run.waypoints.length; i++) {
        const [x0, , z0] = run.waypoints[i - 1]!
        const [x1, , z1] = run.waypoints[i]!
        expect(Math.min(Math.abs(x1 - x0), Math.abs(z1 - z0))).toBeLessThan(1e-3)
      }
    }
  })

  it('crossing points land only at a real door, the open-plan gap, or on the drilled boundary', () => {
    const p = realTopologyPlan()
    const systemPlan = buildAirconSystemPlan(p)
    const { items } = planAirconPlacements(p, systemPlan)
    const input = resolveAirconTrunkingInput(p, systemPlan, items)
    const trunking = buildAirconTrunkingPlan(p, systemPlan, input)

    const livingRun = trunking.runs.find((r) => r.roomId === 'livingDining')!
    expect(livingRun.resolved).toBe(true)
    // The living↔corridor crossing is the open-plan gap on the shared x=10
    // boundary — every waypoint touching x≈10 must land within the corridor
    // room's z-span (0..4), i.e. on the shared boundary, not off it.
    for (const [x, , z] of livingRun.waypoints) {
      if (Math.abs(x - 10) < 1e-3) {
        expect(z).toBeGreaterThanOrEqual(-1e-3)
        expect(z).toBeLessThanOrEqual(4 + 1e-3)
      }
    }

    const bed3Run = trunking.runs.find((r) => r.roomId === 'bedroom3')!
    expect(bed3Run.resolved).toBe(true)
    // bedroom3 only reaches the rest of the flat via its real door into
    // bedroom2 — the run must actually traverse bedroom2.
    expect(bed3Run.roomsTraversed).toContain('bedroom2')
  })
})

/**
 * Regression fixture for the SECOND probe fix (2026-07-25): an L-shaped
 * `livingDining` whose BBOX (what `planRoomRects` would report) overlaps two
 * unrelated rooms — `bedroom3` and `corridor` — the same shape of failure the
 * live default-flat probe hit (an L-room's bbox spuriously overlapping a
 * neighbour's rect suppressed the "edges touching" test entirely, since an
 * overlap never registers as "touching within EDGE_TOUCH_EPS"). Its TRUE
 * polygon footprint only actually borders `corridor` (an open-plan gap, no
 * door) — the gap link must be found via the room's real notched-L edges,
 * not its bbox, which is exactly what `roomEdges`/`sharedBoundarySpan` now
 * do. The AC ledge sits on `corridor` (NOT `livingDining`), so resolving the
 * living FCU's run REQUIRES the gap link to actually fire — a route that
 * (wrongly) fell back to a bbox-vs-rect test against `bedroom3` would still
 * come back unresolved, so this fixture actually exercises the fix rather
 * than accidentally resolving via some other link.
 *
 *   bedroom3     [0,0]..[3,3]         far corner, only touches by BBOX
 *   corridor     [8,0]..[10,6]        AC ledge attached to its north wall
 *   livingDining L-shape: bbox [0,0]..[8,6] (OVERLAPS bedroom3's rect
 *                entirely) but the true footprint is the union of
 *                [4,0]..[8,6] (main) + [0,4]..[4,6] (extension) — an L whose
 *                only real edge touching another room is its east edge at
 *                x=8 (z 0..6), bordering `corridor`; `bedroom3` sits entirely
 *                in the L's NOTCH ([0,0]..[4,4]), never actually adjacent.
 */
function lShapedLivingProbeFix2Plan(): FloorPlan {
  const rooms: PlanRoom[] = [
    { id: 'bedroom3', name: 'Bedroom 3', origin: [0, 0], width: 3, depth: 3, category: 'bedroom' },
    { id: 'corridor', name: 'Corridor', origin: [8, 0], width: 2, depth: 6, category: 'foyer' },
    {
      id: 'livingDining',
      name: 'Living / Dining',
      origin: [4, 0],
      width: 4,
      depth: 6,
      // L-extension to the west, only in the LOWER half (z 4..6) — the notch
      // at [0,0]..[4,4] is where bedroom3 sits, so their rects overlap ONLY
      // in bbox terms ([0,0]..[8,6] vs [0,0]..[3,3]), never via a true edge.
      extension: { offset: [-4, 4], width: 4, depth: 2 },
      category: 'living',
    },
    // AC ledge attached to corridor's north wall (NOT livingDining) — the
    // living FCU can only reach it by first crossing the open-plan gap.
    { id: 'ledge', name: 'AC Ledge', origin: [8, -1.2], width: 2, depth: 1.2, category: 'other' },
  ]
  const walls: PlanWall[] = [
    ...rectWalls('bed3', 0, 0, 3, 3),
    ...rectWalls('ledge', 8, -1.2, 2, 1.2),
    // corridor: perimeter minus its west wall (x=8, the boundary shared with
    // livingDining's main rect) — open-plan knock-through, no wall at all.
    { id: 'corridor-n', start: [8, 0], end: [10, 0], thickness: 'internal' },
    { id: 'corridor-s', start: [8, 6], end: [10, 6], thickness: 'internal' },
    { id: 'corridor-e', start: [10, 0], end: [10, 6], thickness: 'internal' },
    // livingDining: main rect walls minus its east wall (x=8, mirrors
    // corridor's missing west wall) + the extension's walls (it's a real L,
    // fully enclosed on every other side).
    { id: 'living-n', start: [4, 0], end: [8, 0], thickness: 'internal' },
    { id: 'living-w-upper', start: [4, 0], end: [4, 4], thickness: 'internal' },
    { id: 'living-notch-s', start: [0, 4], end: [4, 4], thickness: 'internal' },
    { id: 'living-notch-w', start: [0, 4], end: [0, 6], thickness: 'internal' },
    { id: 'living-s', start: [0, 6], end: [8, 6], thickness: 'internal' },
  ]
  const openings: PlanOpening[] = []
  return {
    id: 'l-shape-probe-fix2',
    name: 'L-shape probe fix 2',
    ceilingHeight: 2.8,
    extent: [10, 6],
    walls,
    openings,
    rooms,
  }
}

describe('buildAirconTrunkingPlan — L-shaped room bbox-overlap regression (2026-07-25 probe)', () => {
  it('finds the gap link via the L room’s TRUE edges, not its overlapping bbox', () => {
    const p = lShapedLivingProbeFix2Plan()
    const systemPlan = buildAirconSystemPlan(p)
    const { items } = planAirconPlacements(p, systemPlan)
    const input = resolveAirconTrunkingInput(p, systemPlan, items)
    const trunking = buildAirconTrunkingPlan(p, systemPlan, input)

    const livingRun = trunking.runs.find((r) => r.roomId === 'livingDining')
    expect(livingRun).toBeDefined()
    // The ledge sits on `corridor`, not `livingDining` — this can ONLY
    // resolve by crossing the open-plan gap link into corridor first.
    expect(livingRun!.resolved).toBe(true)
    expect(livingRun!.roomsTraversed).toContain('corridor')
    expect(livingRun!.lengthM).toBeGreaterThan(0)
    expect(livingRun!.lengthM).toBeLessThan(30)
    // The route must never claim to traverse bedroom3 — it's only bbox-
    // adjacent, never actually reachable from livingDining's real footprint.
    expect(livingRun!.roomsTraversed).not.toContain('bedroom3')
  })
})
