/**
 * Arrange-role classification for the auto-arranger — maps a furniture def to the
 * layout *role* it plays in a room (seating / bed / storage / mounted / …), which
 * drives where `autoArrange` places it. Pure + leaf (no geometry, no `Ctx`, no
 * store), extracted from `autoArrange.ts` so the classification is independently
 * unit-testable. `autoArrange` re-exports these for back-compat.
 */
import type { FurnitureCategory, FurnitureDef } from '../furniture/types'

export type ArrangeRole =
  | 'media'
  | 'mediaConsole'
  | 'featureWall'
  | 'seating'
  | 'armchair'
  | 'lowTable'
  | 'rug'
  | 'diningTable'
  | 'diningChair'
  | 'bed'
  | 'nightstand'
  | 'storage'
  | 'desk'
  | 'deskChair'
  | 'plant'
  | 'floorLamp'
  | 'barCart'
  | 'shoe'
  | 'mounted'
  | 'ceiling'
  | 'other'

const ROLE: Record<string, ArrangeRole> = {
  'tv-wall': 'media',
  'flatscreen-tv': 'media',
  'tv-console': 'mediaConsole',
  'feature-wall': 'featureWall',
  'sofa-3seat': 'seating',
  'sofa-2seat': 'seating',
  'sofa-lshape': 'seating',
  armchair: 'armchair',
  'coffee-table': 'lowTable',
  'side-table': 'lowTable',
  'console-table': 'storage',
  sideboard: 'storage',
  rug: 'rug',
  'dining-table-4': 'diningTable',
  'dining-chair': 'diningChair',
  'bar-stool': 'diningChair',
  'bed-single': 'bed',
  'bed-double': 'bed',
  'bed-queen': 'bed',
  'bed-king': 'bed',
  'bunk-bed': 'bed',
  crib: 'bed',
  nightstand: 'nightstand',
  bookshelf: 'storage',
  'cube-shelf': 'storage',
  dresser: 'storage',
  'changing-table': 'storage',
  wardrobe: 'storage',
  'wardrobe-3door': 'storage',
  'shoe-cabinet': 'shoe',
  refrigerator: 'storage',
  'washing-machine': 'storage',
  bathtub: 'storage',
  piano: 'storage',
  vanity: 'storage',
  desk: 'desk',
  'office-chair': 'deskChair',
  'potted-plant': 'plant',
  'floor-vase': 'plant',
  'bar-cart': 'barCart',
  'floor-lamp': 'floorLamp',
  'standing-fan': 'floorLamp',
  bench: 'lowTable',
  'wall-art': 'mounted',
  'wall-mirror': 'mounted',
  'bathroom-mirror': 'mounted',
  'wall-clock': 'mounted',
  'wall-shelf': 'mounted',
  'wall-sconce': 'mounted',
  'wall-cabinet': 'mounted',
  curtains: 'mounted',
  'roller-blind': 'mounted',
  // Window/door-bound fixtures are static once placed (they snap to their
  // opening) — the curtains precedent: 'mounted' so autoArrange never relocates
  // them. The `windowBound`/`doorBound` fall-through in `roleOf` fixes the whole
  // class; these explicit ids keep it fast + covered even for a def missing here.
  'window-mesh-screen': 'mounted',
  'pet-gate': 'mounted',
  'pet-door-insert': 'mounted',
  'aircon-unit': 'mounted',
  'range-hood': 'mounted',
  soundbar: 'mounted',
  'ceiling-light': 'ceiling',
  'ceiling-fan': 'ceiling',
  'cove-light': 'mounted',
  'floor-mirror': 'storage',
  'table-lamp': 'other',
  'tabletop-decor': 'other',
}

/** Fallback arrange role for an item by its catalog category, when the defId
 *  isn't in the explicit ROLE map (e.g. imported IKEA defs, textiles, outdoor). */
export function roleForCategory(cat: FurnitureCategory): ArrangeRole {
  switch (cat) {
    case 'beds':
      return 'bed'
    case 'storage':
      return 'storage'
    case 'appliances':
      return 'storage'
    case 'seating':
      return 'seating'
    case 'textiles':
      return 'rug'
    case 'electronics':
      return 'media'
    case 'kids':
      return 'storage'
    case 'laundry':
      return 'storage'
    case 'tables':
      return 'lowTable'
    case 'lighting':
      // Non-mounted lighting (floor/table lamps) — ceiling/wall fixtures are
      // already caught by the `mounted` flag in `roleOf` before this runs.
      return 'floorLamp'
    default:
      // kitchen / bathroom / decor / outdoor / others fall here: no curated
      // floor slot, so `settle()` parks them collision-free.
      return 'other'
  }
}

export function roleOf(defId: string, catalog: Record<string, FurnitureDef>): ArrangeRole {
  const explicit = ROLE[defId]
  if (explicit) return explicit
  const def = catalog[defId]
  if (!def) return 'other'
  // Honour the def's collision flags first — an imported (IKEA/user) def gets
  // no entry in ROLE, so without this a wall-mounted pendant or aircon would
  // fall to a floor role (storage/other) and `settle()` would drop it on the
  // floor. `mounted` defs are wall/ceiling fixtures (kept fixed, not relocated);
  // `noClip` defs are rugs (laid flat, slide under everything).
  // Opening-bound fixtures (curtains/blinds/mesh screens/pet gates/pet-door
  // inserts) are placement-locked to their window/door and must never be
  // relocated to a floor slot — treat the whole class as 'mounted' regardless of
  // id, so a future doorBound/windowBound def is covered without a ROLE edit.
  if (def.windowBound || def.doorBound) return 'mounted'
  if (def.mounted) return 'mounted'
  if (def.noClip) return 'rug'
  return roleForCategory(def.category)
}
