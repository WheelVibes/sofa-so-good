import { isFeatureEnabled } from '../features/featureFlags'
import type { ElectricalPoint } from '../floorplan/electricalPlan'
import type { PlumbingPoint } from '../floorplan/plumbingPlan'
import type { PlanElectricalPoint, PlanPlumbingPoint } from '../floorplan/types'
import { buildMergedCatalog } from '../furniture/catalog'
import { deriveElectricalPoints, derivePlumbingPoints } from '../furniture/mepSuggest'
import { useStore } from '../state/store'

/** Drop the persisted id (the sheet builder's `ElectricalPoint`/`PlumbingPoint`
 *  shape has no `id` field) but keep everything else, including the authored
 *  `mountHeightMm` the sheet prints as an "@mm" suffix (MEP layer, G1 PR5). */
function toElectricalPoint(p: PlanElectricalPoint): ElectricalPoint {
  const { id: _id, ...rest } = p
  return rest
}
function toPlumbingPoint(p: PlanPlumbingPoint): PlumbingPoint {
  const { id: _id, ...rest } = p
  return rest
}

/**
 * Build the multi-sheet drawing set from the live store and open it in a new
 * window for print / save-as-PDF. Mirrors `openDesignReport`; surfaces a
 * notification when the pop-up is blocked.
 *
 * The window is opened synchronously (inside the click's user activation) and
 * the sheet builder is dynamic-imported afterwards — it stays out of the boot
 * bundle (P-CHUNK).
 */
export async function openDrawingSet(): Promise<void> {
  const s = useStore.getState()
  const win = window.open('', '_blank')
  if (!win) {
    s.notify.start({
      title: 'Drawing set blocked',
      kind: 'error',
      message: 'Allow pop-ups for this site, then open the drawing set again.',
    })
    return
  }
  let html: string
  try {
    const { buildDrawingSetHtml } = await import('./drawingSet')
    const catalog = buildMergedCatalog(s)
    // Prefer the user's own persisted MEP points (MEP layer, G1 PR5 — "as
    // designed", real authored mount heights) over the furniture-layout
    // heuristic; fall back to the heuristic only when nothing's been
    // authored yet. Still gated by the `electricalPlan`/`plumbingPlan` sheet
    // flags either way (one derivation source either way — `mepSuggest.ts`).
    const persistedElectrical = s.floorPlan.electricalPoints ?? []
    const electrical = isFeatureEnabled('electricalPlan')
      ? persistedElectrical.length > 0
        ? { points: persistedElectrical.map(toElectricalPoint), source: 'persisted' as const }
        : {
            points: deriveElectricalPoints(s.floorPlan, s.items, catalog),
            source: 'heuristic' as const,
          }
      : undefined
    const persistedPlumbing = s.floorPlan.plumbingPoints ?? []
    const plumbing = isFeatureEnabled('plumbingPlan')
      ? persistedPlumbing.length > 0
        ? { points: persistedPlumbing.map(toPlumbingPoint), source: 'persisted' as const }
        : { points: derivePlumbingPoints(s.items, catalog), source: 'heuristic' as const }
      : undefined
    html = buildDrawingSetHtml(
      s.floorPlan,
      s.items,
      catalog,
      s.units,
      s.baselinePlan,
      electrical,
      plumbing,
      s.finishes,
      s.drawingLayers,
      s.drawingCallouts.length ? s.drawingCallouts : undefined,
      s.drawingSetTemplate,
      s.orientationDeg,
    )
  } catch {
    win.close()
    s.notify.start({
      title: 'Drawing set failed',
      kind: 'error',
      message: 'Could not load the drawing-set builder — check your connection and try again.',
    })
    return
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}
