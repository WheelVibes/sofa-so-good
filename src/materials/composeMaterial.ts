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

import type {
  MaterialCategory,
  MaterialDef,
  ProceduralMaterialDef,
  ProceduralPattern,
} from './types'

const COMPOSE_PREFIX = 'compose:'
const TINT_PREFIX = 'tint:'

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/

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
  if (!HEX_RE.test(color)) return null
  return { pattern, color, texture }
}

// ── Tinting an EXISTING catalog material (MAT-COMPOSE tail) ─────────────────
// A composed finish builds a NEW procedural material; a *tinted* finish instead
// recolours an existing catalog material — including the textured CC0 / Poly
// Haven ones, where the chosen colour multiplies the albedo map via the
// material's `m.color` (= `def.swatch`). Encoded `tint:<baseId>:<#hex>`. The
// base id may itself contain ':' (e.g. a provider slug), so the colour is the
// final ':'-segment.

/** True when `id` is a tint-an-existing-material id (`tint:<baseId>:<#hex>`). */
export function isTintMaterialId(id: string): boolean {
  return typeof id === 'string' && id.startsWith(TINT_PREFIX)
}

/** Build a tint id from a base material id + a hex colour. */
export function tintMaterialId(baseId: string, color: string): string {
  return `${TINT_PREFIX}${baseId}:${color}`
}

export interface TintParts {
  baseId: string
  color: string
}

/** Parse a tint id into `{ baseId, color }`, or `null` if malformed. */
export function parseTintMaterialId(id: string): TintParts | null {
  if (!isTintMaterialId(id)) return null
  const rest = id.slice(TINT_PREFIX.length)
  const idx = rest.lastIndexOf(':')
  if (idx <= 0) return null
  const baseId = rest.slice(0, idx)
  const color = rest.slice(idx + 1)
  if (!baseId || !HEX_RE.test(color)) return null
  return { baseId, color }
}

/**
 * Recolour an existing catalog material: clone `base` under the tint id with its
 * `swatch` set to the chosen colour. For a procedural base the colour re-tints
 * the generated albedo; for a textured (Poly Haven / CC0) base it multiplies the
 * albedo map (`buildMaterial` sets `m.color = swatch` for textured defs). Returns
 * `null` for a malformed id. The base def is supplied by the caller (it has the
 * merged catalog), so this stays pure + render-agnostic.
 */
export function tintedMaterialDef(id: string, base: MaterialDef): MaterialDef | null {
  const parts = parseTintMaterialId(id)
  if (!parts) return null
  return { ...base, id, swatch: parts.color, name: `${base.name} · ${parts.color}` }
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
