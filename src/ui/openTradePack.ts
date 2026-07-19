import { isFeatureEnabled } from '../features/featureFlags'
import type { ElectricalPoint } from '../floorplan/electricalPlan'
import type { PlumbingPoint } from '../floorplan/plumbingPlan'
import type { PlanElectricalPoint, PlanPlumbingPoint } from '../floorplan/types'
import { buildMergedCatalog } from '../furniture/catalog'
import { deriveElectricalPoints, derivePlumbingPoints } from '../furniture/mepSuggest'
import { useStore } from '../state/store'
import type { TradePackId } from './tradePacks'

/** Drop the persisted id (the sheet builder's point shape has no `id`) but keep
 *  everything else, including the authored mount height (mirrors
 *  `openDrawingSet.ts`). */
function toElectricalPoint(p: PlanElectricalPoint): ElectricalPoint {
  const { id: _id, ...rest } = p
  return rest
}
function toPlumbingPoint(p: PlanPlumbingPoint): PlumbingPoint {
  const { id: _id, ...rest } = p
  return rest
}

/**
 * Build one per-trade handover pack (BSJ-5) from the live store and open it in a
 * new window for print / save-as-PDF. Mirrors `openDrawingSet` exactly — same
 * synchronous `window.open` (inside the click's user activation) + dynamic
 * import of the builder (keeps it out of the boot bundle), same pop-up-blocked
 * notification, same persisted-preferred / heuristic-fallback MEP routing.
 */
export async function openTradePack(id: TradePackId): Promise<void> {
  const s = useStore.getState()
  const win = window.open('', '_blank')
  if (!win) {
    s.notify.start({
      title: 'Trade pack blocked',
      kind: 'error',
      message: 'Allow pop-ups for this site, then open the trade pack again.',
    })
    return
  }
  let html: string
  try {
    const { buildTradePack } = await import('./tradePacks')
    const catalog = buildMergedCatalog(s)
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
    html = buildTradePack(id, {
      plan: s.floorPlan,
      items: s.items,
      catalog,
      units: s.units,
      baselinePlan: s.baselinePlan,
      electrical,
      plumbing,
      finishes: s.finishes,
      template: s.drawingSetTemplate,
      orientationDeg: s.orientationDeg,
      showSettingOut: isFeatureEnabled('settingOutDims'),
      showCarpentry: isFeatureEnabled('carpentrySheets'),
      showRcp: isFeatureEnabled('rcpSheet'),
    }).html
  } catch {
    win.close()
    s.notify.start({
      title: 'Trade pack failed',
      kind: 'error',
      message: 'Could not load the trade-pack builder — check your connection and try again.',
    })
    return
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}
