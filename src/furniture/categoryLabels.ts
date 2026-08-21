import type { FurnitureCategory } from './types'

/**
 * Canonical display names for the furniture categories (UIUX-66) — ONE map,
 * beside `categoryColors.ts`. Previously duplicated verbatim in
 * `ui/catalog/CategoryTabs.tsx` (private) and `ui/report/reportShared.ts`,
 * while the GLB designer's Save-to-catalog select — with no importable map —
 * showed raw ids ("others", "beds") in a UI of Title Case labels.
 */
export const CATEGORY_LABEL: Record<FurnitureCategory, string> = {
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
  pets: 'Pets',
  laundry: 'Laundry',
  others: 'Others',
}
