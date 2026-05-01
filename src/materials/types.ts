/**
 * Material catalog types — surface finishes for floors and walls.
 *
 * Like the furniture catalog, materials are a discriminated union of
 * 'solid' (a flat painted colour, no texture fetch) and 'textured'
 * (PBR textures from Poly Haven / ambientCG, or user-uploaded). Solid
 * materials short-circuit the loader and render synchronously.
 */

export type MaterialId = string;
export type MaterialCategory = 'floor' | 'wall';

export interface MaterialDefBase {
  id: MaterialId;
  name: string;
  category: MaterialCategory;
  /** Hex colour for the picker thumb and the loading-fallback material. */
  swatch: string;
}

export interface SolidMaterialDef extends MaterialDefBase {
  kind: 'solid';
}

export interface TexturedMaterialDef extends MaterialDefBase {
  kind: 'textured';
  source: 'polyhaven' | 'ambientcg' | 'user';
  /** CC0 attribution URL (built-ins and remote-resolved). */
  sourceUrl?: string;
  /** Provider slug for runtime-resolved entries. */
  slug?: string;
  /** Resolution variant for runtime-resolved entries. */
  resolution?: '1k' | '2k' | '4k';
  textures: {
    albedo: string;
    normal?: string;
    roughness?: string;
    ao?: string;
  };
  /** UV repeat in metres-per-tile. [1, 1] tiles 1×1 m per texture. */
  uvScale: [number, number];
  /** Runtime-only blob URL set during hydration for user materials. */
  runtimeUrls?: {
    albedo: string;
    normal?: string;
    roughness?: string;
    ao?: string;
  };
}

export type MaterialDef = SolidMaterialDef | TexturedMaterialDef;
