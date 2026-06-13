import { isFeatureEnabled } from '../features/featureFlags'
import type { ElectricalPoint } from '../floorplan/electricalPlan'
import { GROUND_LEVEL_ID, planLevels } from '../floorplan/levels'
import type { PlumbingPoint } from '../floorplan/plumbingPlan'
import type { FloorPlan } from '../floorplan/types'
import { wallLength } from '../floorplan/types'
import { buildMergedCatalog } from '../furniture/catalog'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { useStore } from '../state/store'

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
    // Carry the item's storey so per-storey sheets can filter (F13).
    const lvl = it.levelId ? { levelId: it.levelId } : {}
    if (/aircon/.test(id)) pts.push({ x, z, kind: 'aircon', ...lvl })
    else if (/tv-wall|flatscreen-tv/.test(id)) pts.push({ x, z, kind: 'tv-point', ...lvl })
    else if (/shower|bathtub/.test(id)) pts.push({ x, z, kind: 'water-heater', ...lvl })
    else if (/desk/.test(id)) {
      pts.push({ x, z, kind: 'socket-double', ...lvl })
      pts.push({ x: x + 0.25, z, kind: 'data', ...lvl })
    } else if (
      SOCKET_RE.test(id) ||
      def.category === 'appliances' ||
      def.category === 'electronics'
    )
      pts.push({ x, z, kind: 'socket', ...lvl })
  }
  // A light switch just inside each door (on the wall, nudged off the
  // centreline) — on every storey, tagged with its level.
  for (const level of planLevels(plan)) {
    if (!Array.isArray(level.openings) || !Array.isArray(level.walls)) continue
    const lvl = level.id !== GROUND_LEVEL_ID ? { levelId: level.id } : {}
    for (const o of level.openings) {
      if (o.kind !== 'door') continue
      const wall = level.walls.find((w) => w.id === o.wallId)
      if (!wall) continue
      const len = wallLength(wall)
      if (len === 0) continue
      const ux = (wall.end[0] - wall.start[0]) / len
      const uz = (wall.end[1] - wall.start[1]) / len
      const at = o.offset + o.width + 0.15 // just past the leaf
      pts.push({ x: wall.start[0] + ux * at, z: wall.start[1] + uz * at, kind: 'switch', ...lvl })
    }
  }
  return pts
}

/** Derive an indicative plumbing layout from placed fixtures: a WC → soil pipe
 *  + cistern water point; basins / sinks / dishwashers → water + drainage;
 *  showers → floor trap + water; bathtubs → water + drainage; washing machines →
 *  water + floor trap; water heaters → a heater point. A sensible starting point
 *  the user can refine. */
function derivePlumbingPoints(
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
): PlumbingPoint[] {
  const pts: PlumbingPoint[] = []
  for (const it of items) {
    if (!catalog[it.defId]) continue
    const [x, z] = it.position
    const id = it.defId
    const lvl = it.levelId ? { levelId: it.levelId } : {}
    if (/toilet|^wc$/.test(id)) {
      pts.push({ x, z, kind: 'soil-pipe', ...lvl })
      pts.push({ x: x + 0.2, z, kind: 'water-point', ...lvl })
    } else if (/shower/.test(id)) {
      pts.push({ x, z, kind: 'floor-trap', ...lvl })
      pts.push({ x: x + 0.2, z, kind: 'water-point', ...lvl })
    } else if (/washing-machine/.test(id)) {
      pts.push({ x, z, kind: 'water-point', ...lvl })
      pts.push({ x: x + 0.2, z, kind: 'floor-trap', ...lvl })
    } else if (/water-heater|heater/.test(id)) {
      pts.push({ x, z, kind: 'water-heater', ...lvl })
    } else if (/sink|basin|bathtub|dishwasher/.test(id)) {
      pts.push({ x, z, kind: 'water-point', ...lvl })
      pts.push({ x: x + 0.2, z, kind: 'drainage', ...lvl })
    }
  }
  return pts
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
    const electrical = isFeatureEnabled('electricalPlan')
      ? deriveElectricalPoints(s.floorPlan, s.items, catalog)
      : undefined
    const plumbing = isFeatureEnabled('plumbingPlan')
      ? derivePlumbingPoints(s.items, catalog)
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
