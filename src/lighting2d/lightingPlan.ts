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
import { planLightLumens } from './roomLux'

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
  /** Storey the fixture sits on; absent = ground (F13/ML5). */
  levelId?: string
  /** Coverage / falloff radius (m). */
  distance: number
  /**
   * The fixture's IES profile id (`item.props.iesProfile`), when one is
   * selected. Consumed by the lux model for the DISTRIBUTION SHAPE only —
   * magnitude still comes from `intensity` × the registry calibration (see
   * `lighting/ies/iesProfile.ts:relativeIntensityAt`).
   */
  iesProfile?: string
  color: string
}

interface LightScheduleRow {
  type: string
  label: string
  count: number
  /** Representative emit height (m) for the type. */
  height: number
  /** Scene candela — a RENDER unit. Kept for the existing 2D/3D consumers, but
   *  a schedule a supplier reads should quote `lumens` instead: `intensity`
   *  lives on a stylised register its own registry header warns must never be
   *  compared to a real luminaire. */
  intensity: number
  /**
   * Total flux per fixture (lm), from the SAME `planLightLumens` the lux model
   * uses (`intensity × SCENE_INTENSITY_CALIBRATION × 4π`).
   *
   * Derived, never authored: the calibration constant is documented as mapping
   * the registry onto realistic packages — "table lamp 4 cd ≈ 600 lm, floor
   * lamp 7 cd ≈ 1050 lm, ceiling pendant 9 cd ≈ 1350 lm" — and published room
   * guidance puts a bedroom ceiling fixture at 1200-1800 lm, so those land in
   * band. Authoring a second lumens field would create two sources of truth for
   * one quantity and let the schedule drift from the lighting calculation.
   */
  lumens: number
  /** Specified colour temperature (K) — a product property, not derived from
   *  the render tint. */
  cct: number
  /** Specified ingress protection (e.g. 20, 44). */
  ip: number
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
      ...(item.levelId ? { levelId: item.levelId } : {}),
      ...(typeof item.props?.iesProfile === 'string' && item.props.iesProfile
        ? { iesProfile: item.props.iesProfile }
        : {}),
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
        lumens: Math.round(planLightLumens({ intensity: spec.intensity })),
        cct: spec.cct,
        ip: spec.ip,
      })
  }

  const schedule = [...groups.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  )
  return { lights, schedule }
}
