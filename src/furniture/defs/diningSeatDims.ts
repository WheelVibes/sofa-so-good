import type { ParamProps } from '../types'

/**
 * Real-metre top dimensions for the dining table's `seats` enum. The
 * `DiningTable` primitive renders from these (a single dropdown drives the
 * size), so the def's collision footprint MUST derive from the same map — not a
 * fixed `defaultFootprint` — or an 8-seater's collision box stays sized for a
 * 4-seater. Shared (pure, no three/React) between the primitive and the def's
 * `footprintParts` so the two can never drift.
 */
export const DINING_SEAT_DIMENSIONS: Record<string, { w: number; d: number }> = {
  '4': { w: 1.4, d: 0.85 },
  '6': { w: 1.8, d: 0.95 },
  '8': { w: 2.2, d: 1.0 },
}

/** The rendered top size for a dining table item's live props (defaults 4-seat). */
export function diningSeatDim(props: ParamProps): { w: number; d: number } {
  const key = typeof props.seats === 'string' ? props.seats : '4'
  return DINING_SEAT_DIMENSIONS[key] ?? DINING_SEAT_DIMENSIONS['4']
}
