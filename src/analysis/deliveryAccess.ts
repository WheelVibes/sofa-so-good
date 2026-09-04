/**
 * Delivery-access check — can the furniture physically GET to the room?
 *
 * A designer checks this before anything is ordered, and it is the one fit
 * question the app never asked. `analysis/accessibility.ts` checks a door is
 * wide enough for a PERSON (0.85 m wheelchair clearance) and
 * `catalog/roomFit.ts` checks a piece fits the ROOM once it is in there — but
 * nothing checked the route between the lorry and the room. A sofa that fits
 * the living room perfectly and cannot clear the lift door is a real, expensive
 * and very common failure: the SG furniture guides lead with it.
 *
 * **The geometric rule.** A rectangular box passes a rectangular aperture when
 * its two SMALLEST dimensions both fit the aperture's two dimensions — you can
 * always orient the box to present its smallest face. So each item's three
 * dimensions are sorted and the two smallest are compared against each
 * constraint's sorted pair.
 *
 * That is deliberately slightly CONSERVATIVE: experienced movers gain a little
 * by tilting a piece diagonally through an opening (the guides describe exactly
 * this for sofas up to ~0.9 m seat depth), which this does not model. A check
 * that occasionally warns about a piece a skilled crew could squeeze in is the
 * right direction of error for a warning; the reverse would let someone order a
 * sofa that has to go back.
 *
 * **It assumes the piece is delivered ASSEMBLED, and that is the big caveat.**
 * The bounding box checked is the built object. Plenty of furniture ships
 * flat-packed or knock-down — a wardrobe delivered as panels clears any
 * doorway — and the guides note that a sofa too deep for the lift "may need to
 * be dismantled for delivery". So a finding here is not "this cannot be
 * delivered"; it is "this cannot be carried in assembled, so measure your
 * actual lift or confirm it ships knock-down". The finding text says exactly
 * that, because a check that reads as a verdict when it is really a prompt
 * would get ignored after the second false alarm.
 *
 * **Defaults are a starting point, not a fact.** The sources are explicit that
 * HDB lift dimensions "vary by block, so the safest answer is to measure your
 * actual lift", and that "even a difference of 5 to 10 centimeters can determine
 * whether a large item fits". So {@link SG_DEFAULT_ROUTE} is overridable per
 * field and {@link ACCESS_SCOPE_NOTE} says to measure. Thresholds and their
 * provenance: `docs/research/2026-09-02-delivery-access-standards.md`.
 *
 * Pure (no store, no three, no DOM) → unit-testable directly.
 */

import { itemHeight } from '../elevation/projectElevation'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'

/** One aperture or passage on the delivery route. All metres. */
export interface AccessConstraint {
  id: string
  label: string
  /** Clear width of the aperture. */
  widthM: number
  /** Clear height of the aperture. `Infinity` for a passage with no headroom
   *  limit (a corridor's width is what governs, not its ceiling). */
  heightM: number
}

/**
 * Typical Singapore HDB route. Every figure is a published typical, NOT a
 * measurement of the user's block — see the module header.
 */
export const SG_DEFAULT_ROUTE: AccessConstraint[] = [
  // "Many HDB lift door openings are around 0.8 m wide, though more specific
  // measurements show lift door openings of approximately 90 cm wide and 209 cm
  // tall." The narrower figure is used, since a warning should assume the
  // tighter common case.
  { id: 'lift-door', label: 'Lift door opening', widthM: 0.8, heightM: 2.09 },
  // "The standard HDB lift is roughly 100 cm wide and 130-150 cm deep." The
  // cabin governs the LONGEST dimension a piece can carry standing up, so its
  // depth is treated as the aperture height here (a piece can stand on end).
  { id: 'lift-cabin', label: 'Lift cabin', widthM: 1.0, heightM: 2.34 },
  // "Doorway widths in HDB flats are typically 80 to 90 centimetres for bedroom
  // doors and 80 to 85 centimetres for the main entrance door."
  { id: 'main-door', label: 'Main entrance door', widthM: 0.8, heightM: 2.1 },
]

/**
 * The route to check: published Singapore typicals, with the user's own
 * measurements applied where they have recorded any (`plan.deliveryRoute`).
 *
 * Overrides are applied per DIMENSION, not per aperture, so recording just the
 * lift door's width leaves its height — and every other aperture — on the
 * published figure. That matters because the sources are emphatic that a 5-10 cm
 * difference decides whether a large piece fits, and someone measuring on site
 * arrives at numbers one at a time.
 *
 * An override of a non-positive or non-finite value is IGNORED rather than
 * trusted: a route dimension of 0 would silently block every piece and read as a
 * catalogue-wide fault rather than as bad input. The zod schema rejects those on
 * load, so this only guards a live edit.
 */
