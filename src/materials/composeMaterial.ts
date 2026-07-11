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

/** Scale multiplier bounds for the composer's tile-size control (× per tile). */
export const COMPOSE_SCALE_MIN = 0.25
export const COMPOSE_SCALE_MAX = 4
export const DEFAULT_COMPOSE_SCALE = 1

/** Roughness (gloss) override bounds: 0 = mirror gloss, 1 = fully matte. */
const COMPOSE_ROUGHNESS_MIN = 0.05
const COMPOSE_ROUGHNESS_MAX = 1

/**
 * How a tint colour combines with a textured base's albedo (FINISH-RECOLOR):
 *  - `'multiply'` (legacy, the absent-token default): the colour multiplies the
 *    albedo via `material.color` — can only darken/shade the photo texture.
 *  - `'repaint'` (`!r` token): luminance-preserving, mean-anchored recolor — the
 *    albedo is re-baked so its *average* colour becomes the chosen colour while
 *    the pattern's relative contrast survives (can lighten OR darken; a dark
 *    walnut really becomes a light-grey wood). Procedural bases already re-bake
 *    their pattern with the new colour, so the mode only changes textured bases.
 */
export type TintMode = 'multiply' | 'repaint'
const DEFAULT_TINT_MODE: TintMode = 'multiply'

/** Clamp + sanitise a tile-scale multiplier (non-finite / out-of-range → 1). */
function clampScale(s: number): number {
  if (!Number.isFinite(s) || s <= 0) return DEFAULT_COMPOSE_SCALE
  return Math.min(COMPOSE_SCALE_MAX, Math.max(COMPOSE_SCALE_MIN, s))
}

/** Clamp a roughness override, or `undefined` if non-finite / out of range. */
function clampRoughness(r: number): number | undefined {
  if (!Number.isFinite(r)) return undefined
  return Math.min(COMPOSE_ROUGHNESS_MAX, Math.max(COMPOSE_ROUGHNESS_MIN, r))
}

/** Split a colour segment into its parts. After the `<#hex>` colour an optional
 *  `@<scale>` multiplies the tile size, an optional `~<rough>` overrides the
 *  roughness/gloss (CUSTOMIZE-MATERIAL-PARAMS), and an optional `!r` switches the
 *  tint mode to luminance-preserving repaint (FINISH-RECOLOR). All absent →
 *  defaults (byte-identical to the pre-parameter ids, so old saved/applied
 *  finishes keep working). Tokens are order-independent. */
function splitColorScale(seg: string): {
  color: string
  scale: number
  roughness: number | undefined
  mode: TintMode
} {
  // Colour is everything up to the first parameter token (`@`, `~` or `!`).
  const firstTok = (() => {
    let first = -1
    for (const tok of ['@', '~', '!']) {
      const i = seg.indexOf(tok)
      if (i >= 0 && (first < 0 || i < first)) first = i
    }
    return first
  })()
  if (firstTok < 0) {
    return { color: seg, scale: DEFAULT_COMPOSE_SCALE, roughness: undefined, mode: 'multiply' }
  }
  const color = seg.slice(0, firstTok)
  const scaleM = seg.match(/@(-?[\d.]+)/)
  const roughM = seg.match(/~(-?[\d.]+)/)
  // Future-proof: `!<word>` is a mode token; only `r` (repaint) is known today —
  // an unknown word degrades to the legacy multiply mode rather than failing.
  const modeM = seg.match(/!([a-z]+)/)
  return {
    color,
    scale: scaleM ? clampScale(Number.parseFloat(scaleM[1])) : DEFAULT_COMPOSE_SCALE,
    roughness: roughM ? clampRoughness(Number.parseFloat(roughM[1])) : undefined,
    mode: modeM?.[1] === 'r' ? 'repaint' : 'multiply',
  }
}

/** Build the `@<scale>~<rough>!r` parameter suffix, omitting defaults. */
function paramSuffix(scale: number, roughness: number | undefined, mode?: TintMode): string {
  const s = clampScale(scale)
  const r = roughness == null ? undefined : clampRoughness(roughness)
  const m = mode === 'repaint' ? '!r' : ''
  return `${s === DEFAULT_COMPOSE_SCALE ? '' : `@${s}`}${r == null ? '' : `~${r}`}${m}`
}

/** Multiply a `[u, v]` tile size by a scale, guarding non-finite inputs. */
function scaledUv(uv: [number, number], scale: number): [number, number] {
  return [uv[0] * scale, uv[1] * scale]
}

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

/** Build a composed finish id from a texture pattern + a hex colour, optionally
 *  with a tile-scale multiplier (omitted from the id when 1, for back-compat). */
export function composeMaterialId(
  pattern: ProceduralPattern,
  color: string,
  scale: number = DEFAULT_COMPOSE_SCALE,
  roughness?: number,
): string {
  return `${COMPOSE_PREFIX}${pattern}:${color}${paramSuffix(scale, roughness)}`
}

export interface ComposedParts {
  pattern: ProceduralPattern
  color: string
  texture: ComposeTexture
  /** Tile-size multiplier (× the pattern's default `uvScale`). */
  scale: number
  /** Roughness/gloss override, or `undefined` for the pattern default. */
  roughness: number | undefined
}

