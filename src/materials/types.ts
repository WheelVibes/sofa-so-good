/**
 * Material catalog types — surface finishes for floors and walls.
 *
 * Like the furniture catalog, materials are a discriminated union of
 * 'solid' (a flat painted colour, no texture fetch) and 'textured'
 * (PBR textures from Poly Haven / ambientCG, or user-uploaded). Solid
 * materials short-circuit the loader and render synchronously.
 */

export type MaterialId = string
export type MaterialCategory = 'floor' | 'wall'

/** A paint product's specified coverage. Rates are per COAT. */
export interface PaintCoverage {
  /** Spreading rate (m² per litre per coat) on a smooth, primed or
   *  previously-painted surface. */
  spreadingRateM2PerL: number
  /** Standard number of topcoats for full opacity. */
  coats: number
}

interface MaterialDefBase {
  id: MaterialId
  name: string
  category: MaterialCategory
  /** Hex colour for the picker thumb and the loading-fallback material. */
  swatch: string
  /** Optional roughness scalar override (CUSTOMIZE-MATERIAL-PARAMS): 0 = mirror
   *  gloss, 1 = fully matte. Multiplies any roughness map. Absent → the kind's
   *  default (procedural 0.85 / plaster 0.92 / textured map as-is). Used by
   *  composed/tinted finishes that carry a `~<rough>` suffix in their id. */
  roughness?: number
  /** Repaint the albedo with `swatch` via the luminance-preserving recolor
   *  (FINISH-RECOLOR) instead of the legacy `material.color` multiply. Set only
   *  by `tintedMaterialDef` for `tint:…!r` ids; consumed by the textured branch
   *  of `cache.ts:buildMaterial` (procedural bases already re-bake with the
   *  swatch, so it's a no-op there). */
  recolorAlbedo?: boolean
  /**
   * SPECIFIED physical module of a modular finish (tile / slab / plank), in
   * millimetres as `[width, height]` — e.g. `[600, 600]` for 600×600 porcelain.
   *
   * This is a **product dimension**, deliberately independent of `uvScale`.
   * The rendered tile size is `uvScale ÷ the painter's internal grid count`
   * (`patterns/tile.ts` bakes 2×2 tiles per texture period, `brick` 5×6) — but
   * those counts are TEXTURE-AUTHORING constants that exist to make a map look
   * right and may be retuned for purely visual reasons. Deriving a contractor's
   * setting-out from them would let a visual tweak silently change a
   * construction drawing, so a coursing drawing must read THIS field and never
   * infer from `uvScale`.
   *
   * Absent for non-modular finishes (plaster, paint, poured, carpet) and for
   * modular finishes whose module has not been specified — a consumer must
   * treat absence as "unknown", never as a default size.
   */
  moduleMm?: [number, number]
  /**
   * SPECIFIED paint coverage for a coating finish, consumed by
   * `analysis/paintQuantities.ts` to turn a surface area into LITRES.
   *
   * Its PRESENCE is what marks a finish as paint — the same design as
   * `moduleMm` marking a finish as modular. Deliberately not inferred from
   * `pattern === 'plaster'`: that is a rendering constant, and deriving a
   * procurement quantity from it is the mistake `floorplan/tileCoursing.ts`'s
   * header warns about for tile sizes. A finish without this yields no paint
   * row, and the caller reports how many were omitted.
   */
  paint?: PaintCoverage
  /**
   * SPECIFIED floor build-up in millimetres, consumed by
   * `analysis/floorBuildUp.ts` to check the HDB thickness limits and to DERIVE
   * the finished-floor level of each room.
   *
   * Same discipline as `moduleMm` and `paint`: its presence is what marks a
   * finish as a floor build-up, and it is never inferred. A finish without it
   * yields no row and the caller reports how many rooms it could not assess.
   *
   * Split into the finish and its bedding because the two HDB limits are
   * written against different sums — 50 mm covers finish **plus screed**,
   * while the 13 mm overlay limit covers new tiles **plus adhesive** only.
   *
   * **Direction of error matters here in a way it does not for `moduleMm`.**
   * These figures feed a REGULATORY LIMIT, so where a source gives a range the
   * value takes the THICKER end: understating a build-up clears a floor that
   * fails on site, and an inspection is a worse place to find out than a
   * warning panel. Sources in `docs/research/2026-09-03-floor-build-up.md`.
   */
  buildUp?: FloorBuildUp
}

