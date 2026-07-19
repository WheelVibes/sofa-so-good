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

/** Extra width (m) added by the drop-in centre leaf of an extendable table. */
const DINING_LEAF_WIDTH = 0.45

/** Width (m) the leaf adds for the item's live props: `DINING_LEAF_WIDTH` when
 *  `leaf: 'extended'` on a rectangular top, else 0. The extension is only
 *  meaningful for the rectangular top (a drop-in centre leaf), so round/oval
 *  tops never extend — keeping the rendered top and the collision footprint in
 *  lock-step (the primitive and the def's `footprintParts` both call this). */
export function diningLeafExtension(props: ParamProps): number {
  const shape = typeof props.shape === 'string' ? props.shape : 'rect'
  const leaf = typeof props.leaf === 'string' ? props.leaf : 'none'
  return shape === 'rect' && leaf === 'extended' ? DINING_LEAF_WIDTH : 0
}
