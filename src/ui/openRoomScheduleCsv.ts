import { useStore } from '../state/store'

/** Build a CSV of the room schedule (one row per room across all storeys —
 *  area / perimeter / floor + wall finish / ceiling height + a grand-total
 *  footer) and trigger a browser download (Coohom / SH3D "room schedule"
 *  parity). Reuses the plan geometry + finish resolvers; no recomputed pricing.
 *  The builder + material catalog are dynamic-imported so they stay out of the
 *  boot bundle (a programmatic download needs no user-activation window, so the
 *  await-first order is safe). Mirrors `openFurnitureCsv.ts`. */
export async function downloadRoomScheduleCsv(): Promise<void> {
  const s = useStore.getState()
  const [{ buildRoomScheduleCsv }, { BUILTIN_MATERIALS }] = await Promise.all([
    import('../export/roomScheduleCsv'),
    import('../materials/builtinCatalog'),
  ])
  const nameOf = (id: string) => BUILTIN_MATERIALS[id]?.name ?? id
  const csv = buildRoomScheduleCsv(s.floorPlan, s.finishes, nameOf, s.units)
  // Prepend a UTF-8 BOM so Excel reads accented room / finish names correctly.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safe = (s.floorPlan.name || 'room-schedule').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  a.download = `${safe}-rooms.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the click has consumed the blob URL.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
