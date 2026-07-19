/**
 * Lighting switch-circuit model (BSJ-3, `switchCircuits` pro flag) — pure, no
 * store/React/three imports so it stays unit-testable and re-usable by the
 * editor overlay, the electrical sheet SVG and the DXF export alike.
 *
 * Links a `switch` electrical point to the light fixtures it controls and
 * derives the deterministic circuit tags an electrician wires from (S1, S2, …;
 * a two-way pair shares a number → S1a / S1b).
 *
 * ID VOCABULARY (documented decision). A switch's `controls` array holds the
 * ids of the LIGHT FIXTURES it drives. Today the only controllable lighting
 * targets are placed light fixtures (furniture items registered in
 * `furniture/lightEmitters.ts`) whose `PlanLight.id === item.id`, and the
 * `ElectricalKind` union has NO lighting-kind POINT — so a raw item id is
 * unambiguous and needs no prefix. If a lighting-kind electrical point is ever
 * added, prefix its point ids as `point:<id>` to disambiguate; the resolver
 * here keys only on the id string, so that extension is additive.
 *
 * TWO-WAY. A two-way circuit (staircase / bedroom — one light group operated
 * from two switches) is modelled as TWO switch points that list the SAME
 * controlled ids and each carry `way: 2`. They share one circuit NUMBER and
 * get the `a`/`b` suffixed tags (`S1a`/`S1b`); the legend prints one row.
 *
 * Determinism. Switches and lights are ordered by (x, z, id) before any number
 * is assigned, so the same design always yields the same S/L tags regardless
 * of array/insertion order.
 */

import { GROUND_LEVEL_ID, planLevels } from './levels'
import { wallNormal } from './openingProbe'
import { type FloorPlan, type PlanRoom, type PlanWall, pointInRoom, wallLength } from './types'

/** A switch point, the shape this module needs (a subset of
 *  `PlanElectricalPoint`/`ElectricalPoint`). */
export interface CircuitSwitchInput {
  id: string
  x: number
  z: number
  controls?: string[]
  gang?: number
  way?: number
  levelId?: string
}

/** A light fixture, the shape this module needs (a subset of `PlanLight`). */
export interface CircuitLightInput {
  id: string
  x: number
  z: number
  /** Emitter/def key (its furniture type) — drives the circuit's descriptor. */
  type: string
  label?: string
  levelId?: string
}

/** One lighting circuit — a single switch, or a two-way PAIR of switches, plus
 *  the light group they operate. Rendered as one legend row. */
export interface SwitchCircuit {
  /** 1-based circuit number (stable). */
  circuitNo: number
  /** Base tag for the legend, e.g. `"S1"`. */
  tag: string
  /** The controlling switch point id(s) — 1, or 2 for a two-way pair. */
  switchIds: string[]
  /** Controlled light ids that resolve to a present light. */
  controls: string[]
  /** L-marks of the controlled lights, e.g. `["L1","L2"]`. */
  lightMarks: string[]
  gang: number
  /** 1 = one-way, 2 = two-way. */
  way: number
  /** Human descriptor for the legend, e.g. `"Living downlights"`. */
  roomLabel: string
}

export interface SwitchCircuitPlan {
  circuits: SwitchCircuit[]
  /** switch point id → its specific on-plan tag (`S1`, or `S1a`/`S1b`). */
  tagBySwitchId: Map<string, string>
  /** controlled light id → its L-mark (`L1`). Only controlled lights get one. */
  lightMarkById: Map<string, string>
  /** controlled light id → the circuit tags controlling it (usually one). */
  tagsByLightId: Map<string, string[]>
  /** Lights present but controlled by no switch — the advisory count. */
  unswitchedLightCount: number
  /** `switch` points whose `controls` resolve to zero present lights. */
  emptySwitchCount: number
}

