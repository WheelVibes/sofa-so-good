/**
 * Indicative envelope thermal / U-value digest (PARITY-THERMAL).
 *
 * A transparent, lookup-table estimate of a home's thermal envelope — NOT a
 * certified simulation. Given a plan (+ optional finishes) it sums the EXTERIOR
 * opaque wall area and the glazing (window-opening) area across ALL storeys,
 * maps each surface to a representative steady-state U-value (W/m²K) via a small
 * documented `U_VALUES` table, and reports the total envelope area, the
 * area-weighted average U, and an indicative conductive heat-gain/loss index
 * `Σ (area × U)` (units W/K — multiply by an indoor-outdoor ΔT for watts).
 *
 * Why this shape:
 *  - The plan model identifies exterior walls structurally (`PlanWall.thickness
 *    === 'external'`), so the opaque envelope = every external wall's
 *    length × storey height, minus the window openings cut into those walls.
 *  - Glazing area = window openings (`PlanOpening.kind === 'window'`) on exterior
 *    walls, `width × (head − sill)`.
 *  - A surface's U-value comes from its construction category. Opaque walls map
 *    from the wall finish category when a finish hint is supplied, else the
 *    default reinforced-concrete (RC) wall. Glazing maps from a glazing category
 *    (single / double), defaulting to single glazing — the SG norm.
 *
 * Pure + deterministic + unit-testable: depends only on the floorplan helpers
 * (`planLevels`, `wallLength`), never on three/React/the store. Reuses the SAME
 * geometry helpers the rest of the app uses so the numbers reconcile with the
 * wall-finish schedule.
 *
 * Edge cases:
 *  - Bare-shell / empty plan (no walls) → a fully zeroed digest (never NaN).
 *  - An all-interior plan (no exterior walls) → zero envelope.
 *  - A surface whose finish maps to no table entry → a documented default U
 *    (RC wall for opaque, single glazing for glass).
 *
 * The figure is INDICATIVE only — it ignores roof/floor slabs, thermal bridging,
 * solar gain, infiltration, shading and orientation. The UI must label it so.
 */

import { planLevels } from '../floorplan/levels'
import type { RoomFinishMaps } from '../floorplan/roomFinishes'
import type { FloorPlan, PlanOpening } from '../floorplan/types'
import { wallLength } from '../floorplan/types'

/**
 * Representative steady-state U-values (W/m²K) for the Singapore residential
 * context. These are typical handbook / SS 530-style order-of-magnitude figures,
 * deliberately a single auditable table — they are indicative, not certified.
 *
 * Opaque-wall sources / assumptions (uninsulated, the SG norm):
 *  - `rc`        reinforced-concrete external wall (~150–200 mm), no insulation
 *                — ~2.0 (the default exterior construction here).
 *  - `brick`     plastered clay-brick / blockwork external wall — ~1.7.
 *  - `lightweight` lightweight / cavity / insulated partition or drywall
 *                external skin — ~1.0 (better-performing assembly).
 *  - `cladding`  insulated rain-screen / composite cladding — ~0.6.
 *
 * Glazing sources / assumptions (BCA / typical product data):
 *  - `single`    6 mm clear single glazing in an aluminium frame — ~5.7
 *                (the prevailing SG default → the glazing default).
 *  - `double`    insulated double-glazed unit — ~2.8.
 *  - `low-e`     low-emissivity double glazing — ~1.8.
 */
export const U_VALUES = {
  wall: {
    rc: 2.0,
    brick: 1.7,
    lightweight: 1.0,
    cladding: 0.6,
  },
  glazing: {
    single: 5.7,
    double: 2.8,
    'low-e': 1.8,
  },
} as const

export type WallUKind = keyof typeof U_VALUES.wall
export type GlazingUKind = keyof typeof U_VALUES.glazing

/** Default opaque-wall construction when no finish hint resolves a kind. */
export const DEFAULT_WALL_KIND: WallUKind = 'rc'
/** Default glazing type when no finish hint resolves a kind (SG norm). */
export const DEFAULT_GLAZING_KIND: GlazingUKind = 'single'

