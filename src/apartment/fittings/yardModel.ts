/**
 * YARD-FITTINGS — the three things a real HDB BTO service yard has that
 * `plumbingModel.ts` stops short of: the washing machine's BRAIDED INLET HOSE running from the
 * bib tap down to the machine's top-back, its corrugated DRAIN HOSE snaking around the machine
 * into the floor trap, and the CEILING-MOUNTED RETRACTABLE LAUNDRY RACK (two brackets, a few
 * aluminium poles on hanger cords) that every flat in Singapore dries its washing on.
 *
 * Sibling of `plumbingModel.ts`, and downstream of it: the hoses are derived from the fittings
 * that model already resolved (the `water-point` on the wall behind the machine and the
 * `floor-trap` in the same room), never from the raw MEP points, so the hose always lands on the
 * hardware that is actually drawn. If either endpoint is missing — no tap within
 * `FIXTURE_SNAP_M`, no trap in the room — that hose is simply not emitted; a hose to nowhere
 * reads far worse than no hose.
 *
 * The washer's own geometry comes from its catalog footprint through {@link yardWashers}, which
 * is the ONLY place this module needs the furniture catalog. Everything else is plan maths.
 *
 * Rotation convention: furniture is footprint-centred and faces +Z, and three rotates a local
 * (lx, lz) by `item.rotation` (yaw about +Y) to world `(lx·cosθ + lz·sinθ, −lx·sinθ + lz·cosθ)`.
 * The machine's BACK is therefore local −Z. (`plumbingModel.ts:outOfObstacles` uses the
 * transposed form, which is indistinguishable for the square, axis-aligned footprints it is
 * given; do not copy it here — a hose is not symmetric.)
 *
 * Pure: no three, no store, no React. Metres and radians throughout.
 */
import { roomCategoryFromName } from '../../floorplan/roomCategory'
import { type FloorPlan, type PlanRoom, pointInRoom, roomPolygon } from '../../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../../furniture/types'
import {
  DEFAULT_CEILING_M,
  FIXTURE_SNAP_M,
  FLOOR_TRAP_SIZE_M,
  FLOOR_TRAP_Y,
  type PlumbingFitting,
} from './plumbingModel'

// ── hoses ───────────────────────────────────────────────────────────────────

/** Braided steel inlet hose — ~24 mm over the braid. */
export const INLET_HOSE_R = 0.012
/** Corrugated drain hose — fatter and matte, which is what reads as "corrugated" at 2 m. */
export const DRAIN_HOSE_R = 0.016
/** How far the bib tap's spout tip stands off the tap's own centre (matches `bibTap()`'s
 *  downturned spout in `PlumbingFittings.tsx`: out `+0.026`, down `0.068`). */
const TAP_SPOUT_OUT_M = 0.026
const TAP_SPOUT_DROP_M = 0.068
/** The inlet port sits this far below the machine's top face. */
const INLET_PORT_DROP_M = 0.06
/** The drain port sits this high off the floor at the machine's back. */
const DRAIN_PORT_Y_M = 0.12
/** How far the hose stands off the machine's back panel (clear of the shell, not of the wall —
 *  a washer is pushed back to within a few centimetres of its wall). */
const HOSE_BACK_CLEAR_M = 0.004
/** How far past the machine's side the drain hose turns before it heads for the trap. Routing
 *  it straight from the back panel to the trap cuts the corner of the machine's own footprint. */
const DRAIN_TURN_CLEAR_M = 0.06

// ── ceiling laundry rack ────────────────────────────────────────────────────

/** Poles hang at 2.05 m AFFL — high enough to walk under, low enough to reach. */
export const RACK_POLE_Y_M = 2.05
/** Ø 28 mm aluminium pole. */
const RACK_POLE_R_M = 0.014
/** Ø 4 mm hanger cord. */
const RACK_CORD_R_M = 0.002
/** Across-the-short-axis spacing between poles. */
export const RACK_POLE_SPACING_M = 0.22
/** How many poles a rack gets when the room is wide enough for them. */
export const RACK_POLE_COUNT = 3
/** Poles span this fraction of the room's long axis. */
const RACK_SPAN_FRAC = 0.8
/** Nothing in the rack comes closer than this to a room edge. */
export const RACK_WALL_CLEAR_M = 0.1
/** A room shorter than this on its long axis cannot take a rack. */
export const RACK_MIN_LONG_M = 1.6
/** …nor can a ceiling lower than this. */
export const RACK_MIN_CEILING_M = 2.3
/** Ceiling bracket / pulley housing: across the short axis × down × along the long axis. */
const RACK_BRACKET = { w: 0.12, h: 0.06, d: 0.08 } as const
/** Where along the long axis the two brackets sit, as a fraction of the room's extent. */
const RACK_BRACKET_FRACS = [0.25, 0.75] as const

