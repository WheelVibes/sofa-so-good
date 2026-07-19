import type { LayoutPreset } from './types'

export const boutiqueSuite: LayoutPreset = {
  id: 'boutique-suite',
  group: 'layout',
  name: 'Boutique Suite',
  description: 'Hotel-style main bedroom: symmetric bed, twin nightstands, foot bench.',
  dryFloor: 'floor-wood-walnut',
  wall: 'wall-paint-greige',
  style: {
    'sofa-3seat': {
      color: '#8f857a',
      material: 'fabric',
      pattern: 'plain',
      pillowColor: '#3a352c',
    },
    armchair: { color: '#7d7468', material: 'velvet', sheen: 0.3, style: 'tub' },
    rug: { color: '#cfc6b8', borderColor: '#5a4a32', pattern: 'plain' },
    curtains: { color: '#d8cdb8' },
  },
  rooms: {
    // Main bedroom → balanced hotel layout. Queen centred on the north wall
    // (headboard wall) with twin nightstands + lamps; wardrobe on the solid
    // east wall; a bench at the foot. Symmetry reads as a boutique suite.
    mainBedroom: [
      {
        id: 'default-main-bed',
        defId: 'bed-queen',
        position: [1.5, 1.25],
        rotation: 0,
        props: {
          frameColor: '#4a3a2c',
          beddingColor: '#e8e2d6',
          headboardStyle: 'upholstered',
          headboardColor: '#8f857a',
          throwColor: '#6b5f4e',
          pillowColor: '#ffffff',
        },
      },
      {
        id: 'default-main-ns-l',
        defId: 'nightstand',
        position: [0.475, 0.55],
        rotation: 0,
        props: { color: '#4a3a2c' },
      },
      {
        id: 'default-main-ns-r',
        defId: 'nightstand',
        position: [2.525, 0.55],
        rotation: 0,
        props: { color: '#4a3a2c' },
      },
      {
        id: 'default-main-lamp-l',
        defId: 'table-lamp',
        position: [0.475, 0.55],
        rotation: 0,
        props: { surfaceHeight: 0.52, shade: 'drum' },
      },
      {
        id: 'default-main-lamp-r',
        defId: 'table-lamp',
        position: [2.525, 0.55],
        rotation: 0,
        props: { surfaceHeight: 0.52, shade: 'drum' },
      },
      {
        id: 'default-main-wardrobe',
        defId: 'wardrobe-3door',
        position: [2.7, 1.95],
        rotation: -Math.PI / 2,
        props: { width: 1.4, doorStyle: 'sliding', color: '#6b5f4e' },
      },
      {
        id: 'default-main-bench',
        defId: 'bench',
        position: [1.5, 2.55],
        rotation: 0,
        props: {
          style: 'upholstered',
          material: 'velvet',
          color: '#7d7468',
          legColor: '#3a2c1d',
          sheen: 0.3,
        },
      },
      {
        id: 'default-main-rug',
        defId: 'rug',
        position: [1.4, 2.0],
        rotation: 0,
        props: { width: 1.8, depth: 1.2, color: '#cfc6b8', borderColor: '#5a4a32' },
      },
      {
        id: 'default-main-pendant',
        defId: 'ceiling-light',
        position: [1.5, 1.6],
        rotation: 0,
        props: { style: 'flush' },
      },
      {
        id: 'default-main-curtain',
        defId: 'curtains',
        position: [0.28, 2.2],
        rotation: Math.PI / 2,
        props: { width: 2.3, height: 2.3, color: '#d8cdb8' },
      },
      {
        id: 'default-main-sconce-l',
        defId: 'wall-sconce',
        position: [0.45, 0.3],
        rotation: 0,
        props: { mountHeight: 1.45 },
      },
      {
        id: 'default-main-sconce-r',
        defId: 'wall-sconce',
        position: [2.55, 0.3],
        rotation: 0,
        props: { mountHeight: 1.45 },
      },
    ],
  },
}