/** Stable (x, z, id) ordering. */
function byPos<T extends { x: number; z: number; id: string }>(a: T, b: T): number {
  return a.x - b.x || a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/** A short descriptor word for a fixture type, for the legend label. */
function typeWord(types: Set<string>): string {
  if (types.size === 1) {
    const only = [...types][0]
    if (only === 'ceiling-fan') return 'fan'
    if (only === 'cove-light') return 'cove lights'
    if (only === 'ceiling-light') return 'downlights'
  }
  return 'lights'
}

/**
 * Build the switch-circuit plan for a set of switch points + light fixtures.
 * `roomNameAt` (optional) resolves a world point to its room name for the
 * legend descriptor (the caller wires it from `allPlanRooms` + `pointInRoom`);
 * without it the descriptor is just the fixture-type word.
 */
export function buildSwitchCircuits(
  switches: CircuitSwitchInput[],
  lights: CircuitLightInput[],
  roomNameAt?: (x: number, z: number) => string | undefined,
): SwitchCircuitPlan {
  const lightById = new Map(lights.map((l) => [l.id, l]))
  const switchById = new Map(switches.map((s) => [s.id, s]))

  // Resolve each switch's controls to lights that are actually present.
  const resolvedControls = (s: CircuitSwitchInput): string[] =>
    (s.controls ?? []).filter((id) => lightById.has(id))

  const linked = switches.filter((s) => resolvedControls(s).length > 0).sort(byPos)
  const emptySwitchCount = switches.length - linked.length

  // L-marks: number the controlled lights (across all switches) in (x,z,id)
  // order so a light's mark is stable regardless of which switch it hangs off.
  const controlledLightIds = new Set<string>()
  for (const s of linked) for (const id of resolvedControls(s)) controlledLightIds.add(id)
  const lightMarkById = new Map<string, string>()
  ;[...controlledLightIds]
    .map((id) => lightById.get(id)!)
    .sort(byPos)
    .forEach((l, i) => {
      lightMarkById.set(l.id, `L${i + 1}`)
    })

  // Two-way pairing: among way===2 switches, pair those with an identical
  // resolved control-set (sorted-join key), two at a time in (x,z,id) order.
  const twoWayGroups = new Map<string, CircuitSwitchInput[]>()
  for (const s of linked) {
    if ((s.way ?? 1) !== 2) continue
    const key = [...resolvedControls(s)].sort().join('|')
    const arr = twoWayGroups.get(key)
    if (arr) arr.push(s)
    else twoWayGroups.set(key, [s])
  }
  const partnerOf = new Map<string, string>()
  for (const group of twoWayGroups.values()) {
    const g = [...group].sort(byPos)
    for (let i = 0; i + 1 < g.length; i += 2) {
      partnerOf.set(g[i]!.id, g[i + 1]!.id)
      partnerOf.set(g[i + 1]!.id, g[i]!.id)
    }
  }

  const tagBySwitchId = new Map<string, string>()
  const tagsByLightId = new Map<string, string[]>()
  const circuits: SwitchCircuit[] = []
  let circuitNo = 0

  const describe = (controls: string[], way: number, gang: number): string => {
    const ls = controls.map((id) => lightById.get(id)!).filter(Boolean)
    const roomCounts = new Map<string, number>()
    for (const l of ls) {
      const rn = roomNameAt?.(l.x, l.z)
      if (rn) roomCounts.set(rn, (roomCounts.get(rn) ?? 0) + 1)
    }
    let room = ''
    let best = 0
    for (const [rn, c] of roomCounts) {
      if (c > best) {
        best = c
        room = rn
      }
    }
    const word = typeWord(new Set(ls.map((l) => l.type)))
    const base = room ? `${room} ${word}` : word
    const tags: string[] = []
    if (way === 2) tags.push('2-way')
    if (gang >= 2) tags.push(`${gang}-gang`)
    return tags.length ? `${base} (${tags.join(', ')})` : base
  }

  for (const s of linked) {
    if (tagBySwitchId.has(s.id)) continue
    circuitNo++
    const partnerId = partnerOf.get(s.id)
    const controls = resolvedControls(s)
    const marks = controls
      .map((id) => lightMarkById.get(id)!)
      .filter(Boolean)
      .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
    if (partnerId && switchById.has(partnerId)) {
      // Two-way pair: shared circuit number, a/b suffix in (x,z,id) order (s is
      // first since `linked` is sorted and the partner is not yet assigned).
      tagBySwitchId.set(s.id, `S${circuitNo}a`)
      tagBySwitchId.set(partnerId, `S${circuitNo}b`)
      circuits.push({
        circuitNo,
        tag: `S${circuitNo}`,
        switchIds: [s.id, partnerId],
        controls,
        lightMarks: marks,
        gang: Math.max(s.gang ?? 1, switchById.get(partnerId)?.gang ?? 1),
        way: 2,
        roomLabel: describe(controls, 2, Math.max(s.gang ?? 1, 1)),
      })
    } else {
      tagBySwitchId.set(s.id, `S${circuitNo}`)
      circuits.push({
        circuitNo,
        tag: `S${circuitNo}`,
        switchIds: [s.id],
        controls,
        lightMarks: marks,
        gang: s.gang ?? 1,
        way: s.way ?? 1,
        roomLabel: describe(controls, s.way ?? 1, s.gang ?? 1),
      })
    }
    for (const id of controls) {
      const list = tagsByLightId.get(id) ?? []
      list.push(`S${circuitNo}`)
      tagsByLightId.set(id, list)
    }
  }

  const unswitchedLightCount = lights.length - controlledLightIds.size

  return {
    circuits,
    tagBySwitchId,
    lightMarkById,
    tagsByLightId,
    unswitchedLightCount,
    emptySwitchCount,
  }
}

const lvl = (id?: string): string => id ?? GROUND_LEVEL_ID

/** How far (m) to probe off a switch's on-wall point to land inside the room it
 *  serves. A `deriveElectricalPoints` switch sits ON its host wall's centreline
 *  (just past the door leaf), so it is NOT strictly inside any interior room
 *  rectangle — it must be nudged perpendicular past the wall face. 0.3 m clears
 *  a typical HDB external wall (~0.2 m thick → 0.1 m half) and lands ~0.2 m
 *  inside the room. */
const SWITCH_ROOM_PROBE_M = 0.3

/** Squared distance from point `(px,pz)` to wall segment `w` (for nearest-wall). */
function pointToWallDist2(px: number, pz: number, w: PlanWall): number {
  const ax = w.start[0]
  const az = w.start[1]
  const dx = w.end[0] - ax
  const dz = w.end[1] - az
  const l2 = dx * dx + dz * dz
  if (l2 <= 0) return (px - ax) ** 2 + (pz - az) ** 2
  let t = ((px - ax) * dx + (pz - az) * dz) / l2
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cz = az + t * dz
  return (px - cx) ** 2 + (pz - cz) ** 2
}

/**
 * Which room(s) a switch belongs to. Mirrors the openingSchedule probe
 * (`openingProbe.ts`): a direct `pointInRoom` hit wins, but a switch on a wall
 * centreline (the realistic `deriveElectricalPoints` case) is resolved by
 * probing ~0.3 m perpendicular to its NEAREST wall (both sides), landing just
 * inside whichever room(s) that wall bounds. Cardinal-direction probes are a
 * fallback for a degenerate / wall-less plan. Returns the set of room ids the
 * switch could serve (a switch beside a door on an INTERNAL wall legitimately
 * borders both rooms; the per-room nearest-door heuristic then picks it).
 */
function switchRoomIds(
  rooms: readonly PlanRoom[],
  walls: readonly PlanWall[],
  sx: number,
  sz: number,
): Set<string> {
  const ids = new Set<string>()
  for (const r of rooms) if (pointInRoom(r, sx, sz)) ids.add(r.id)
  if (ids.size > 0) return ids
  const probes: [number, number][] = []
  let best: PlanWall | undefined
  let bestD = Number.POSITIVE_INFINITY
  for (const w of walls) {
    const d = pointToWallDist2(sx, sz, w)
    if (d < bestD) {
      bestD = d
      best = w
    }
  }
  const n = best ? wallNormal(best) : null
  if (n)
    probes.push(
      [n[0] * SWITCH_ROOM_PROBE_M, n[1] * SWITCH_ROOM_PROBE_M],
      [-n[0] * SWITCH_ROOM_PROBE_M, -n[1] * SWITCH_ROOM_PROBE_M],
    )
  probes.push(
    [SWITCH_ROOM_PROBE_M, 0],
    [-SWITCH_ROOM_PROBE_M, 0],
    [0, SWITCH_ROOM_PROBE_M],
    [0, -SWITCH_ROOM_PROBE_M],
  )
  for (const [dx, dz] of probes)
    for (const r of rooms) if (pointInRoom(r, sx + dx, sz + dz)) ids.add(r.id)
  return ids
}

/**
 * Suggest a switch→light linking for every room (BSJ-3 "Suggest circuits").
 *
 * CONVENTION (SG norm): the light switch beside a room's ENTRY DOOR operates
 * that room's main lights — so, per room, the switch physically NEAREST any of
 * the room's doors is linked to ALL the room's light fixtures. A room with a
 * single switch gets it regardless; a room with no switch is left for the
 * unswitched-lights advisory. Returns a map of switch id → controlled light ids
 * (only the chosen switch per room); the caller applies it under one undo step.
 * Level-gated: a switch/light/door only counts for a room on the SAME storey.
 */
export function suggestCircuitLinks(
  plan: FloorPlan,
  switches: CircuitSwitchInput[],
  lights: CircuitLightInput[],
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const level of planLevels(plan)) {
    const levelId = level.id
    const walls = Array.isArray(level.walls) ? level.walls : []
    const openings = Array.isArray(level.openings) ? level.openings : []
    // Door midpoints on this storey (entry-door reference points).
    const doorMids: [number, number][] = []
    for (const o of openings) {
      if (o.kind !== 'door') continue
      const wall = walls.find((w) => w.id === o.wallId)
      if (!wall) continue
      const len = wallLength(wall)
      if (len === 0) continue
      const ux = (wall.end[0] - wall.start[0]) / len
      const uz = (wall.end[1] - wall.start[1]) / len
      const at = o.offset + o.width / 2
      doorMids.push([wall.start[0] + ux * at, wall.start[1] + uz * at])
    }
    const rooms = Array.isArray(level.rooms) ? level.rooms : []
    // Resolve each on-level switch's room membership ONCE (probe-based, so a
    // switch on a wall centreline still lands in the room it serves).
    const roomIdsBySwitch = new Map<string, Set<string>>()
    for (const s of switches) {
      if (lvl(s.levelId) !== levelId) continue
      roomIdsBySwitch.set(s.id, switchRoomIds(rooms, walls, s.x, s.z))
    }
    for (const room of rooms) {
      const roomSwitches = switches.filter(
        (s) => lvl(s.levelId) === levelId && roomIdsBySwitch.get(s.id)?.has(room.id),
      )
      const roomLights = lights.filter(
        (l) => lvl(l.levelId) === levelId && pointInRoom(room, l.x, l.z),
      )
      if (roomSwitches.length === 0 || roomLights.length === 0) continue
      // Reference: nearest door, else the room's rectangular centre.
      const ref = doorMids.length
        ? undefined
        : ([room.origin[0] + room.width / 2, room.origin[1] + room.depth / 2] as [number, number])
      const dist2 = (s: CircuitSwitchInput): number => {
        if (ref) return (s.x - ref[0]) ** 2 + (s.z - ref[1]) ** 2
        let best = Number.POSITIVE_INFINITY
        for (const [dx, dz] of doorMids) best = Math.min(best, (s.x - dx) ** 2 + (s.z - dz) ** 2)
        return best
      }
      const chosen = [...roomSwitches].sort((a, b) => dist2(a) - dist2(b) || byPos(a, b))[0]!
      out.set(
        chosen.id,
        roomLights.map((l) => l.id),
      )
    }
  }
  return out
}
