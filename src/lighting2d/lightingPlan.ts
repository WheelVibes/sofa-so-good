/**
 * Lighting plan (reflected-ceiling-style) — the pure data core.
 *
 * Derives, from the placed furniture + the {@link LIGHT_EMITTERS} registry, the
 * set of light fixtures in the design: each one's world position (footprint
 * centre + its rotated emitter offset), emit height, intensity, coverage radius
 * and colour, plus a grouped schedule. A 2D renderer (LP2) plots these over the
 * floor plan and the report (LP3) tabulates the schedule — the professional
 * "where are the lights, how high, how bright" deliverable (Chief Architect /
 * RoomSketcher reflected ceiling plans). Pure (no three, no React) → testable.
 */
import { isItemEmitter, LIGHT_EMITTERS } from '../furniture/lightEmitters'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'

export interface PlanLight {
  id: string
  /** Emitter/def key (its furniture type). */
  type: string
  label: string
  /** World position of the bulb (footprint centre + rotated emitter offset). */
  x: number
  z: number
  /** Emit height above the floor (m). */
  height: number
  /** Peak intensity (candela). */
  intensity: number
  /** Coverage / falloff radius (m). */
  distance: number
  color: string
}

export interface LightScheduleRow {
  type: string
  label: string
  count: number
  /** Representative emit height (m) for the type. */
  height: number
  intensity: number
}

export interface LightingPlan {
  lights: PlanLight[]
  /** Grouped by type, sorted by descending count then label. */
  schedule: LightScheduleRow[]
}

/**
 * Build the lighting plan for the placed `items`. Only items whose def is a
 * registered light emitter contribute; `defs` resolves friendly labels. The
 * emitter's optional local offset `[rightX, forwardZ]` is rotated by the item's
 * yaw into world space (matching the scene's fixture placement), so an arc-lamp
 * bulb sits out over the sofa on the plan just as it does in 3D. Items whose
 * per-item `enabled` gate is off (a fixture whose light is switched off by its
 * params) are excluded, matching the 3D scene.
 */
export function buildLightingPlan(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
): LightingPlan {
  const lights: PlanLight[] = []
  const groups = new Map<string, LightScheduleRow>()

  for (const item of items) {
    const spec = LIGHT_EMITTERS[item.defId]
    if (!spec || !isItemEmitter(item.defId, item.props)) continue
    const def = defs[item.defId]
    const label = item.label ?? def?.name ?? item.defId
    const r = item.rotation
    // Local axes in world (matches clearance/frontClearanceRect): front = +Z, right = +X.
    const fx = Math.sin(r)
    const fz = Math.cos(r)
    const rx = Math.cos(r)
    const rz = -Math.sin(r)
    const [offRight, offFwd] = spec.offset?.(item.props) ?? [0, 0]
    const x = item.position[0] + rx * offRight + fx * offFwd
    const z = item.position[1] + rz * offRight + fz * offFwd
    const height = spec.height(item.props)
    lights.push({
      id: item.id,
      type: item.defId,
      label,
      x,
      z,
      height,
      intensity: spec.intensity,
      distance: spec.distance,
      color: spec.color,
    })
    const row = groups.get(item.defId)
    if (row) row.count += 1
    else
      groups.set(item.defId, {
        type: item.defId,
        label: def?.name ?? item.defId,
        count: 1,
        height,
        intensity: spec.intensity,
      })
  }

  const schedule = [...groups.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  )
  return { lights, schedule }
}
