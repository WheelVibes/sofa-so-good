import type { LayoutPreset } from './types'

export const scandiCalm: LayoutPreset = {
  id: 'scandi-calm',
  name: 'Scandi Calm',
  description: 'Pale ash woods, soft-white walls, light textiles.',
  dryFloor: 'floor-wood-ash',
  wall: 'wall-paint-soft-white',
  style: {
    'sofa-3seat': {
      color: '#d6d4cc',
      material: 'fabric',
      pattern: 'plain',
      pillowColor: '#9bb0a6',
    },
    armchair: { color: '#cfcabb', material: 'fabric', style: 'standard' },
    'dining-chair': { style: 'wood', seatColor: '#cdb696', finish: 'wood' },
    rug: { color: '#e6e0d2', borderColor: '#cdbfa6', pattern: 'herringbone' },
    'coffee-table': { color: '#cdb696', finish: 'wood', shape: 'oval' },
    'side-table': { topColor: '#cdb696', finish: 'wood' },
    'dining-table-4': { topColor: '#cdb696', legColor: '#b39a72' },
    'bed-queen': {
      frameColor: '#cdb696',
      beddingColor: '#eceae2',
      headboardStyle: 'upholstered',
      pillowColor: '#ffffff',
    },
    'bed-single': {
      frameColor: '#cdb696',
      beddingColor: '#eceae2',
      headboardStyle: 'upholstered',
    },
    'bed-double': {
      frameColor: '#cdb696',
      beddingColor: '#eceae2',
      headboardStyle: 'upholstered',
    },
    nightstand: { color: '#cdb696' },
    dresser: { color: '#cdb696' },
    bookshelf: { color: '#cdb696' },
    desk: { color: '#cdb696' },
    'tv-console': { color: '#cdb696' },
    'wardrobe-3door': { color: '#e8e2d6' },
    curtains: { color: '#e6e0d2' },
  },
}
