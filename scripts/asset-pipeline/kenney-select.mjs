// Pure, network-free helpers for the Kenney model fetcher
// (`fetch-kenney-models.mjs`). Kept in its own module so the curated-set lookup
// is unit-testable without touching the network or the filesystem. NO side
// effects here.

export { slugify } from './polyhaven-select.mjs'

/**
 * Curated Tier-1 CC0 set from Kenney's "Furniture Kit"
 * (https://kenney.nl/assets/furniture-kit — CC0 1.0, no attribution required).
 * The kit already ships self-contained flat-shaded GLBs at
 * `Models/GLTF format/<file>.glb` (no external buffers/textures — verified: a
 * single embedded `buffers[0]`, `images: undefined`), so this fetcher extracts
 * them directly with no glTF-bundle repack step (contrast Poly Haven's
 * multi-file glTF, which DOES need one).
 *
 * `glb` is the path inside the kit ZIP (relative to the ZIP root);
 * `category` is the target `local-assets/<category>/` subdir (a
 * `FurnitureCategory`); `name` is the display name written to the def + the
 * provenance sidecar.
 */
export const KENNEY_FURNITURE_KIT = {
  pack: 'furniture-kit',
  pageUrl: 'https://kenney.nl/assets/furniture-kit',
  items: [
    { glb: 'bedDouble', category: 'beds', name: 'Double Bed' },
    { glb: 'loungeDesignSofa', category: 'seating', name: 'Design Sofa' },
    { glb: 'loungeSofaCorner', category: 'seating', name: 'Corner Sofa' },
    { glb: 'loungeChairRelax', category: 'seating', name: 'Lounge Chair' },
    { glb: 'chairModernCushion', category: 'seating', name: 'Modern Cushion Chair' },
    { glb: 'tableCoffee', category: 'tables', name: 'Coffee Table' },
    { glb: 'table', category: 'tables', name: 'Rectangular Table' },
    { glb: 'sideTableDrawers', category: 'tables', name: 'Side Table with Drawers' },
    { glb: 'bookcaseOpen', category: 'storage', name: 'Open Bookcase' },
    { glb: 'cabinetTelevision', category: 'storage', name: 'TV Cabinet' },
    { glb: 'kitchenFridgeLarge', category: 'kitchen', name: 'Refrigerator' },
    { glb: 'kitchenStove', category: 'kitchen', name: 'Stove' },
    { glb: 'bathroomSink', category: 'bathroom', name: 'Bathroom Sink' },
    { glb: 'washer', category: 'laundry', name: 'Washing Machine' },
    { glb: 'lampRoundFloor', category: 'lighting', name: 'Floor Lamp' },
    { glb: 'lampSquareCeiling', category: 'lighting', name: 'Ceiling Lamp' },
    { glb: 'pottedPlant', category: 'decor', name: 'Potted Plant' },
    { glb: 'rugRound', category: 'textiles', name: 'Round Rug' },
    { glb: 'televisionModern', category: 'electronics', name: 'Modern TV' },
  ],
}

/** The in-ZIP path to a kit item's self-contained GLB. */
export function kenneyZipEntryPath(glbStem) {
  return `Models/GLTF format/${glbStem}.glb`
}

/** CC0 attribution string for the sidecar / provenance record (matches the
 *  Poly Haven fetcher's `buildAttribution` shape/tone). */
export function kenneyAttribution(item, pack) {
  return `${item.name} (CC0) — Kenney "${pack}" kit (kenney.nl)`
}
