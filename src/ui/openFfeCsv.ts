import { isFeatureEnabled } from '../features/featureFlags'
import { useStore } from '../state/store'

/** Build a CSV of the FF&E schedule (Furniture, Fixtures & Equipment — one row
 *  per item type per room, with source / SKU / size / qty / pricing + a grand-
 *  total footer) and trigger a browser download (Fohlio / Houzz / Programa "FF&E
 *  schedule" parity). Reuses the existing FF&E schedule data (no recomputed
 *  pricing or dimensions); prices are blanked when the budget feature is off, so
 *  size + quantity still export. The builders + catalog are dynamic-imported so
 *  they stay out of the boot bundle (a programmatic download needs no user-
 *  activation window, so the await-first order is safe). Mirrors
 *  `openRoomScheduleCsv.ts` / `openFurnitureCsv.ts`. */
export async function downloadFfeCsv(): Promise<void> {
  const s = useStore.getState()
  const [{ buildFfeSchedule }, { buildFfeCsv }, { buildMergedCatalog }] = await Promise.all([
    import('../ffe/ffeSchedule'),
    import('../export/ffeCsv'),
    import('../furniture/catalog'),
  ])
  const rows = buildFfeSchedule(s.floorPlan, s.items, buildMergedCatalog(s))
  const csv = buildFfeCsv(rows, s.units, { prices: isFeatureEnabled('budget') })
  // Prepend a UTF-8 BOM so Excel reads accented item names correctly.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safe = (s.floorPlan.name || 'ffe-schedule').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  a.download = `${safe}-ffe.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the click has consumed the blob URL.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
