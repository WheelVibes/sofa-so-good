import { planToDxf } from '../export/dxf'
import { useStore } from '../state/store'

/** Build a DXF of the active floor plan and trigger a download — a CAD-handoff
 *  export (RoomSketcher/Cedreo parity). Pure browser download, no backend. */
export function downloadPlanDxf(): void {
  const plan = useStore.getState().floorPlan
  const dxf = planToDxf(plan)
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
