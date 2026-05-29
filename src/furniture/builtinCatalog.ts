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

  // ── Appliances ──────────────────────────────────────────────────────────
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
    ],
  },
  'aircon-unit': {
    kind: 'parametric',
    id: 'aircon-unit',
    name: 'Aircon (wall unit)',
    category: 'appliances',
    primitive: 'AirconUnit',
    defaultFootprint: { w: 0.84, d: 0.22, h: 0.3 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 0.7, max: 1.1, step: 0.02, default: 0.84, unit: 'm' },
      { kind: 'number', key: 'mountHeight', label: 'Mount height', min: 1.9, max: 2.5, step: 0.05, default: 2.25, unit: 'm' },
      { kind: 'color', key: 'color', label: 'Finish', default: '#f3f3f0' },
    ],
  },

  // ── Lighting ────────────────────────────────────────────────────────────
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
  rug: {
    kind: 'parametric',
    id: 'rug',
    name: 'Area rug',
    category: 'decor',
    primitive: 'Rug',
    defaultFootprint: { w: 2.0, d: 1.4, h: 0.03 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 0.8, max: 3.0, step: 0.1, default: 2.0, unit: 'm' },
      { kind: 'number', key: 'depth', label: 'Depth', min: 0.6, max: 2.4, step: 0.1, default: 1.4, unit: 'm' },
      { kind: 'color', key: 'color', label: 'Field', default: '#9c8f7a' },
      { kind: 'color', key: 'borderColor', label: 'Border', default: '#6e5f4c' },
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
