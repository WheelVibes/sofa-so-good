/**
 * Rough retail price model (SGD) for a live budget estimate. Values are
 * approximate mid-market Singapore prices (IKEA / local furnishing) — enough
 * for a "what would furnishing this cost?" ballpark, clearly labelled as an
 * estimate in the UI. A per-item table overrides a per-category fallback.
 */
import type { FurnitureCategory, FurnitureType } from './types';

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
};

/** Notable per-item prices (SGD). */
const ITEM_PRICE: Record<string, number> = {
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
};

/** Estimated price (SGD) for one item of `defId` in `category`. */
export function itemPrice(defId: FurnitureType, category: FurnitureCategory): number {
  return ITEM_PRICE[defId] ?? CATEGORY_BASE[category] ?? 100;
}
