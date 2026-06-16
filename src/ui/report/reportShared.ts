/**
 * Shared constants + tiny helpers for the design-report builder (`../report.ts`).
 * The print palettes are fixed inks (the report window has its own CSS, not the
 * app's tokens); `esc`/`sgd` are the HTML-escape + SGD-format helpers.
 */
import type { FurnitureCategory } from '../../furniture/types'
import type { ElevationPalette } from '../elevation/elevationSvg'
import type { LightingPalette } from '../lighting2d/lightingPlanSvg'

/** Per-room floor + wall finish material ids (the store's `finishes` slice). */
export interface ReportFinishes {
  floor: Record<string, string>
  walls: Record<string, string>
}

/** Print palette for elevations — fixed inks (the report window has its own CSS,
 *  not the app's CSS tokens). */
export const ELEV_PRINT: ElevationPalette = {
  bg: '#f9fafb',
  stroke: '#374151',
  opening: '#93c5fd',
  item: '#d8c8b0',
  text: '#4b5563',
}
export const LIGHTING_PRINT: LightingPalette = {
  wall: '#9ca3af',
  ink: '#374151',
  coverage: '#f59e0b',
}
export const SECTION_PRINT = {
  wall: '#9ca3af',
  floor: '#374151',
  ceil: '#9ca3af',
  opening: '#93c5fd',
  ink: '#4b5563',
  item: '#d8c8b0',
}

export const CAT_LABEL: Record<FurnitureCategory, string> = {
  beds: 'Beds',
  seating: 'Seating',
  tables: 'Tables',
  storage: 'Storage',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  appliances: 'Appliances',
  lighting: 'Lighting',
  decor: 'Decor',
  textiles: 'Textiles',
  outdoor: 'Outdoor',
  electronics: 'Electronics',
  kids: 'Baby & Kids',
  laundry: 'Laundry',
  others: 'Others',
}

// Escapes for BOTH text and attribute contexts (the report embeds names/notes/
// swatches inside style="…" + title="…"), so quotes must be escaped too — a `"`
// in a user-controlled value (a material swatch, a room name) would otherwise
// break out of the attribute and inject markup.
export const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

export const sgd = (n: number) => `$${Math.round(n).toLocaleString('en-SG')}`
