import type { LayoutPreset } from './types'

/**
 * RM2 retune (2026-07-19): "Cozy Tropical" becomes "Tropical Biophilic" —
 * same teak/sage/terracotta palette, plus extra greenery via `extraItems`.
 */
export const cozyTropical: LayoutPreset = {
  id: 'cozy-tropical',
  group: 'theme',
  name: 'Tropical Biophilic',
  description: 'Teak floors, sage walls, lush greenery and terracotta accents.',
  dryFloor: 'floor-wood-teak',
  wall: 'wall-paint-sage',
  paletteId: 'sage-cream',
  style: {
    'sofa-3seat': {
      color: '#3f6b5e',
      material: 'fabric',
      pattern: 'plain',
      pillowColor: '#c4683f',
    },
    armchair: { color: '#caa46a', material: 'fabric', style: 'wingback' },
    'dining-chair': { style: 'wood', seatColor: '#9a6b3f', finish: 'wood' },
    rug: { color: '#b4a890', borderColor: '#5a4a32', pattern: 'plain' },
    'coffee-table': { color: '#9a6b3f', finish: 'wood', shape: 'round' },
    'side-table': { topColor: '#9a6b3f', finish: 'wood' },
    'dining-table-4': { topColor: '#9a6b3f', legColor: '#6b4f34' },
    'bed-queen': {
      frameColor: '#9a6b3f',
      beddingColor: '#cfc3a8',
      throwColor: '#b5683f',
      headboardStyle: 'upholstered',
    },
    'bed-single': { frameColor: '#9a6b3f', beddingColor: '#cfc3a8', throwColor: '#b5683f' },
    'bed-double': { frameColor: '#9a6b3f', beddingColor: '#cfc3a8', throwColor: '#b5683f' },
    nightstand: { color: '#9a6b3f' },
    dresser: { color: '#9a6b3f' },
    bookshelf: { color: '#9a6b3f' },
    desk: { color: '#9a6b3f' },
    'tv-console': { color: '#9a6b3f' },
    'wardrobe-3door': { color: '#a6877c', doorStyle: 'hinged' },
    'potted-plant': { type: 'fiddle', size: 'large', leafColor: '#3f7a3f' },
    curtains: { color: '#cfd3b8' },
  },
  // Bedrooms keep the warm wood + terracotta throw but drop the living room's
  // saturated sofa green, reading calmer under the same theme (RM2).
  categoryStyle: {
    bedroom: {
      'bed-queen': { beddingColor: '#e2dcc8' },
    },
    masterBedroom: {
      'bed-queen': { beddingColor: '#e2dcc8' },
    },
  },
  // Biophilic touch: an extra potted plant in the main bedroom (living/dining
  // already has one at `default-ld-plant`).
  extraItems: [
    {
      id: 'cozy-plant-bedroom',
      defId: 'potted-plant',
      position: [2.6, 3.2],
      rotation: 0,
      props: { type: 'fiddle', size: 'medium', leafColor: '#3f7a3f' },
    },
  ],
}
