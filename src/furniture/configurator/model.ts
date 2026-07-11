/**
 * Slot-based product configurator — pure data model + clamping (SLOT-101).
 *
 * A *configurable product* is a **base** plus named **slots**, each with an
 * **anchor** (a transform in the base's local frame) and a set of compatible
 * **options** (each contributing geometry, footprint, and price). The user
 * picks one option per slot; `composeProduct` (see `compose.ts`) assembles the
 * selection into a part list + bounds + price, which bakes to a single user GLB
 * via the existing GLB-designer channel (`saveConfigured.ts`).
 *
 * This module is pure + serializable + dependency-free (no three.js / React),
 * mirroring `parametric/spec.ts`: a typed product definition + a typed user
 * selection + a `clampConfig` that ALWAYS yields something buildable (never
 * throws), the single defence against user-mangled input.
 */

import type { FurnitureCategory } from '../types'

/** A transform in the BASE's local frame (metres / radians). Floor-anchored,
 *  footprint-centred, +Z forward — same convention as `ParametricPart`. */
export interface SlotAnchor {
  position: [number, number, number]
  /** Yaw of the option about Y (radians). v1 supports quarter-turns. */
  rotationY?: number
}

/** A box part in an option's (or base's) own local frame (floor-anchored,
 *  centred, +Z forward). Structurally a `ParametricPart` plus the material
 *  hints the configurator's object builder needs to skin it, and a `finishKey`
 *  so the baked GLB exposes re-skinnable groups. */
export interface ConfiguredPart {
  role: string
  position: [number, number, number]
  size: [number, number, number]
  /** Material token resolved via `getSurfaceMaterial` (wood/painted/…) or a
   *  `mat:<id>` DLC id. Defaults to a neutral painted surface. */
  material?: string
  /** Tint hex for the material. */
  color?: string
  /** Re-skin group key for the baked GLB (e.g. `base:frame`). */
  finishKey?: string
}

/** One option that can fill a slot. Geometry is EITHER procedural box parts OR
 *  a GLB sub-asset (bundled CC0 url); never both (GLB path is SLOT-203). */
export interface SlotOption {
  id: string
  label: string
  /** SGD, explicit (no estimator guesswork — fixed-SKU configurator). */
  price: number
  parts?: ConfiguredPart[]
  gltfUrl?: string
  /** Footprint this option contributes, in its own frame (for bounds union). */
  footprint: { w: number; d: number; h: number }
  tags?: string[]
  /** Attribution for a `gltfUrl` sub-asset (SLOT-203) — wired like the bundled
   *  props' `.glb.json` sidecars so a GLB option carries its own credit. Ignored
   *  for procedural (`parts`) options. */
  license?: string
  attribution?: string
  sourceUrl?: string
}

export interface ProductSlot {
  id: string
  label: string
  anchor: SlotAnchor
  options: SlotOption[]
  /** Default option id (must exist in `options`). */
  defaultOptionId: string
  /** Whether the slot may be left empty (e.g. "no headboard"). Default false. */
  optional?: boolean
  /** Tag filter: an option is offered only if every tag here is in option.tags. */
  accepts?: string[]
}

type SlotConstraint =
  | { kind: 'mutex'; slots: string[] }
  | { kind: 'requires'; ifSlot: string; ifOption: string; thenSlot: string; thenOption: string }
  | {
      kind: 'excludes'
      slot: string
      option: string
      conflictsWith: { slot: string; option: string }
    }

export interface ConfigurableProduct {
  id: string
  label: string
  category: FurnitureCategory
  base: {
    parts?: ConfiguredPart[]
    gltfUrl?: string
    footprint: { w: number; d: number; h: number }
    price: number
  }
  slots: ProductSlot[]
  constraints?: SlotConstraint[]
}

/** The user selection (per-instance "recipe", serializable). */
export interface ConfiguredSpec {
  productId: string
  /** slotId → chosen option id, or null for an empty optional slot. */
  selections: Record<string, string | null>
}

