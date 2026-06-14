import { useStore } from '../state/store'

/** Build the bill of quantities and download it as an Excel `.xlsx` workbook
 *  (PARITY-QUOTEXLSX) — the spreadsheet deliverable contractors/clients expect.
 *  Reuses the same `assembleBoqInput` as the HTML quote so the two price
 *  identically. Builders are dynamic-imported (out of the boot bundle); a
 *  programmatic download needs no user-activation window. */
export async function downloadBoqXlsx(): Promise<void> {
  const s = useStore.getState()
  const [{ buildBoq }, { boqToXlsx }, { assembleBoqInput }] = await Promise.all([
    import('../export/boq'),
    import('../export/boqXlsx'),
    import('./openBoq'),
  ])
  const boq = buildBoq(await assembleBoqInput())
  const bytes = boqToXlsx(boq)
  const blob = new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safe = (s.floorPlan.name || 'quote').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  a.download = `${safe}-quote.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
