import { buildMergedCatalog } from '../furniture/catalog'
import { useStore } from '../state/store'

/** Build a DXF of the active floor plan and trigger a download — a CAD-handoff
 *  export (RoomSketcher/Cedreo parity, plus furniture footprints/labels,
 *  auto-dimensions and opening-schedule marks for a fabricator handoff — TODO
 *  G6, plus a DEMOLITION/NEW_WORKS layer diffed against the as-loaded
 *  baseline plan when walls changed — TODO H5). Pure browser download, no
 *  backend. The DXF builder is dynamic-imported
 *  so it stays out of the boot bundle (P-CHUNK); a programmatic download needs
 *  no user-activation window, so the await-first order is safe. */
export async function downloadPlanDxf(): Promise<void> {
  const s = useStore.getState()
  const plan = s.floorPlan
  const { planToDxf } = await import('../export/dxf')
  const catalog = buildMergedCatalog(s)
  const dxf = planToDxf(plan, s.items, catalog, s.units, s.baselinePlan)
  const blob = new Blob([dxf], { type: 'application/dxf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safe = (plan.name || 'floor-plan').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  a.download = `${safe}.dxf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the click has consumed the blob URL.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
