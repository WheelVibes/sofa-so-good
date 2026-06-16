import type { FurnitureDef } from '../types'

/** others furniture definitions. Part of the built-in catalog (see ../builtinCatalog.ts). */
export const OTHERS_DEFS = {
  staircase: {
    kind: 'parametric',
    id: 'staircase',
    name: 'Staircase',
    keywords: ['stairs', 'steps', 'stairway', 'flight'],
    category: 'others',
    primitive: 'Staircase',
    defaultFootprint: { w: 0.9, d: 3.4, h: 2.2 },
    verticalSpan: { base: 0, top: 2.2 },
    footprintParams: { w: 'width' },
    paramSchema: [
      {
        kind: 'enum',
        key: 'style',
        label: 'Style',
        default: 'straight',
        options: [
          { value: 'straight', label: 'Straight' },
          { value: 'lshape', label: 'L-shaped' },
          { value: 'ushape', label: 'U-shaped' },
          { value: 'spiral', label: 'Spiral' },
        ],
      },
      { kind: 'number', key: 'steps', label: 'Steps', min: 2, max: 24, step: 1, default: 13 },
      {
        kind: 'number',
        key: 'width',
        label: 'Width',
        min: 0.6,
        max: 1.6,
        step: 0.05,
        default: 0.9,
        unit: 'm',
      },
      {
        kind: 'number',
        key: 'riserHeight',
        label: 'Riser',
        min: 0.12,
        max: 0.2,
        step: 0.005,
        default: 0.17,
        unit: 'm',
      },
      {
        kind: 'number',
        key: 'treadDepth',
        label: 'Tread',
        min: 0.22,
        max: 0.32,
        step: 0.005,
        default: 0.26,
        unit: 'm',
      },
      {
        kind: 'enum',
        key: 'railing',
        label: 'Railing',
        default: 'side',
        options: [
          { value: 'none', label: 'None' },
          { value: 'side', label: 'One side' },
          { value: 'both', label: 'Both sides' },
        ],
      },
      { kind: 'color', key: 'color', label: 'Timber', default: '#9c6b3f' },
    ],
  },
} satisfies Record<string, FurnitureDef>
