/**
 * CATALOG-COMPARE — pure data + selection logic for the side-by-side catalog
 * item comparison tray (UX-research round 2 pick #3). No React/DOM here so the
 * dims/area/price formatting and the select-for-compare cap/category rules are
 * unit-testable in isolation; `CatalogCompareTray.tsx` renders this data.
 */
import { itemFitsRoom, type RoomFitLevel, type RoomFreeRect } from '../../catalog/roomFit'
import { itemPrice } from '../../furniture/furniturePrices'
import type { FurnitureDef } from '../../furniture/types'
import { formatArea, formatDims, type UnitSystem } from '../../utils/measurement'

/** Compare tray caps at 3 columns — more than that stops being scannable
 *  side-by-side (Coohom/Planner 5D both cap at 3). */
export const COMPARE_MAX = 3

/** One column's worth of derived, display-ready comparison data. */
export interface CompareRow {
  id: string
  name: string
  /** "1.80 × 0.90 m" (or imperial) footprint width × depth. */
  dimsLabel: string
  /** Footprint height in metres (raw — the caller formats/rounds for display). */
  height: number
  /** Footprint area in m² (raw). */
  area: number
  /** "1.6 m²" (or imperial) formatted footprint area. */
  areaLabel: string
  /** Estimated price (SGD), or `null` when prices aren't shown (budget feature
   *  off) — the row is omitted entirely by the caller in that case. */
  price: number | null
  /** "fits" / "tight" / "wont-fit" — 'unknown' when no room is being edited
   *  (or the fit flag is off), which the caller renders as a dash, never a
   *  false verdict. */
  fit: RoomFitLevel
}

/** Build one comparison column's data for a def. Pure — same inputs, same
 *  output; no store/hook access so tests can call it directly. */
export function buildCompareRow(
  def: FurnitureDef,
  opts: {
    units?: UnitSystem
    /** Free-space rects of the room being edited, or `null`/`undefined` when
     *  none is active — resolves to a 'unknown' fit verdict either way. */
    roomRects?: RoomFreeRect[] | null
    /** Whether prices are shown at all (the `budget` feature flag) — `false`
     *  omits the price from the row (`null`) rather than showing an estimate
     *  the rest of the app currently hides. */
    priceOn?: boolean
  } = {},
): CompareRow {
  const { units = 'metric', roomRects = null, priceOn = false } = opts
  const { w, d, h } = def.defaultFootprint
  return {
    id: def.id,
    name: def.name,
    dimsLabel: formatDims(w, d, units),
    height: h,
    area: w * d,
    areaLabel: formatArea(w * d, units),
    price: priceOn ? itemPrice(def, def.category) : null,
    fit: itemFitsRoom(def.defaultFootprint, roomRects),
  }
}

/**
 * Toggle a def into/out of the compare selection.
 * - Already selected → deselect (remove it).
 * - Selecting from a DIFFERENT category than the current selection → the
 *   comparison only makes sense within one category (comparing a sofa's
 *   footprint against a wardrobe's is meaningless), so this starts a fresh
 *   selection with just the newly-tapped item rather than silently blocking
 *   the tap or mixing categories.
 * - At the {@link COMPARE_MAX} cap → ignored (no-op) so a 4th tap doesn't
 *   bump an earlier pick a user may still want.
 */
export function toggleCompareSelection(
  selected: FurnitureDef[],
  def: FurnitureDef,
  max = COMPARE_MAX,
): FurnitureDef[] {
  const already = selected.some((d) => d.id === def.id)
  if (already) return selected.filter((d) => d.id !== def.id)
  if (selected.length > 0 && selected[0].category !== def.category) return [def]
  if (selected.length >= max) return selected
  return [...selected, def]
}
