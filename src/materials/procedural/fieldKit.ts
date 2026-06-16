/**
 * Shared field buffers + helpers for the procedural pattern generators
 * (`./patterns/*`). A `Fields` set is the per-texel albedo / height / roughness a
 * pattern paints onto one tile; `generators.ts` turns it into the PBR textures.
 * Kept dependency-free (no three / DOM) so the patterns stay pure + worker-safe.
 */

export interface Fields {
  /** RGBA albedo, 0..255. */
  albedo: Uint8ClampedArray
  /** Height field 0..1 for normal-map derivation. */
  height: Float32Array
  /** Per-texel roughness 0..1. */
  rough: Float32Array
  /** Bump strength fed to the normal derivation. */
  normalStrength: number
  metalness: number
}

/** Empty `size`×`size` field buffers (transparent black, flat height/roughness). */
export function blank(size: number): Fields {
  return {
    albedo: new Uint8ClampedArray(size * size * 4),
    height: new Float32Array(size * size),
    rough: new Float32Array(size * size),
    normalStrength: 1,
    metalness: 0,
  }
}

export function setPx(
  f: Fields,
  i: number,
  r: number,
  g: number,
  b: number,
  h: number,
  rough: number,
) {
  f.albedo[i * 4] = r
  f.albedo[i * 4 + 1] = g
  f.albedo[i * 4 + 2] = b
  f.albedo[i * 4 + 3] = 255
  f.height[i] = h
  f.rough[i] = rough
}

export function shade(rgb: [number, number, number], factor: number): [number, number, number] {
  return [rgb[0] * factor, rgb[1] * factor, rgb[2] * factor]
}
