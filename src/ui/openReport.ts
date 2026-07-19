import { buildMergedCatalog } from '../furniture/catalog'
import { useStore } from '../state/store'

/**
 * Build the printable design report from the live store and open it in a new
 * window for print / save-as-PDF. Captures the current canvas as the hero image
 * (skipped if tainted). Surfaces a notification when the pop-up is blocked.
 * Shared by the Tools menu, the mobile toolbar, and the Share modal so the
 * report logic lives in exactly one place.
 *
 * The window is opened synchronously (inside the click's user activation, so
 * pop-up blockers allow it) and the heavy report builder is dynamic-imported
 * afterwards — it stays out of the boot bundle (P-CHUNK).
 */
export async function openDesignReport(): Promise<void> {
  const s = useStore.getState()
  const win = window.open('', '_blank')
  if (!win) {
    s.notify.start({
      title: 'Report blocked',
      kind: 'error',
      message: 'Allow pop-ups for this site, then open the report again.',
    })
    return
  }
  const canvas = document.querySelector('canvas')
  let hero: string | null = null
  try {
    hero = canvas ? canvas.toDataURL('image/png') : null
  } catch {
    hero = null // tainted canvas — skip the image
  }
  let html: string
  try {
    const { buildReportHtml } = await import('./report')
    html = buildReportHtml(
      s.floorPlan,
      s.items,
      buildMergedCatalog(s),
      hero,
      s.units,
      s.finishes,
      s.designNote,
      s.annotations,
      s.budgetTarget,
      s.baselinePlan,
      s.priceRules,
      s.petTypes,
      s.keyCollectionDate,
    )
  } catch {
    win.close()
    s.notify.start({
      title: 'Report failed',
      kind: 'error',
      message: 'Could not load the report builder — check your connection and try again.',
    })
    return
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}
