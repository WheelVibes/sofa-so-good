import { allPlanRooms } from '../floorplan/levels'
import { isDefaultPlan } from '../floorplan/planGeometry'
import type { FloorPlan } from '../floorplan/types'
import { useStore } from '../state/store'

/** Floor/wall finish maps for the active plan: the store finishes for the
 *  default flat, else each custom room's own `floor`/`walls`. Matches how
 *  `openBoq` resolves finishes so the cost breakdown prices identically. */
function finishMaps(plan: FloorPlan): {
  floor: Record<string, string>
  walls: Record<string, string>
} {
  const s = useStore.getState()
  if (isDefaultPlan(plan)) {
    return {
      floor: s.finishes.floor as Record<string, string>,
      walls: s.finishes.walls as Record<string, string>,
    }
  }
  const floor: Record<string, string> = {}
  const walls: Record<string, string> = {}
  for (const r of allPlanRooms(plan)) {
    if (r.floor) floor[r.id] = r.floor
    if (r.wall) walls[r.id] = r.wall
  }
  return { floor, walls }
}

/** Build the combined cost-breakdown CSV (furniture-by-category + finishes /
 *  renovation lines + a reconciling grand total) and trigger a browser download.
 *  Reuses the live budget price model + the renovation rate estimate (no
 *  recomputed pricing). Builder + material catalog are dynamic-imported so they
 *  stay out of the boot bundle (a programmatic download needs no user-activation
 *  window, so the await-first order is safe). Mirrors `openFurnitureCsv.ts`. */
export async function downloadCostBreakdownCsv(): Promise<void> {
  const s = useStore.getState()
  const [{ buildCostBreakdownCsv }, { buildMergedCatalog }, { BUILTIN_MATERIALS }] =
    await Promise.all([
      import('../export/costBreakdownCsv'),
      import('../furniture/catalog'),
      import('../materials/builtinCatalog'),
    ])
  const nameOf = (id: string) => BUILTIN_MATERIALS[id]?.name ?? id
  const csv = buildCostBreakdownCsv(
    s.floorPlan,
    s.items,
    buildMergedCatalog(s),
    finishMaps(s.floorPlan),
    nameOf,
    s.units,
    s.priceRules,
  )
  // Prepend a UTF-8 BOM so Excel reads accented item / finish names correctly.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safe = (s.floorPlan.name || 'costs').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  a.download = `${safe}-costs.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the click has consumed the blob URL.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