/**
 * Classify a wall finish id into an opaque-wall U-value bucket by keyword.
 * Unknown / unset ids fall back to the default RC wall.
 */
export function wallUKind(finishId: string | null | undefined): WallUKind {
  if (!finishId) return DEFAULT_WALL_KIND
  const s = finishId.toLowerCase()
  if (/clad|composite|panel|insulat/.test(s)) return 'cladding'
  if (/drywall|partition|plasterboard|gypsum|light/.test(s)) return 'lightweight'
  if (/brick|block|masonry/.test(s)) return 'brick'
  return DEFAULT_WALL_KIND
}

/**
 * Classify a glazing finish hint into a glazing U-value bucket by keyword.
 * Unknown / unset hints fall back to the default single glazing.
 */
export function glazingUKind(hint: string | null | undefined): GlazingUKind {
  if (!hint) return DEFAULT_GLAZING_KIND
  const s = hint.toLowerCase()
  if (/low.?e|lowe/.test(s)) return 'low-e'
  if (/double|igu|insulat/.test(s)) return 'double'
  return DEFAULT_GLAZING_KIND
}

/** A single envelope surface category and its rolled-up area + U-value. */
export interface ThermalSurface {
  /** 'wall' (opaque) or 'glazing'. */
  category: 'wall' | 'glazing'
  /** The U-value bucket used (e.g. 'rc', 'single'). */
  kind: string
  /** Combined area of surfaces in this bucket (m²). */
  areaSqm: number
  /** Representative U-value applied (W/m²K). */
  uValue: number
  /** Conductive index contribution = areaSqm × uValue (W/K). */
  index: number
}

/** The indicative envelope thermal digest. */
export interface ThermalReport {
  /** Opaque exterior wall area, net of glazing (m²). */
  opaqueWallSqm: number
  /** Glazing (window-opening) area on exterior walls (m²). */
  glazingSqm: number
  /** Total exterior envelope area = opaque + glazing (m²). */
  totalEnvelopeSqm: number
  /** Window-to-wall ratio (glazing / total envelope), 0..1 (0 when no envelope). */
  glazingRatio: number
  /** Area-weighted average U-value across the whole envelope (W/m²K); 0 when no
   *  envelope (never NaN). */
  averageU: number
  /** Indicative conductive heat-gain/loss index = Σ (area × U), W/K. */
  heatTransferIndex: number
  /** Per-bucket surface breakdown, opaque walls then glazing, area-desc. */
  surfaces: ThermalSurface[]
}

/** A fully-zeroed digest — the result for a bare-shell / all-interior plan. */
function emptyReport(): ThermalReport {
  return {
    opaqueWallSqm: 0,
    glazingSqm: 0,
    totalEnvelopeSqm: 0,
    glazingRatio: 0,
    averageU: 0,
    heatTransferIndex: 0,
    surfaces: [],
  }
}

/** Clear opening height (m) of a window: head − sill, clamped ≥ 0. */
function openingHeight(o: PlanOpening): number {
  return Math.max(0, o.head - o.sill)
}

/**
 * Build the indicative thermal-envelope digest. Pure — never throws; a plan
 * with no exterior walls returns a zeroed digest.
 *
 * `finishes` is optional: when supplied, the opaque-wall U-value is refined by
 * the wall finishes, but the model is primarily construction-driven (exterior
 * walls are RC by default) so the digest is meaningful even for a bare shell.
 */
