/**
 * How many metres of floor should one texture period cover?
 *
 * Getting this wrong is the loudest photoreal tell there is, and it costs
 * quality in both directions:
 *
 *  - **Too large** (the map stretched over more floor than it depicts) is a
 *    straight magnification: a 0.4 m wood scan rendered at 1.2 m shows each
 *    texel across three times the area, so the floor is blurry AND its planks
 *    are three times too wide.
 *  - **Too small** is minification: detail survives (mipmaps), but the pattern
 *    repeats far more often than the real material would, which reads as
 *    obvious tiling.
 *
 * So the tile size is derived from the MAP, in this order:
 *
 *  1. **The scanned size**, when the provider publishes one — ambientCG ships
 *    `dimensionX`/`dimensionY` (cm) per asset, which is the physical patch the
 *    photograph covers. Nothing beats knowing, so it is used as-is unless it
 *    would fall below `MIN_TEXEL_DENSITY` (see there: physical truth wins over
 *    sharpness, but only down to a floor).
 *  2. **A caller's guess** (a per-family table, a curated showroom value),
 *    CAPPED by what the map's resolution can cover sharply — the "a tile is at
 *    most as big as its map" rule. A guess may shrink a texture (harmless,
 *    mipmaps) but never stretch it past `TARGET_TEXEL_DENSITY`.
 *  3. **The map's own resolution**, when there is no guess at all (a user
 *    upload): a texture carries a fixed number of texels, so the area it can
 *    cover at a given sharpness follows directly. A 2K upload then tiles over
 *    twice the floor a 1K one does, at the same sharpness.
 *
 * Pure — no three, no React, no fetch.
 */

/**
 * Texels per metre a surface should carry. Chosen from what the app already
 * ships: the procedural patterns run 427–1280 px/m (a 512 px bake over a
 * 0.4–1.2 m period) and the packed ambientCG corpus has a median of 853 px/m,
 * so 512 sits at the low end of "sharp at furniture distance" without inflating
 * the tile size of every 1K scan past the size of a real room.
 */
export const TARGET_TEXEL_DENSITY = 512

/**
 * The density below which a surface reads soft no matter how true its scale is.
 * A REAL scanned size is allowed between this and the target — measured on the
 * packed corpus, 214 of 264 scanned sizes already sit inside the 512 px/m
 * target, and most of the rest are the 2.4–3 m brick and tile scans that land
 * at 340–427 px/m — the same density the procedural floors ship at, and worth
 * keeping at their true size. Only the extremes (a 5.4 m paving scan at 190
 * px/m) trade scale for sharpness.
 */
const MIN_TEXEL_DENSITY = 256

/** Physical tile sizes outside this range are a data error, not a design
 *  choice — a 5 cm period tiles into moiré, a 12 m one never repeats indoors. */
export const MIN_TILE_M = 0.1
export const MAX_TILE_M = 8

export interface TileSizeInput {
  /** Real-world size of the scanned patch in metres, when the provider says. */
  scanMetres?: number | null
  /** Albedo resolution in pixels (square maps: the longer edge). */
  pixels?: number | null
  /** Last-resort guess (e.g. the packer's per-family table). */
  fallbackMetres?: number | null
}

/** Where a resolved tile size came from — worth recording, because a family
 *  guess should be replaced the moment a real dimension shows up. */
type TileSizeSource = 'scan' | 'density' | 'fallback'

export interface ResolvedTileSize {
  metres: number
  source: TileSizeSource
}

const clampTile = (m: number) => Math.min(MAX_TILE_M, Math.max(MIN_TILE_M, m))

/**
 * Resolve one texture period in metres. Always returns something usable: with
 * no usable input at all it falls back to 1 m (the historical default), so a
 * malformed manifest entry degrades to today's behaviour rather than a NaN UV.
 */
export function resolveTileSize(input: TileSizeInput): ResolvedTileSize {
  const ok = (v: number | null | undefined): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0
  if (ok(input.scanMetres)) {
    // A measured size stands, down to the sharpness floor: past that the map
    // has too few texels for the area to read as anything.
    const floor = ok(input.pixels) ? input.pixels / MIN_TEXEL_DENSITY : Number.POSITIVE_INFINITY
    return { metres: clampTile(Math.min(input.scanMetres, floor)), source: 'scan' }
  }
  const cap = ok(input.pixels) ? input.pixels / TARGET_TEXEL_DENSITY : Number.POSITIVE_INFINITY
  if (ok(input.fallbackMetres)) {
    // A guess may be smaller than the map can cover (fine — more repeats, full
    // detail); it may not be bigger (that is magnification, and irreversible).
    const capped = Math.min(input.fallbackMetres, cap)
    return {
      metres: clampTile(capped),
      source: capped < input.fallbackMetres ? 'density' : 'fallback',
    }
  }
  if (ok(input.pixels)) return { metres: clampTile(cap), source: 'density' }
  return { metres: 1, source: 'fallback' }
}

/** Texels per metre a map achieves at a given period — the number that decides
 *  whether a surface reads sharp or soft. */
export function texelDensity(pixels: number, metres: number): number {
  if (!(pixels > 0) || !(metres > 0)) return 0
  return pixels / metres
}

/**
 * Is this map being MAGNIFIED — asked to cover more floor than its own texels
 * can describe at the target density? Magnification is the one direction that
 * cannot be recovered downstream (mipmaps handle the other), so it is worth
 * flagging at the point a tile size is chosen or a user scales one up.
 */
export function isMagnified(pixels: number, metres: number): boolean {
  return texelDensity(pixels, metres) < TARGET_TEXEL_DENSITY
}

/**
 * The largest scale factor a user dial may apply to a finish before it starts
 * magnifying past the target density — i.e. how much bigger the tiles can get
 * while the map still has the texels to fill them. `Infinity` when the map is
 * dense enough that the clamp would never bite (or is unknown).
 */
export function maxScaleForMap(pixels: number | null | undefined, metres: number): number {
  if (!pixels || !(pixels > 0) || !(metres > 0)) return Number.POSITIVE_INFINITY
  return Math.max(1, texelDensity(pixels, metres) / TARGET_TEXEL_DENSITY)
}
