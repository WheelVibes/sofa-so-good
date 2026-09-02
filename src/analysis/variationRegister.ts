/**
 * Variation register — what changed since the design was priced, and what it costs.
 *
 * **The gap this closes.** A professional administering a renovation has to
 * account for the delta between what was PRICED and what is now being built. In
 * Singapore that is exactly where disputes land: the contractor quoted from one
 * drawing revision, the tiling or the carpentry changed afterwards, and nobody
 * wrote down the difference. The app had every part of the cost model and no way
 * to compare two states of it.
 *
 * A register is a per-trade diff of two `RenoAllocation`s: the one computed from
 * the captured **as-tendered** snapshot, and the one computed from the design as
 * it stands. Each trade line is `added`, `omitted`, `changed` or unchanged, and
 * the register's total is the sum of the deltas — which is the figure a
 * variation order carries.
 *
 * **Why it diffs ALLOCATIONS rather than designs.** A design diff ("this wall
 * moved") cannot be priced without re-running the whole cost model anyway, and
 * two designs can differ in ways that cost nothing. Diffing the priced output
 * means every line in the register has a number attached by construction, and
 * the register can never disagree with the budget it came from — the same
 * reason `paintQuantities.ts` consumes the finish schedule instead of
 * re-deriving areas.
 *
 * **What it is NOT.** Not a quotation and not a contract instrument: the rates
 * are the app's indicative SG rate card, not a contractor's priced schedule, and
 * the register says so. Its use is to make the change VISIBLE and approximately
 * sized before someone is asked to price it properly.
 *
 * Pure (no store, no three, no DOM).
 */

import type { RenoAllocation, RenoTradeLine } from './renovationAllocator'

export type VariationKind = 'added' | 'omitted' | 'changed'

export interface VariationLine {
  /** Trade id, stable across both allocations. */
  id: string
  label: string
  kind: VariationKind
  unit: RenoTradeLine['unit']
  /** Quantity as tendered (0 for an added trade). */
  quantityBefore: number
  /** Quantity as it stands (0 for an omitted trade). */
  quantityAfter: number
  /** Subtotal as tendered (SGD). */
  subtotalBefore: number
  /** Subtotal as it stands (SGD). */
  subtotalAfter: number
  /** `subtotalAfter − subtotalBefore` — positive is an addition to the price. */
  deltaSgd: number
  stage: string
}

export interface VariationRegister {
  lines: VariationLine[]
  /** Sum of every line's delta (SGD). Positive = the design now costs more. */
  netSgd: number
  /** Sum of the positive deltas only — what is being ADDED. */
  addedSgd: number
  /** Sum of the negative deltas only (as a negative number) — what is OMITTED. */
  omittedSgd: number
  /** True when nothing has changed since the snapshot. */
  unchanged: boolean
  /** Printed alongside the table. */
  note: string
}

/** Deltas smaller than this (SGD) are treated as no change — floating-point
 *  noise from re-deriving areas, not a variation anyone should be told about. */
export const VARIATION_EPSILON_SGD = 0.5

export const VARIATION_NOTE =
  'Priced with the app’s indicative SG rate card, not a contractor’s schedule — this register ' +
  'exists to make a change visible and approximately sized, not to price it. Quantities are ' +
  're-derived from each state of the design, so a line can change because the design changed OR ' +
  'because the rate card did. Have any variation priced properly before it is instructed.'

const round = (v: number) => Math.round(v * 100) / 100

/**
 * Compare a tendered allocation against the current one.
 *
 * Trades absent from one side are reported as `added`/`omitted` rather than
 * silently skipped — an omitted trade is a CREDIT and is exactly the kind of
 * thing that goes unclaimed. Lines are sorted by absolute delta, largest first:
 * the biggest money is the thing to look at.
 */
export function buildVariationRegister(
  tendered: RenoAllocation,
  current: RenoAllocation,
): VariationRegister {
  const before = new Map((tendered?.lines ?? []).map((l) => [l.id, l]))
  const after = new Map((current?.lines ?? []).map((l) => [l.id, l]))
  const ids = [...new Set([...before.keys(), ...after.keys()])]

  const lines: VariationLine[] = []
  for (const id of ids) {
    const b = before.get(id)
    const a = after.get(id)
    const subtotalBefore = b?.subtotal ?? 0
    const subtotalAfter = a?.subtotal ?? 0
    const delta = subtotalAfter - subtotalBefore
    if (Math.abs(delta) < VARIATION_EPSILON_SGD) continue
    const kind: VariationKind = !b ? 'added' : !a ? 'omitted' : 'changed'
    lines.push({
      id,
      label: a?.label ?? b?.label ?? id,
      kind,
      unit: a?.unit ?? b?.unit ?? 'no.',
      quantityBefore: b?.quantity ?? 0,
      quantityAfter: a?.quantity ?? 0,
      subtotalBefore: round(subtotalBefore),
      subtotalAfter: round(subtotalAfter),
      deltaSgd: round(delta),
      stage: a?.stage ?? b?.stage ?? '',
    })
  }

  lines.sort(
    (x, y) => Math.abs(y.deltaSgd) - Math.abs(x.deltaSgd) || x.label.localeCompare(y.label),
  )

  const addedSgd = round(lines.reduce((s, l) => s + Math.max(0, l.deltaSgd), 0))
  const omittedSgd = round(lines.reduce((s, l) => s + Math.min(0, l.deltaSgd), 0))
  return {
    lines,
    netSgd: round(addedSgd + omittedSgd),
    addedSgd,
    omittedSgd,
    unchanged: lines.length === 0,
    note: VARIATION_NOTE,
  }
}
