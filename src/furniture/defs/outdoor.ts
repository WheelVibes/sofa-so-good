import type { FurnitureDef } from '../types'

/** outdoor furniture definitions. Part of the built-in catalog (see ../builtinCatalog.ts). */
export const OUTDOOR_DEFS = {
  'outdoor-parasol': {
    kind: 'parametric',
    id: 'outdoor-parasol',
    name: 'Parasol',
    keywords: ['umbrella', 'patio umbrella', 'sunshade', 'balcony', 'garden', 'shade'],
    category: 'outdoor',
    primitive: 'OutdoorParasol',
    defaultFootprint: { w: 2.2, d: 2.2, h: 2.3 },
    // The wide footprint is the canopy, which floats up high — only the thin pole
    // touches the floor. Span it at canopy height so furniture (loungers, tables)
    // can sit in its shade without the canopy reading as a floor-level obstacle.
    verticalSpan: { base: 1.9, top: 2.3 },
    paramSchema: [
      {
        kind: 'number',
        key: 'diameter',
        label: 'Canopy ⌀',
        min: 1.5,
        max: 3,
        step: 0.1,
        default: 2.2,
        unit: 'm',
      },
      { kind: 'color', key: 'fabric', label: 'Canopy', default: '#b5654a' },
    ],
  },
  'outdoor-table': {
    kind: 'parametric',
    id: 'outdoor-table',
    name: 'Outdoor table',
    keywords: ['patio', 'balcony', 'bistro', 'garden table', 'deck', 'slatted'],
    category: 'outdoor',
    primitive: 'OutdoorTable',
    defaultFootprint: { w: 0.7, d: 0.7, h: 0.74 },
    footprintParams: { w: 'size', d: 'size' },
    paramSchema: [
      {
        kind: 'number',
        key: 'size',
        label: 'Size',
        min: 0.5,
        max: 1.1,
        step: 0.05,
        default: 0.7,
        unit: 'm',
      },
      {
        kind: 'number',
        key: 'height',
        label: 'Height',
        min: 0.4,
        max: 0.78,
        step: 0.02,
        default: 0.72,
        unit: 'm',
      },
      { kind: 'color', key: 'color', label: 'Frame', default: '#a9763f' },
      {
        kind: 'enum',
        key: 'finish',
        label: 'Finish',
        default: 'wood',
        options: [
          { value: 'wood', label: 'Teak' },
          { value: 'rattan', label: 'Rattan' },
          { value: 'painted', label: 'Painted' },
          { value: 'gloss', label: 'Metal' },
        ],
      },
    ],
  },
  'outdoor-chair': {
    kind: 'parametric',
    id: 'outdoor-chair',
    name: 'Outdoor chair',
    keywords: ['patio', 'balcony', 'garden chair', 'lounge', 'deck', 'slatted'],
    category: 'outdoor',
    primitive: 'OutdoorChair',
    defaultFootprint: { w: 0.62, d: 0.62, h: 0.9 },
    frontClearance: 0.4,
    paramSchema: [
      { kind: 'color', key: 'color', label: 'Frame', default: '#a9763f' },
      {
        kind: 'enum',
        key: 'finish',
        label: 'Finish',
        default: 'wood',
        options: [
          { value: 'wood', label: 'Teak' },
          { value: 'rattan', label: 'Rattan' },
          { value: 'painted', label: 'Painted' },
          { value: 'gloss', label: 'Metal' },
        ],
      },
    ],
  },
  'outdoor-lounger': {
    kind: 'parametric',
    id: 'outdoor-lounger',
    name: 'Outdoor lounger',
    keywords: ['sunbed', 'sun lounger', 'daybed', 'deck chair', 'patio', 'balcony', 'poolside'],
    category: 'outdoor',
    primitive: 'OutdoorLounger',
    defaultFootprint: { w: 0.72, d: 1.95, h: 0.5 },
    frontClearance: 0.4,
    paramSchema: [
      { kind: 'color', key: 'color', label: 'Frame', default: '#a9763f' },
      { kind: 'color', key: 'cushion', label: 'Cushion', default: '#dfe3e1' },
      {
        kind: 'enum',
        key: 'finish',
        label: 'Finish',
        default: 'wood',
        options: [
          { value: 'wood', label: 'Teak' },
          { value: 'rattan', label: 'Rattan' },
          { value: 'painted', label: 'Painted' },
          { value: 'gloss', label: 'Metal' },
        ],
      },
    ],
  },
  'planter-trough': {
    kind: 'parametric',
    id: 'planter-trough',
    name: 'Planter trough',
    keywords: ['planter', 'balcony', 'outdoor', 'trough', 'window box', 'garden', 'greenery'],
    category: 'outdoor',
    primitive: 'PlanterTrough',
    defaultFootprint: { w: 0.9, d: 0.28, h: 0.65 },
    // Only `length` is a schema param; depth is a fixed 0.28 m in the primitive,
    // so `defaultFootprint.d` (0.28) is the honest depth. (No `d` mapping — the
    // old `d: 'depth'` referenced a param the schema never exposed.)
    footprintParams: { w: 'length' },
    paramSchema: [
      {
        kind: 'number',
        key: 'length',
        label: 'Length',
        min: 0.5,
        max: 1.6,
        step: 0.1,
        default: 0.9,
        unit: 'm',
      },
      { kind: 'color', key: 'potColor', label: 'Planter', default: '#a6a29a' },
      { kind: 'color', key: 'leafColor', label: 'Foliage', default: '#4a7a44' },
    ],
  },
} satisfies Record<string, FurnitureDef>
