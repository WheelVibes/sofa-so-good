import { buildMergedCatalog } from '../furniture/catalog'
import { useStore } from '../state/store'
import { buildReportHtml } from './report'

/**
 * Build the printable design report from the live store and open it in a new
 * window for print / save-as-PDF. Captures the current canvas as the hero image
 * (skipped if tainted). Surfaces a notification when the pop-up is blocked.
 * Shared by the Tools menu, the mobile toolbar, and the Share modal so the
 * report logic lives in exactly one place.
 */
export function openDesignReport(): void {
  const s = useStore.getState()
  const canvas = document.querySelector('canvas')
  let hero: string | null = null
  try {
    hero = canvas ? canvas.toDataURL('image/png') : null
  } catch {
    hero = null // tainted canvas — skip the image
  }
  const html = buildReportHtml(
    s.floorPlan,
    s.items,
    buildMergedCatalog(s),
    hero,
    s.units,
    s.finishes,
    s.designNote,
    s.annotations,
  )
  const win = window.open('', '_blank')
  if (!win) {
    s.notify.start({
      title: 'Report blocked',
      kind: 'error',
      message: 'Allow pop-ups for this site, then open the report again.',
    })
    return
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}
