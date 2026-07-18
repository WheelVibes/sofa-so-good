/**
 * Plumbing plan core (PARITY-PLUMBING — mirrors `electricalPlan.ts`).
 *
 * Pure plan builder: takes a floor plan + a list of plumbing points (water
 * supply, drainage/waste, floor traps, soil pipes, water heaters) and returns a
 * validated, clamped copy plus a per-kind schedule (count + friendly label) —
 * the plumbing spec sheet that sits alongside the electrical + lighting plans in
 * an SG renovation drawing set (Coohom parity).
 *
 * Self-contained: imports only `./types`. No furniture / store types.
 */

import type { FloorPlan, PlumbingKind } from './types'

/** Standard SG plumbing point kinds — moved to `floorplan/types.ts` (MEP layer
 *  plan, G1), same rationale as `electricalPlan.ts`'s `ElectricalKind`.
 *  Re-exported here type-only so existing importers are unaffected. */
export type { PlumbingKind }

/** A single plumbing point placed in the plan (world metres). */
export interface PlumbingPoint {
  x: number
  z: number
  kind: PlumbingKind
  /** Optional free-text annotation (e.g. "kitchen sink", "WC"). */
  label?: string
  /** Storey the point sits on; absent = ground (F13). */
  levelId?: string
}

/** One schedule row: how many of a given kind, with a friendly label. */
interface PlumbingScheduleRow {
  kind: PlumbingKind
  count: number
  label: string
}

/** The built plan: validated points + a per-kind schedule. */
export interface PlumbingPlan {
  points: PlumbingPoint[]
  schedule: PlumbingScheduleRow[]
}

/** Human-friendly labels per kind. */
const KIND_LABELS: Record<PlumbingKind, string> = {
  'water-point': 'Water supply point',
  drainage: 'Waste / drainage point',
  'floor-trap': 'Floor trap',
  'soil-pipe': 'Soil pipe (WC)',
  'water-heater': 'Water heater point',
}

/** Stable schedule ordering (independent of input order). */
const KIND_ORDER: PlumbingKind[] = [
  'water-point',
  'drainage',
  'floor-trap',
  'soil-pipe',
  'water-heater',
]

const VALID_KINDS = new Set<PlumbingKind>(KIND_ORDER)

/** Finite-number clamp helper (NaN / Infinity → 0). */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * Build a plumbing plan from raw points. Pure: validates each point (drops
 * unknown kinds, clamps non-finite coordinates to 0), keeps points even if they
 * fall outside the plan walls, and groups into a per-kind schedule. Non-array
 * `points` (or a plan with a non-array `walls`) is tolerated and treated empty.
 */
export function buildPlumbingPlan(plan: FloorPlan, points: PlumbingPoint[]): PlumbingPlan {
  void (plan && Array.isArray(plan.walls) ? plan.walls : [])

  const raw = Array.isArray(points) ? points : []
  const clean: PlumbingPoint[] = []
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue
    const kind = (p as PlumbingPoint).kind
    if (!VALID_KINDS.has(kind)) continue
    const out: PlumbingPoint = { x: num(p.x), z: num(p.z), kind }
    if (typeof p.label === 'string' && p.label.length > 0) out.label = p.label
    if (typeof p.levelId === 'string' && p.levelId.length > 0) out.levelId = p.levelId
    clean.push(out)
  }

  const counts = new Map<PlumbingKind, number>()
  for (const p of clean) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1)

  const schedule: PlumbingScheduleRow[] = []
  for (const kind of KIND_ORDER) {
    const count = counts.get(kind) ?? 0
    if (count > 0) schedule.push({ kind, count, label: KIND_LABELS[kind] })
  }

  return { points: clean, schedule }
}

/** The friendly label for a kind (exported for the SVG legend). */
export function plumbingKindLabel(kind: PlumbingKind): string {
  return KIND_LABELS[kind] ?? kind
}
