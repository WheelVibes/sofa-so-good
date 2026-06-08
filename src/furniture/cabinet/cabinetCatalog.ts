/**
 * Catalog definitions for the parametric cabinet engine (K1). Three starting
 * carcasses — base, wall (upper) and tall pantry — all driven by the one
 * `CabinetModule` primitive + `buildCabinet` model. Kept in its own file so the
 * cabinet feature stays self-contained; merged into `BUILTIN_CATALOG` via spread.
 */

import type { ParametricDef, ParamField, PrimitiveKind } from '../types'

type CabinetType = 'base' | 'wall' | 'tall'

/** Shared front-style + finish + colour controls common to every cabinet. */
function commonFields(type: CabinetType): ParamField[] {
  const fronts =
    type === 'base'
      ? [
          { value: 'slab', label: 'Slab doors' },
          { value: 'shaker', label: 'Shaker doors' },
          { value: 'drawers', label: 'Drawers' },
          { value: 'open', label: 'Open shelves' },
        ]
      : [
          { value: 'slab', label: 'Slab doors' },
          { value: 'shaker', label: 'Shaker doors' },
          { value: 'glass', label: 'Glass doors' },
          { value: 'open', label: 'Open shelves' },
        ]
  return [
    {
      kind: 'integer',
      key: 'columns',
      label: 'Door columns',
      min: 1,
      max: 4,
      default: type === 'tall' ? 1 : 2,
    },
    { kind: 'enum', key: 'front', label: 'Fronts', default: 'slab', options: fronts },
    {
      kind: 'integer',
      key: 'drawerRows',
      label: 'Drawer rows',
      min: 1,
      max: 5,
      default: 3,
    },
    { kind: 'color', key: 'color', label: 'Cabinet', default: '#e6e2d8' },
    {
      kind: 'enum',
      key: 'finish',
      label: 'Finish',
      default: 'painted',
      options: [
        { value: 'wood', label: 'Wood' },
        { value: 'painted', label: 'Painted' },
        { value: 'gloss', label: 'Gloss' },
      ],
    },
    { kind: 'number', key: 'sheen', label: 'Sheen', min: 0, max: 1, step: 0.05, default: 0 },
  ]
}

/** A dimension field in metres with 1 cm granularity (millimetre-ish custom). */
const dim = (key: string, label: string, min: number, max: number, def: number): ParamField => ({
  kind: 'number',
  key,
  label,
  min,
  max,
  step: 0.01,
  default: def,
  unit: 'm',
})

export const CABINET_DEFS: Record<string, ParametricDef> = {
  'cabinet-base': {
    kind: 'parametric',
    id: 'cabinet-base',
    name: 'Base cabinet',
    category: 'kitchen',
    primitive: 'CabinetBase' satisfies PrimitiveKind,
    keywords: ['cabinet', 'cupboard', 'carcass', 'base unit', 'kitchen', 'modular'],
    defaultFootprint: { w: 0.6, d: 0.62, h: 0.9 },
    footprintParams: { w: 'width', d: 'depth' },
    paramSchema: [
      dim('width', 'Width', 0.3, 1.2, 0.6),
      dim('height', 'Carcass height', 0.5, 0.95, 0.72),
      dim('depth', 'Depth', 0.35, 0.7, 0.6),
      {
        kind: 'enum',
        key: 'countertop',
        label: 'Countertop',
        default: 'yes',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'None' },
        ],
      },
      {
        kind: 'enum',
        key: 'worktop',
        label: 'Worktop',
        default: 'none',
        options: [
          { value: 'none', label: 'Plain' },
          { value: 'sink', label: 'Sink basin' },
          { value: 'hob', label: 'Hob / cooktop' },
        ],
      },
      { kind: 'color', key: 'worktopColor', label: 'Worktop colour', default: '#34373d' },
      dim('countertopThickness', 'Worktop thickness', 0.02, 0.08, 0.04),
      dim('toeKick', 'Toe-kick', 0, 0.18, 0.1),
      ...commonFields('base'),
    ],
  },
  'cabinet-wall': {
    kind: 'parametric',
    id: 'cabinet-wall',
    name: 'Wall cabinet (upper)',
    category: 'kitchen',
    primitive: 'CabinetWall' satisfies PrimitiveKind,
    keywords: ['cabinet', 'upper', 'wall unit', 'cupboard', 'kitchen', 'modular'],
    defaultFootprint: { w: 0.6, d: 0.35, h: 0.72 },
    footprintParams: { w: 'width', d: 'depth' },
    // Uppers mount on the wall; the carcass renders from the floor in its own
    // frame but is meant to be lifted by placement (mounted = skip wall body).
    mounted: true,
    verticalSpan: { base: 1.45, top: 2.2 },
    paramSchema: [
      dim('width', 'Width', 0.3, 1.0, 0.6),
      dim('height', 'Height', 0.4, 0.95, 0.72),
      dim('depth', 'Depth', 0.28, 0.4, 0.35),
      {
        kind: 'enum',
        key: 'cornice',
        label: 'Cornice',
        default: 'no',
        options: [
          { value: 'no', label: 'None' },
          { value: 'yes', label: 'Crown cap' },
        ],
      },
      ...commonFields('wall'),
    ],
  },
  'cabinet-tall': {
    kind: 'parametric',
    id: 'cabinet-tall',
    name: 'Tall pantry cabinet',
    category: 'kitchen',
    primitive: 'CabinetTall' satisfies PrimitiveKind,
    keywords: ['cabinet', 'pantry', 'larder', 'tall unit', 'broom', 'cupboard', 'modular'],
    defaultFootprint: { w: 0.6, d: 0.62, h: 2.05 },
    footprintParams: { w: 'width', d: 'depth' },
    paramSchema: [
      dim('width', 'Width', 0.4, 1.0, 0.6),
      dim('height', 'Carcass height', 1.4, 2.2, 2.0),
      dim('depth', 'Depth', 0.35, 0.7, 0.6),
      {
        kind: 'enum',
        key: 'cornice',
        label: 'Cornice',
        default: 'no',
        options: [
          { value: 'no', label: 'None' },
          { value: 'yes', label: 'Crown cap' },
        ],
      },
      dim('toeKick', 'Toe-kick', 0, 0.18, 0.1),
      ...commonFields('tall'),
    ],
  },
}
