/**
 * Pure room→walls enumeration for accent-wall creation (ACCENT-CREATE).
 *
 * The FinishPicker's "Accent walls" section lets a user CREATE an accent by
 * picking one of the room's walls (rather than only tapping a wall in the 3D
 * view). The wall ids returned here match the `${wallId}:${roomId}` key scheme
 * `finishes.wallAccents` uses — the SAME ids the 3D wall-tap path produces:
 *
 *  - Fixed apartment: `WALLS` constant ids, via `roomShell` (the ids
 *    `WallSegment` stamps into the accent key).
 *  - Custom plan: `floorPlan.walls[].id`, via `planRoomShell` (the ids
 *    `RoomShell`/`PlanRoomShell` stamp into the accent key).
 *
 * Both are resolved through the shared `getRoomEditorShell` dispatch, so this
 * one helper covers BOTH plan kinds with no duplicated wall→room geometry. The
 * shells clip shared walls to the room footprint; multiple clips of one source
 * wall collapse to a single accent target here (accent keys are per source
 * wall id, not per clip), keeping the longest clip as the representative span.
 *
 * Pure — no store, no rendering — so it unit-tests without the R3F stack.
 */

import type { FloorPlan } from '../floorplan/types'
import { getRoomEditorShell } from '../scene/roomEditorShell'
import { formatLength, type UnitSystem } from '../utils/measurement'

/** Canonical compass side of a wall relative to its room centre. The frame is
 *  the app's world XZ (+X = east, +Z = south, so −Z = North) — the same
 *  "up = −Z = North" convention the 2D plan editor uses at the default North
 *  orientation. Does NOT apply the user's North-orientation offset (labels stay
 *  deterministic; see helper caveats). */
type WallSide = 'N' | 'S' | 'E' | 'W'

export interface RoomWall {
  /** Source wall id — matches the `${wallId}:${roomId}` accent key. */
  wallId: string
  /** Room this wall face belongs to. */
  roomId: string
  /** Representative (longest) clipped span endpoints in world XZ. */
  start: [number, number]
  end: [number, number]
  /** Clipped span length in metres. */
  length: number
  /** Compass side of the wall relative to the room centre. */
  side: WallSide
}

const COMPASS_NAME: Record<WallSide, string> = {
  N: 'North',
  S: 'South',
  E: 'East',
  W: 'West',
}

// Stable display order: North, East, South, West, then longest first.
const SIDE_ORDER: Record<WallSide, number> = { N: 0, E: 1, S: 2, W: 3 }

/**
 * The walls of a room, one entry per source wall id (deduped across clips),
 * ready to drive an "Add accent wall" picker. Empty when the room id isn't part
 * of the active plan. Works for both the fixed apartment and custom plans.
 */
export function roomWalls(plan: FloorPlan, roomId: string): RoomWall[] {
  const editor = getRoomEditorShell(plan, roomId)
  if (!editor) return []
  // Both shell variants expose walls with `{ wallId, start, end }` + a `center`.
  const walls = editor.shell.walls as ReadonlyArray<{
    wallId: string
    start: readonly [number, number]
    end: readonly [number, number]
  }>
  const center = editor.shell.center

  // Collapse clips of the same source wall to one entry, keeping the longest.
  const byId = new Map<string, { start: [number, number]; end: [number, number]; length: number }>()
  for (const w of walls) {
    const length = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])
    if (length < 1e-4) continue
    const prev = byId.get(w.wallId)
    if (!prev || length > prev.length) {
      byId.set(w.wallId, { start: [w.start[0], w.start[1]], end: [w.end[0], w.end[1]], length })
    }
  }

  const out: RoomWall[] = []
  for (const [wallId, { start, end, length }] of byId) {
    const dx = Math.abs(end[0] - start[0])
    const dz = Math.abs(end[1] - start[1])
    const midX = (start[0] + end[0]) / 2
    const midZ = (start[1] + end[1]) / 2
    // A wall running mostly along X is a horizontal edge → North (−Z) / South
    // (+Z) of the room centre; one running along Z → West (−X) / East (+X).
    const side: WallSide = dx >= dz ? (midZ < center[1] ? 'N' : 'S') : midX < center[0] ? 'W' : 'E'
    out.push({ wallId, roomId, start, end, length, side })
  }

  return out.sort((a, b) => SIDE_ORDER[a.side] - SIDE_ORDER[b.side] || b.length - a.length)
}

/** Human label for a room wall, e.g. "North wall · 3.60 m". Unit-aware. */
export function roomWallLabel(wall: RoomWall, units: UnitSystem = 'metric'): string {
  return `${COMPASS_NAME[wall.side]} wall · ${formatLength(wall.length, units)}`
}
