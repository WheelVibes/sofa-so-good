/**
 * Built-in furniture catalog. Each entry is a fully-typed FurnitureDef.
 *
 * Adding a parametric primitive: add a new ParametricDef here AND a
 * primitive component under primitives/<PrimitiveKind>.tsx. Adding a
 * built-in GLB: drop the file under public/assets/furniture/ and add a
 * BuiltinGltfDef entry; the generic GltfModel wrapper handles rendering.
 *
 * User-uploaded assets are NOT included here — they live in the user-assets
 * store slice and are merged in by `useCatalog()`.
 */

import type { FurnitureCategory, FurnitureDef, FurnitureType } from './types';

export const BUILTIN_CATALOG: Record<FurnitureType, FurnitureDef> = {
  // ── Beds ────────────────────────────────────────────────────────────────
  // Beds use fixed Singapore-standard mattress sizes — width/length are
  // not user-editable, so they're omitted from paramSchema and resolved
  // from defaultFootprint via defaultParamProps().
  'bed-single': {
    kind: 'parametric',
    id: 'bed-single',
    name: 'Single bed',
    category: 'beds',
    primitive: 'Bed',
    defaultFootprint: { w: 0.91, d: 1.9, h: 0.6 },
    paramSchema: [
      { kind: 'color', key: 'mattressColor', label: 'Mattress', default: '#e8e2d4' },
      { kind: 'color', key: 'beddingColor', label: 'Bedding', default: '#c9d3da' },
      { kind: 'color', key: 'throwColor', label: 'Throw', default: '#b08968' },
      { kind: 'color', key: 'frameColor', label: 'Frame', default: '#6f553f' },
      {
        kind: 'enum',
        key: 'headboardStyle',
        label: 'Headboard',
        default: 'flat',
        options: [
          { value: 'flat', label: 'Flat' },
          { value: 'paneled', label: 'Paneled' },
        ],
      },
    ],
  },
  'bed-double': {
    kind: 'parametric',
    id: 'bed-double',
    name: 'Double bed',
    category: 'beds',
    primitive: 'Bed',
    defaultFootprint: { w: 1.37, d: 1.9, h: 0.6 },
    paramSchema: [
      { kind: 'color', key: 'mattressColor', label: 'Mattress', default: '#e8e2d4' },
      { kind: 'color', key: 'beddingColor', label: 'Bedding', default: '#c9d3da' },
      { kind: 'color', key: 'throwColor', label: 'Throw', default: '#b08968' },
      { kind: 'color', key: 'frameColor', label: 'Frame', default: '#6f553f' },
      {
        kind: 'enum',
        key: 'headboardStyle',
        label: 'Headboard',
        default: 'flat',
        options: [
          { value: 'flat', label: 'Flat' },
          { value: 'paneled', label: 'Paneled' },
        ],
      },
    ],
  },
  'bed-queen': {
    kind: 'parametric',
    id: 'bed-queen',
    name: 'Queen bed',
    category: 'beds',
    primitive: 'Bed',
    defaultFootprint: { w: 1.52, d: 1.9, h: 0.6 },
    paramSchema: [
      { kind: 'color', key: 'mattressColor', label: 'Mattress', default: '#e8e2d4' },
      { kind: 'color', key: 'beddingColor', label: 'Bedding', default: '#c9d3da' },
      { kind: 'color', key: 'throwColor', label: 'Throw', default: '#b08968' },
      { kind: 'color', key: 'frameColor', label: 'Frame', default: '#6f553f' },
      {
        kind: 'enum',
        key: 'headboardStyle',
        label: 'Headboard',
        default: 'paneled',
        options: [
          { value: 'flat', label: 'Flat' },
          { value: 'paneled', label: 'Paneled' },
        ],
      },
    ],
  },
  'bed-king': {
    kind: 'parametric',
    id: 'bed-king',
    name: 'King bed',
    category: 'beds',
    primitive: 'Bed',
    defaultFootprint: { w: 1.82, d: 2.03, h: 0.6 },
    paramSchema: [
      { kind: 'color', key: 'mattressColor', label: 'Mattress', default: '#e8e2d4' },
      { kind: 'color', key: 'beddingColor', label: 'Bedding', default: '#c9d3da' },
      { kind: 'color', key: 'throwColor', label: 'Throw', default: '#b08968' },
      { kind: 'color', key: 'frameColor', label: 'Frame', default: '#6f553f' },
      {
        kind: 'enum',
        key: 'headboardStyle',
        label: 'Headboard',
        default: 'paneled',
        options: [
          { value: 'flat', label: 'Flat' },
          { value: 'paneled', label: 'Paneled' },
        ],
      },
    ],
  },

  // ── Seating ─────────────────────────────────────────────────────────────
  'sofa-3seat': {
    kind: 'parametric',
    id: 'sofa-3seat',
    name: '3-seat sofa',
    category: 'seating',
    primitive: 'Sofa',
    defaultFootprint: { w: 2.1, d: 0.9, h: 0.85 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 1.8, max: 2.4, step: 0.05, default: 2.1, unit: 'm' },
      { kind: 'number', key: 'depth', label: 'Depth', min: 0.85, max: 1.0, step: 0.05, default: 0.9, unit: 'm' },
      { kind: 'integer', key: 'cushionCount', label: 'Cushions', min: 2, max: 4, default: 3 },
      { kind: 'color', key: 'color', label: 'Upholstery', default: '#8aa1a8' },
      { kind: 'color', key: 'pillowColor', label: 'Throw pillows', default: '#c8775c' },
    ],
  },
  'sofa-2seat': {
    kind: 'parametric',
    id: 'sofa-2seat',
    name: '2-seat sofa',
    category: 'seating',
    primitive: 'Sofa',
    defaultFootprint: { w: 1.5, d: 0.9, h: 0.85 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 1.3, max: 1.7, step: 0.05, default: 1.5, unit: 'm' },
      { kind: 'number', key: 'depth', label: 'Depth', min: 0.85, max: 1.0, step: 0.05, default: 0.9, unit: 'm' },
      { kind: 'integer', key: 'cushionCount', label: 'Cushions', min: 2, max: 3, default: 2 },
      { kind: 'color', key: 'color', label: 'Upholstery', default: '#8aa1a8' },
      { kind: 'color', key: 'pillowColor', label: 'Throw pillows', default: '#c8775c' },
    ],
  },

  // ── Tables ──────────────────────────────────────────────────────────────
  'dining-table-4': {
    kind: 'parametric',
    id: 'dining-table-4',
    name: 'Dining table',
    category: 'tables',
    primitive: 'DiningTable',
    defaultFootprint: { w: 1.5, d: 0.9, h: 0.74 },
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
      { kind: 'color', key: 'topColor', label: 'Top', default: '#9e7b53' },
      { kind: 'color', key: 'legColor', label: 'Legs', default: '#5b4126' },
    ],
  },
  desk: {
    kind: 'parametric',
    id: 'desk',
    name: 'Desk',
    category: 'tables',
    primitive: 'Desk',
    defaultFootprint: { w: 1.4, d: 0.6, h: 0.74 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 1.0, max: 1.8, step: 0.1, default: 1.4, unit: 'm' },
      { kind: 'number', key: 'depth', label: 'Depth', min: 0.5, max: 0.8, step: 0.05, default: 0.6, unit: 'm' },
      { kind: 'color', key: 'color', label: 'Colour', default: '#d5c2a3' },
    ],
  },

  // ── Storage ─────────────────────────────────────────────────────────────
  'wardrobe-3door': {
    kind: 'parametric',
    id: 'wardrobe-3door',
    name: 'Wardrobe',
    category: 'storage',
    primitive: 'Wardrobe',
    defaultFootprint: { w: 1.5, d: 0.6, h: 2.1 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 1.0, max: 2.4, step: 0.1, default: 1.5, unit: 'm' },
      { kind: 'integer', key: 'doorCount', label: 'Doors', min: 2, max: 4, default: 3 },
      { kind: 'color', key: 'color', label: 'Colour', default: '#caa478' },
    ],
  },
  dresser: {
    kind: 'parametric',
    id: 'dresser',
    name: 'Chest of drawers',
    category: 'storage',
    primitive: 'Dresser',
    defaultFootprint: { w: 1.2, d: 0.5, h: 0.93 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 0.8, max: 1.8, step: 0.1, default: 1.2, unit: 'm' },
      { kind: 'integer', key: 'rows', label: 'Rows', min: 2, max: 5, default: 3 },
      { kind: 'integer', key: 'cols', label: 'Columns', min: 1, max: 3, default: 2 },
      { kind: 'color', key: 'color', label: 'Colour', default: '#8a6b48' },
    ],
  },
  'shoe-cabinet': {
    kind: 'parametric',
    id: 'shoe-cabinet',
    name: 'Shoe cabinet',
    category: 'storage',
    primitive: 'ShoeCabinet',
    defaultFootprint: { w: 0.9, d: 0.32, h: 1.02 },
    footprintParams: { w: 'width', d: 'depth' },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 0.6, max: 1.6, step: 0.05, default: 0.9, unit: 'm' },
      { kind: 'number', key: 'depth', label: 'Depth', min: 0.24, max: 0.4, step: 0.02, default: 0.32, unit: 'm' },
      { kind: 'integer', key: 'tiers', label: 'Tiers', min: 2, max: 5, default: 3 },
      { kind: 'color', key: 'color', label: 'Colour', default: '#9a8a72' },
    ],
  },
  bookshelf: {
    kind: 'parametric',
    id: 'bookshelf',
    name: 'Bookshelf',
    category: 'storage',
    primitive: 'Bookshelf',
    defaultFootprint: { w: 0.9, d: 0.3, h: 1.8 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 0.6, max: 1.5, step: 0.05, default: 0.9, unit: 'm' },
      { kind: 'number', key: 'height', label: 'Height', min: 1.2, max: 2.4, step: 0.1, default: 1.8, unit: 'm' },
      { kind: 'integer', key: 'shelfCount', label: 'Shelves', min: 3, max: 6, default: 4 },
      { kind: 'color', key: 'color', label: 'Colour', default: '#7a5e3a' },
    ],
  },
  'tv-console': {
    kind: 'parametric',
    id: 'tv-console',
    name: 'TV console',
    category: 'storage',
    primitive: 'TVConsole',
    defaultFootprint: { w: 1.8, d: 0.4, h: 0.45 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 1.2, max: 2.4, step: 0.1, default: 1.8, unit: 'm' },
      { kind: 'color', key: 'color', label: 'Colour', default: '#3a2f24' },
    ],
  },

  'dining-chair': {
    kind: 'parametric',
    id: 'dining-chair',
    name: 'Dining chair',
    category: 'seating',
    primitive: 'DiningChair',
    defaultFootprint: { w: 0.46, d: 0.46, h: 0.92 },
    paramSchema: [
      { kind: 'color', key: 'seatColor', label: 'Seat', default: '#7a5c3c' },
      { kind: 'color', key: 'legColor', label: 'Legs', default: '#4e3a24' },
    ],
  },
  'office-chair': {
    kind: 'parametric',
    id: 'office-chair',
    name: 'Office chair',
    category: 'seating',
    primitive: 'OfficeChair',
    defaultFootprint: { w: 0.6, d: 0.6, h: 1.0 },
    paramSchema: [{ kind: 'color', key: 'color', label: 'Upholstery', default: '#2b2f33' }],
  },
  'bar-stool': {
    kind: 'parametric',
    id: 'bar-stool',
    name: 'Bar stool',
    category: 'seating',
    primitive: 'BarStool',
    defaultFootprint: { w: 0.42, d: 0.42, h: 0.71 },
    paramSchema: [
      { kind: 'color', key: 'seatColor', label: 'Seat', default: '#7a5c3c' },
      { kind: 'color', key: 'legColor', label: 'Legs', default: '#3a3d42' },
    ],
  },
  armchair: {
    kind: 'parametric',
    id: 'armchair',
    name: 'Armchair',
    category: 'seating',
    primitive: 'Armchair',
    defaultFootprint: { w: 0.85, d: 0.85, h: 0.92 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 0.7, max: 1.0, step: 0.05, default: 0.85, unit: 'm' },
      { kind: 'number', key: 'depth', label: 'Depth', min: 0.7, max: 0.95, step: 0.05, default: 0.85, unit: 'm' },
      { kind: 'color', key: 'color', label: 'Upholstery', default: '#b06a52' },
    ],
  },

  // ── Tables (low / occasional) ───────────────────────────────────────────
  'coffee-table': {
    kind: 'parametric',
    id: 'coffee-table',
    name: 'Coffee table',
    category: 'tables',
    primitive: 'CoffeeTable',
    defaultFootprint: { w: 1.1, d: 0.55, h: 0.42 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 0.8, max: 1.4, step: 0.05, default: 1.1, unit: 'm' },
      { kind: 'number', key: 'depth', label: 'Depth', min: 0.4, max: 0.7, step: 0.05, default: 0.55, unit: 'm' },
      { kind: 'color', key: 'color', label: 'Colour', default: '#6f553f' },
    ],
  },
  nightstand: {
    kind: 'parametric',
    id: 'nightstand',
    name: 'Nightstand',
    category: 'storage',
    primitive: 'Nightstand',
    defaultFootprint: { w: 0.45, d: 0.4, h: 0.52 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 0.35, max: 0.6, step: 0.05, default: 0.45, unit: 'm' },
      { kind: 'number', key: 'depth', label: 'Depth', min: 0.3, max: 0.5, step: 0.05, default: 0.4, unit: 'm' },
      { kind: 'color', key: 'color', label: 'Colour', default: '#8a6b48' },
    ],
  },

  // ── Bathroom ────────────────────────────────────────────────────────────
  toilet: {
    kind: 'parametric',
    id: 'toilet',
    name: 'Toilet (WC)',
    category: 'bathroom',
    primitive: 'Toilet',
    defaultFootprint: { w: 0.4, d: 0.66, h: 0.78 },
    paramSchema: [{ kind: 'color', key: 'color', label: 'Finish', default: '#f4f4f1' }],
  },
  'bathroom-sink': {
    kind: 'parametric',
    id: 'bathroom-sink',
    name: 'Basin',
    category: 'bathroom',
    primitive: 'BathroomSink',
    defaultFootprint: { w: 0.44, d: 0.44, h: 0.98 },
    paramSchema: [{ kind: 'color', key: 'color', label: 'Finish', default: '#f4f4f1' }],
  },
  shower: {
    kind: 'parametric',
    id: 'shower',
    name: 'Shower',
    category: 'bathroom',
    primitive: 'Shower',
    defaultFootprint: { w: 0.9, d: 0.9, h: 2.0 },
    paramSchema: [
      { kind: 'number', key: 'size', label: 'Size', min: 0.8, max: 1.2, step: 0.05, default: 0.9, unit: 'm' },
      { kind: 'color', key: 'trayColor', label: 'Tray', default: '#eceae6' },
    ],
  },
  'bathroom-mirror': {
    kind: 'parametric',
    id: 'bathroom-mirror',
    name: 'Mirror',
    category: 'bathroom',
    primitive: 'Mirror',
    defaultFootprint: { w: 0.6, d: 0.06, h: 0.9 },
    mounted: true,
    verticalSpan: { base: 1.0, top: 2.0 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 0.4, max: 1.2, step: 0.05, default: 0.6, unit: 'm' },
      { kind: 'number', key: 'height', label: 'Height', min: 0.5, max: 1.2, step: 0.05, default: 0.9, unit: 'm' },
      { kind: 'number', key: 'mountHeight', label: 'Hang height', min: 1.1, max: 1.8, step: 0.05, default: 1.5, unit: 'm' },
    ],
  },

  // ── Appliances ──────────────────────────────────────────────────────────
  microwave: {
    kind: 'parametric',
    id: 'microwave',
    name: 'Microwave',
    category: 'appliances',
    primitive: 'Microwave',
    defaultFootprint: { w: 0.5, d: 0.36, h: 0.3 },
    verticalSpan: { base: 0.9, top: 1.22 },
    paramSchema: [
      { kind: 'number', key: 'surfaceHeight', label: 'Sits at', min: 0, max: 1.2, step: 0.02, default: 0.9, unit: 'm' },
      { kind: 'color', key: 'color', label: 'Finish', default: '#3b3e44' },
    ],
  },
  refrigerator: {
    kind: 'parametric',
    id: 'refrigerator',
    name: 'Refrigerator',
    category: 'appliances',
    primitive: 'Refrigerator',
    defaultFootprint: { w: 0.7, d: 0.7, h: 1.78 },
    paramSchema: [
      { kind: 'number', key: 'height', label: 'Height', min: 1.4, max: 1.9, step: 0.02, default: 1.78, unit: 'm' },
      { kind: 'color', key: 'color', label: 'Finish', default: '#d8dade' },
    ],
  },
  'flatscreen-tv': {
    kind: 'parametric',
    id: 'flatscreen-tv',
    name: 'TV (flatscreen)',
    category: 'appliances',
    primitive: 'FlatscreenTV',
    defaultFootprint: { w: 1.25, d: 0.25, h: 0.85 },
    paramSchema: [
      {
        kind: 'enum',
        key: 'size',
        label: 'Size',
        default: '55',
        options: [
          { value: '43', label: '43"' },
          { value: '55', label: '55"' },
          { value: '65', label: '65"' },
          { value: '75', label: '75"' },
        ],
      },
      {
        kind: 'enum',
        key: 'mount',
        label: 'Mount',
        default: 'stand',
        options: [
          { value: 'stand', label: 'On stand' },
          { value: 'wall', label: 'Wall' },
        ],
      },
    ],
  },
  'tv-wall': {
    kind: 'parametric',
    id: 'tv-wall',
    name: 'TV (wall-mounted)',
    category: 'appliances',
    primitive: 'FlatscreenTV',
    defaultFootprint: { w: 1.25, d: 0.1, h: 0.75 },
    mounted: true,
    verticalSpan: { base: 0.9, top: 1.85 },
    paramSchema: [
      {
        kind: 'enum',
        key: 'size',
        label: 'Size',
        default: '55',
        options: [
          { value: '43', label: '43"' },
          { value: '55', label: '55"' },
          { value: '65', label: '65"' },
          { value: '75', label: '75"' },
        ],
      },
      {
        kind: 'enum',
        key: 'mount',
        label: 'Mount',
        default: 'wall',
        options: [
          { value: 'wall', label: 'Wall' },
          { value: 'stand', label: 'On stand' },
        ],
      },
      { kind: 'number', key: 'mountHeight', label: 'Centre height', min: 1.0, max: 1.7, step: 0.05, default: 1.35, unit: 'm' },
    ],
  },
  monitor: {
    kind: 'parametric',
    id: 'monitor',
    name: 'Monitor',
    category: 'appliances',
    primitive: 'Monitor',
    defaultFootprint: { w: 0.62, d: 0.2, h: 0.5 },
    verticalSpan: { base: 0.74, top: 1.25 },
    paramSchema: [
      {
        kind: 'enum',
        key: 'size',
        label: 'Size',
        default: '27',
        options: [
          { value: '24', label: '24"' },
          { value: '27', label: '27"' },
          { value: '32', label: '32"' },
        ],
      },
    ],
  },
  'aircon-unit': {
    kind: 'parametric',
    id: 'aircon-unit',
    name: 'Aircon (wall unit)',
    category: 'appliances',
    primitive: 'AirconUnit',
    defaultFootprint: { w: 0.84, d: 0.22, h: 0.3 },
    mounted: true,
    verticalSpan: { base: 1.9, top: 2.55 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 0.7, max: 1.1, step: 0.02, default: 0.84, unit: 'm' },
      { kind: 'number', key: 'mountHeight', label: 'Mount height', min: 1.9, max: 2.5, step: 0.05, default: 2.25, unit: 'm' },
      { kind: 'color', key: 'color', label: 'Finish', default: '#f3f3f0' },
    ],
  },

  'wall-cabinet': {
    kind: 'parametric',
    id: 'wall-cabinet',
    name: 'Wall cabinets',
    category: 'kitchen',
    primitive: 'WallCabinet',
    defaultFootprint: { w: 2.4, d: 0.35, h: 0.7 },
    footprintParams: { w: 'length' },
    mounted: true,
    verticalSpan: { base: 1.4, top: 2.2 },
    paramSchema: [
      { kind: 'number', key: 'length', label: 'Length', min: 0.6, max: 4.0, step: 0.1, default: 2.4, unit: 'm' },
      { kind: 'number', key: 'mountHeight', label: 'Underside', min: 1.2, max: 1.7, step: 0.05, default: 1.45, unit: 'm' },
      { kind: 'color', key: 'color', label: 'Finish', default: '#e3dfd6' },
    ],
  },
  'range-hood': {
    kind: 'parametric',
    id: 'range-hood',
    name: 'Range hood',
    category: 'kitchen',
    primitive: 'RangeHood',
    defaultFootprint: { w: 0.7, d: 0.45, h: 0.9 },
    mounted: true,
    verticalSpan: { base: 1.4, top: 2.3 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 0.6, max: 0.9, step: 0.05, default: 0.7, unit: 'm' },
      { kind: 'number', key: 'mountHeight', label: 'Underside', min: 1.3, max: 1.6, step: 0.05, default: 1.45, unit: 'm' },
      { kind: 'color', key: 'color', label: 'Finish', default: '#c4c8cc' },
    ],
  },
  stove: {
    kind: 'parametric',
    id: 'stove',
    name: 'Cooker / stove',
    category: 'kitchen',
    primitive: 'Stove',
    defaultFootprint: { w: 0.6, d: 0.6, h: 0.92 },
    paramSchema: [{ kind: 'color', key: 'color', label: 'Finish', default: '#cfd2d6' }],
  },
  'drying-rack': {
    kind: 'parametric',
    id: 'drying-rack',
    name: 'Drying rack',
    category: 'appliances',
    primitive: 'DryingRack',
    defaultFootprint: { w: 0.9, d: 0.55, h: 0.95 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 0.6, max: 1.2, step: 0.05, default: 0.9, unit: 'm' },
      { kind: 'color', key: 'color', label: 'Finish', default: '#c9ccd1' },
    ],
  },
  'washing-machine': {
    kind: 'parametric',
    id: 'washing-machine',
    name: 'Washing machine',
    category: 'appliances',
    primitive: 'WashingMachine',
    defaultFootprint: { w: 0.6, d: 0.6, h: 0.85 },
    paramSchema: [{ kind: 'color', key: 'color', label: 'Finish', default: '#eef0f2' }],
  },
  'ceiling-fan': {
    kind: 'parametric',
    id: 'ceiling-fan',
    name: 'Ceiling fan',
    category: 'appliances',
    primitive: 'CeilingFan',
    defaultFootprint: { w: 1.3, d: 1.3, h: 0.4 },
    mounted: true,
    verticalSpan: { base: 2.1, top: 2.7 },
    paramSchema: [
      { kind: 'integer', key: 'blades', label: 'Blades', min: 2, max: 5, default: 3 },
      { kind: 'number', key: 'span', label: 'Span', min: 0.9, max: 1.6, step: 0.05, default: 1.3, unit: 'm' },
      { kind: 'color', key: 'bladeColor', label: 'Blades colour', default: '#6b4f34' },
    ],
  },

  // ── Lighting ────────────────────────────────────────────────────────────
  'cove-light': {
    kind: 'parametric',
    id: 'cove-light',
    name: 'Cove light (LED)',
    category: 'lighting',
    primitive: 'CoveLight',
    defaultFootprint: { w: 2.0, d: 0.16, h: 0.12 },
    footprintParams: { w: 'length' },
    mounted: true,
    verticalSpan: { base: 2.2, top: 2.45 },
    paramSchema: [
      { kind: 'number', key: 'length', label: 'Length', min: 0.6, max: 4.0, step: 0.1, default: 2.0, unit: 'm' },
      { kind: 'number', key: 'mountHeight', label: 'Mount height', min: 2.0, max: 2.55, step: 0.05, default: 2.3, unit: 'm' },
      { kind: 'color', key: 'ledColor', label: 'LED', default: '#ffcf94' },
      { kind: 'color', key: 'boxColor', label: 'Box', default: '#f1efea' },
    ],
  },
  'wall-sconce': {
    kind: 'parametric',
    id: 'wall-sconce',
    name: 'Wall sconce',
    category: 'lighting',
    primitive: 'WallSconce',
    defaultFootprint: { w: 0.14, d: 0.18, h: 0.2 },
    mounted: true,
    verticalSpan: { base: 1.55, top: 1.85 },
    paramSchema: [
      { kind: 'number', key: 'mountHeight', label: 'Mount height', min: 1.2, max: 2.2, step: 0.05, default: 1.7, unit: 'm' },
      { kind: 'color', key: 'shadeColor', label: 'Diffuser', default: '#f3e7c6' },
      { kind: 'color', key: 'metalColor', label: 'Fitting', default: '#2c2f33' },
    ],
  },
  'table-lamp': {
    kind: 'parametric',
    id: 'table-lamp',
    name: 'Table lamp',
    category: 'lighting',
    primitive: 'TableLamp',
    defaultFootprint: { w: 0.3, d: 0.3, h: 0.44 },
    verticalSpan: { base: 0.52, top: 0.98 },
    paramSchema: [
      { kind: 'number', key: 'surfaceHeight', label: 'Sits at', min: 0, max: 1.0, step: 0.02, default: 0.52, unit: 'm' },
      { kind: 'color', key: 'shadeColor', label: 'Shade', default: '#f0e4c4' },
      { kind: 'color', key: 'baseColor', label: 'Base', default: '#33363b' },
    ],
  },
  'floor-lamp': {
    kind: 'parametric',
    id: 'floor-lamp',
    name: 'Floor lamp',
    category: 'lighting',
    primitive: 'FloorLamp',
    defaultFootprint: { w: 0.42, d: 0.42, h: 1.8 },
    paramSchema: [
      { kind: 'color', key: 'shadeColor', label: 'Shade', default: '#f3e6c8' },
      { kind: 'color', key: 'poleColor', label: 'Pole', default: '#2b2b2b' },
    ],
  },
  'ceiling-light': {
    kind: 'parametric',
    id: 'ceiling-light',
    name: 'Ceiling light',
    category: 'lighting',
    primitive: 'CeilingLight',
    defaultFootprint: { w: 0.45, d: 0.45, h: 0.5 },
    mounted: true,
    verticalSpan: { base: 2.0, top: 2.7 },
    paramSchema: [
      {
        kind: 'enum',
        key: 'style',
        label: 'Style',
        default: 'pendant',
        options: [
          { value: 'pendant', label: 'Pendant' },
          { value: 'flush', label: 'Flush mount' },
        ],
      },
      { kind: 'color', key: 'shadeColor', label: 'Shade', default: '#f2ead6' },
    ],
  },

  // ── Decor ───────────────────────────────────────────────────────────────
  'tabletop-decor': {
    kind: 'parametric',
    id: 'tabletop-decor',
    name: 'Decor set',
    category: 'decor',
    primitive: 'TabletopDecor',
    defaultFootprint: { w: 0.34, d: 0.22, h: 0.22 },
    verticalSpan: { base: 0.42, top: 0.66 },
    paramSchema: [
      { kind: 'number', key: 'surfaceHeight', label: 'Sits at', min: 0, max: 1.2, step: 0.02, default: 0.42, unit: 'm' },
      { kind: 'color', key: 'bookColor', label: 'Books', default: '#8a5a3c' },
      { kind: 'color', key: 'vaseColor', label: 'Vase', default: '#cfd3d6' },
    ],
  },
  rug: {
    kind: 'parametric',
    id: 'rug',
    name: 'Area rug',
    category: 'decor',
    primitive: 'Rug',
    defaultFootprint: { w: 2.0, d: 1.4, h: 0.03 },
    noClip: true,
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 0.8, max: 3.0, step: 0.1, default: 2.0, unit: 'm' },
      { kind: 'number', key: 'depth', label: 'Depth', min: 0.6, max: 2.4, step: 0.1, default: 1.4, unit: 'm' },
      { kind: 'color', key: 'color', label: 'Field', default: '#9c8f7a' },
      { kind: 'color', key: 'borderColor', label: 'Border', default: '#6e5f4c' },
    ],
  },
  curtains: {
    kind: 'parametric',
    id: 'curtains',
    name: 'Curtains',
    category: 'decor',
    primitive: 'Curtain',
    defaultFootprint: { w: 1.8, d: 0.12, h: 2.3 },
    // Drapes hang flat against a wall behind furniture — never block placement.
    noClip: true,
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 1.0, max: 3.0, step: 0.1, default: 1.8, unit: 'm' },
      { kind: 'number', key: 'height', label: 'Height', min: 1.5, max: 2.5, step: 0.05, default: 2.3, unit: 'm' },
      { kind: 'color', key: 'color', label: 'Fabric', default: '#c4b9a6' },
    ],
  },
  'wall-art': {
    kind: 'parametric',
    id: 'wall-art',
    name: 'Wall art',
    category: 'decor',
    primitive: 'WallArt',
    defaultFootprint: { w: 0.8, d: 0.08, h: 0.6 },
    mounted: true,
    verticalSpan: { base: 1.1, top: 2.0 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 0.3, max: 1.6, step: 0.05, default: 0.8, unit: 'm' },
      { kind: 'number', key: 'height', label: 'Height', min: 0.3, max: 1.2, step: 0.05, default: 0.6, unit: 'm' },
      { kind: 'number', key: 'mountHeight', label: 'Hang height', min: 1.0, max: 2.0, step: 0.05, default: 1.55, unit: 'm' },
      { kind: 'color', key: 'frameColor', label: 'Frame', default: '#2c2722' },
      { kind: 'color', key: 'artColor', label: 'Art', default: '#9fb0a6' },
    ],
  },
  'wall-shelf': {
    kind: 'parametric',
    id: 'wall-shelf',
    name: 'Wall shelf',
    category: 'decor',
    primitive: 'WallShelf',
    defaultFootprint: { w: 0.8, d: 0.22, h: 0.15 },
    footprintParams: { w: 'width', d: 'depth' },
    mounted: true,
    verticalSpan: { base: 1.3, top: 1.5 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 0.4, max: 1.6, step: 0.05, default: 0.8, unit: 'm' },
      { kind: 'number', key: 'depth', label: 'Depth', min: 0.16, max: 0.32, step: 0.02, default: 0.22, unit: 'm' },
      { kind: 'number', key: 'mountHeight', label: 'Mount height', min: 0.8, max: 2.0, step: 0.05, default: 1.4, unit: 'm' },
      { kind: 'color', key: 'color', label: 'Colour', default: '#8a6b48' },
    ],
  },
  'floor-mirror': {
    kind: 'parametric',
    id: 'floor-mirror',
    name: 'Floor mirror',
    category: 'decor',
    primitive: 'FloorMirror',
    defaultFootprint: { w: 0.6, d: 0.22, h: 1.6 },
    footprintParams: { w: 'width' },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 0.4, max: 0.9, step: 0.05, default: 0.6, unit: 'm' },
      { kind: 'number', key: 'height', label: 'Height', min: 1.2, max: 2.0, step: 0.05, default: 1.6, unit: 'm' },
      { kind: 'color', key: 'frameColor', label: 'Frame', default: '#6f553f' },
    ],
  },
  'potted-plant': {
    kind: 'parametric',
    id: 'potted-plant',
    name: 'Potted plant',
    category: 'decor',
    primitive: 'PottedPlant',
    defaultFootprint: { w: 0.55, d: 0.55, h: 1.0 },
    paramSchema: [
      {
        kind: 'enum',
        key: 'type',
        label: 'Type',
        default: 'bush',
        options: [
          { value: 'bush', label: 'Bush' },
          { value: 'snake', label: 'Snake plant' },
          { value: 'palm', label: 'Palm' },
        ],
      },
      {
        kind: 'enum',
        key: 'size',
        label: 'Size',
        default: 'medium',
        options: [
          { value: 'small', label: 'Small' },
          { value: 'medium', label: 'Medium' },
          { value: 'large', label: 'Large' },
        ],
      },
      { kind: 'color', key: 'potColor', label: 'Pot', default: '#b9743f' },
      { kind: 'color', key: 'leafColor', label: 'Foliage', default: '#3f6b3a' },
    ],
  },

  // ── Kitchen ─────────────────────────────────────────────────────────────
  'kitchen-counter-l': {
    kind: 'parametric',
    id: 'kitchen-counter-l',
    name: 'Kitchen counter',
    category: 'kitchen',
    primitive: 'KitchenCounter',
    defaultFootprint: { w: 2.4, d: 0.6, h: 0.9 },
    footprintParams: { w: 'length' },
    paramSchema: [
      { kind: 'number', key: 'length', label: 'Length', min: 1.2, max: 4.0, step: 0.1, default: 2.4, unit: 'm' },
      {
        kind: 'enum',
        key: 'hasSink',
        label: 'Sink',
        default: 'no',
        options: [
          { value: 'no', label: 'None' },
          { value: 'yes', label: 'Sink' },
        ],
      },
      { kind: 'color', key: 'color', label: 'Cabinet', default: '#e3dfd6' },
    ],
  },
};

/** Pre-grouped lookup for the catalog drawer; recomputed only on module init. */
export const BUILTIN_BY_CATEGORY: Readonly<Record<FurnitureCategory, FurnitureDef[]>> =
  Object.freeze(
    (Object.values(BUILTIN_CATALOG) as FurnitureDef[]).reduce(
      (acc, def) => {
        (acc[def.category] ??= []).push(def);
        return acc;
      },
      {} as Record<FurnitureCategory, FurnitureDef[]>,
    ),
  );
