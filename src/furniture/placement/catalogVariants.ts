/**
 * Pre-placement finish/variant resolution (CATALOG-VARIANT, 2026-07-03 core-loop
 * parity audit). IKEA Kreativ / Coohom / Roomstyler let a shopper pick a colour
 * on the browse card before it ever lands in the room; here that choice was only
 * reachable *after* placement, via the inspector (`ui/inspector/IkeaBody.tsx`'s
 * finish picker, `ui/inspector/ParametricBody.tsx`'s colour fields). This module
 * is the pure "what can I choose, and what does choosing it mean" logic behind
 * `CatalogVariantPopover` — the quick-look swatch popover `CatalogCard` opens
 * before arming placement — so the popover component stays presentational and
 * the resolution stays unit-testable.
 *
 * Deliberately reuses the vocabulary every other surface already understands
 * instead of inventing a new one:
 *  - IKEA (`IkeaGltfDef.variants`): the same `{ variant: finish }` patch as the
 *    inspector's `ikeaBodyProps.ts:variantProps`.
 *  - parametric (`ParametricDef.paramSchema`): a `color`-kind field, keyed via
 *    `furniture/appearanceProps.ts:appearanceKeys` (the same appearance-key
 *    detection copy-appearance/bulk-recolour already rely on) so a colour field
 *    only counts here if it's *actually* an appearance dimension.
 *  - a plain GLB (builtin/user/remote/pack/local) has no def-level finish
 *    concept beyond the inspector's post-placement `tint` override — there's
 *    nothing distinct to offer pre-place, so it gets no popover (the
 *    "non-tintable" edge case).
 */
import { appearanceKeys } from '../appearanceProps'
import type { FurnitureDef, IkeaVariant, ParamField, ParamProps } from '../types'

export interface CatalogVariantOption {
  /** Stable key for the option: the IKEA finish, or the swatch hex itself. */
  id: string
  label: string
  /** Swatch colour to render; a `disabled` IKEA stub may still lack one. */
  swatchHex?: string
  /** True for a stubbed IKEA variant (`assetId === null`) — shown so the user
   *  knows the finish exists, but not selectable (mirrors `IkeaBody`). */
  disabled?: boolean
}

/** A small curated neutral + accent palette for a parametric colour field —
 *  same spirit as `ui/inspector/QuickFinishes.tsx`'s curated wood row, but for
 *  raw hex tints (no material asset to load), so it stays instant and prod-safe.
 *  Kept short so the popover stays compact on a 390px card (TODO.md's mobile
 *  clutter warning). */
export const CURATED_COLOR_SWATCHES: { hex: string; label: string }[] = [
  { hex: '#f4f1ea', label: 'Ivory' },
  { hex: '#d9d2c3', label: 'Sand' },
  { hex: '#9c8f7a', label: 'Taupe' },
  { hex: '#6b6f76', label: 'Charcoal' },
  { hex: '#2b2b2e', label: 'Black' },
  { hex: '#4a5a4a', label: 'Sage' },
  { hex: '#4a5a78', label: 'Navy' },
  { hex: '#8a4b3b', label: 'Terracotta' },
]

/** The def's primary colour field for pre-place tinting: the field literally
 *  named `color` if present (the common case — sofas, beds, rugs, …), else the
 *  first `color`-kind field in schema order (e.g. a decor piece whose only
 *  colour dimension is `potColor`). Only fields `appearanceKeys` already
 *  recognises count — colour fields always qualify there, but routing through
 *  it keeps this in lock-step with copy-appearance/bulk-recolour instead of
 *  re-deriving its own notion of "is this an appearance prop". */
function primaryColorField(def: FurnitureDef): ParamField | undefined {
  if (def.kind !== 'parametric') return undefined
  const keys = new Set(appearanceKeys(def))
  const colorFields = def.paramSchema.filter((f) => f.kind === 'color' && keys.has(f.key))
  return colorFields.find((f) => f.key === 'color') ?? colorFields[0]
}

function ikeaOption(v: IkeaVariant): CatalogVariantOption {
  return { id: v.finish, label: v.label, swatchHex: v.swatchHex, disabled: v.assetId === null }
}

/**
 * Finish/variant options offered on the catalog card BEFORE placement — empty
 * when `def` has nothing to choose (a single-finish IKEA product, a plain GLB,
 * or a parametric def with no colour field). Only IKEA multi-variant products
 * and tintable parametric pieces get a popover.
 */
export function catalogVariantOptions(def: FurnitureDef): CatalogVariantOption[] {
  if (def.kind === 'gltf' && def.source === 'ikea') {
    // Only offer finishes with a real GLB — a stubbed variant (`assetId === null`)
    // can't be placed, so showing it as a disabled swatch just confuses (bug #7).
    const available = def.variants.filter((v) => v.assetId !== null)
    if (available.length < 2) return []
    return available.map(ikeaOption)
  }
  const field = primaryColorField(def)
  if (!field) return []
  return CURATED_COLOR_SWATCHES.map((c) => ({ id: c.hex, label: c.label, swatchHex: c.hex }))
}

/** Whether `def` has at least one selectable finish/variant to quick-pick
 *  before placement — drives whether `CatalogCard` renders the popover trigger
 *  at all (a def with none renders no trigger, never a disabled one). */
export function hasCatalogVariants(def: FurnitureDef): boolean {
  return catalogVariantOptions(def).length > 0
}

/**
 * Initial item props for placing `def` in the chosen variant/swatch —
 * intended to be merged OVER `defaultItemProps(def)` (`placement/
 * defaultItemProps.ts`) so every other schema default (size, form, weave, …)
 * is untouched; only the finish dimension changes. Returns `{}` (a no-op
 * merge) for an option id that doesn't resolve to anything (stale/removed
 * variant, disabled stub) so a caller can always spread it safely.
 */
export function initialVariantProps(def: FurnitureDef, optionId: string): ParamProps {
  if (def.kind === 'gltf' && def.source === 'ikea') {
    const v = def.variants.find((x) => x.finish === optionId)
    if (!v || v.assetId === null) return {}
    return { variant: v.finish }
  }
  const field = primaryColorField(def)
  if (!field) return {}
  return { [field.key]: optionId }
}
