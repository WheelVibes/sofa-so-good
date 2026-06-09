/**
 * Rough retail price model (SGD) for a live budget estimate. Values are
 * approximate mid-market Singapore prices (IKEA / local furnishing) — enough
 * for a "what would furnishing this cost?" ballpark, clearly labelled as an
 * estimate in the UI. A per-item table overrides a per-category fallback.
 */
import type { FurnitureCategory, FurnitureDef } from './types'

/** Fallback price by category when an item has no explicit entry. */
const CATEGORY_BASE: Record<FurnitureCategory, number> = {
  beds: 650,
  seating: 450,
  tables: 240,
  storage: 380,
  kitchen: 600,
  bathroom: 320,
  appliances: 700,
  lighting: 90,
  decor: 60,
  textiles: 200,
  outdoor: 300,
  electronics: 120,
  kids: 80,
  laundry: 60,
  others: 100,
}

/** Notable per-item prices (SGD). */
export const ITEM_PRICE: Record<string, number> = {
  // Seating
  'sofa-3seat': 1200,
  'sofa-2seat': 900,
  'sofa-lshape': 1900,
  armchair: 520,
  ottoman: 180,
  'dining-chair': 90,
  'office-chair': 260,
  'bar-stool': 110,
  bench: 220,
  // Beds
  'bed-single': 450,
  'bed-double': 700,
  'bed-queen': 900,
  'bed-king': 1200,
  'bunk-bed': 850,
  'toddler-bed': 250,
  crib: 320,
  // Tables
  'coffee-table': 240,
  'side-table': 120,
  'dining-table-4': 600,
  'console-table': 280,
  'bar-cart': 220,
  desk: 350,
  // Storage
  wardrobe: 900,
  'wardrobe-3door': 1100,
  bookshelf: 320,
  'cube-shelf': 280,
  dresser: 520,
  sideboard: 680,
  'tv-console': 420,
  'shoe-cabinet': 180,
  'kitchen-counter': 1400,
  'room-divider': 300,
  // Appliances
  refrigerator: 1500,
  'washing-machine': 800,
  'flatscreen-tv': 900,
  'tv-wall': 1100,
  monitor: 350,
  soundbar: 380,
  stove: 600,
  microwave: 180,
  'range-hood': 350,
  'aircon-unit': 1200,
  // Bathroom
  toilet: 400,
  'bathroom-sink': 280,
  shower: 600,
  'floor-mirror': 180,
  // Lighting
  'ceiling-light': 120,
  'ceiling-fan': 280,
  'floor-lamp': 150,
  'table-lamp': 80,
  'wall-sconce': 70,
  'cove-light': 110,
  // Decor
  'potted-plant': 70,
  'wall-art': 90,
  rug: 240,
  curtains: 160,
  'roller-blind': 120,
  'wall-clock': 45,
  'wall-shelf': 60,
  // Previously fell back to the (often wildly off) per-category base.
  nightstand: 150,
  vanity: 550,
  'changing-table': 220,
  'coat-rack': 80,
  'high-chair': 120,
  'chaise-lounge': 800,
  'toy-storage': 90,
  bathtub: 1100,
  'towel-rail': 60,
  'towel-ladder': 180,
  'bathroom-mirror': 120,
  'wall-cabinet': 220,
  'kitchen-island': 1800,
  'kitchen-counter-l': 1800,
  dishwasher: 850,
  'built-in-oven': 950,
  'wine-cooler': 700,
  'planter-trough': 90,
  'outdoor-chair': 160,
  'outdoor-table': 240,
  'outdoor-parasol': 130,
  'cabinet-base': 420,
  'cabinet-corner': 520,
  'cabinet-wall': 260,
  'cabinet-tall': 680,
  'standing-fan': 90,
  'drying-rack': 50,
  'laundry-hamper': 40,
  'tabletop-decor': 60,
  'hanging-plant': 50,
  'floor-vase': 70,
  'wall-mirror': 120,
  fireplace: 900,
  piano: 3500,
  'feature-wall': 350,
}

/** Estimated price (SGD) for one item. For an IKEA def the per-INSTANCE variant
 *  (`variant` — the finish the user selected on that placed item) wins, so two
 *  instances on different finishes are priced independently; it falls back to
 *  the def's active variant, then any priced variant, then a per-item table
 *  entry, then the per-category base, then 100. */
export function itemPrice(
  def: Pick<FurnitureDef, 'id' | 'category'> & Partial<FurnitureDef>,
  category: FurnitureCategory,
  variant?: string,
): number {
  if (def.kind === 'gltf' && def.source === 'ikea' && def.variants) {
    const wanted = variant ?? def.activeVariant
    const chosen =
      def.variants.find((v) => v.finish === wanted && typeof v.price === 'number') ??
      def.variants.find((v) => v.finish === def.activeVariant && typeof v.price === 'number') ??
      def.variants.find((v) => typeof v.price === 'number')
    if (typeof chosen?.price === 'number') return chosen.price
  }
  return ITEM_PRICE[def.id] ?? CATEGORY_BASE[category] ?? 100
}
