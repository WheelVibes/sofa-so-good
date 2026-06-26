import { useStore } from '../state/store'

/** Build an iCalendar (.ics) of the estimated renovation timeline and trigger a
 *  browser download, so a homeowner can drop the reno phases into their
 *  calendar. The schedule starts today (the move-in / works start date is
 *  sourced here, at the call site, keeping the `renoIcs` builder pure). The
 *  timeline + builder are dynamic-imported so they stay out of the boot bundle
 *  (a programmatic download needs no user-activation window, so the await-first
 *  order is safe). Mirrors `openFurnitureCsv.ts`. */
export async function downloadRenoIcs(): Promise<void> {
  const s = useStore.getState()
  const [{ buildRenoTimeline }, { buildRenoIcs }] = await Promise.all([
    import('../analysis/renoTimeline'),
    import('../export/renoIcs'),
  ])
  const { phases } = buildRenoTimeline(s.floorPlan)
  if (phases.length === 0) {
    s.notify.start({
      title: 'No renovation phases',
      kind: 'info',
      message: 'This plan has no estimated reno phases to export.',
    })
    return
  }
  // Start the schedule today (the clock lives here, not in the pure builder).
  const ics = buildRenoIcs(phases, new Date())
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safe = (s.floorPlan.name || 'renovation').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  a.download = `${safe}-timeline.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the click has consumed the blob URL.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
