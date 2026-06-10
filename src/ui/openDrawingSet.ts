import { buildMergedCatalog } from '../furniture/catalog'
import { useStore } from '../state/store'
import { buildDrawingSetHtml } from './drawingSet'

/**
 * Build the multi-sheet drawing set from the live store and open it in a new
 * window for print / save-as-PDF. Mirrors `openDesignReport`; surfaces a
 * notification when the pop-up is blocked.
 */
export function openDrawingSet(): void {
  const s = useStore.getState()
  const html = buildDrawingSetHtml(
    s.floorPlan,
    s.items,
    buildMergedCatalog(s),
    s.units,
    s.baselinePlan,
  )
  const win = window.open('', '_blank')
  if (!win) {
    s.notify.start({
      title: 'Drawing set blocked',
      kind: 'error',
      message: 'Allow pop-ups for this site, then open the drawing set again.',
    })
    return
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}
