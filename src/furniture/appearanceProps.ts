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

import type { FurnitureDef, ParamProps, ParamValue } from './types'

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
