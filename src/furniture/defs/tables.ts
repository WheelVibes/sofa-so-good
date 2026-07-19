import { ellipseFootprintParts } from '../footprintShapes'
import type { FurnitureDef } from '../types'
import { diningSeatDim } from './diningSeatDims'
import { nestFootprint } from './nestingTables'

/** tables furniture definitions. Part of the built-in catalog (see ../builtinCatalog.ts). */
export const TABLES_DEFS = {
  // ── Tables ──────────────────────────────────────────────────────────────
  'dining-table-4': {
    kind: 'parametric',
    id: 'dining-table-4',
    name: 'Dining table',
    keywords: ['dinner table', 'kitchen table'],
    category: 'tables',
    primitive: 'DiningTable',
    // Default = the 4-seat rendered top (the primitive sizes off the `seats`
    // enum, not width/depth), so the honest footprint matches the geometry.
    defaultFootprint: { w: 1.4, d: 0.85, h: 0.74 },
    // The rendered top size comes from the `seats` enum (DINING_SEAT_DIMENSIONS),
    // NOT width/depth — so the footprint must track `seats` too, or a 6/8-seater
    // keeps a 4-seater collision box. Rect → one OBB at the seat size; round/oval
    // → the inscribed-OBB union approximating the disc/ellipse (footprintShapes.ts)
    // so the bbox corners of a round top read as open floor.
    footprintParts: (props) => {
      const { w, d } = diningSeatDim(props)
      const shape = props.shape
      if (shape !== 'round' && shape !== 'oval') return [{ dx: 0, dz: 0, w, d }]
      return ellipseFootprintParts(w, d)
    },
    paramSchema: [
      {
        kind: 'enum',
        key: 'seats',
        label: 'Seats',
        default: '4',
        options: [
          { value: '4', label: '4-seater' },
          { value: '6', label: '6-seater' },
          { value: '8', label: '8-seater' },
        ],
      },
      {
        kind: 'enum',
        key: 'shape',
        label: 'Shape',
        default: 'rect',
        options: [
          { value: 'rect', label: 'Rectangular' },
          { value: 'round', label: 'Round' },
          { value: 'oval', label: 'Oval' },
        ],
      },
      { kind: 'color', key: 'topColor', label: 'Top', default: '#9e7b53' },
      { kind: 'color', key: 'legColor', label: 'Legs', default: '#5b4126' },
      {
        kind: 'enum',
        key: 'finish',
        label: 'Top finish',
        default: 'mat:floor-wood-oak',
        options: [
          { value: 'wood', label: 'Wood' },
          { value: 'painted', label: 'Painted' },
          { value: 'gloss', label: 'Gloss' },
          { value: 'marble', label: 'Marble' },
          { value: 'concrete', label: 'Concrete' },
        ],
      },
      { kind: 'number', key: 'sheen', label: 'Sheen', min: 0, max: 1, step: 0.05, default: 0 },
    ],
  },
  desk: {
    kind: 'parametric',
    id: 'desk',
    name: 'Desk',
    keywords: ['study table', 'writing desk', 'work desk', 'computer table'],
    category: 'tables',
    primitive: 'Desk',
    defaultFootprint: { w: 1.4, d: 0.6, h: 0.74 },
    paramSchema: [
      {
        kind: 'number',
        key: 'width',
        label: 'Width',
        min: 1.0,
        max: 1.8,
        step: 0.1,
        default: 1.4,
        unit: 'm',
      },
      {
        kind: 'number',
        key: 'depth',
        label: 'Depth',
        min: 0.5,
        max: 0.8,
        step: 0.05,
        default: 0.6,
        unit: 'm',
      },
      { kind: 'color', key: 'color', label: 'Colour', default: '#d5c2a3' },
      {
        // Placed AFTER `legStyle` so `legStyle` stays the def's first structural
        // enum (its panel/legs/hairpin modes keep their structural-harness
        // coverage); the gaming style is covered via the harness EXTRA_MODES map.
        kind: 'enum',
        key: 'legStyle',
        label: 'Legs',
        default: 'panel',
        options: [
          { value: 'panel', label: 'Panel + drawer' },
          { value: 'legs', label: 'Four legs' },
          { value: 'hairpin', label: 'Hairpin' },
        ],
      },
      {
        kind: 'enum',
        key: 'style',
        label: 'Style',
        default: 'standard',
        options: [
          { value: 'standard', label: 'Standard' },
          { value: 'gaming', label: 'Gaming (riser + cable tray)' },
        ],
      },
      {
        kind: 'enum',
        key: 'finish',
        label: 'Finish',
        default: 'mat:floor-wood-oak',
        options: [
          { value: 'wood', label: 'Wood' },
          { value: 'painted', label: 'Painted' },
          { value: 'gloss', label: 'Gloss' },
        ],
      },
      { kind: 'number', key: 'sheen', label: 'Sheen', min: 0, max: 1, step: 0.05, default: 0 },
    ],
  },
  // ── Tables (low / occasional) ───────────────────────────────────────────
  'coffee-table': {
    kind: 'parametric',
    id: 'coffee-table',
    name: 'Coffee table',
    keywords: ['centre table', 'center table'],
    category: 'tables',
    primitive: 'CoffeeTable',
    defaultFootprint: { w: 1.1, d: 0.55, h: 0.42 },
    // Round/oval tops: same inscribed-OBB-union approximation as the dining
    // table (see footprintShapes.ts); 'rect' is unchanged (single full box).
    footprintParts: (props) => {
      const shape = props.shape
      if (shape !== 'round' && shape !== 'oval') return []
      const w = typeof props.width === 'number' ? props.width : 1.1
      const d = typeof props.depth === 'number' ? props.depth : 0.55
      return ellipseFootprintParts(w, d)
    },
    paramSchema: [
      {
        kind: 'number',
        key: 'width',
        label: 'Width',
        min: 0.8,
        max: 1.4,
        step: 0.05,
        default: 1.1,
        unit: 'm',
      },
      {
        kind: 'number',
        key: 'depth',
        label: 'Depth',
        min: 0.4,
        max: 0.7,
        step: 0.05,
        default: 0.55,
        unit: 'm',
      },
      { kind: 'color', key: 'color', label: 'Colour', default: '#6f553f' },
      {
        kind: 'enum',
        key: 'shape',
        label: 'Shape',
        default: 'rect',
        options: [
          { value: 'rect', label: 'Rectangular' },
          { value: 'round', label: 'Round' },
          { value: 'oval', label: 'Oval' },
        ],
      },
      {
        kind: 'enum',
        key: 'finish',
        label: 'Finish',
        default: 'mat:floor-wood-oak',
        options: [
          { value: 'wood', label: 'Wood' },
          { value: 'painted', label: 'Painted' },
          { value: 'gloss', label: 'Gloss' },
          { value: 'marble', label: 'Marble' },
          { value: 'concrete', label: 'Concrete' },
        ],
      },
      { kind: 'number', key: 'sheen', label: 'Sheen', min: 0, max: 1, step: 0.05, default: 0 },
    ],
  },
  'console-table': {
    kind: 'parametric',
    id: 'console-table',
    name: 'Console table',
    keywords: ['hallway table', 'entryway table', 'sofa table'],
    category: 'tables',
    primitive: 'ConsoleTable',
    defaultFootprint: { w: 1.2, d: 0.35, h: 0.8 },
    paramSchema: [
      {
        kind: 'number',
        key: 'width',
        label: 'Width',
        min: 0.8,
        max: 1.6,
        step: 0.05,
        default: 1.2,
        unit: 'm',
      },
      {
        kind: 'number',
        key: 'depth',
        label: 'Depth',
        min: 0.28,
        max: 0.45,
        step: 0.02,
        default: 0.35,
        unit: 'm',
      },
      { kind: 'color', key: 'color', label: 'Top / body', default: '#6f553f' },
      { kind: 'color', key: 'legColor', label: 'Legs', default: '#4a3722' },
      {
        kind: 'enum',
        key: 'style',
        label: 'Style',
        default: 'shelf',
        options: [
          { value: 'shelf', label: 'Lower shelf' },
          { value: 'drawers', label: 'Drawers' },
        ],
      },
      {
        kind: 'enum',
        key: 'finish',
        label: 'Finish',
        default: 'mat:floor-wood-oak',
        options: [
          { value: 'wood', label: 'Wood' },
          { value: 'painted', label: 'Painted' },
          { value: 'gloss', label: 'Gloss' },
        ],
      },
      { kind: 'number', key: 'sheen', label: 'Sheen', min: 0, max: 1, step: 0.05, default: 0 },
    ],
  },
  'bar-cart': {
    kind: 'parametric',
    id: 'bar-cart',
    name: 'Bar cart',
    category: 'tables',
    keywords: ['drinks trolley', 'serving cart', 'trolley', 'bar trolley'],
    primitive: 'BarCart',
    defaultFootprint: { w: 0.72, d: 0.42, h: 0.82 },
    footprintParams: { w: 'width', d: 'depth' },
    paramSchema: [
      {
        kind: 'number',
        key: 'width',
        label: 'Width',
        min: 0.55,
        max: 0.95,
        step: 0.01,
        default: 0.72,
        unit: 'm',
      },
      {
        kind: 'number',
        key: 'depth',
        label: 'Depth',
        min: 0.34,
        max: 0.5,
        step: 0.01,
        default: 0.42,
        unit: 'm',
      },
      { kind: 'integer', key: 'tiers', label: 'Tiers', min: 2, max: 3, default: 2 },
      {
        kind: 'enum',
        key: 'frame',
        label: 'Frame',
        default: 'brass',
        options: [
          { value: 'brass', label: 'Brass' },
          { value: 'black', label: 'Matte black' },
          { value: 'chrome', label: 'Chrome' },
        ],
      },
      {
        kind: 'enum',
        key: 'shelf',
        label: 'Shelves',
        default: 'glass',
        options: [
          { value: 'glass', label: 'Glass' },
          { value: 'wood', label: 'Wood' },
          { value: 'marble', label: 'Marble' },
        ],
      },
      { kind: 'color', key: 'shelfColor', label: 'Wood shelf', default: '#6f553f' },
    ],
  },
  'side-table': {
    kind: 'parametric',
    id: 'side-table',
    name: 'Side table',
    keywords: ['end table', 'accent table', 'nesting tables', 'nest of tables', 'stacking tables'],
    category: 'tables',
    primitive: 'SideTable',
    defaultFootprint: { w: 0.45, d: 0.45, h: 0.5 },
    footprintParams: { w: 'diameter', d: 'diameter' },
    // 'round' (3-leg) and 'drum' (cylindrical pedestal) are true circles — the
    // diameter×diameter bbox is already square, so the inscribed-OBB ellipse
    // union is a proper circle here. 'square' keeps the single full box. A
    // `set` nest (2–3 staggered round tables) spans wider than one table, so its
    // footprint tracks the WHOLE set extent (nestFootprint) — an honest
    // over-report vs the single largest piece, like the pets.ts enum→footprint
    // convention (the enum can't feed the 1:1 `footprintParams`).
    footprintParts: (props) => {
      const dia = typeof props.diameter === 'number' ? props.diameter : 0.45
      const set = typeof props.set === 'string' ? props.set : 'single'
      if (set !== 'single') {
        const { w, d } = nestFootprint(dia, set)
        return [{ dx: 0, dz: 0, w, d }]
      }
      if (props.shape === 'square') return []
      return ellipseFootprintParts(dia, dia)
    },
    paramSchema: [
      {
        kind: 'number',
        key: 'diameter',
        label: 'Diameter',
        min: 0.35,
        max: 0.7,
        step: 0.05,
        default: 0.45,
        unit: 'm',
      },
      {
        kind: 'number',
        key: 'height',
        label: 'Height',
        min: 0.4,
        max: 0.65,
        step: 0.05,
        default: 0.5,
        unit: 'm',
      },
      { kind: 'color', key: 'topColor', label: 'Top', default: '#9e7b53' },
      { kind: 'color', key: 'legColor', label: 'Legs', default: '#4a3722' },
      {
        // Nesting set (2–3 round tables that tuck together). `shape` stays the
        // first structural enum; the nest modes get structural coverage via the
        // harness's EXTRA_STRUCTURAL_MODES. A nest always renders round pieces
        // regardless of `shape` (see SideTable).
        kind: 'enum',
        key: 'set',
        label: 'Set',
        default: 'single',
        options: [
          { value: 'single', label: 'Single' },
          { value: 'nest2', label: 'Nesting (2)' },
          { value: 'nest3', label: 'Nesting (3)' },
        ],
      },
      {
        kind: 'enum',
        key: 'shape',
        label: 'Shape',
        default: 'round',
        options: [
          { value: 'round', label: 'Round (3 legs)' },
          { value: 'square', label: 'Square (4 legs)' },
          { value: 'drum', label: 'Drum pedestal' },
        ],
      },
      {
        kind: 'enum',
        key: 'finish',
        label: 'Top finish',
        default: 'wood',
        options: [
          { value: 'wood', label: 'Wood' },
          { value: 'painted', label: 'Painted' },
          { value: 'gloss', label: 'Gloss' },
          { value: 'marble', label: 'Marble' },
          { value: 'concrete', label: 'Concrete' },
          { value: 'brass', label: 'Brushed brass' },
        ],
      },
      { kind: 'number', key: 'sheen', label: 'Sheen', min: 0, max: 1, step: 0.05, default: 0 },
    ],
  },
  // Bar / counter-height table — a tall small-top table for a breakfast bar /
  // kitchen island. Reuses the DiningTable primitive with its own defaults: an
  // explicit small width/depth (overriding the seat-derived top) and a raised
  // `tableHeight` (bar-stool territory). Its own def keeps the dining table's
  // seat enum + dims undistorted.
  'bar-table': {
    kind: 'parametric',
    id: 'bar-table',
    name: 'Bar table',
    keywords: ['counter table', 'high table', 'pub table', 'poseur table', 'breakfast bar'],
    category: 'tables',
    primitive: 'DiningTable',
    defaultFootprint: { w: 0.7, d: 0.7, h: 1.05 },
    footprintParams: { w: 'width', d: 'depth' },
    // Round → the inscribed-OBB ellipse union (footprintShapes.ts); rect falls
    // back to the single enclosing OBB from footprintParams.
    footprintParts: (props) => {
      if (props.shape !== 'round') return []
      const w = typeof props.width === 'number' ? props.width : 0.7
      const d = typeof props.depth === 'number' ? props.depth : 0.7
      return ellipseFootprintParts(w, d)
    },
    paramSchema: [
      {
        kind: 'number',
        key: 'width',
        label: 'Width',
        min: 0.55,
        max: 0.9,
        step: 0.05,
        default: 0.7,
        unit: 'm',
      },
      {
        kind: 'number',
        key: 'depth',
        label: 'Depth',
        min: 0.55,
        max: 0.8,
        step: 0.05,
        default: 0.7,
        unit: 'm',
      },
      {
        kind: 'number',
        key: 'tableHeight',
        label: 'Height',
        min: 0.9,
        max: 1.1,
        step: 0.05,
        default: 1.05,
        unit: 'm',
      },
      {
        kind: 'enum',
        key: 'shape',
        label: 'Shape',
        default: 'rect',
        options: [
          { value: 'rect', label: 'Rectangular' },
          { value: 'round', label: 'Round pedestal' },
        ],
      },
      { kind: 'color', key: 'topColor', label: 'Top', default: '#9e7b53' },
      { kind: 'color', key: 'legColor', label: 'Legs', default: '#5b4126' },
      {
        kind: 'enum',
        key: 'finish',
        label: 'Top finish',
        default: 'mat:floor-wood-oak',
        options: [
          { value: 'wood', label: 'Wood' },
          { value: 'painted', label: 'Painted' },
          { value: 'gloss', label: 'Gloss' },
          { value: 'marble', label: 'Marble' },
          { value: 'concrete', label: 'Concrete' },
        ],
      },
      { kind: 'number', key: 'sheen', label: 'Sheen', min: 0, max: 1, step: 0.05, default: 0 },
    ],
  },
  // Wall-mounted / fold-down desk — an HDB study-corner worktop that hangs off
  // the wall. `mounted` (attaches to a wall). The `fold-down` style adds drop
  // legs to the floor, but the piece is still wall-anchored (the piano-hinge
  // batten is the primary mount), so it stays `mounted` — the structural harness
  // treats mounted defs as connectivity-only (no floor assert), which is correct
  // for the floating style and harmless for the deployed fold-down legs.
  'wall-desk': {
    kind: 'parametric',
    id: 'wall-desk',
    name: 'Wall-mounted desk',
    keywords: ['floating desk', 'fold-down desk', 'wall desk', 'drop-leaf desk', 'study corner'],
    category: 'tables',
    primitive: 'WallDesk',
    mounted: true,
    defaultFootprint: { w: 1.0, d: 0.5, h: 0.75 },
    verticalSpan: { base: 0, top: 0.78 },
    footprintParams: { w: 'width', d: 'depth' },
    paramSchema: [
      {
        kind: 'number',
        key: 'width',
        label: 'Width',
        min: 0.9,
        max: 1.1,
        step: 0.05,
        default: 1.0,
        unit: 'm',
      },
      {
        kind: 'number',
        key: 'depth',
        label: 'Depth',
        min: 0.45,
        max: 0.55,
        step: 0.05,
        default: 0.5,
        unit: 'm',
      },
      {
        kind: 'enum',
        key: 'style',
        label: 'Style',
        default: 'floating',
        options: [
          { value: 'floating', label: 'Floating (braced)' },
          { value: 'fold-down', label: 'Fold-down (drop legs)' },
        ],
      },
      { kind: 'color', key: 'color', label: 'Colour', default: '#c9b38f' },
      {
        kind: 'enum',
        key: 'finish',
        label: 'Finish',
        default: 'mat:floor-wood-oak',
        options: [
          { value: 'wood', label: 'Wood' },
          { value: 'painted', label: 'Painted' },
          { value: 'gloss', label: 'Gloss' },
        ],
      },
      { kind: 'number', key: 'sheen', label: 'Sheen', min: 0, max: 1, step: 0.05, default: 0 },
    ],
  },
  // Trestle desk — a worktop on two trestle supports. `legStyle` is the first
  // structural enum (harness auto-sweeps trestle-a / trestle-h / adjustable).
  'trestle-desk': {
    kind: 'parametric',
    id: 'trestle-desk',
    name: 'Trestle desk',
    keywords: ['trestle table', 'craft desk', 'studio desk', 'work desk', 'a-frame desk'],
    category: 'tables',
    primitive: 'TrestleDesk',
    defaultFootprint: { w: 1.4, d: 0.7, h: 0.74 },
    footprintParams: { w: 'width', d: 'depth' },
    paramSchema: [
      {
        kind: 'number',
        key: 'width',
        label: 'Width',
        min: 1.2,
        max: 1.6,
        step: 0.05,
        default: 1.4,
        unit: 'm',
      },
      {
        kind: 'number',
        key: 'depth',
        label: 'Depth',
        min: 0.6,
        max: 0.8,
        step: 0.05,
        default: 0.7,
        unit: 'm',
      },
      {
        kind: 'enum',
        key: 'legStyle',
        label: 'Legs',
        default: 'trestle-a',
        options: [
          { value: 'trestle-a', label: 'A-frame trestle' },
          { value: 'trestle-h', label: 'H-frame trestle' },
          { value: 'adjustable', label: 'Adjustable (pin holes)' },
        ],
      },
      { kind: 'color', key: 'color', label: 'Worktop', default: '#b9986a' },
      {
        kind: 'enum',
        key: 'finish',
        label: 'Finish',
        default: 'mat:floor-wood-oak',
        options: [
          { value: 'wood', label: 'Wood' },
          { value: 'painted', label: 'Painted' },
          { value: 'gloss', label: 'Gloss' },
        ],
      },
      { kind: 'number', key: 'sheen', label: 'Sheen', min: 0, max: 1, step: 0.05, default: 0 },
    ],
  },
} satisfies Record<string, FurnitureDef>
