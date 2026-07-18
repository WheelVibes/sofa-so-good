/**
 * Toggleable construction drawing-set layers (sheet groups) + picker labels.
 * Kept in a dependency-light module (no heavy `drawingSet` imports) so the
 * toolbar + store can reference the list without pulling the sheet builder into
 * the boot bundle — `drawingSet.ts` stays dynamically imported (P-CHUNK).
 *
 * The floor plan is always the base sheet; every other group can be hidden to
 * tailor the set (e.g. a clean client copy with no electrical/plumbing/
 * demolition, or a full builder copy) — RoomSketcher / Chief Architect "layers".
 */

export type DrawingLayer =
  | 'elevations'
  | 'lighting'
  | 'dimensions'
  | 'section'
  | 'electrical'
  | 'plumbing'
  | 'finishes'
  | 'demolition'
  | 'ffe'
  | 'carpentry'
  | 'openingSchedule'

/** Display order + labels for the layer picker. */
export const DRAWING_LAYERS: { key: DrawingLayer; label: string }[] = [
  { key: 'elevations', label: 'Elevations' },
  { key: 'lighting', label: 'Lighting plan' },
  { key: 'dimensions', label: 'Dimensioned plan' },
  { key: 'section', label: 'Cross-section' },
  { key: 'electrical', label: 'Electrical plan' },
  { key: 'plumbing', label: 'Plumbing plan' },
  { key: 'finishes', label: 'Finishes schedule' },
  { key: 'demolition', label: 'Demolition plan' },
  { key: 'ffe', label: 'FF&E schedule' },
  { key: 'openingSchedule', label: 'Door & window schedule' },
  { key: 'carpentry', label: 'Carpentry sheets' },
]

/** Per-layer visibility: a layer is included unless explicitly set to `false`
 *  (so an absent/empty map = the full set, preserving the prior behaviour). */
export type DrawingLayerVisibility = Partial<Record<DrawingLayer, boolean>>

/** Whether a layer is included given a (possibly partial/absent) visibility map. */
export const drawingLayerOn = (v: DrawingLayerVisibility | undefined, k: DrawingLayer): boolean =>
  v?.[k] !== false