/** Options offered for a slot after its `accepts` tag filter. */
export function offeredOptions(slot: ProductSlot): SlotOption[] {
  if (!slot.accepts || slot.accepts.length === 0) return slot.options
  const need = slot.accepts
  return slot.options.filter((o) => need.every((t) => (o.tags ?? []).includes(t)))
}

/** Resolve one slot's raw selection to a valid option id, or null when the slot
 *  is optional and the raw value is an explicit null. Unknown/absent → default. */
function resolveSlot(slot: ProductSlot, raw: string | null | undefined): string | null {
  const offered = offeredOptions(slot)
  const ids = new Set(offered.map((o) => o.id))
  if (raw === null) return slot.optional ? null : slot.defaultOptionId
  if (typeof raw === 'string' && ids.has(raw)) return raw
  // Default must itself still be offered; otherwise first offered, else null.
  if (ids.has(slot.defaultOptionId)) return slot.defaultOptionId
  return offered[0]?.id ?? (slot.optional ? null : slot.defaultOptionId)
}

/** Demote a slot to its default (or null when optional) — used by constraints. */
function demote(slot: ProductSlot): string | null {
  return slot.optional ? null : resolveSlot(slot, undefined)
}

/**
 * Turn arbitrary (user-mangled) input into a buildable spec. Never throws.
 * Every slot ends with a valid option id (or null on an optional slot), and all
 * constraints are satisfied — applied in declared order, **left wins** (the
 * earlier-declared slot keeps its selection; the later is demoted), matching the
 * deterministic discipline of `clampSpec`.
 */
export function clampConfig(
  product: ConfigurableProduct,
  raw: Partial<ConfiguredSpec> | null | undefined,
): ConfiguredSpec {
  const rawSel = (raw?.selections ?? {}) as Record<string, string | null | undefined>
  const slotById = new Map(product.slots.map((s) => [s.id, s]))
  const selections: Record<string, string | null> = {}
  for (const slot of product.slots) selections[slot.id] = resolveSlot(slot, rawSel[slot.id])

  for (const c of product.constraints ?? []) {
    if (c.kind === 'mutex') {
      // At most one of these slots filled; keep the earliest filled, empty/demote
      // the rest (in the order the slots are declared in the product).
      const ordered = product.slots.filter((s) => c.slots.includes(s.id))
      let kept = false
      for (const slot of ordered) {
        if (selections[slot.id] == null) continue
        if (!kept) {
          kept = true
        } else {
          selections[slot.id] = demote(slot)
        }
      }
    } else if (c.kind === 'requires') {
      if (selections[c.ifSlot] === c.ifOption) {
        const then = slotById.get(c.thenSlot)
        if (then && offeredOptions(then).some((o) => o.id === c.thenOption)) {
          selections[c.thenSlot] = c.thenOption
        }
      }
    } else if (c.kind === 'excludes') {
      if (
        selections[c.slot] === c.option &&
        selections[c.conflictsWith.slot] === c.conflictsWith.option
      ) {
        const other = slotById.get(c.conflictsWith.slot)
        if (other) selections[c.conflictsWith.slot] = demote(other)
      }
    }
  }
  return { productId: product.id, selections }
}

/** The chosen option object for a slot (after clamping), or null when empty. */
export function selectedOption(slot: ProductSlot, spec: ConfiguredSpec): SlotOption | null {
  const id = spec.selections[slot.id]
  if (id == null) return null
  return slot.options.find((o) => o.id === id) ?? null
}

/** A short human label for a configured product ("Mattress-on-frame · Foam 20 cm"). */
export function productLabel(product: ConfigurableProduct, spec: ConfiguredSpec): string {
  const filled = product.slots
    .map((s) => selectedOption(s, spec)?.label)
    .filter((l): l is string => !!l)
  return filled.length ? `${product.label} · ${filled.join(', ')}` : product.label
}
