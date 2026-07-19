import type { FurnitureCategory } from '../../../furniture/types'

/** Muted top-down fill per furniture category for the 2D plan layer.
 *  Tokens live in `screens.css` (`--plan-cat-*`) so the plan themes correctly;
 *  `exportPlanPng.ts` PLAN_VARS must list every var used here. */
export const CATEGORY_FILL: Record<FurnitureCategory, string> = {
  beds: 'var(--plan-cat-beds)',
  seating: 'var(--plan-cat-seating)',
  tables: 'var(--plan-cat-tables)',
  storage: 'var(--plan-cat-storage)',
  kitchen: 'var(--plan-cat-kitchen)',
  bathroom: 'var(--plan-cat-bathroom)',
  appliances: 'var(--plan-cat-appliances)',
  lighting: 'var(--plan-cat-lighting)',
  decor: 'var(--plan-cat-decor)',
  textiles: 'var(--plan-cat-textiles)',
  outdoor: 'var(--plan-cat-outdoor)',
  electronics: 'var(--plan-cat-electronics)',
  kids: 'var(--plan-cat-kids)',
  pets: 'var(--plan-cat-pets)',
  laundry: 'var(--plan-cat-laundry)',
  others: 'var(--plan-cat-others)',
}

export type Tool =
  | 'select'
  | 'wall'
  | 'room'
  | 'polyroom'
  | 'autoroom'
  | 'split'
  | 'door'
  | 'window'
  | 'scale'
  | 'text'
  | 'dimension'
  | 'polyline'
  | 'mep'

/** A reference photo/scan traced over to draw walls. Session-scoped (the object
 *  URL lives only this session); `mPerPx` is the calibrated real-world scale. */
export interface Backdrop {
  url: string
  /** Natural pixel dimensions of the loaded image. */
  w: number
  h: number
  opacity: number
  /** Metres per image pixel (set via the Scale tool). */
  mPerPx: number
  /** World position (m) of the image's top-left corner. */
  ox: number
  oz: number
  /** True once the user has calibrated the scale manually with the Scale tool.
   *  AI plan recognition will NOT overwrite a manual calibration — its scale
   *  estimate only applies while this is unset/false. */
  scaleCalibrated?: boolean
}

export const FIT_PAD = 0.6 // metres of breathing room when fitting the plan to the view
// Large grid margin around the plan so the canvas reads as an open, pannable
// grid (Figma-style) rather than a tight box that clips anything drawn outside
// the current plan bounds. The plan stays centred (equal margin all sides).
export const GRID_MARGIN = 20
export const EXPORT_PAD = 1 // metres of padding around the plan in the exported PNG
export const MAX_W = 940
export const MAX_H = 620

/** User-zoom limits — multiplies the fit-to-view base px-per-metre. */
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 5
/** Wheel-zoom sensitivity: factor = exp(-deltaY * this). Tuned so one mouse
 *  notch (~100px) is a ~13% step and trackpad pinches scrub smoothly. */
export const ZOOM_WHEEL_SENS = 0.0013
/** Step for the on-screen ± zoom buttons. */
export const ZOOM_BTN_STEP = 0.2