// ── shapes ──────────────────────────────────────────────────────────────────

/** A washing machine reduced to what the hoses need: where it is, which way it faces, how big. */
export interface WasherPlacement {
  x: number
  z: number
  /** Yaw about +Y; the machine's back is local −Z rotated by this. */
  rotation: number
  w: number
  d: number
  h: number
}

type YardHoseKind = 'inlet' | 'drain'

/** A hose as a polyline the renderer sweeps a tube along (Catmull-Rom). World metres. */
interface YardHose {
  kind: YardHoseKind
  radius: number
  points: [number, number, number][]
  /** The room the machine stands in, for the per-room editor scope. */
  roomId: string | null
}

type YardRackPartKind = 'bracket' | 'pole' | 'cord'

/**
 * One rack primitive. `s` is the size BEFORE `rot` is applied: a box is (w, h, d); a cylinder is
 * (diameter, length, diameter) about its own +Y, so a pole lying along world −Z/+Z carries
 * `rot = [π/2, 0, 0]`.
 */
interface YardRackPart {
  kind: YardRackPartKind
  geo: 'box' | 'cyl'
  c: [number, number, number]
  s: [number, number, number]
  rot: [number, number, number]
  roomId: string
}

export interface YardFittingSet {
  hoses: YardHose[]
  rack: YardRackPart[]
}

// ── washers ─────────────────────────────────────────────────────────────────

const WASHER_RE = /washing-machine/

/**
 * Every ground-storey washing machine, with the footprint its catalog def declares. The one
 * point in this module that touches the furniture catalog — everything downstream is plan maths.
 */
export function yardWashers(
  items: readonly FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
): WasherPlacement[] {
  const out: WasherPlacement[] = []
  for (const it of items) {
    if (it.levelId) continue
    if (!WASHER_RE.test(it.defId)) continue
    const def = catalog[it.defId]
    if (!def) continue
    out.push({
      x: it.position[0],
      z: it.position[1],
      rotation: it.rotation ?? 0,
      w: def.defaultFootprint.w,
      d: def.defaultFootprint.d,
      h: def.defaultFootprint.h,
    })
  }
  return out
}

// ── maths helpers ───────────────────────────────────────────────────────────

/** World direction of the machine's local +Z (the face it presents to the room). */
function forwardOf(m: WasherPlacement): [number, number] {
  return [Math.sin(m.rotation), Math.cos(m.rotation)]
}

