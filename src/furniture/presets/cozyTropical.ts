import type { LayoutPreset } from './types'

export const cozyTropical: LayoutPreset = {
  id: 'cozy-tropical',
  name: 'Cozy Tropical',
  description: 'Teak floors, sage walls, greens and terracotta accents.',
  dryFloor: 'floor-wood-teak',
  wall: 'wall-paint-sage',
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
}