export function buildThermalReport(plan: FloorPlan, finishes?: RoomFinishMaps): ThermalReport {
  const levels = planLevels(plan)

  // Accumulate opaque wall area per U-kind and glazing area per U-kind. We map
  // every exterior wall to its construction kind, sum its gross area (length ×
  // storey height), and subtract the window openings cut into it. The window
  // openings themselves accrue to the glazing buckets.
  const wallAreaByKind = new Map<WallUKind, number>()
  const glazingAreaByKind = new Map<GlazingUKind, number>()

  // Exterior walls aren't room-keyed, so we can't attribute a finish per wall.
  // We keep opaque walls on their construction default (RC) and only let a
  // finish hint override the whole envelope when one clearly names a non-RC
  // external construction. (Kept additive so the signature matches the rest of
  // the report's builders.)
  const wallFinishHint: string | null = finishes
    ? (Object.values(finishes.walls).find((id) =>
        /clad|composite|panel|insulat|brick|block|masonry|drywall|partition|plasterboard|gypsum/i.test(
          id,
        ),
      ) ?? null)
    : null
  const wallKind = wallUKind(wallFinishHint)

  for (const level of levels) {
    const height = level.ceilingHeight ?? plan.ceilingHeight
    const walls = level.walls ?? []
    const openings = level.openings ?? []
    const externalWallIds = new Set(
      walls.filter((w) => w.thickness === 'external').map((w) => w.id),
    )

    // Gross opaque exterior wall area (before deducting glazing).
    for (const w of walls) {
      if (w.thickness !== 'external') continue
      const gross = wallLength(w) * height
      if (gross <= 0) continue
      wallAreaByKind.set(wallKind, (wallAreaByKind.get(wallKind) ?? 0) + gross)
    }

    // Glazing = window openings on exterior walls. Deduct their area from the
    // opaque bucket (clamped ≥ 0 below) and add it to the glazing bucket.
    for (const o of openings) {
      if (o.kind !== 'window') continue
      if (!externalWallIds.has(o.wallId)) continue
      const area = o.width * openingHeight(o)
      if (area <= 0) continue
      const gKind = DEFAULT_GLAZING_KIND
      glazingAreaByKind.set(gKind, (glazingAreaByKind.get(gKind) ?? 0) + area)
      // Subtract from the opaque wall bucket of the wall's construction kind.
      wallAreaByKind.set(wallKind, (wallAreaByKind.get(wallKind) ?? 0) - area)
    }
  }

  const surfaces: ThermalSurface[] = []
  let opaqueWallSqm = 0
  let glazingSqm = 0
  let heatTransferIndex = 0

  for (const [kind, rawArea] of wallAreaByKind) {
    const areaSqm = Math.max(0, rawArea)
    if (areaSqm <= 0) continue
    const uValue = U_VALUES.wall[kind]
    const index = areaSqm * uValue
    opaqueWallSqm += areaSqm
    heatTransferIndex += index
    surfaces.push({ category: 'wall', kind, areaSqm, uValue, index })
  }
  for (const [kind, areaSqm] of glazingAreaByKind) {
    if (areaSqm <= 0) continue
    const uValue = U_VALUES.glazing[kind]
    const index = areaSqm * uValue
    glazingSqm += areaSqm
    heatTransferIndex += index
    surfaces.push({ category: 'glazing', kind, areaSqm, uValue, index })
  }

  const totalEnvelopeSqm = opaqueWallSqm + glazingSqm
  if (totalEnvelopeSqm <= 0) return emptyReport()

  // Opaque walls first (area-desc), then glazing (area-desc), so the biggest
  // contributor reads first within each group.
  surfaces.sort(
    (a, b) =>
      (a.category === b.category ? 0 : a.category === 'wall' ? -1 : 1) || b.areaSqm - a.areaSqm,
  )

  return {
    opaqueWallSqm,
    glazingSqm,
    totalEnvelopeSqm,
    glazingRatio: glazingSqm / totalEnvelopeSqm,
    averageU: heatTransferIndex / totalEnvelopeSqm,
    heatTransferIndex,
    surfaces,
  }
}

/** Friendly label for a U-value bucket kind, for report headings/tables. */
export function thermalKindLabel(category: 'wall' | 'glazing', kind: string): string {
  if (category === 'glazing') {
    switch (kind) {
      case 'single':
        return 'Single glazing'
      case 'double':
        return 'Double glazing'
      case 'low-e':
        return 'Low-E double glazing'
      default:
        return 'Glazing'
    }
  }
  switch (kind) {
    case 'rc':
      return 'RC external wall'
    case 'brick':
      return 'Brick / block wall'
    case 'lightweight':
      return 'Lightweight wall'
    case 'cladding':
      return 'Insulated cladding'
    default:
      return 'External wall'
  }
}