/** World direction of the machine's local +X. */
function rightOf(m: WasherPlacement): [number, number] {
  return [Math.cos(m.rotation), -Math.sin(m.rotation)]
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function isServiceYard(r: PlanRoom): boolean {
  return (r.category ?? roomCategoryFromName(r.name)) === 'serviceYard'
}

function roomAt(plan: FloorPlan, x: number, z: number): string | null {
  return plan.rooms.find((r) => pointInRoom(r, x, z))?.id ?? null
}

// ── hoses ───────────────────────────────────────────────────────────────────

/**
 * The braided inlet hose: bib-tap spout → down, bellying slightly into the room → the port just
 * below the machine's top-back edge. Four points, so the renderer's Catmull-Rom reads as a hose
 * rather than a rod. Null when the machine has no tap to hang off.
 */
function inletHose(m: WasherPlacement, tap: PlumbingFitting, roomId: string | null): YardHose {
  const out: [number, number] = [Math.sin(tap.yaw), Math.cos(tap.yaw)]
  const [fx, fz] = forwardOf(m)
  const back: [number, number] = [-fx, -fz]
  const p0: [number, number, number] = [
    tap.x + out[0] * TAP_SPOUT_OUT_M,
    tap.y - TAP_SPOUT_DROP_M,
    tap.z + out[1] * TAP_SPOUT_OUT_M,
  ]
  const port = HOSE_BACK_CLEAR_M + INLET_HOSE_R + m.d / 2
  const p3: [number, number, number] = [
    m.x + back[0] * port,
    m.h - INLET_PORT_DROP_M,
    m.z + back[1] * port,
  ]
  // Belly the slack out of the wall (i.e. along the machine's FORWARD), never down through the
  // machine's top face: both mid points stay above `m.h` by construction of the two fractions.
  const mid = (t: number, bulge: number): [number, number, number] => [
    lerp(p0[0], p3[0], t) + fx * bulge,
    lerp(p0[1], p3[1], t),
    lerp(p0[2], p3[2], t) + fz * bulge,
  ]
  return {
    kind: 'inlet',
    radius: INLET_HOSE_R,
    points: [p0, mid(0.3, 0.045), mid(0.6, 0.03), p3],
    roomId,
  }
}

/**
 * The corrugated drain hose: the port low on the machine's back panel → out past the machine's
 * side nearest the trap → a shallow bow across the open tile → the near edge of the grating.
 * Routed AROUND the machine on purpose: a straight run from the back panel to the trap cuts
 * through the corner of the machine's own footprint.
 */
function drainHose(m: WasherPlacement, trap: PlumbingFitting, roomId: string | null): YardHose {
  const [fx, fz] = forwardOf(m)
  const [rx, rz] = rightOf(m)
  const back: [number, number] = [-fx, -fz]
  const bd = HOSE_BACK_CLEAR_M + DRAIN_HOSE_R + m.d / 2
  // Which side of the machine the trap lies on, in the machine's own frame.
  const side = (trap.x - m.x) * rx + (trap.z - m.z) * rz >= 0 ? 1 : -1
  const at = (along: number, y: number): [number, number, number] => [
    m.x + back[0] * bd + rx * along,
    y,
    m.z + back[1] * bd + rz * along,
  ]
  const p0 = at(side * (m.w / 4), DRAIN_PORT_Y_M)
  const p1 = at(side * (m.w / 2 + DRAIN_TURN_CLEAR_M), DRAIN_PORT_Y_M - 0.02)
  // The grating edge facing the machine, with the tube's own radius held off the tile.
  const dx = p1[0] - trap.x
  const dz = p1[2] - trap.z
  const len = Math.hypot(dx, dz) || 1
  const edge = FLOOR_TRAP_SIZE_M / 2
  const p3: [number, number, number] = [
    trap.x + (dx / len) * edge,
    FLOOR_TRAP_Y + DRAIN_HOSE_R,
    trap.z + (dz / len) * edge,
  ]
  const p2: [number, number, number] = [
    lerp(p1[0], p3[0], 0.55),
    lerp(p1[1], p3[1], 0.55) + 0.02,
    lerp(p1[2], p3[2], 0.55),
  ]
  return { kind: 'drain', radius: DRAIN_HOSE_R, points: [p0, p1, p2, p3], roomId }
}

// ── ceiling rack ────────────────────────────────────────────────────────────

/**
 * The ceiling rack for one room, or `[]` when the room cannot take one: shorter than
 * {@link RACK_MIN_LONG_M} on its long axis, a ceiling under {@link RACK_MIN_CEILING_M}, no room
 * across the short axis for even one pole at {@link RACK_WALL_CLEAR_M}, or a shape whose pole
 * ends fall outside the polygon (an L-shaped yard: skip rather than hang a pole through a wall).
 */
function rackFor(room: PlanRoom, ceiling: number): YardRackPart[] {
  if (ceiling < RACK_MIN_CEILING_M) return []
  const poly = roomPolygon(room)
  const xs = poly.map((p) => p[0])
  const zs = poly.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const alongZ = maxZ - minZ >= maxX - minX
  const long = alongZ ? maxZ - minZ : maxX - minX
  const short = alongZ ? maxX - minX : maxZ - minZ
  if (long < RACK_MIN_LONG_M) return []
  // Poles across the short axis: as many of RACK_POLE_COUNT as fit inside the wall clearance.
  const halfRoom = short / 2 - RACK_WALL_CLEAR_M
  if (halfRoom <= 0) return []
  let count = RACK_POLE_COUNT
  while (count > 1 && ((count - 1) * RACK_POLE_SPACING_M) / 2 > halfRoom) count -= 1
  const span = Math.min(long * RACK_SPAN_FRAC, long - 2 * RACK_WALL_CLEAR_M)
  if (span <= 0) return []
  const longMin = alongZ ? minZ : minX
  const shortMid = alongZ ? (minX + maxX) / 2 : (minZ + maxZ) / 2
  const longMid = longMin + long / 2
  // World (x, z) from a (short-axis, long-axis) pair.
  const world = (s: number, l: number): [number, number] => (alongZ ? [s, l] : [l, s])
  const parts: YardRackPart[] = []
  const poleY = RACK_POLE_Y_M
  const bracketY = ceiling - RACK_BRACKET.h / 2
  const bracketLs = RACK_BRACKET_FRACS.map((f) => longMin + long * f)
  for (const l of bracketLs) {
    const [bx, bz] = world(shortMid, l)
    parts.push({
      kind: 'bracket',
      geo: 'box',
      c: [bx, bracketY, bz],
      s: alongZ
        ? [RACK_BRACKET.w, RACK_BRACKET.h, RACK_BRACKET.d]
        : [RACK_BRACKET.d, RACK_BRACKET.h, RACK_BRACKET.w],
      rot: [0, 0, 0],
      roomId: room.id,
    })
  }
  for (let i = 0; i < count; i++) {
    const s = shortMid + (i - (count - 1) / 2) * RACK_POLE_SPACING_M
    const [px, pz] = world(s, longMid)
    // Both ends must actually be over this room's floor.
    const [ax, az] = world(s, longMid - span / 2)
    const [bx2, bz2] = world(s, longMid + span / 2)
    if (!pointInRoom(room, ax, az) || !pointInRoom(room, bx2, bz2)) return []
    parts.push({
      kind: 'pole',
      geo: 'cyl',
      c: [px, poleY, pz],
      s: [RACK_POLE_R_M * 2, span, RACK_POLE_R_M * 2],
      // Unit cylinder is +Y; lay it along the long axis.
      rot: alongZ ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2],
      roomId: room.id,
    })
    for (const l of bracketLs) {
      const [cx, cz] = world(s, l)
      const top = ceiling - RACK_BRACKET.h
      parts.push({
        kind: 'cord',
        geo: 'cyl',
        c: [cx, (top + poleY) / 2, cz],
        s: [RACK_CORD_R_M * 2, Math.max(0.01, top - poleY), RACK_CORD_R_M * 2],
        rot: [0, 0, 0],
        roomId: room.id,
      })
    }
  }
  return parts
}

