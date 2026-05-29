/**
 * Built-in material catalog.
 *
 * Floors and a few wall finishes are generated procedurally on-device at
 * runtime (see materials/procedural) — real tiling PBR maps (albedo +
 * normal + roughness) with no network fetch and a single shared tile per
 * material. Wall paints are flat matte colours that match common Singapore
 * HDB interior palettes. Adding a material = one entry here.
 */

import type {
  MaterialCategory,
  MaterialDef,
  MaterialId,
  ProceduralPattern,
} from './types';
import type { RoomId } from '../apartment/types';

function floor(
  id: string,
  name: string,
  swatch: string,
  pattern: ProceduralPattern,
  uvScale: [number, number],
  sourceUrl?: string,
): MaterialDef {
  return { id, name, category: 'floor', kind: 'procedural', pattern, swatch, uvScale, sourceUrl };
}

export const BUILTIN_MATERIALS: Record<MaterialId, MaterialDef> = {
  // ── Floors (procedural PBR) ─────────────────────────────────────────────
  'floor-concrete': floor('floor-concrete', 'Concrete (bare)', '#bcb9b3', 'concrete', [2.2, 2.2]),
  'floor-wood-oak': floor('floor-wood-oak', 'Oak planks', '#b88f5d', 'wood', [1.9, 1.2]),
  'floor-wood-walnut': floor('floor-wood-walnut', 'Walnut planks', '#6b4428', 'wood', [1.9, 1.2]),
  'floor-tile-white': floor('floor-tile-white', 'White tiles', '#e6e3dc', 'tile', [0.6, 0.6]),
  'floor-tile-marble': floor('floor-tile-marble', 'Marble', '#dcd6c8', 'marble', [1.6, 1.6]),
  'floor-carpet-grey': floor('floor-carpet-grey', 'Grey carpet', '#7a7c7e', 'carpet', [1.5, 1.5]),
  'floor-vinyl-light': floor('floor-vinyl-light', 'Light vinyl', '#c9b99c', 'wood', [1.4, 0.9]),
  'floor-terrazzo': floor('floor-terrazzo', 'Terrazzo', '#cfc8b8', 'concrete', [1.2, 1.2]),

  // ── Walls ───────────────────────────────────────────────────────────────
  // Default white is a subtly textured plaster (orange-peel normal) so walls
  // catch light like real painted plaster instead of reading dead flat.
  'wall-paint-white': {
    id: 'wall-paint-white',
    name: 'White paint',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#f5f5f0',
    uvScale: [2.5, 2.5],
  },
  'wall-paint-warm': {
    id: 'wall-paint-warm',
    name: 'Warm cream',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#e9d8c4',
    uvScale: [2.5, 2.5],
  },
  'wall-paint-sage': {
    id: 'wall-paint-sage',
    name: 'Sage',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#a7b59a',
    uvScale: [2.5, 2.5],
  },
  'wall-paint-charcoal': {
    id: 'wall-paint-charcoal',
    name: 'Charcoal',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#3a3a3a',
    uvScale: [2.5, 2.5],
  },
  'wall-paint-blue': {
    id: 'wall-paint-blue',
    name: 'Sky blue',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#a9c1d6',
    uvScale: [2.5, 2.5],
  },
  'wall-paint-blush': {
    id: 'wall-paint-blush',
    name: 'Blush',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#e6c8c0',
    uvScale: [2.5, 2.5],
  },
};

export const DEFAULT_FLOOR: MaterialId = 'floor-wood-oak';
export const DEFAULT_WALL: MaterialId = 'wall-paint-white';

/** Sensible move-in-ready finishes per room: wood through the living spaces
 *  and bedrooms, tile in the wet rooms and kitchen, hard-wearing surfaces in
 *  utility spaces. Rooms not listed fall back to DEFAULT_FLOOR. */
export const DEFAULT_ROOM_FLOOR: Partial<Record<RoomId, MaterialId>> = {
  mainBedroom: 'floor-wood-oak',
  bedroom2: 'floor-wood-oak',
  bedroom3: 'floor-wood-oak',
  livingDining: 'floor-wood-oak',
  corridor: 'floor-wood-oak',
  kitchen: 'floor-tile-white',
  bath1: 'floor-tile-white',
  bath2: 'floor-tile-white',
  householdShelter: 'floor-vinyl-light',
  serviceYard: 'floor-concrete',
  acLedge: 'floor-concrete',
};

export const DEFAULT_ROOM_WALL: Partial<Record<RoomId, MaterialId>> = {
  livingDining: 'wall-paint-warm',
  bath1: 'wall-paint-blue',
  bath2: 'wall-paint-blue',
  kitchen: 'wall-paint-white',
};

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
