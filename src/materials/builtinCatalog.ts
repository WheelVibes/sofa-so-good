/**
 * Built-in material catalog.
 *
 * Floors and a few wall finishes are generated procedurally on-device at
 * runtime (see materials/procedural) — real tiling PBR maps (albedo +
 * normal + roughness) with no network fetch and a single shared tile per
 * material. Wall paints are flat matte colours that match common Singapore
 * HDB interior palettes. Adding a material = one entry here.
 */

import type { RoomId } from '../apartment/types'
import type { MaterialCategory, MaterialDef, MaterialId, ProceduralPattern } from './types'

function floor(
  id: string,
  name: string,
  swatch: string,
  pattern: ProceduralPattern,
  uvScale: [number, number],
  sourceUrl?: string,
): MaterialDef {
  return { id, name, category: 'floor', kind: 'procedural', pattern, swatch, uvScale, sourceUrl }
}

/** Painted plaster wall in an arbitrary colour (shares the plaster normal,
 *  tinted by `swatch`) — used to widen the curated wall palette. */
function wall(id: string, name: string, swatch: string): MaterialDef {
  return {
    id,
    name,
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch,
    uvScale: [2.5, 2.5],
  }
}

/** Patterned wallpaper finish (stripe / grasscloth). Tiles at ~1 m. */
function wallpaper(
  id: string,
  name: string,
  swatch: string,
  pattern: ProceduralPattern,
): MaterialDef {
  return { id, name, category: 'wall', kind: 'procedural', pattern, swatch, uvScale: [1.2, 1.2] }
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
  'floor-terrazzo': floor('floor-terrazzo', 'Terrazzo', '#d7d2c6', 'terrazzo', [1.0, 1.0]),
  // Large-format porcelain — ubiquitous in modern HDB renovations.
  'floor-tile-grey': floor('floor-tile-grey', 'Grey porcelain', '#b9b9b6', 'tile', [0.8, 0.8]),
  'floor-tile-charcoal': floor(
    'floor-tile-charcoal',
    'Charcoal porcelain',
    '#4c4e52',
    'tile',
    [0.8, 0.8],
  ),
  'floor-wood-teak': floor('floor-wood-teak', 'Teak planks', '#9a6b3f', 'wood', [1.9, 1.2]),
  'floor-wood-ash': floor('floor-wood-ash', 'Pale ash planks', '#cdb696', 'wood', [1.9, 1.2]),
  'floor-wood-ebony': floor('floor-wood-ebony', 'Ebony planks', '#43342a', 'wood', [1.9, 1.2]),
  'floor-tile-sand': floor('floor-tile-sand', 'Sand porcelain', '#cdbfa6', 'tile', [0.8, 0.8]),
  'floor-wood-merbau': floor('floor-wood-merbau', 'Merbau', '#7a3f2a', 'wood', [1.9, 1.2]),
  'floor-wood-maple': floor('floor-wood-maple', 'Maple', '#d8c19a', 'wood', [1.9, 1.2]),
  // Basketweave parquet — one block ≈ 0.5 m, so it tiles at 0.5 m.
  'floor-parquet-oak': floor('floor-parquet-oak', 'Oak parquet', '#b88f5d', 'parquet', [0.5, 0.5]),
  'floor-parquet-walnut': floor(
    'floor-parquet-walnut',
    'Walnut parquet',
    '#6b4428',
    'parquet',
    [0.5, 0.5],
  ),
  // Herringbone parquet — premium 45° interlocking planks. The tile holds 16
  // plank-widths, so at a 2 m tile each plank is ~0.5 m × 0.125 m (realistic).
  'floor-herringbone-oak': floor(
    'floor-herringbone-oak',
    'Oak herringbone',
    '#b88f5d',
    'herringbone',
    [2.0, 2.0],
  ),
  'floor-herringbone-walnut': floor(
    'floor-herringbone-walnut',
    'Walnut herringbone',
    '#6b4428',
    'herringbone',
    [2.0, 2.0],
  ),
  'floor-checker-mono': floor(
    'floor-checker-mono',
    'Checkerboard',
    '#e8e6e0',
    'checker',
    [1.2, 1.2],
  ),
  'floor-checker-terracotta': floor(
    'floor-checker-terracotta',
    'Checker terracotta',
    '#c79a78',
    'checker',
    [1.2, 1.2],
  ),
  'floor-terrazzo-dark': floor(
    'floor-terrazzo-dark',
    'Dark terrazzo',
    '#5a564e',
    'terrazzo',
    [1.0, 1.0],
  ),
  'floor-carpet-blue': floor('floor-carpet-blue', 'Navy carpet', '#3f4a63', 'carpet', [1.5, 1.5]),
  'floor-carpet-greige': floor(
    'floor-carpet-greige',
    'Greige carpet',
    '#b3a89a',
    'carpet',
    [1.5, 1.5],
  ),

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
  'wall-paint-greige': {
    id: 'wall-paint-greige',
    name: 'Greige',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#cdc6ba',
    uvScale: [2.5, 2.5],
  },
  'wall-paint-terracotta': {
    id: 'wall-paint-terracotta',
    name: 'Terracotta',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#c08763',
    uvScale: [2.5, 2.5],
  },
  'wall-paint-navy': {
    id: 'wall-paint-navy',
    name: 'Navy',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#3b4a63',
    uvScale: [2.5, 2.5],
  },
  'wall-paint-forest': {
    id: 'wall-paint-forest',
    name: 'Forest green',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#4a5e4a',
    uvScale: [2.5, 2.5],
  },

  // Expanded curated palette — popular contemporary interior wall colours.
  'wall-paint-soft-white': wall('wall-paint-soft-white', 'Soft white', '#efece4'),
  'wall-paint-almond': wall('wall-paint-almond', 'Almond', '#e7ddca'),
  'wall-paint-oat': wall('wall-paint-oat', 'Oat', '#d8cdb8'),
  'wall-paint-mushroom': wall('wall-paint-mushroom', 'Mushroom', '#b6aa9a'),
  'wall-paint-clay': wall('wall-paint-clay', 'Clay', '#b98a6e'),
  'wall-paint-rust': wall('wall-paint-rust', 'Rust', '#a85a3c'),
  'wall-paint-mustard': wall('wall-paint-mustard', 'Mustard', '#c69a45'),
  'wall-paint-olive': wall('wall-paint-olive', 'Olive', '#7d7a4a'),
  'wall-paint-eucalyptus': wall('wall-paint-eucalyptus', 'Eucalyptus', '#8fa79a'),
  'wall-paint-teal': wall('wall-paint-teal', 'Teal', '#3f6b6a'),
  'wall-paint-petrol': wall('wall-paint-petrol', 'Petrol blue', '#345a66'),
  'wall-paint-denim': wall('wall-paint-denim', 'Denim', '#5a7088'),
  'wall-paint-lavender': wall('wall-paint-lavender', 'Lavender', '#b3aac4'),
  'wall-paint-mauve': wall('wall-paint-mauve', 'Mauve', '#9a7d86'),
  'wall-paint-dusty-rose': wall('wall-paint-dusty-rose', 'Dusty rose', '#c9a0a0'),
  'wall-paint-stone-grey': wall('wall-paint-stone-grey', 'Stone grey', '#a8a6a1'),
  'wall-paint-slate': wall('wall-paint-slate', 'Slate', '#6a6f76'),
  'wall-paint-graphite': wall('wall-paint-graphite', 'Graphite', '#454a50'),
  'wall-paint-ink': wall('wall-paint-ink', 'Ink', '#2b3340'),

  // Wallpapers — tone-on-tone vertical stripe + natural grasscloth weave.
  'wall-stripe-greige': wallpaper('wall-stripe-greige', 'Striped greige', '#cfc7ba', 'stripe'),
  'wall-stripe-sage': wallpaper('wall-stripe-sage', 'Striped sage', '#aebaa6', 'stripe'),
  'wall-stripe-blue': wallpaper('wall-stripe-blue', 'Striped blue', '#9fb1c4', 'stripe'),
  'wall-grasscloth-natural': wallpaper(
    'wall-grasscloth-natural',
    'Grasscloth natural',
    '#cdbf9e',
    'grasscloth',
  ),
  'wall-grasscloth-olive': wallpaper(
    'wall-grasscloth-olive',
    'Grasscloth olive',
    '#9a9466',
    'grasscloth',
  ),
  'wall-grasscloth-charcoal': wallpaper(
    'wall-grasscloth-charcoal',
    'Grasscloth charcoal',
    '#5a5852',
    'grasscloth',
  ),
  // Exposed-brick accent walls (running bond + recessed mortar).
  'wall-brick-red': wallpaper('wall-brick-red', 'Exposed brick', '#9c5a44', 'brick'),
  'wall-brick-white': wallpaper('wall-brick-white', 'White-washed brick', '#d9d3c8', 'brick'),
  'wall-brick-charcoal': wallpaper('wall-brick-charcoal', 'Charcoal brick', '#55504c', 'brick'),
  // Microcement / concrete accent walls (smooth, large-scale tiling).
  'wall-concrete-light': {
    id: 'wall-concrete-light',
    name: 'Microcement (light)',
    category: 'wall',
    kind: 'procedural',
    pattern: 'concrete',
    swatch: '#cbc6bd',
    uvScale: [3, 3],
  },
  'wall-concrete-grey': {
    id: 'wall-concrete-grey',
    name: 'Microcement (grey)',
    category: 'wall',
    kind: 'procedural',
    pattern: 'concrete',
    swatch: '#9d9a95',
    uvScale: [3, 3],
  },
  'wall-concrete-charcoal': {
    id: 'wall-concrete-charcoal',
    name: 'Microcement (charcoal)',
    category: 'wall',
    kind: 'procedural',
    pattern: 'concrete',
    swatch: '#54524f',
    uvScale: [3, 3],
  },
  // Board-and-batten panelling (vertical raised battens), tiles ~1.2 m wide.
  'wall-batten-white': wallpaper(
    'wall-batten-white',
    'Board & batten (white)',
    '#eceae3',
    'batten',
  ),
  'wall-batten-sage': wallpaper('wall-batten-sage', 'Board & batten (sage)', '#9aa88f', 'batten'),
  'wall-batten-navy': wallpaper('wall-batten-navy', 'Board & batten (navy)', '#3c4a60', 'batten'),
}

export const DEFAULT_FLOOR: MaterialId = 'floor-wood-oak'
export const DEFAULT_WALL: MaterialId = 'wall-paint-white'

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
}

export const DEFAULT_ROOM_WALL: Partial<Record<RoomId, MaterialId>> = {
  livingDining: 'wall-paint-warm',
  bath1: 'wall-paint-blue',
  bath2: 'wall-paint-blue',
  kitchen: 'wall-paint-white',
}

export const BUILTIN_MATERIALS_BY_CATEGORY: Readonly<Record<MaterialCategory, MaterialDef[]>> =
  Object.freeze(
    (Object.values(BUILTIN_MATERIALS) as MaterialDef[]).reduce(
      (acc, m) => {
        if (!acc[m.category]) acc[m.category] = []
        acc[m.category].push(m)
        return acc
      },
      {} as Record<MaterialCategory, MaterialDef[]>,
    ),
  )
