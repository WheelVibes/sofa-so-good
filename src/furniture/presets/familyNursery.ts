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
  // Room geometry (2026-07-23 default-flat revision): bedroom3 is
  // x=[6.24,9.125] z=[0.2,3.725], north window x=[6.8,8.6], door on the SOUTH
  // wall (was the corridor-N wall on the old plan) spanning x=[6.38,7.18],
  // swinging into the room — the nursing nook is pulled to the SE quadrant,
  // clear of the door's swing path.
  rooms: {
    // Bedroom 3 → nursery. East wall (solid) holds the crib; the west wall
    // (solid partition) a changing dresser; a nursing chair + arc lamp nook
    // to the south; soft rug centred.
    bedroom3: [
      {
        // North (W1) window curtain — soft nursery tone, blocks morning light.
        id: 'default-b3-curtain',
        defId: 'curtains',
        position: [7.7, 0.28],
        rotation: 0,
        props: { width: 1.9, height: 2.55, color: '#d9cfc2' },
      },
      {
        id: 'default-b3-crib',
        defId: 'crib',
        position: [8.65, 1.0],
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
        position: [6.6, 1.0],
        rotation: Math.PI / 2,
        props: { width: 1.2, rows: 3, color: '#cdb696', handle: 'knob' },
      },
      {
        id: 'default-b3-glider',
        defId: 'armchair',
        position: [7.9, 2.9],
        rotation: Math.PI,
        props: { style: 'standard', material: 'fabric', color: '#b48a6a' },
      },
      {
        id: 'default-b3-lamp',
        // Arc lamp for the glider nook, pulled NORTH of the glider (z=1.9)
        // clear of the door's swing on the south wall (x=[6.38,7.18]); its
        // arc still reaches over the glider at (7.9, 2.9).
        defId: 'floor-lamp',
        position: [7.9, 1.9],
        rotation: 0.6,
        props: { base: 'arc', shade: 'drum', poleColor: '#3a3026' },
      },
      {
        id: 'default-b3-rug',
        defId: 'rug',
        position: [7.9, 2.5],
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
        position: [7.68, 1.9],
        rotation: 0,
        props: { style: 'flush' },
      },
      {
        // Nudged from [8.8,2.0] (v0.23.1.8): `wall-int-b3-LD-col`'s RC
        // corner stub (z=[1.2,1.8], now correctly collision-checked at its
        // real 300 mm thickness — see `wallThicknessMetres`'s fallback fix)
        // clips the old spot's SW corner.
        id: 'default-b3-plant',
        defId: 'potted-plant',
        position: [8.7, 2.2],
        rotation: 0,
        props: { size: 'small', type: 'snake' },
      },
      {
        id: 'default-b3-art',
        defId: 'wall-art',
        position: [6.28, 2.4],
        rotation: Math.PI / 2,
        props: { width: 0.7, height: 0.5, artColor: '#b48a6a' },
      },
    ],
  },
}
