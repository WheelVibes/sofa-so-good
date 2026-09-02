/**
 * Site-measurement reconciliation — pure data core.
 *
 * Every drawing this app produces is derived from the MODEL. But a real home is
 * not the template: an HDB flat as built differs from its plan, and a traced
 * backdrop is only as accurate as the trace. So the whole contractor package
 * rests on an assumption nothing currently checks — that the model matches the
 * actual flat.
 *
 * This closes that: a user records what they measured on site with a tape, and
 * this reports the deviation against the modelled dimension, flagged against a
 * tolerance. That is the difference between "to scale" and "verified to scale",
 * and it is what lets a contractor trust the numbers.
 *
 * **On tolerance, deliberately.** Published tolerance manuals express dimensional
 * tolerance as a BAND THAT WIDENS WITH LENGTH, and {@link defaultToleranceMm}
 * follows that convention (6 mm up to 1.2 m, 9 mm to 1.8 m, 12 mm beyond). It
 * cites no standard clause number, for the same reason `export/specification.ts`
 * cites none: naming a specific standard or edition that turned out wrong or
 * superseded would be worse than naming none, because a fabricated citation
 * reads as authoritative. Each measurement can carry its own `toleranceMm`, and
 * {@link RECONCILE_SCOPE_NOTE} tells the reader to confirm the applicable
 * tolerance for their project.
 *
 * Pure (no store, no three, no DOM) → unit-testable directly.
 */

import { allPlanRooms, planLevels } from './levels'
import {
  type FloorPlan,
  type MeasuredTargetKind,
  type PlanRoom,
  type SiteMeasurement,
  wallLength,
} from './types'

export type { MeasuredTargetKind, SiteMeasurement }

export interface ReconciledMeasurement {
  id: string
  kind: MeasuredTargetKind
  targetId: string
  /** Human label for the target, e.g. a wall's display name or a room name. */
  targetLabel: string
  measuredMm: number
  /** The model's value for the same dimension (mm), or null when the target
   *  cannot be resolved — a measurement of a wall that has since been deleted. */
  modelMm: number | null
  /** measured − model (mm). Positive = the real thing is BIGGER than drawn. */
  deviationMm: number | null
  toleranceMm: number
  /** `within` · `exceeds` · `unresolved` (target not found in the plan). */
  verdict: 'within' | 'exceeds' | 'unresolved'
  note?: string
}

export interface MeasurementReconciliation {
  rows: ReconciledMeasurement[]
  /** How many exceeded tolerance — the number that decides whether the drawings
   *  can be trusted as-is. */
  exceedsCount: number
  /** How many referenced something no longer in the plan. */
  unresolvedCount: number
  /** Largest absolute deviation among resolved rows (mm), 0 when none. */
  worstDeviationMm: number
  scopeNote: string
}

export const RECONCILE_SCOPE_NOTE =
  'Deviations are the difference between what was measured on site and what the drawings show. The default tolerance widens with length, following the usual convention in published tolerance manuals; it cites no standard clause — confirm the tolerance that applies to your project and adjust per measurement if needed.'

/**
 * Default permitted deviation for a nominal length, following the
 * widens-with-length convention. `nominalMm` is the MODELLED length.
 */
export function defaultToleranceMm(nominalMm: number): number {
  const n = Math.abs(nominalMm)
  if (n <= 1200) return 6
  if (n < 1800) return 9
  return 12
}

/** Label + modelled value for a measurement's target. */
function resolveTarget(
  plan: FloorPlan,
  m: SiteMeasurement,
): { label: string; modelMm: number | null } {
  if (m.kind === 'wall') {
    // EVERY storey's walls, not `plan.walls` — that is ground-only (F13), so
    // an upper-floor wall would have resolved as `unresolved` ("target
    // deleted") even though it exists.
    const wall = planLevels(plan)
      .flatMap((l) => l.walls ?? [])
      .find((w) => w.id === m.targetId)
    if (!wall) return { label: m.targetId, modelMm: null }
    return {
      label: wall.name?.trim() || `Wall ${m.targetId}`,
      modelMm: Math.round(wallLength(wall) * 1000),
    }
  }
  if (m.kind === 'opening') {
    const o = planLevels(plan)
      .flatMap((l) => l.openings ?? [])
      .find((x) => x.id === m.targetId)
    if (!o) return { label: m.targetId, modelMm: null }
    return {
      label: o.name?.trim() || `${o.kind === 'door' ? 'Door' : 'Window'} ${m.targetId}`,
      modelMm: Math.round((o.width ?? 0) * 1000),
    }
  }
  const room: PlanRoom | undefined = allPlanRooms(plan).find((r) => r.id === m.targetId)
  if (!room) return { label: m.targetId, modelMm: null }
  const span = m.kind === 'room-width' ? room.width : room.depth
  return {
    label: `${room.name} (${m.kind === 'room-width' ? 'width' : 'depth'})`,
    modelMm: Math.round((span ?? 0) * 1000),
  }
}

/**
 * Reconcile recorded site measurements against the model.
 *
 * A measurement whose target no longer exists is reported as `unresolved`
 * rather than dropped — silently discarding a measurement someone took on site
 * would be the worst possible failure mode for this feature.
 */
export function buildMeasurementReconciliation(
  plan: FloorPlan,
  measurements: SiteMeasurement[] = [],
): MeasurementReconciliation {
  const rows: ReconciledMeasurement[] = measurements.map((m) => {
    const { label, modelMm } = resolveTarget(plan, m)
    const tolerance =
      typeof m.toleranceMm === 'number' && Number.isFinite(m.toleranceMm) && m.toleranceMm >= 0
        ? m.toleranceMm
        : defaultToleranceMm(modelMm ?? m.measuredMm)
    if (modelMm === null) {
      return {
        id: m.id,
        kind: m.kind,
        targetId: m.targetId,
        targetLabel: label,
        measuredMm: Math.round(m.measuredMm),
        modelMm: null,
        deviationMm: null,
        toleranceMm: tolerance,
        verdict: 'unresolved' as const,
        ...(m.note ? { note: m.note } : {}),
      }
    }
    const deviation = Math.round(m.measuredMm) - modelMm
    return {
      id: m.id,
      kind: m.kind,
      targetId: m.targetId,
      targetLabel: label,
      measuredMm: Math.round(m.measuredMm),
      modelMm,
      deviationMm: deviation,
      toleranceMm: tolerance,
      verdict: Math.abs(deviation) <= tolerance ? ('within' as const) : ('exceeds' as const),
      ...(m.note ? { note: m.note } : {}),
    }
  })

  const resolved = rows.filter((r) => r.deviationMm !== null)
  return {
    rows,
    exceedsCount: rows.filter((r) => r.verdict === 'exceeds').length,
    unresolvedCount: rows.filter((r) => r.verdict === 'unresolved').length,
    worstDeviationMm: resolved.reduce((w, r) => Math.max(w, Math.abs(r.deviationMm ?? 0)), 0),
    scopeNote: RECONCILE_SCOPE_NOTE,
  }
}
