import type { FurnitureDef } from '../types'

/** textiles furniture definitions. Part of the built-in catalog (see ../builtinCatalog.ts). */
export const TEXTILES_DEFS = {
  rug: {
    kind: 'parametric',
    id: 'rug',
    name: 'Area rug',
    keywords: ['carpet', 'mat', 'floor mat'],
    category: 'textiles',
    primitive: 'Rug',
    defaultFootprint: { w: 2.0, d: 1.4, h: 0.03 },
    noClip: true,
    paramSchema: [
      {
        kind: 'number',
        key: 'width',
        label: 'Width',
        min: 0.8,
        max: 3.0,
        step: 0.1,
        default: 2.0,
        unit: 'm',
      },
      {
        kind: 'number',
        key: 'depth',
        label: 'Depth',
        min: 0.6,
        max: 2.4,
        step: 0.1,
        default: 1.4,
        unit: 'm',
      },
      { kind: 'color', key: 'color', label: 'Field', default: '#9c8f7a' },
      {
        kind: 'enum',
        key: 'shape',
        label: 'Shape',
        default: 'rectangular',
        options: [
          { value: 'rectangular', label: 'Rectangular' },
          { value: 'round', label: 'Round' },
          { value: 'oval', label: 'Oval' },
        ],
      },
      {
        kind: 'enum',
        key: 'pattern',
        label: 'Pattern',
        default: 'solid',
        options: [
          { value: 'solid', label: 'Solid' },
          { value: 'gradient', label: 'Gradient' },
          { value: 'striped', label: 'Striped' },
          { value: 'herringbone', label: 'Herringbone' },
          { value: 'checkered', label: 'Checkered' },
          { value: 'plaid', label: 'Plaid' },
          { value: 'dots', label: 'Dots' },
        ],
      },
      { kind: 'color', key: 'color2', label: 'Field 2 (gradient)', default: '#c4b9a6' },
      { kind: 'color', key: 'borderColor', label: 'Border', default: '#6e5f4c' },
    ],
  },
  curtains: {
    kind: 'parametric',
    id: 'curtains',
    name: 'Curtains',
    keywords: ['drapes', 'drapery', 'window treatment'],
    category: 'textiles',
    primitive: 'Curtain',
    defaultFootprint: { w: 2.0, d: 0.12, h: 2.75 },
    // Drapes hang flat against a wall behind furniture — never block placement.
    noClip: true,
    // Window-bound: statically placed on a window (no move/rotate/flip). Placement
    // sizes the curtain to its window (wider than the glass, floor-to-ceiling).
    windowBound: true,
    paramSchema: [
      {
        kind: 'number',
        key: 'width',
        label: 'Width',
        min: 1.0,
        max: 3.4,
        step: 0.1,
        default: 2.0,
        unit: 'm',
      },
      {
        // Floor-to-rod drop — floor-to-ceiling by default (placement sets it to
        // the room's ceiling height).
        kind: 'number',
        key: 'height',
        label: 'Height',
        min: 1.8,
        max: 3.2,
        step: 0.05,
        default: 2.75,
        unit: 'm',
      },
      {
        // Drop length: floor-to-ceiling (default) or down to just below the
        // window sill. Both hang from the rod (the `height` above).
        kind: 'enum',
        key: 'length',
        label: 'Length',
        default: 'floor',
        options: [
          { value: 'floor', label: 'Floor-to-ceiling' },
          { value: 'sill', label: 'Sill length' },
        ],
      },
      { kind: 'color', key: 'color', label: 'Fabric', default: '#c4b9a6' },
      {
        // Draw the curtains with a smooth animation (CURTAIN-DRAW): 0 = open
        // (tied back, exterior light filters in), 1 = drawn (covers the window).
        // The primitive eases between the two; the window light attenuation
        // tracks the same value.
        kind: 'number',
        key: 'drawAmount',
        label: 'Draw (open → closed)',
        min: 0,
        max: 1,
        step: 0.05,
        default: 1,
      },
      {
        kind: 'enum',
        key: 'pattern',
        label: 'Weave',
        default: 'plain',
        options: [
          { value: 'plain', label: 'Plain' },
          { value: 'striped', label: 'Striped' },
          { value: 'herringbone', label: 'Herringbone' },
          { value: 'checkered', label: 'Checkered' },
          { value: 'plaid', label: 'Plaid' },
          { value: 'dots', label: 'Dots' },
        ],
      },
    ],
  },
  'wall-tapestry': {
    kind: 'parametric',
    id: 'wall-tapestry',
    name: 'Wall tapestry',
    keywords: ['macrame', 'woven hanging', 'wall hanging', 'textile', 'boho'],
    category: 'textiles',
    primitive: 'WallTapestry',
    defaultFootprint: { w: 0.7, d: 0.06, h: 0.95 },
    mounted: true,
    verticalSpan: { base: 0.7, top: 1.75 },
    paramSchema: [
      {
        kind: 'number',
        key: 'width',
        label: 'Width',
        min: 0.4,
        max: 1.2,
        step: 0.05,
        default: 0.7,
        unit: 'm',
      },
      {
        kind: 'number',
        key: 'drop',
        label: 'Drop',
        min: 0.5,
        max: 1.5,
        step: 0.05,
        default: 0.95,
        unit: 'm',
      },
      {
        kind: 'number',
        key: 'mountHeight',
        label: 'Rod height',
        min: 1.2,
        max: 2.0,
        step: 0.05,
        default: 1.7,
        unit: 'm',
      },
      {
        kind: 'enum',
        key: 'style',
        label: 'Style',
        default: 'macrame',
        options: [
          { value: 'macrame', label: 'Macramé (fringed)' },
          { value: 'woven', label: 'Woven panel' },
        ],
      },
      { kind: 'color', key: 'color', label: 'Panel', default: '#d9cdb6' },
      { kind: 'color', key: 'rodColor', label: 'Rod', default: '#b08a5a' },
    ],
  },
} satisfies Record<string, FurnitureDef>
