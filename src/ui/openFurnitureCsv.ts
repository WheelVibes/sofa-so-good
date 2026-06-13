import { useStore } from '../state/store'

/** Build a CSV of the furniture list (FF&E schedule) and trigger a browser
 *  download — Sweet Home 3D parity ("export furniture list to CSV"). Reuses the
 *  existing FF&E schedule data (no recomputed pricing). The builders are
 *  dynamic-imported so they stay out of the boot bundle (a programmatic download
 *  needs no user-activation window, so the await-first order is safe). */
export async function downloadFurnitureCsv(): Promise<void> {
  const s = useStore.getState()
  const [{ buildFfeSchedule }, { buildFurnitureCsv }, { buildMergedCatalog }] = await Promise.all([
    import('../ffe/ffeSchedule'),
    import('./furnitureCsv'),
    import('../furniture/catalog'),
  ])
  const rows = buildFfeSchedule(s.floorPlan, s.items, buildMergedCatalog(s))
  const csv = buildFurnitureCsv(rows)
  // Prepend a UTF-8 BOM so Excel reads accented item names correctly.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safe = (s.floorPlan.name || 'furniture-list').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  a.download = `${safe}-furniture.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the click has consumed the blob URL.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
