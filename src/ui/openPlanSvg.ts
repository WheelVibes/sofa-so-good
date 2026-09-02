import { buildMergedCatalog } from '../furniture/catalog'
import { useStore } from '../state/store'
import { planFootprints } from './planFootprints'

/** Build a vector SVG of the active floor plan (furnished, with pinned
 *  dimension annotations) and trigger a browser download — the vector sibling of
 *  the DXF export (Sweet Home 3D parity). Reuses the shared `reportPlanSvg`
 *  renderer (never re-implements it); furniture footprints come from the shared
 *  `planFootprints` resolver so the SVG reads as a furnished layout. The renderers are
 *  dynamic-imported so they stay out of the boot bundle; a programmatic download
 *  needs no user-activation window, so the await-first order is safe. */
export async function downloadPlanSvg(): Promise<void> {
  const s = useStore.getState()
  const [{ reportPlanSvg }, { buildPlanSvgDocument }] = await Promise.all([
    import('./reportPlanSvg'),
    import('./planSvgExport'),
  ])
  const catalog = buildMergedCatalog(s)
  // Top-down footprints — the same shared, shape-aware resolver the report plan
  // diagram and the drawing set read from.
  const footprints = planFootprints(s.items, catalog)
  const inner = reportPlanSvg(s.floorPlan, s.annotations, s.units, footprints)
  const doc = buildPlanSvgDocument(inner)
  if (!doc) {
    s.notify.start({
      title: 'No plan to export',
      kind: 'error',
      message: 'Draw or open a floor plan first, then export the SVG.',
    })
    return
  }
  const blob = new Blob([doc], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safe = (s.floorPlan.name || 'floor-plan').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  a.download = `${safe}.svg`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the click has consumed the blob URL.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
