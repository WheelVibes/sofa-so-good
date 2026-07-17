/**
 * Eyedropper finish sampling (UX-7) — the pure, render-agnostic core for
 * "match that wall/floor's finish". Given a clicked surface descriptor (kind +
 * roomId, plus an optional wallId for an accent face) and the live finish maps
 * + plan, it resolves the SAME finish id the renderer is currently showing on
 * that surface, using the identical read precedence as the scene:
 *
 *   floor →  live slice pick → plan-room default → app default floor
 *   wall  →  accent override (wallId) → live slice pick → plan-room default
 *            → app default wall
 *
 * The scene's raycast hit-classifier (`scene/finishDropTarget.ts`) tags room
 * surfaces with `{ kind, roomId }` only, so the in-app v1 samples at room-wall
 * granularity (no `wallId`); the `wallId` accent branch is kept + tested so a
 * later per-wall tag resolves an accent face correctly. Pure (no three / DOM),
 * so it unit-tests against plain finish maps + a plan fixture.
 */

import { allPlanRooms } from '../floorplan/levels'
import {
  DEFAULT_PLAN_FLOOR,
  resolvePlanRoomFloor,
  resolvePlanRoomWall,
} from '../floorplan/roomFinishes'
import type { FloorPlan } from '../floorplan/types'
import { DEFAULT_FLOOR, DEFAULT_WALL } from './builtinCatalog'

/** The finish maps the sampler reads (a structural subset of FinishesSlice). */
export interface SampleFinishMaps {
  floor: Record<string, string>
  walls: Record<string, string>
  ceiling?: Record<string, string>
  /** Accent-wall overrides keyed `${wallId}:${roomId}`. */
  wallAccents: Record<string, string>
}

/** A surface the eyedropper can sample. `wallId` (accent face) is optional —
 *  absent → the whole-room wall finish. */
export type SampleSurface =
  | { kind: 'floor'; roomId: string }
  | { kind: 'wall'; roomId: string; wallId?: string }

/** The sampled finish + which surface kind it applies to (so a caller can set
 *  the picker's tab / route the follow-up apply). */
export interface SampledFinish {
  finishId: string
  surface: 'floor' | 'wall'
}

/**
 * Resolve the finish id currently rendered on a clicked room surface. Always
 * returns a concrete id (never null for a valid room) — an unfinished wall
 * resolves to the neutral plaster default so the picked swatch is applicable.
 * Returns null only when `roomId` is empty.
 */
export function resolveSampledFinish(
  surface: SampleSurface,
  finishes: SampleFinishMaps,
  plan: FloorPlan,
): SampledFinish | null {
  const roomId = surface.roomId
  if (!roomId) return null
  // Resolve the room across every storey (F13) — a plan room carries its own
  // template-authored floor/wall defaults the live slice falls back to.
  const room = allPlanRooms(plan).find((r) => r.id === roomId)

  if (surface.kind === 'floor') {
    const finishId = room
      ? resolvePlanRoomFloor(finishes, room)
      : (finishes.floor[roomId] ?? DEFAULT_FLOOR ?? DEFAULT_PLAN_FLOOR)
    return { finishId, surface: 'floor' }
  }

  // Wall: an accent override for this specific face wins over the room default.
  if (surface.wallId) {
    const accent = finishes.wallAccents[`${surface.wallId}:${roomId}`]
    if (accent) return { finishId: accent, surface: 'wall' }
  }
  const roomWall = room ? resolvePlanRoomWall(finishes, room) : (finishes.walls[roomId] ?? null)
  return { finishId: roomWall ?? finishes.walls[roomId] ?? DEFAULT_WALL, surface: 'wall' }
}
