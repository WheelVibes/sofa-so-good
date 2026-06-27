/**
 * Composable finishes (MAT-COMPOSE) — let a user build a floor/wall finish from
 * a **texture/pattern** plus a **colour**, instead of only picking a pre-baked
 * catalog entry. Every procedural finish is already a `(pattern, swatch)` pair
 * tinted by the on-device generator, so a composed finish is just an id that
 * encodes that pair: `compose:<pattern>:<#hex>`.
 *
 * The id is resolved on the fly into a `ProceduralMaterialDef` (see
 * `useMaterial.ts`), exactly like the raw `#hex` custom-colour path — so it
 * needs no catalog entry, serializes as a plain string in `finishes`, and
 * renders through the existing procedural pipeline. Pure + unit-tested (no
 * three / React / store imports).
 */

import type { MaterialCategory, ProceduralMaterialDef, ProceduralPattern } from './types'

const COMPOSE_PREFIX = 'compose:'

/** A texture family the composer offers, with a sensible physical tile size
 *  (metres-per-tile) mirroring the curated builtin `uvScale` values. */
export interface ComposeTexture {
  pattern: ProceduralPattern
  label: string
  uvScale: [number, number]
}

/** The curated texture palette, ordered for the composer dropdown. */
export const COMPOSE_TEXTURES: ComposeTexture[] = [
  { pattern: 'plaster', label: 'Plaster (paint)', uvScale: [2.5, 2.5] },
  { pattern: 'wood', label: 'Wood planks', uvScale: [1.9, 1.2] },
  { pattern: 'parquet', label: 'Parquet', uvScale: [0.5, 0.5] },
  { pattern: 'herringbone', label: 'Herringbone', uvScale: [2, 2] },
  { pattern: 'tile', label: 'Tile', uvScale: [0.8, 0.8] },
  { pattern: 'hexagon', label: 'Hexagon tile', uvScale: [0.5, 0.5] },
  { pattern: 'subway', label: 'Subway tile', uvScale: [0.7, 0.7] },
  { pattern: 'marble', label: 'Marble', uvScale: [1.6, 1.6] },
  { pattern: 'terrazzo', label: 'Terrazzo', uvScale: [1, 1] },
  { pattern: 'concrete', label: 'Concrete', uvScale: [2.5, 2.5] },
  { pattern: 'carpet', label: 'Carpet', uvScale: [1.5, 1.5] },
  { pattern: 'checker', label: 'Checkerboard', uvScale: [1.2, 1.2] },
  { pattern: 'stripe', label: 'Striped', uvScale: [1.2, 1.2] },
  { pattern: 'grasscloth', label: 'Grasscloth', uvScale: [1.2, 1.2] },
  { pattern: 'brick', label: 'Brick', uvScale: [1.2, 1.2] },
  { pattern: 'batten', label: 'Board & batten', uvScale: [1.2, 1.2] },
  { pattern: 'fluted', label: 'Fluted panel', uvScale: [0.8, 0.8] },
]

const BY_PATTERN = new Map(COMPOSE_TEXTURES.map((t) => [t.pattern, t]))

/** Default composed finish for a fresh composer (oak-toned wood planks). */
export const DEFAULT_COMPOSE_PATTERN: ProceduralPattern = 'wood'
export const DEFAULT_COMPOSE_COLOR = '#b88f5d'

/** True when `id` is a composed-finish id (`compose:<pattern>:<#hex>`). */
export function isComposedMaterialId(id: string): boolean {
  return typeof id === 'string' && id.startsWith(COMPOSE_PREFIX)
}

/** Build a composed finish id from a texture pattern + a hex colour. */
export function composeMaterialId(pattern: ProceduralPattern, color: string): string {
  return `${COMPOSE_PREFIX}${pattern}:${color}`
}

export interface ComposedParts {
  pattern: ProceduralPattern
  color: string
  texture: ComposeTexture
}

/** Parse a composed id into its parts, or `null` if malformed / unknown
 *  pattern / non-hex colour. */
export function parseComposedMaterialId(id: string): ComposedParts | null {
  if (!isComposedMaterialId(id)) return null
  const rest = id.slice(COMPOSE_PREFIX.length)
  const sep = rest.indexOf(':')
  if (sep < 0) return null
  const pattern = rest.slice(0, sep) as ProceduralPattern
  const color = rest.slice(sep + 1)
  const texture = BY_PATTERN.get(pattern)
  if (!texture) return null
  if (!/^#[0-9a-fA-F]{3,8}$/.test(color)) return null
  return { pattern, color, texture }
}

/**
 * Synthesize a `ProceduralMaterialDef` for a composed finish id, or `null` if
 * the id is not a valid composed id. Mirrors `customColorDef` but with a chosen
 * texture pattern instead of fixed plaster. `category` is metadata only (floors
 * and walls render procedural defs identically).
 */
export function composedMaterialDef(
  id: string,
  category: MaterialCategory = 'floor',
): ProceduralMaterialDef | null {
  const parts = parseComposedMaterialId(id)
  if (!parts) return null
  return {
    id,
    name: `${parts.texture.label} · ${parts.color}`,
    category,
    kind: 'procedural',
    pattern: parts.pattern,
    swatch: parts.color,
    uvScale: parts.texture.uvScale,
  }
}
