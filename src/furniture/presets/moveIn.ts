import type { LayoutPreset } from './types'

/**
 * RM2 retune (2026-07-19): the move-in default becomes "Modern Contemporary" —
 * the 2025-26 SG default look (white + warm oak neutral + one deep navy
 * accent), still the app's move-in default so positions are unchanged.
 */
export const moveIn: LayoutPreset = {
  id: 'move-in',
  group: 'theme',
  name: 'Modern Contemporary',
  description: 'White walls, warm oak, one deep navy accent — the everyday SG default.',
  dryFloor: 'floor-wood-oak',
  wall: 'wall-paint-white',
  paletteId: 'navy-brass',
  style: {
    'sofa-3seat': {
      color: '#e7e2d6',
      material: 'fabric',
      pattern: 'plain',
      pillowColor: '#28374a',
    },
    armchair: { color: '#28374a', material: 'fabric', style: 'standard' },
    'dining-chair': { style: 'wood', seatColor: '#cdb696', finish: 'wood' },
    rug: { color: '#e6e0d2', borderColor: '#28374a', pattern: 'plain' },
    'coffee-table': { color: '#cdb696', finish: 'wood', shape: 'round' },
    'side-table': { topColor: '#cdb696', finish: 'wood' },
    'dining-table-4': { topColor: '#cdb696', legColor: '#8a6b48' },
    'bed-queen': { frameColor: '#cdb696', beddingColor: '#f2ede4', headboardStyle: 'upholstered' },
    'bed-single': { frameColor: '#cdb696', beddingColor: '#f2ede4' },
    'bed-double': { frameColor: '#cdb696', beddingColor: '#f2ede4' },
    nightstand: { color: '#cdb696' },
    dresser: { color: '#cdb696' },
    bookshelf: { color: '#cdb696' },
    desk: { color: '#cdb696' },
    'tv-console': { color: '#cdb696' },
    'wardrobe-3door': { color: '#f2ede4' },
    curtains: { color: '#e6e0d2' },
  },
  // The navy accent stays in the living room; bedrooms read plainer/calmer —
  // cream bedding, no accent pillow (RM2 categoryStyle > style).
  categoryStyle: {
    living: {
      'sofa-3seat': { pillowColor: '#28374a' },
      armchair: { color: '#28374a' },
    },
    bedroom: {
      'bed-queen': { pillowColor: '#f2ede4', beddingColor: '#f7f4ee' },
      'bed-single': { beddingColor: '#f7f4ee' },
      'bed-double': { beddingColor: '#f7f4ee' },
    },
    masterBedroom: {
      'bed-queen': { pillowColor: '#f2ede4', beddingColor: '#f7f4ee' },
    },
  },
}