/** A floor finish's specified build-up above what it is laid on (mm). */
export interface FloorBuildUp {
  /** The finish's own thickness — tile body, plank, screed topping. */
  finishMm: number
  /** Bedding it needs: adhesive bed, levelling screed, underlay. */
  beddingMm: number
  /** Why these figures, when a source gave a range. */
  note?: string
}

export interface SolidMaterialDef extends MaterialDefBase {
  kind: 'solid'
}

/** Pattern name for runtime procedural texture generation. */
export type ProceduralPattern =
  | 'wood'
  | 'vinyl'
  | 'tile'
  | 'carpet'
  | 'concrete'
  | 'marble'
  | 'plaster'
  | 'terrazzo'
  | 'stripe'
  | 'grasscloth'
  | 'checker'
  | 'parquet'
  | 'herringbone'
  | 'brick'
  | 'batten'
  | 'hexagon'
  | 'subway'
  | 'porcelain'
  | 'stoneTile'
  | 'porcelainStone'
  | 'fluted'
  | 'peranakan'
  | 'limewash'

/** A finish whose PBR maps are generated on-device at runtime (no fetch).
 *  `swatch` doubles as the base tint fed to the generator. */
export interface ProceduralMaterialDef extends MaterialDefBase {
  kind: 'procedural'
  pattern: ProceduralPattern
  /** CC0/attribution-free; generated locally. */
  sourceUrl?: string
  /** UV repeat in metres-per-tile. [1, 1] tiles 1×1 m per texture. */
  uvScale: [number, number]
}

export interface TexturedMaterialDef extends MaterialDefBase {
  kind: 'textured'
  source: 'polyhaven' | 'ambientcg' | 'user'
  /** CC0 attribution URL (built-ins and remote-resolved). */
  sourceUrl?: string
  /** Provider slug for runtime-resolved entries. */
  slug?: string
  /** Resolution variant for runtime-resolved entries. */
  resolution?: '1k' | '2k' | '4k'
  /** Provider-hosted low-res preview URL (~128–150 px). Used by the
   *  finish picker swatch grid so we don't load the full albedo. */
  thumbUrl?: string
  textures: {
    albedo: string
    normal?: string
    roughness?: string
    ao?: string
    /** Spatially-varying metalness (`metalnessMap`). A scan with rust, patina or
     *  worn plating cannot be described by the scalar `metalness` alone. When
     *  present the scalar is driven to 1 so the map is the sole authority. */
    metalness?: string
    /** Per-texel opacity (`alphaMap`) for genuinely perforated / open-weave
     *  surfaces (grates, mesh, sheer fabric). Uses alpha-TEST, not blending —
     *  see `cache.ts` (a blended surface would fight the wall-reveal fade and
     *  sort incorrectly against the rest of the shell). */
    opacity?: string
    /** Height / displacement field. NOT bound as three's `displacementMap` —
     *  that displaces vertices and the shell's walls/floors are low-poly boxes
     *  with nothing to displace. It feeds the parallax-occlusion floor path
     *  (`pomFloor.ts`) instead, which ray-marches the height field in the
     *  fragment shader so joints genuinely recede. */
    displacement?: string
  }
  /** UV repeat in metres-per-tile. [1, 1] tiles 1×1 m per texture. */
  uvScale: [number, number]
  /** Runtime-only blob URL set during hydration for user materials. */
  runtimeUrls?: {
    albedo: string
    normal?: string
    roughness?: string
    ao?: string
    metalness?: string
    opacity?: string
    displacement?: string
  }
}

export type MaterialDef = SolidMaterialDef | TexturedMaterialDef | ProceduralMaterialDef
