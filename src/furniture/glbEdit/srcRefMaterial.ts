/**
 * GLB Asset Designer — decomposed-part TEXTURE FIDELITY for `srcRef` mesh parts
 * (Asset Studio Stage 10a). A part decomposed from a GLB source keeps a `srcRef`
 * pointer instead of inlined triangles (Stage 9a); this module turns the SOURCE
 * mesh's textured material — held in `srcRefCache.ts` as one shared cloned
 * `MeshStandardMaterial` — into the render/export material for that part, with the
 * part's own colour/physical fields acting as OVERRIDES.
 *
 * The spec stores NOTHING new for this: the textures live in the runtime source
 * (that's the whole point of refs). A resolved srcRef part therefore renders with
 * the source's real PBR maps (map/normal/roughness/metalness/ao + their
 * transforms/colorSpace) in the preview AND bakes them into the exported GLB.
 *
 * Override interplay (mirrors the mesh-part idiom):
 *  - colour  → multiplies onto the source `map` (three does `color × map`, the
 *    `tint:` legacy multiply idiom). The captured colour equals the source's own
 *    colour, so an untouched part is VERBATIM; a user recolour tints.
 *  - roughness / metalness → override the source scalar (its maps still multiply).
 *  - a `mat:<id>` **finish** REPLACES the source textures entirely — handled by
 *    the standard finish path in `buildObject.ts` (this module returns null so
 *    that path takes over), matching how a mesh part's finish already works.
 *  - "Reset to source look" clears the finish + variant overrides and restores
 *    colour/roughness/metalness to the source (`resetSrcRefPartToSourceLook`).
 *
 * Memory discipline: `getCachedSrcRefMaterial` returns ONE shared instance per
 * cache entry; `buildSrcRefPartMaterial` clones it once per object build (never
 * per frame), exactly like the finish-material clone path.
 */

import { Color, type MeshStandardMaterial } from 'three'
import type { ShapePart } from './editSpec'
import { getCachedSrcRefMaterial } from './srcRefCache'

/** The captured SOURCE look of a resolved srcRef part — the flat scalars the
 *  source material carried (colour + roughness/metalness), read from the cache. */
export interface SrcRefSourceLook {
  color: string
  roughness?: number
  metalness?: number
}

/** True when a part is a resolvable GLB-decompose reference (a `mesh` part with a
 *  `srcRef` and no inlined `geometry`). Pure. */
function isSrcRefPart(part: ShapePart): boolean {
  return part.kind === 'mesh' && !!part.srcRef && !part.geometry
}

/** The captured SOURCE look for a resolved srcRef part (from the cache), or null
 *  while it hasn't resolved / isn't a srcRef part / had no standard material. The
 *  hex/roughness/metalness are exactly what the decompose captured onto the part,
 *  so they double as the "reset target". */
export function srcRefSourceLook(part: ShapePart): SrcRefSourceLook | null {
  if (!isSrcRefPart(part) || !part.srcRef) return null
  const mat = getCachedSrcRefMaterial(part.srcRef)
  if (!mat) return null
  return {
    color: `#${mat.color.getHexString()}`,
    roughness: mat.roughness,
    metalness: mat.metalness,
  }
}

/**
 * Build the render/export material for a resolved srcRef part from its cached
 * SOURCE material (textures shared), applying the part's overrides. Returns null
 * when the part isn't a resolved srcRef, has no cached source material yet, OR
 * carries a `mat:<id>` finish (which REPLACES the source textures — the standard
 * finish path in `buildObject.ts` handles that). The returned material is
 * caller-OWNED (a fresh clone, safe to dispose); its textures are the shared
 * source instances (never disposed here).
 */
export function buildSrcRefPartMaterial(part: ShapePart): MeshStandardMaterial | null {
  if (!isSrcRefPart(part) || !part.srcRef) return null
  // A finish replaces the whole source look — let the standard builder win.
  if (part.finish) return null
  const src = getCachedSrcRefMaterial(part.srcRef)
  if (!src) return null
  const m = src.clone() // shares texture instances; only the material is cloned
  // Colour tint — three multiplies `color × map`, so the source colour = verbatim
  // and a user recolour tints (the `tint:` multiply idiom).
  m.color = new Color(part.color)
  if (part.roughness !== undefined) m.roughness = part.roughness
  if (part.metalness !== undefined) m.metalness = part.metalness
  const glow = part.emissiveIntensity ?? 0
  m.emissive = new Color(glow > 0 ? part.color : 0x000000)
  m.emissiveIntensity = glow
  const opacity = part.opacity ?? 1
  m.transparent = opacity < 1
  m.opacity = opacity
  return m
}

/** Case-insensitive hex equality (normalises the leading `#` + case). */
function sameHex(a: string, b: string): boolean {
  return a.replace(/^#/, '').toLowerCase() === b.replace(/^#/, '').toLowerCase()
}

/**
 * True when a resolved srcRef part diverges from its captured SOURCE look — a
 * colour tint, a roughness/metalness change, or a `mat:<id>` finish. Drives the
 * inspector's "Reset to source look" affordance (shown only when this is true).
 * Pure — the caller supplies the source look (via {@link srcRefSourceLook}).
 */
export function srcRefPartHasOverride(part: ShapePart, look: SrcRefSourceLook): boolean {
  if (part.finish) return true
  if (!sameHex(part.color, look.color)) return true
  if (
    look.roughness !== undefined &&
    part.roughness !== undefined &&
    Math.abs(part.roughness - look.roughness) > 1e-4
  ) {
    return true
  }
  if (
    look.metalness !== undefined &&
    part.metalness !== undefined &&
    Math.abs(part.metalness - look.metalness) > 1e-4
  ) {
    return true
  }
  return false
}

/**
 * Restore a srcRef part to its captured SOURCE look — clears the finish + finish
 * texture-variant overrides + any gradient, and resets colour/roughness/metalness
 * to the source scalars, so the part renders the source textures verbatim again.
 * Pure — returns a new part (the caller commits it).
 */
export function resetSrcRefPartToSourceLook(part: ShapePart, look: SrcRefSourceLook): ShapePart {
  const { finish: _f, finishScale: _fs, finishRotation: _fr, gradient: _g, ...rest } = part
  return { ...rest, color: look.color, roughness: look.roughness, metalness: look.metalness }
}
