import type { FurnitureDef } from '../types'

/** laundry furniture definitions. Part of the built-in catalog (see ../builtinCatalog.ts). */
export const LAUNDRY_DEFS = {
  'drying-rack': {
    kind: 'parametric',
    id: 'drying-rack',
    name: 'Drying rack',
    keywords: ['clothes airer', 'laundry rack'],
    category: 'laundry',
    primitive: 'DryingRack',
    defaultFootprint: { w: 0.9, d: 0.55, h: 0.95 },
    paramSchema: [
      {
        kind: 'number',
        key: 'width',
        label: 'Width',
        min: 0.6,
        max: 1.2,
        step: 0.05,
        default: 0.9,
        unit: 'm',
      },
      { kind: 'color', key: 'color', label: 'Finish', default: '#c9ccd1' },
    ],
  },
  'laundry-hamper': {
    kind: 'parametric',
    id: 'laundry-hamper',
    name: 'Laundry hamper',
    keywords: ['laundry basket', 'washing basket', 'linen basket', 'hamper'],
    category: 'laundry',
    primitive: 'LaundryHamper',
    defaultFootprint: { w: 0.42, d: 0.42, h: 0.56 },
    paramSchema: [
      {
        kind: 'enum',
        key: 'style',
        label: 'Shape',
        default: 'round',
        options: [
          { value: 'round', label: 'Round basket' },
          { value: 'rect', label: 'Rectangular bin' },
        ],
      },
      {
        kind: 'enum',
        key: 'weave',
        label: 'Material',
        default: 'rattan',
        options: [
          { value: 'rattan', label: 'Woven rattan' },
          { value: 'fabric', label: 'Canvas' },
        ],
      },
      { kind: 'color', key: 'color', label: 'Basket', default: '#cbb791' },
      { kind: 'color', key: 'liner', label: 'Liner', default: '#eee7d8' },
      {
        kind: 'enum',
        key: 'lid',
        label: 'Lid',
        default: 'none',
        options: [
          { value: 'none', label: 'Open' },
          { value: 'flat', label: 'Lidded' },
        ],
      },
    ],
  },
  'washing-machine': {
    kind: 'parametric',
    id: 'washing-machine',
    name: 'Washing machine',
    category: 'laundry',
    keywords: ['washer', 'laundry', 'dryer'],
    primitive: 'WashingMachine',
    defaultFootprint: { w: 0.6, d: 0.6, h: 0.85 },
    paramSchema: [
      { kind: 'color', key: 'color', label: 'Colour', default: '#eef0f2' },
      {
        kind: 'enum',
        key: 'finish',
        label: 'Finish',
        default: 'matte',
        options: [
          { value: 'matte', label: 'Matte' },
          { value: 'steel', label: 'Stainless steel' },
          { value: 'gloss', label: 'Gloss' },
        ],
      },
    ],
  },
} satisfies Record<string, FurnitureDef>
