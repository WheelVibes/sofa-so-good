/**
 * Pure one-line text summary of a design for quick sharing in a chat/email
 * (name · rooms · area · items · est. cost) — distinct from the full report or
 * the portable `.sofa.json` file. Kept separate from `ShareModal` so the
 * formatting is unit-testable, and reuses `reportData.lineEach` so the cost
 * matches the report/budget exactly.
 */
import type { FloorPlan } from '../floorplan/types'
import { planTotalArea } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { formatArea, type UnitSystem } from '../utils/measurement'
import { lineEach } from './reportData'

export function buildShareSummary(
  plan: FloorPlan,
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  units: UnitSystem = 'metric',
): string {
  let cost = 0
  for (const it of items) {
    const def = catalog[it.defId]
    if (def) cost += lineEach(it, def)
  }
  const rooms = plan.rooms.length
  const n = items.length
  return [
    plan.name,
    ' — ',
    `${rooms} ${rooms === 1 ? 'room' : 'rooms'}`,
    ` · ${formatArea(planTotalArea(plan), units)}`,
    ` · ${n} ${n === 1 ? 'item' : 'items'}`,
    ` · ~$${Math.round(cost).toLocaleString('en-SG')}`,
  ].join('')
}
