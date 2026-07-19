/**
 * MEP (electrical/plumbing) point authoring helpers — pure, no store/React
 * imports (MEP layer plan, G1, PR1).
 *
 * Per-kind default mount heights (AFFL — above finished floor level, mm) used
 * when a point's own `mountHeightMm` is unset (placeholder in the inspector
 * `Num` control, and the value baked in when the editor first places a point).
 * The plan doc only names a subset per family; the remaining kinds get a
 * sensible default noted below (deviation, not verbatim from the doc):
 * - electrical: `data`/`socket-double` default to the same AFFL as a standard
 *   `socket` (300mm) — both are typically ganged at skirting height alongside
 *   sockets in an SG reno.
 * - plumbing: `drainage` defaults to `floor-trap`'s 0mm (both are floor-level
 *   waste connections); `water-heater` defaults to 1800mm, matching the
 *   electrical `water-heater` connection point's mount height (the two are
 *   installed at the same elevation next to the heater unit).
 */

import type { ElectricalKind, PlumbingKind } from './types'

/** Per-kind default electrical point mount height (mm, AFFL). */
export const ELECTRICAL_MOUNT_DEFAULTS_MM: Record<ElectricalKind, number> = {
  socket: 300,
  'socket-double': 300,
  switch: 1200,
  data: 300,
  'tv-point': 400,
  aircon: 2400,
  'water-heater': 1800,
}

/** Per-kind default plumbing point mount height (mm, AFFL). */
export const PLUMBING_MOUNT_DEFAULTS_MM: Record<PlumbingKind, number> = {
  'water-point': 600,
  drainage: 0,
  'floor-trap': 0,
  'soil-pipe': 0,
  'water-heater': 1800,
}

/** The default mount height (mm, AFFL) for an electrical point kind. */
export function electricalMountDefaultMm(kind: ElectricalKind): number {
  return ELECTRICAL_MOUNT_DEFAULTS_MM[kind]
}

/** The default mount height (mm, AFFL) for a plumbing point kind. */
export function plumbingMountDefaultMm(kind: PlumbingKind): number {
  return PLUMBING_MOUNT_DEFAULTS_MM[kind]
}

/** Minimal shape shared by `PlanElectricalPoint`/`PlanPlumbingPoint` needed for
 *  dedupe — kept generic (not importing either family's full interface) so
 *  `isDuplicateMepPoint` works for both without caring which family it's given. */
interface MepPointLike {
  x: number
  z: number
  kind: string
  levelId?: string
}

/** True when `candidate` duplicates a point already in `existing`: same kind,
 *  same storey (`levelId` compared with strict equality — both `undefined`
 *  match each other as "ground", so callers don't need to pre-normalise), and
 *  within `radiusM` (default 0.3 m) — used both to gate Suggest (PR4) and, if
 *  ever wired, manual placement dedupe. Pure; `existing` is never mutated. */
export function isDuplicateMepPoint<T extends MepPointLike>(
  existing: T[],
  candidate: Pick<T, 'x' | 'z' | 'kind'> & { levelId?: T['levelId'] },
  radiusM = 0.3,
): boolean {
  return existing.some((p) => {
    if (p.kind !== candidate.kind) return false
    if (p.levelId !== candidate.levelId) return false
    const dx = p.x - candidate.x
    const dz = p.z - candidate.z
    return Math.sqrt(dx * dx + dz * dz) <= radiusM
  })
}
