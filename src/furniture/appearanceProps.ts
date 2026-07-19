/**
 * "Appearance" prop extraction — the subset of an item's props that describe how
 * it *looks* (finish / colour / material / variant / tint), as opposed to its
 * size, form or position. Powers copy-appearance / paste-appearance and
 * bulk-recolour-by-category: those transfer only the look, so a walnut finish can
 * jump from one piece to a differently-sized one without resizing it.
 *
 * Pure + catalog-driven (reads each def's `paramSchema`) so it's unit-testable
 * and safe to reuse from the store actions.
 */

import type { FurnitureDef, FurnitureItem, ParamProps, ParamValue } from './types'

/** Enum/string param keys that name a look dimension (finish/colour/material/…). */
const APPEARANCE_KEY_RE =
  /finish|materi|wood|metal|fabric|leather|colou?r|shade|frame|print|accent|trim|tone|wrap|pattern|stain|veneer|upholster|gloss|tile|stone|marble/i

/** Props that are always appearance for GLB / IKEA items (no schema). */
const GLTF_APPEARANCE_KEYS = ['variant', 'tint', 'reflective'] as const

/**
 * The set of prop keys that count as "appearance" for a def:
 *  - parametric: every `color` field + any enum/string field whose key names a
 *    look dimension, plus a shared `tint`/`variant` if the item carries one;
 *  - gltf / ikea: variant + tint (+ reflective).
 */
export function appearanceKeys(def: FurnitureDef): string[] {
  if (def.kind === 'parametric') {
    const keys = new Set<string>()
    for (const f of def.paramSchema) {
      if (f.kind === 'color') keys.add(f.key)
      else if (f.kind === 'enum' && APPEARANCE_KEY_RE.test(f.key)) keys.add(f.key)
    }
    return [...keys]
  }
  return [...GLTF_APPEARANCE_KEYS]
}

/** Pull the appearance-only subset of an item's props (given its def). */
export function extractAppearance(props: ParamProps, def: FurnitureDef): ParamProps {
  const out: ParamProps = {}
  for (const key of appearanceKeys(def)) {
    const v = props[key]
    if (v !== undefined) out[key] = v
  }
  return out
}

/**
 * Merge a copied appearance onto a target item's props, keeping only the keys
 * the target def actually understands — so pasting a sofa's look onto a chair
 * transfers the shared dims (e.g. `fabric`, `color`) and ignores the rest. Never
 * touches size/form/position keys. Returns a new props object (or the same
 * reference if nothing applied).
 */
export function mergeAppearance(
  targetProps: ParamProps,
  clipboard: ParamProps,
  targetDef: FurnitureDef,
): ParamProps {
  const allowed = new Set(appearanceKeys(targetDef))
  let changed = false
  const next: ParamProps = { ...targetProps }
  for (const [key, value] of Object.entries(clipboard)) {
    if (!allowed.has(key)) continue
    if (next[key] === value) continue
    next[key] = value as ParamValue
    changed = true
  }
  return changed ? next : targetProps
}

/**
 * A bulk-recolour patch for `def`, targeting whichever prop key(s) its render
 * path actually reads (BUG: `props.tint` is GLB-only — a parametric primitive
 * never looks at it, so tinting stock furniture was a silent no-op):
 *  - gltf / ikea → `{ tint: hex }` (the only key `gltfRender.ts` consumes);
 *  - parametric → every `color`-kind `paramSchema` field set to `hex` (a sofa's
 *    `color`, an armchair's `frameColor` + `fabricColor`, …, whichever exist).
 * A parametric def with no color field at all yields `{}` (nothing to patch —
 * e.g. a def whose "colour" is a materia/enum pick, out of scope here).
 */
export function recolorPatch(def: FurnitureDef, hex: string): ParamProps {
  if (def.kind === 'parametric') {
    const out: ParamProps = {}
    for (const f of def.paramSchema) {
      if (f.kind === 'color') out[f.key] = hex
    }
    return out
  }
  return { tint: hex }
}

/**
 * The inverse of {@link recolorPatch} — clears a bulk recolour back to the
 * def's own designed look:
 *  - gltf / ikea → `{ tint: undefined }` (deletes the override, reverting to
 *    the GLB's own baked materials);
 *  - parametric → every `color` field reset to its OWN schema `default` (not
 *    blanked — there's no "no colour" state for a primitive that always
 *    renders a material, so "clear" means "back to the def's designed colour").
 */
export function clearRecolorPatch(def: FurnitureDef): Record<string, ParamValue | undefined> {
  if (def.kind === 'parametric') {
    const out: Record<string, ParamValue | undefined> = {}
    for (const f of def.paramSchema) {
      if (f.kind === 'color') out[f.key] = f.default
    }
    return out
  }
  return { tint: undefined }
}

/**
 * The current bulk-recolour hex for `item` under `def`, for display (the
 * MultiSelectPanel swatch + "shared tint" check) — gltf/ikea reads `props.tint`;
 * parametric reads the FIRST `color` field (the item's live value, falling back
 * to that field's schema default). Returns '' when there's nothing to show
 * (gltf with no tint override, or a parametric def with no color field).
 */
export function currentRecolorValue(item: Pick<FurnitureItem, 'props'>, def: FurnitureDef): string {
  if (def.kind === 'parametric') {
    const first = def.paramSchema.find((f) => f.kind === 'color')
    if (!first) return ''
    const v = item.props[first.key]
    return typeof v === 'string' && v !== '' ? v : first.default
  }
  const v = item.props.tint
  return typeof v === 'string' ? v : ''
}