/** Parse a composed id into its parts, or `null` if malformed / unknown
 *  pattern / non-hex colour. */
export function parseComposedMaterialId(id: string): ComposedParts | null {
  if (!isComposedMaterialId(id)) return null
  const rest = id.slice(COMPOSE_PREFIX.length)
  const sep = rest.indexOf(':')
  if (sep < 0) return null
  const pattern = rest.slice(0, sep) as ProceduralPattern
  // A composed finish re-bakes its procedural pattern with the colour, which IS
  // a true recolor already — a `!r` token is tolerated but changes nothing.
  const { color, scale, roughness } = splitColorScale(rest.slice(sep + 1))
  const texture = BY_PATTERN.get(pattern)
  if (!texture) return null
  if (!HEX_RE.test(color)) return null
  return { pattern, color, texture, scale, roughness }
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

/** Build a tint id from a base material id + a hex colour, optionally with a
 *  tile-scale multiplier and/or a tint mode (both omitted from the id at their
 *  defaults, for back-compat). `mode: 'repaint'` appends `!r` — the
 *  luminance-preserving recolor for textured bases (FINISH-RECOLOR). */
export function tintMaterialId(
  baseId: string,
  color: string,
  scale: number = DEFAULT_COMPOSE_SCALE,
  roughness?: number,
  mode: TintMode = DEFAULT_TINT_MODE,
): string {
  return `${TINT_PREFIX}${baseId}:${color}${paramSuffix(scale, roughness, mode)}`
}

export interface TintParts {
  baseId: string
  color: string
  /** Tile-size multiplier (× the base material's default `uvScale`). */
  scale: number
  /** Roughness/gloss override, or `undefined` for the base default. */
  roughness: number | undefined
  /** How the colour combines with a textured base's albedo (FINISH-RECOLOR). */
  mode: TintMode
}

/** Parse a tint id into `{ baseId, color, scale, roughness, mode }`, or `null` if malformed. */
export function parseTintMaterialId(id: string): TintParts | null {
  if (!isTintMaterialId(id)) return null
  const rest = id.slice(TINT_PREFIX.length)
  // The colour + params are the final ':'-segment; the base id (which may itself
  // contain ':') is everything before it.
  const lastColon = rest.lastIndexOf(':')
  if (lastColon <= 0) return null
  const baseId = rest.slice(0, lastColon)
  const { color, scale, roughness, mode } = splitColorScale(rest.slice(lastColon + 1))
  if (!baseId || !HEX_RE.test(color)) return null
  return { baseId, color, scale, roughness, mode }
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
  let next: MaterialDef = {
    ...base,
    id,
    swatch: parts.color,
    name: `${base.name} · ${parts.color}`,
  }
  // Repaint mode (FINISH-RECOLOR): the textured branch of `buildMaterial` bakes
  // a luminance-preserving recolored albedo instead of multiplying `m.color`.
  // Harmless on procedural/solid bases (their swatch replacement above is
  // already a true recolor).
  if (parts.mode === 'repaint') next = { ...next, recolorAlbedo: true }
  // Apply the tile-scale multiplier where the base has a uvScale (procedural /
  // textured); a solid base has none, so scale is a no-op there.
  if (parts.scale !== DEFAULT_COMPOSE_SCALE && 'uvScale' in next && next.uvScale) {
    next = { ...next, uvScale: scaledUv(next.uvScale, parts.scale) }
  }
  if (parts.roughness != null) next = { ...next, roughness: parts.roughness }
  return next
}

/**
 * Resolve the finish id a custom-colour pick should write so the colour
 * REPAINTS the surface's current finish instead of replacing it with flat
 * plaster paint (FINISH-RECOLOR):
 *  - a tint re-colours in place (keeps base + scale + gloss; legacy multiply
 *    tints upgrade to repaint on the next colour pick);
 *  - a composed finish re-bakes its pattern with the new colour;
 *  - a plain catalog finish becomes `tint:<id>:<hex>!r` — EXCEPT paint-like
 *    bases (solid / plaster procedural / bare `#hex`), which stay plain paint;
 *  - no active finish / unknown id → plain paint.
 * Callers gate on the `finishRecolor` flag (off → pass the bare hex through).
 * Pure: the merged catalog is supplied for the plain-id def lookup.
 */
export function recolorFinishId(
  active: string | undefined,
  hex: string,
  catalog: Record<string, MaterialDef>,
): string {
  if (!active) return hex
  const tint = parseTintMaterialId(active)
  if (tint) return tintMaterialId(tint.baseId, hex, tint.scale, tint.roughness, 'repaint')
  const composed = parseComposedMaterialId(active)
  if (composed) return composeMaterialId(composed.pattern, hex, composed.scale, composed.roughness)
  if (active.startsWith('#')) return hex
  const def = catalog[active]
  if (!def) return hex
  if (def.kind === 'solid' || (def.kind === 'procedural' && def.pattern === 'plaster')) return hex
  return tintMaterialId(active, hex, 1, undefined, 'repaint')
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
    uvScale: scaledUv(parts.texture.uvScale, parts.scale),
    ...(parts.roughness != null ? { roughness: parts.roughness } : {}),
  }
}
