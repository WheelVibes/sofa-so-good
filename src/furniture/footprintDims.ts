import type { FurnitureDef } from './types'

/**
 * Shared resolution of a parametric def's live footprint dims from item props
 * via `footprintParams` (falling back to the standard `width`/`depth` keys).
 *
 * Accepts numeric props AND numeric-STRING props — the latter lets an enum
 * whose values are metre strings (e.g. nightstand `size`: '0.38'/'0.45'/'0.6')
 * drive the collision footprint exactly, instead of pinning `defaultFootprint`
 * to the largest mode (the conservative fallback used when enum values are
 * non-numeric, e.g. dog-crate 'S'/'M'). Non-numeric strings resolve to null.
 *
 * Single source for the six former inline copies (collision/placement,
 * dragHelpers, ScatterFill, InspectorHeader, PlanFurnitureInspector, ikeaSets).
 */
function footprintDim(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

/** Resolve live { w, d } for a parametric def, falling back to `fallback` per axis. */
export function resolveFootprintDims(
  def: Pick<Extract<FurnitureDef, { kind: 'parametric' }>, 'footprintParams'>,
  props: Record<string, unknown>,
  fallback: { w: number; d: number },
): { w: number; d: number } {
  const map = def.footprintParams ?? {}
  const w = footprintDim(props[map.w ?? 'width']) ?? fallback.w
  const d = footprintDim(props[map.d ?? 'depth']) ?? fallback.d
  return { w, d }
}
