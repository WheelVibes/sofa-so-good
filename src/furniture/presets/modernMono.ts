import type { LayoutPreset } from './types'

export const modernMono: LayoutPreset = {
  id: 'modern-mono',
  name: 'Modern Mono',
  description: 'Grey porcelain, charcoal walls, glossy monochrome.',
  dryFloor: 'floor-tile-grey',
  wall: 'wall-paint-charcoal',
  style: {
    'sofa-3seat': {
      color: '#2c2e30',
      material: 'fabric',
      pattern: 'plain',
      pillowColor: '#9aa0a6',
    },
    armchair: { color: '#3a3d42', material: 'velvet', sheen: 0.4, style: 'tub' },
    'dining-chair': { style: 'upholstered', seatColor: '#2c2e30' },
    rug: { color: '#5a5e63', borderColor: '#2b2b2b', pattern: 'plain' },
    'coffee-table': { color: '#1c1f24', finish: 'gloss' },
    'side-table': { topColor: '#1c1f24', finish: 'gloss', shape: 'drum' },
    'dining-table-4': { topColor: '#2b2e33', legColor: '#1c1f24', finish: 'gloss' },
    'bed-queen': {
      frameColor: '#2b2e33',
      beddingColor: '#9aa0a6',
      headboardStyle: 'upholstered',
    },
    'bed-single': {
      frameColor: '#2b2e33',
      beddingColor: '#9aa0a6',
      headboardStyle: 'upholstered',
    },
    'bed-double': {
      frameColor: '#2b2e33',
      beddingColor: '#9aa0a6',
      headboardStyle: 'upholstered',
    },
    nightstand: { color: '#2b2e33', finish: 'gloss' },
    dresser: { color: '#2b2e33', finish: 'gloss', handle: 'recessed' },
    bookshelf: { color: '#2b2e33', finish: 'gloss' },
    desk: { color: '#2b2e33', finish: 'gloss' },
    'tv-console': { color: '#1c1f24', finish: 'gloss' },
    'wardrobe-3door': { color: '#2b2e33', doorStyle: 'sliding' },
    curtains: { color: '#4a4e54' },
  },
  extraItems: [
    {
      id: 'mono-feature',
      defId: 'feature-wall',
      position: [12.53, 2.45],
      rotation: -Math.PI / 2,
      props: { width: 3.0, height: 2.55, style: 'slat', color: '#23262b', finish: 'gloss' },
    },
  ],
}
