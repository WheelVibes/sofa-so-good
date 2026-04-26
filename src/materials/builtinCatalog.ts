/**
 * Built-in material catalog. Floor textures source from Poly Haven and
 * ambientCG (CC0); wall paints are solid hex colours that match common
 * Singapore HDB interior palettes. Adding a material = one entry here
 * + (for textured) the asset files dropped under public/assets/materials/.
 *
 * The current build ships solid placeholders for the textured entries
 * so the picker is fully functional even before the texture pipeline
 * is run. When the asset script lands, only the URL paths change.
 */

import type {
  MaterialCategory,
  MaterialDef,
  MaterialId,
  SolidMaterialDef,
} from './types';

// Solid placeholder until the texture pipeline ships real PBR maps under
// public/assets/materials/<id>/. When that lands, swap this back to a
// TexturedMaterialDef factory that points at /assets/materials/${id}/.
function texFloor(
  id: string,
  name: string,
  swatch: string,
  _source: 'polyhaven' | 'ambientcg',
  _sourceUrl: string,
  _uvScale: [number, number] = [1, 1],
): SolidMaterialDef {
  return {
    id,
    name,
    category: 'floor',
    kind: 'solid',
    swatch,
  };
}

export const BUILTIN_MATERIALS: Record<MaterialId, MaterialDef> = {
  // ── Floors ──────────────────────────────────────────────────────────────
  'floor-concrete': {
    id: 'floor-concrete',
    name: 'Concrete (bare)',
    category: 'floor',
    kind: 'solid',
    swatch: '#bcb9b3',
  },
  'floor-wood-oak': texFloor(
    'floor-wood-oak',
    'Oak planks',
    '#b88f5d',
    'polyhaven',
    'https://polyhaven.com/a/wood_floor_deck',
    [1.5, 1.5],
  ),
  'floor-wood-walnut': texFloor(
    'floor-wood-walnut',
    'Walnut planks',
    '#5a3924',
    'polyhaven',
    'https://polyhaven.com/a/wood_floor_worn',
    [1.5, 1.5],
  ),
  'floor-tile-white': texFloor(
    'floor-tile-white',
    'White tiles',
    '#e6e3dc',
    'polyhaven',
    'https://polyhaven.com/a/square_tiles_03',
    [0.6, 0.6],
  ),
  'floor-tile-marble': texFloor(
    'floor-tile-marble',
    'Marble',
    '#dcd6c8',
    'polyhaven',
    'https://polyhaven.com/a/marble_01',
    [1.0, 1.0],
  ),
  'floor-carpet-grey': texFloor(
    'floor-carpet-grey',
    'Grey carpet',
    '#7a7c7e',
    'ambientcg',
    'https://ambientcg.com/view?id=Carpet001',
    [2.0, 2.0],
  ),
  'floor-vinyl-light': texFloor(
    'floor-vinyl-light',
    'Light vinyl',
    '#cdbfa5',
    'ambientcg',
    'https://ambientcg.com/view?id=Vinyl001',
    [1.5, 1.5],
  ),
  'floor-terrazzo': texFloor(
    'floor-terrazzo',
    'Terrazzo',
    '#cfc8b8',
    'polyhaven',
    'https://polyhaven.com/a/terrazzo_01',
    [1.0, 1.0],
  ),

  // ── Walls (solid first; textured wall packs land in a follow-up) ────────
  'wall-paint-white': {
    id: 'wall-paint-white',
    name: 'White paint',
    category: 'wall',
    kind: 'solid',
    swatch: '#f5f5f0',
  },
  'wall-paint-warm': {
    id: 'wall-paint-warm',
    name: 'Warm cream',
    category: 'wall',
    kind: 'solid',
    swatch: '#e9d8c4',
  },
  'wall-paint-sage': {
    id: 'wall-paint-sage',
    name: 'Sage',
    category: 'wall',
    kind: 'solid',
    swatch: '#a7b59a',
  },
  'wall-paint-charcoal': {
    id: 'wall-paint-charcoal',
    name: 'Charcoal',
    category: 'wall',
    kind: 'solid',
    swatch: '#3a3a3a',
  },
  'wall-paint-blue': {
    id: 'wall-paint-blue',
    name: 'Sky blue',
    category: 'wall',
    kind: 'solid',
    swatch: '#a9c1d6',
  },
  'wall-paint-blush': {
    id: 'wall-paint-blush',
    name: 'Blush',
    category: 'wall',
    kind: 'solid',
    swatch: '#e6c8c0',
  },
};

export const DEFAULT_FLOOR: MaterialId = 'floor-concrete';
export const DEFAULT_WALL: MaterialId = 'wall-paint-white';

export const BUILTIN_MATERIALS_BY_CATEGORY: Readonly<Record<MaterialCategory, MaterialDef[]>> =
  Object.freeze(
    (Object.values(BUILTIN_MATERIALS) as MaterialDef[]).reduce(
      (acc, m) => {
        (acc[m.category] ??= []).push(m);
        return acc;
      },
      {} as Record<MaterialCategory, MaterialDef[]>,
    ),
  );
