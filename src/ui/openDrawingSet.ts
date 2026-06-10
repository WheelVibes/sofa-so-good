import { isFeatureEnabled } from '../features/featureFlags'
import type { ElectricalPoint } from '../floorplan/electricalPlan'
import type { FloorPlan } from '../floorplan/types'
import { wallLength } from '../floorplan/types'
import { buildMergedCatalog } from '../furniture/catalog'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { useStore } from '../state/store'
import { buildDrawingSetHtml } from './drawingSet'

/** defIds / categories that imply a power point at the item's position. */
const SOCKET_RE =
  /refrigerator|washing-machine|microwave|oven|dishwasher|wine-cooler|stove|range-hood|soundbar|floor-speaker|aquarium|piano|monitor/

/** Derive an indicative electrical layout from the placed furniture + doors:
 *  appliances/electronics → sockets, aircon → aircon point, TV → TV point,
 *  shower/bathtub → water-heater, a desk → a double socket + data, and a light
 *  switch just inside each door. A sensible starting point the user can refine. */
function deriveElectricalPoints(
  plan: FloorPlan,
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
): ElectricalPoint[] {
  const pts: ElectricalPoint[] = []
  for (const it of items) {
    const def = catalog[it.defId]
    if (!def) continue
    const [x, z] = it.position
    const id = it.defId
    if (/aircon/.test(id)) pts.push({ x, z, kind: 'aircon' })
    else if (/tv-wall|flatscreen-tv/.test(id)) pts.push({ x, z, kind: 'tv-point' })
    else if (/shower|bathtub/.test(id)) pts.push({ x, z, kind: 'water-heater' })
    else if (/desk/.test(id)) {
      pts.push({ x, z, kind: 'socket-double' })
      pts.push({ x: x + 0.25, z, kind: 'data' })
    } else if (
      SOCKET_RE.test(id) ||
      def.category === 'appliances' ||
      def.category === 'electronics'
    )
      pts.push({ x, z, kind: 'socket' })
  }
  // A light switch just inside each door (on the wall, nudged off the centreline).
  if (Array.isArray(plan.openings) && Array.isArray(plan.walls)) {
    for (const o of plan.openings) {
      if (o.kind !== 'door') continue
      const wall = plan.walls.find((w) => w.id === o.wallId)
      if (!wall) continue
      const len = wallLength(wall)
      if (len === 0) continue
      const ux = (wall.end[0] - wall.start[0]) / len
      const uz = (wall.end[1] - wall.start[1]) / len
      const at = o.offset + o.width + 0.15 // just past the leaf
      pts.push({ x: wall.start[0] + ux * at, z: wall.start[1] + uz * at, kind: 'switch' })
    }
  }
  return pts
}

/**
 * Build the multi-sheet drawing set from the live store and open it in a new
 * window for print / save-as-PDF. Mirrors `openDesignReport`; surfaces a
 * notification when the pop-up is blocked.
 */
export function openDrawingSet(): void {
  const s = useStore.getState()
  const catalog = buildMergedCatalog(s)
  const electrical = isFeatureEnabled('electricalPlan')
    ? deriveElectricalPoints(s.floorPlan, s.items, catalog)
    : undefined
  const html = buildDrawingSetHtml(
    s.floorPlan,
    s.items,
    catalog,
    s.units,
    s.baselinePlan,
    electrical,
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
