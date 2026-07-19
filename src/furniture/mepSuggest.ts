/**
 * MEP point suggestion heuristics (MEP layer plan, G1, PR4) — derives a
 * starting electrical/plumbing layout from the placed furniture + doors.
 *
 * Moved VERBATIM from `ui/openDrawingSet.ts` (which used it as an inline,
 * export-time-only fallback) so there is exactly ONE derivation source
 * (plan-doc risk #4 — heuristic drift): both the drawing-set export fallback
 * (`openDrawingSet.ts`) and the editor's "Suggest MEP points" action
 * (`floorPlanSlice.suggestMepPoints`) call these same two functions. Pure —
 * no store/React imports. Furniture types can't be imported by
 * `src/floorplan` (would create an import cycle — same rationale as
 * `furnishPlan.ts`), so this lives in `src/furniture` instead and imports
 * `floorplan` types, never the reverse.
 */

import type { ElectricalPoint } from '../floorplan/electricalPlan'
import { GROUND_LEVEL_ID, planLevels } from '../floorplan/levels'
import type { PlumbingPoint } from '../floorplan/plumbingPlan'
import type { FloorPlan } from '../floorplan/types'
import { wallLength } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from './types'

/** defIds / categories that imply a power point at the item's position. */
const SOCKET_RE =
  /refrigerator|washing-machine|microwave|oven|dishwasher|wine-cooler|stove|range-hood|soundbar|floor-speaker|aquarium|piano|monitor/

/** Derive an indicative electrical layout from the placed furniture + doors:
 *  appliances/electronics → sockets, aircon → aircon point, TV → TV point,
 *  shower/bathtub → water-heater, a desk → a double socket + data, and a light
 *  switch just inside each door. A sensible starting point the user can refine. */
export function deriveElectricalPoints(
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
export function derivePlumbingPoints(
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