export function resolveDeliveryRoute(
  overrides: Record<string, { widthM?: number; heightM?: number }> | undefined,
  base: AccessConstraint[] = SG_DEFAULT_ROUTE,
): AccessConstraint[] {
  if (!overrides) return base
  const usable = (v: number | undefined): v is number => Number.isFinite(v) && (v as number) > 0
  let changed = false
  const next = base.map((c) => {
    const o = overrides[c.id]
    if (!o) return c
    const widthM = usable(o.widthM) ? o.widthM : c.widthM
    const heightM = usable(o.heightM) ? o.heightM : c.heightM
    if (widthM === c.widthM && heightM === c.heightM) return c
    changed = true
    return { ...c, widthM, heightM }
  })
  // Return `base` ITSELF when nothing moved, so reference identity answers "is
  // this route measured or typical?" — see `hasMeasuredRoute`. An override map
  // that exists but matches the typicals is not a measured route.
  return changed ? next : base
}

/** True when any aperture is running on the user's own figure rather than a typical. */
export function hasMeasuredRoute(
  overrides: Record<string, { widthM?: number; heightM?: number }> | undefined,
): boolean {
  return resolveDeliveryRoute(overrides) !== SG_DEFAULT_ROUTE
}

export const ACCESS_SCOPE_NOTE =
  'Route dimensions default to published Singapore typicals. HDB lift and corridor sizes vary by block and a 5-10 cm difference decides whether a large piece fits, so measure your actual lift, corridor turn and doorways and adjust these before ordering. The check assumes a piece is carried on its smallest face and does not model tilting it diagonally, so it errs toward warning.'

interface AccessFinding {
  itemId: string
  defId: string
  label: string
  /** The item's three dimensions, sorted ascending (m). */
  dimsM: [number, number, number]
  /** Constraints this item cannot pass, worst first. */
  blockedBy: { id: string; label: string; widthM: number; heightM: number }[]
  /** What to actually do about it — phrased as a prompt, not a verdict. */
  action: string
}

export interface DeliveryAccessResult {
  /** Items that cannot pass at least one constraint. */
  findings: AccessFinding[]
  /** How many distinct items were checked (those with resolvable dimensions). */
  checked: number
  /** True when nothing is blocked — also true when nothing was checkable, so
   *  read it with `checked`. */
  allClear: boolean
  scopeNote: string
}

/** Does a box with sorted dims pass an aperture of `w` x `h`? */
function passes(sorted: [number, number, number], w: number, h: number): boolean {
  // The two smallest dimensions must fit the aperture's two dimensions; try
  // both orientations of the box face against the aperture.
  const [a, b] = [sorted[0], sorted[1]]
  const [aw, ah] = w <= h ? [w, h] : [h, w]
  const [ba, bb] = a <= b ? [a, b] : [b, a]
  return ba <= aw && bb <= ah
}

/**
 * Check every placed item against the delivery route.
 *
 * Items with no resolvable footprint are skipped (not reported as passing) —
 * `checked` says how many were actually assessed, so "all clear" can never be
 * mistaken for "nothing was looked at".
 */
export function buildDeliveryAccess(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  route: AccessConstraint[] = SG_DEFAULT_ROUTE,
): DeliveryAccessResult {
  const findings: AccessFinding[] = []
  let checked = 0
  // One finding per DEF, not per placement: four identical dining chairs that
  // cannot fit is one problem to solve, not four.
  const seen = new Set<string>()

  for (const it of items) {
    const def = defs[it.defId]
    if (!def?.defaultFootprint) continue
    const w = def.defaultFootprint.w
    const d = def.defaultFootprint.d
    const h = itemHeight(it, def)
    if (!(w > 0) || !(d > 0) || !(h > 0)) continue
    if (seen.has(it.defId)) continue
    seen.add(it.defId)
    checked += 1

    const sorted = [w, d, h].sort((x, y) => x - y) as [number, number, number]
    const blockedBy = route
      .filter((c) => !passes(sorted, c.widthM, c.heightM))
      .map((c) => ({ id: c.id, label: c.label, widthM: c.widthM, heightM: c.heightM }))
      // Tightest constraint first — that is the one to solve.
      .sort((a, b) => Math.min(a.widthM, a.heightM) - Math.min(b.widthM, b.heightM))

    if (blockedBy.length > 0) {
      const tightest = blockedBy[0]!
      findings.push({
        itemId: it.id,
        defId: it.defId,
        label: it.label?.trim() || def.name || it.defId,
        dimsM: sorted,
        blockedBy,
        action:
          `Needs ${sorted[0].toFixed(2)} x ${sorted[1].toFixed(2)} m clear on its smallest face, ` +
          `against ${tightest.label} at ${tightest.widthM.toFixed(2)} x ${tightest.heightM === Number.POSITIVE_INFINITY ? '∞' : tightest.heightM.toFixed(2)} m. ` +
          `Measure your actual ${tightest.label.toLowerCase()}, or confirm it ships knock-down.`,
      })
    }
  }

  return {
    findings,
    checked,
    allClear: findings.length === 0,
    scopeNote: ACCESS_SCOPE_NOTE,
  }
}
