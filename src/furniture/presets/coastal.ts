import type { LayoutPreset } from './types'

export const coastal: LayoutPreset = {
  id: 'coastal',
  name: 'Coastal',
  description: 'Pale ash, sky-blue walls, navy + white nautical textiles.',
  dryFloor: 'floor-wood-ash',
  wall: 'wall-paint-blue',
  style: {
    'sofa-3seat': {
      color: '#eceae2',
      material: 'fabric',
      pattern: 'striped',
      pillowColor: '#3b4a63',
    },
    armchair: { color: '#3b4a63', material: 'fabric', style: 'standard' },
    'dining-chair': { style: 'wood', seatColor: '#cdb696', finish: 'painted' },
    rug: { color: '#dfe2e6', borderColor: '#3b4a63', pattern: 'striped' },
    'coffee-table': { color: '#cdb696', finish: 'painted' },
    'side-table': { topColor: '#eceae2', finish: 'painted' },
    'dining-table-4': { topColor: '#cdb696', legColor: '#eceae2' },
    'bed-queen': {
      frameColor: '#cdb696',
      beddingColor: '#eef1f4',
      throwColor: '#3b4a63',
      headboardStyle: 'upholstered',
      beddingPattern: 'striped',
    },
    'bed-single': { frameColor: '#cdb696', beddingColor: '#eef1f4', throwColor: '#3b4a63' },
    'bed-double': { frameColor: '#cdb696', beddingColor: '#eef1f4', throwColor: '#3b4a63' },
    nightstand: { color: '#eceae2', finish: 'painted' },
    dresser: { color: '#eceae2', finish: 'painted' },
    bookshelf: { color: '#eceae2', finish: 'painted' },
    desk: { color: '#eceae2', finish: 'painted' },
    'tv-console': { color: '#eceae2', finish: 'painted' },
    'wardrobe-3door': { color: '#eef1f4' },
    curtains: { color: '#dfe2e6' },
  },
}
