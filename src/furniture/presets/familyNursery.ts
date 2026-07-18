import type { LayoutPreset } from './types'

export const familyNursery: LayoutPreset = {
  id: 'family-nursery',
  group: 'layout',
  name: 'Family Nursery',
  description:
    'Soft warm flat; Bedroom 3 re-modelled as a nursery (crib + changing + nursing nook).',
  dryFloor: 'floor-wood-ash',
  wall: 'wall-paint-warm',
  style: {
    'sofa-3seat': {
      color: '#cfc3b2',
      material: 'fabric',
      pattern: 'plain',
      pillowColor: '#b48a6a',
    },
    armchair: { color: '#cbb79f', material: 'fabric', style: 'standard' },
    rug: { color: '#e6ddca', borderColor: '#c8b89c', pattern: 'plain' },
    'bed-queen': {
      frameColor: '#cdb696',
      beddingColor: '#efe9dc',
      headboardStyle: 'upholstered',
    },
    'wardrobe-3door': { color: '#e6ddca', doorStyle: 'sliding' },
    curtains: { color: '#e6ddca' },
  },
  rooms: {
    // Bedroom 3 → nursery. East wall (solid) holds the crib; the west wall
    // (solid partition) a changing dresser; a nursing chair + arc lamp nook
    // to the south; soft rug centred.
    bedroom3: [
      {
        id: 'default-b3-crib',
        defId: 'crib',
        position: [8.5, 1.4],
        rotation: -Math.PI / 2,
        props: {
          endStyle: 'slat',
          color: '#efe9dc',
          finish: 'painted',
          mattressColor: '#d6e2dc',
          mattressLevel: 'high',
        },
      },
      {
        id: 'default-b3-changer',
        defId: 'dresser',
        position: [6.45, 1.0],
        rotation: Math.PI / 2,
        props: { width: 1.2, rows: 3, color: '#cdb696', handle: 'knob' },
      },
      {
        id: 'default-b3-glider',
        defId: 'armchair',
        position: [7.5, 3.0],
        rotation: Math.PI,
        props: { style: 'standard', material: 'fabric', color: '#b48a6a' },
      },
      {
        id: 'default-b3-lamp',
        defId: 'floor-lamp',
        position: [6.4, 3.1],
        rotation: 0.6,
        props: { base: 'arc', shade: 'drum', poleColor: '#3a3026' },
      },
      {
        id: 'default-b3-rug',
        defId: 'rug',
        position: [7.4, 2.4],
        rotation: 0,
        props: {
          width: 1.6,
          depth: 1.2,
          color: '#e6ddca',
          borderColor: '#c8b89c',
          pattern: 'plain',
        },
      },
      {
        id: 'default-b3-pendant',
        defId: 'ceiling-light',
        position: [7.5, 1.9],
        rotation: 0,
        props: { style: 'flush' },
      },
      {
        id: 'default-b3-plant',
        defId: 'potted-plant',
        position: [8.55, 3.0],
        rotation: 0,
        props: { size: 'small', type: 'snake' },
      },
      {
        id: 'default-b3-art',
        defId: 'wall-art',
        position: [6.14, 2.4],
        rotation: Math.PI / 2,
        props: { width: 0.7, height: 0.5, artColor: '#b48a6a' },
      },
    ],
  },
}
