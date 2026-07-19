/**
 * Electrical / power & data layout plan core (feature F29).
 *
 * Pure plan builder: takes a floor plan + a list of electrical points (sockets,
 * switches, data outlets, TV points, aircon + water-heater connection points)
 * and returns a validated, clamped copy plus a per-kind schedule (count +
 * friendly label) — the spec sheet that sits alongside the lighting plan in an
 * SG renovation drawing set.
 *
 * Self-contained: imports only `./types`. No furniture / store types.
 */

import type { ElectricalKind, FloorPlan } from './types'

/** Standard SG electrical point kinds — moved to `floorplan/types.ts` (MEP
 *  layer plan, G1) so `PlanElectricalPoint` can live there without an import
 *  cycle; re-exported here type-only so existing importers are unaffected. */
export type { ElectricalKind }

/** A single electrical point placed in the plan (world metres). */
export interface ElectricalPoint {
  x: number
  z: number
  kind: ElectricalKind
  /** Optional free-text annotation (e.g. "fridge", "study desk"). */
  label?: string
  /** Storey the point sits on; absent = ground (F13). */
  levelId?: string
  /** Mount height above finished floor level (mm, AFFL) — carried through from
   *  a persisted `PlanElectricalPoint` (MEP layer, G1 PR5) so the exported
   *  sheet can print it beside the symbol. Absent for heuristic-derived
   *  points (the furniture-layout fallback has no authored height). */
  mountHeightMm?: number
  /** Point id — carried through from the persisted `PlanElectricalPoint` so the
   *  electrical sheet can join a `switch` to its lighting circuit (BSJ-3).
   *  Absent for heuristic-derived points. */
  id?: string
  /** Controlled light-fixture ids for a `switch` point (BSJ-3) — carried through
   *  so the sheet can tag the circuit. See `PlanElectricalPoint.controls`. */
  controls?: string[]
  /** Switch gang count (BSJ-3). */
  gang?: number
  /** One-way (1) / two-way (2) switching (BSJ-3). */
  way?: number
}

/** One schedule row: how many of a given kind, with a friendly label. */
interface ElectricalScheduleRow {
  kind: ElectricalKind
  count: number
  label: string
}

/** The built plan: validated points + a per-kind schedule. */
export interface ElectricalPlan {
  points: ElectricalPoint[]
  schedule: ElectricalScheduleRow[]
}

/** Human-friendly labels per kind. */
const KIND_LABELS: Record<ElectricalKind, string> = {
  socket: 'Single socket outlet',
  'socket-double': 'Double socket outlet',
  switch: 'Light switch',
  data: 'Data / network point',
  'tv-point': 'TV point',
  aircon: 'Aircon point',
  'water-heater': 'Water heater point',
}

/** Stable schedule ordering (independent of input order). */
const KIND_ORDER: ElectricalKind[] = [
  'socket',
  'socket-double',
  'switch',
  'data',
  'tv-point',
  'aircon',
  'water-heater',
]

const VALID_KINDS = new Set<ElectricalKind>(KIND_ORDER)

/** Finite-number clamp helper (NaN / Infinity → 0). */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * Build an electrical plan from raw points. Pure: validates each point (drops
 * unknown kinds, clamps non-finite coordinates to 0), keeps points even if they
 * fall outside the plan walls, and groups into a per-kind schedule. Non-array
 * `points` (or a plan with a non-array `walls`) is tolerated and treated empty.
 */
export function buildElectricalPlan(plan: FloorPlan, points: ElectricalPoint[]): ElectricalPlan {
  // Tolerate a malformed plan (non-array walls): bounds are the SVG step's job,
  // but reading walls defensively here keeps the core safe for any caller.
  void (plan && Array.isArray(plan.walls) ? plan.walls : [])

  const raw = Array.isArray(points) ? points : []
  const clean: ElectricalPoint[] = []
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue
    const kind = (p as ElectricalPoint).kind
    if (!VALID_KINDS.has(kind)) continue
    const out: ElectricalPoint = { x: num(p.x), z: num(p.z), kind }
    if (typeof p.label === 'string' && p.label.length > 0) out.label = p.label
    if (typeof p.levelId === 'string' && p.levelId.length > 0) out.levelId = p.levelId
    if (typeof p.mountHeightMm === 'number' && Number.isFinite(p.mountHeightMm))
      out.mountHeightMm = p.mountHeightMm
    // BSJ-3: carry the id + switch-circuit fields through so the sheet can join
    // a switch to its lighting circuit. Only meaningful on `switch` points.
    if (typeof p.id === 'string' && p.id.length > 0) out.id = p.id
    if (Array.isArray(p.controls) && p.controls.length > 0)
      out.controls = p.controls.filter((c) => typeof c === 'string' && c.length > 0)
    if (typeof p.gang === 'number' && Number.isFinite(p.gang)) out.gang = p.gang
    if (typeof p.way === 'number' && Number.isFinite(p.way)) out.way = p.way
    clean.push(out)
  }

  const counts = new Map<ElectricalKind, number>()
  for (const p of clean) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1)

  const schedule: ElectricalScheduleRow[] = []
  for (const kind of KIND_ORDER) {
    const count = counts.get(kind) ?? 0
    if (count > 0) schedule.push({ kind, count, label: KIND_LABELS[kind] })
  }

  return { points: clean, schedule }
}

/** The friendly label for a kind (exported for the SVG legend). */
export function electricalKindLabel(kind: ElectricalKind): string {
  return KIND_LABELS[kind] ?? kind
}
