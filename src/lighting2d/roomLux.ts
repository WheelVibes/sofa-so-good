/**
 * Per-room average illuminance estimate (lux) — the lighting plan's "is this
 * room bright enough?" check (LP5), via the classic lumen method:
 *
 *   E (lx) = total source flux (lm) × utilisation factor / floor area (m²)
 *
 * Each placed emitter's flux is derived from its registry intensity (candela),
 * the room is classified from its name (shared `roomKindFromName`), and the
 * estimate is compared against recommended residential illuminance bands to
 * yield an ok / low / high status per room. Pure (no three, no React) →
 * unit-testable; consumed by the Drawings panel, the report and the drawing set.
 */

import { type RoomKind, roomKindFromName } from '../analysis/suggestions'
import { GROUND_LEVEL_ID, planLevels } from '../floorplan/levels'
import { type FloorPlan, planRoomArea, pointInRoom } from '../floorplan/types'
import type { PlanLight } from './lightingPlan'

/**
 * Candela → lumens assuming an isotropic point source: Φ = 4π·I.
 * The emitter registry stores a single peak candela per fixture (no
 * distribution curve), so the full-sphere integral is the simplest defensible
 * total-flux model for these omnidirectional point lights.
 */
export const LUMENS_PER_CANDELA = 4 * Math.PI

/**
 * The registry's intensities are stylised night-scene values, roughly an order
 * of magnitude below real luminaires (the scene's 9 cd ceiling pendant ↔ a real
 * ~1350 lm pendant ≈ 107 cd mean). One calibration constant maps every fixture
 * onto a realistic lumen package: table lamp 4 cd ≈ 600 lm, floor lamp 7 cd
 * ≈ 1050 lm, ceiling pendant 9 cd ≈ 1350 lm — all typical retail outputs.
 */
export const SCENE_INTENSITY_CALIBRATION = 12

/**
 * Lumen-method utilisation factor: the fraction of source lumens that actually
 * reach the floor / work plane after luminaire and room-surface losses.
 * 0.4–0.5 is typical for light-finish residential rooms with mixed direct
 * fixtures (CIBSE Code for Lighting interior-utilance tables); we use the
 * middle of that band.
 */
export const UTILISATION_FACTOR = 0.45

/**
 * Recommended maintained average illuminance bands per room kind (lx).
 * Residential guidance — CIBSE Code for Lighting / LG9 (homes), IES Lighting
 * Handbook residential tables, SS 531 / EN 12464-1 adjacent task values:
 * living 100–200 lx ambient; bedroom 100–150 lx (cosy ambient); kitchen 300 lx
 * on worktops (up to ~600 lx with task lighting); bathroom 200 lx general
 * (more at the mirror); study/desk 300–500 lx. Balconies / service spaces need
 * only orientation light; 'other' gets a broad general-purpose band.
 */
export const RECOMMENDED_LUX: Record<RoomKind, { min: number; max: number }> = {
  living: { min: 100, max: 200 },
  dining: { min: 100, max: 200 },
  bedroom: { min: 100, max: 150 },
  kitchen: { min: 300, max: 600 },
  bath: { min: 200, max: 400 },
  study: { min: 300, max: 500 },
  balcony: { min: 50, max: 150 },
  other: { min: 100, max: 300 },
}

export type LuxStatus = 'low' | 'ok' | 'high'

export interface RoomLuxEstimate {
  roomId: string
  roomName: string
  kind: RoomKind
  /** Interior floor area, m². */
  area: number
  /** Total derived source flux from the room's emitters, lm. */
  lumens: number
  /** Estimated average illuminance, lx (0 for a room with no emitters). */
  lux: number
  /** Recommended band for the room kind (lx). */
  recommended: { min: number; max: number }
  /** `lux` vs the recommended band. An unlit room reads `low`. */
  status: LuxStatus
}

/** Derived source flux of one plan light (lm): calibrated candela × 4π. */
export function planLightLumens(light: Pick<PlanLight, 'intensity'>): number {
  return light.intensity * SCENE_INTENSITY_CALIBRATION * LUMENS_PER_CANDELA
}

/**
 * Estimate the average illuminance of every room in the plan from the placed
 * emitters (a light belongs to the room containing its bulb position — so an
 * arc lamp reaching through a doorway counts where its bulb actually is).
 * Zero-area (degenerate) rooms are skipped; rooms with no emitters are kept,
 * reported at 0 lx / `low` — "this room is unlit" is the actionable finding.
 */
export function estimateRoomLux(plan: FloorPlan, lights: PlanLight[]): RoomLuxEstimate[] {
  const rows: RoomLuxEstimate[] = []
  // Every storey's rooms; a light only counts toward rooms on ITS storey
  // (F13/ML5 — same-XZ rooms on different levels must not share fixtures).
  for (const level of planLevels(plan)) {
    for (const room of level.rooms) {
      const area = planRoomArea(room)
      if (area <= 0) continue
      let lumens = 0
      for (const l of lights) {
        if ((l.levelId ?? GROUND_LEVEL_ID) !== level.id) continue
        if (pointInRoom(room, l.x, l.z)) lumens += planLightLumens(l)
      }
      const kind = roomKindFromName(room.name)
      const recommended = RECOMMENDED_LUX[kind]
      const lux = (lumens * UTILISATION_FACTOR) / area
      const status: LuxStatus =
        lux < recommended.min ? 'low' : lux > recommended.max ? 'high' : 'ok'
      rows.push({
        roomId: room.id,
        roomName: room.name,
        kind,
        area,
        lumens,
        lux,
        recommended,
        status,
      })
    }
  }
  return rows
}
