import type { LayoutPreset } from './types'

/**
 * NEW (RM2, 2026-07-19): "Peranakan Accent" — cream walls + dark tropical wood
 * with jewel-toned emerald/coral/cobalt accents, a patterned rug (via the
 * rug def's existing `pattern` options — no new material). Jewel tones stay
 * in the living/dining rooms; bedrooms read cream + wood only
 * (`categoryStyle`).
 */
export const peranakanAccent: LayoutPreset = {
  id: 'peranakan-accent',
  group: 'theme',
  name: 'Peranakan Accent',
  description: 'Cream & dark tropical wood, emerald/coral/cobalt jewel accents, patterned rug.',
  dryFloor: 'floor-wood-ebony',
  wall: 'wall-paint-warm',
  paletteId: 'peranakan',
  style: {
    'sofa-3seat': {
      color: '#1f6f5c',
      material: 'fabric',
      pattern: 'plain',
      pillowColor: '#e2725b',
    },
    armchair: { color: '#1a3f8f', material: 'fabric', style: 'wingback' },
    'dining-chair': { style: 'wood', seatColor: '#e2725b', finish: 'wood' },
    rug: {
      color: '#f2e9d3',
      color2: '#1f6f5c',
      borderColor: '#1a3f8f',
      pattern: 'checkered',
    },
    'coffee-table': { color: '#4a352a', finish: 'wood', shape: 'round' },
    'side-table': { topColor: '#4a352a', finish: 'wood' },
    'dining-table-4': { topColor: '#4a352a', legColor: '#2f2318' },
    'bed-queen': {
      frameColor: '#4a352a',
      beddingColor: '#f2e9d3',
      headboardStyle: 'paneled',
      pillowColor: '#f2e9d3',
    },
    'bed-single': { frameColor: '#4a352a', beddingColor: '#f2e9d3' },
    'bed-double': { frameColor: '#4a352a', beddingColor: '#f2e9d3' },
    nightstand: { color: '#4a352a' },
    dresser: { color: '#4a352a' },
    bookshelf: { color: '#4a352a' },
    desk: { color: '#4a352a' },
    'tv-console': { color: '#4a352a' },
    'wardrobe-3door': { color: '#f2e9d3' },
    curtains: { color: '#f2e9d3' },
  },
  // Jewel accents stay in the living/dining rooms; bedrooms read cream + wood
  // only (RM2 categoryStyle > style).
  categoryStyle: {
    living: {
      armchair: { color: '#1a3f8f' },
      'sofa-3seat': { pillowColor: '#e2725b' },
    },
    dining: {
      'dining-chair': { seatColor: '#e2725b' },
    },
    bedroom: {
      'bed-queen': { pillowColor: '#f2e9d3' },
    },
    masterBedroom: {
      'bed-queen': { pillowColor: '#f2e9d3' },
    },
  },
}