// ── resolve ─────────────────────────────────────────────────────────────────

/**
 * Resolve the service-yard fittings for a plan: a hose pair per washing machine that has both a
 * bib tap and a floor trap to connect, and a ceiling laundry rack in every service yard big
 * enough to hang one. `plumbing` is the list `plumbingModel.ts:resolvePlumbingFittings` already
 * produced, so the hoses land on the hardware that is actually drawn.
 */
export function resolveYardFittings(
  plan: FloorPlan,
  plumbing: readonly PlumbingFitting[],
  washers: readonly WasherPlacement[],
): YardFittingSet {
  const hoses: YardHose[] = []
  for (const m of washers) {
    const roomId = roomAt(plan, m.x, m.z)
    const tap = plumbing.find(
      (f) =>
        f.kind === 'water-point' &&
        f.wallId !== null &&
        Math.hypot(f.x - m.x, f.z - m.z) <= FIXTURE_SNAP_M,
    )
    if (tap) hoses.push(inletHose(m, tap, roomId))
    const trap =
      roomId === null
        ? undefined
        : plumbing.find((f) => f.kind === 'floor-trap' && f.roomId === roomId)
    if (trap) hoses.push(drainHose(m, trap, roomId))
  }
  const ceiling = plan.ceilingHeight ?? DEFAULT_CEILING_M
  const rack: YardRackPart[] = []
  for (const room of plan.rooms) {
    if (!isServiceYard(room)) continue
    rack.push(...rackFor(room, ceiling))
  }
  return { hoses, rack }
}

/**
 * Scope a resolved set to ONE room, for the per-room editor (EDITOR-LOCKSTEP; mirrors
 * `plumbingModel.ts:plumbingForRoom`). An id that matches no room yields an empty set rather
 * than falling back to the whole flat.
 */
export function yardFittingsForRoom(set: YardFittingSet, roomId: string): YardFittingSet {
  return {
    hoses: set.hoses.filter((h) => h.roomId === roomId),
    rack: set.rack.filter((p) => p.roomId === roomId),
  }
}
