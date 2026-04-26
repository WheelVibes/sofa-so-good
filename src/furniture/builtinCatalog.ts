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
  'bed-single': {
    kind: 'parametric',
    id: 'bed-single',
    name: 'Single bed',
    category: 'beds',
    primitive: 'Bed',
    defaultFootprint: { w: 1.0, d: 2.0, h: 0.6 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 0.9, max: 1.1, step: 0.05, default: 1.0, unit: 'm' },
      { kind: 'number', key: 'length', label: 'Length', min: 1.9, max: 2.1, step: 0.05, default: 2.0, unit: 'm' },
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
    defaultFootprint: { w: 1.4, d: 2.0, h: 0.6 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 1.3, max: 1.5, step: 0.05, default: 1.4, unit: 'm' },
      { kind: 'number', key: 'length', label: 'Length', min: 1.9, max: 2.1, step: 0.05, default: 2.0, unit: 'm' },
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
    defaultFootprint: { w: 1.6, d: 2.0, h: 0.6 },
    paramSchema: [
      { kind: 'number', key: 'width', label: 'Width', min: 1.5, max: 1.8, step: 0.05, default: 1.6, unit: 'm' },
      { kind: 'number', key: 'length', label: 'Length', min: 1.9, max: 2.1, step: 0.05, default: 2.0, unit: 'm' },
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

  // ── Kitchen ─────────────────────────────────────────────────────────────
  'kitchen-counter-l': {
    kind: 'parametric',
    id: 'kitchen-counter-l',
    name: 'Kitchen counter',
    category: 'kitchen',
    primitive: 'KitchenCounter',
    defaultFootprint: { w: 2.4, d: 0.6, h: 0.9 },
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
