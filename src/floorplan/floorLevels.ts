/**
 * Floor build-up / levels & transitions (blank-slate BSJ-8).
 *
 * A per-room finished-floor-level offset (`PlanRoom.floorLevelMm`, mm vs the main
 * FFL datum) drives both the DOCUMENTATION layer (this module) and — since
 * v0.24.0.2 — the real 3D representation (`floorLevels3d.ts`, which reuses this
 * module's `buildFloorTransitions` for its doorway risers so the 3D step and the
 * 2D marker can never disagree). This pure module derives from it:
 *
 *  - **FFL tags** ("FFL −50") at each room label where a level is set, for the
 *    dimensioned/setting-out plan + the tiler pack.
 *  - **Step / transition markers** at doorways between two rooms at DIFFERENT
 *    levels ("threshold: 25 mm step + transition strip").
 *  - **A kerb/step advisory** — a wet room (bath/powder) at the SAME level as its
 *    adjacent dry room gets a "no step/kerb … verify with contractor" note.
 *
 * Reuses `openingProbe.ts:roomsAcrossOpening` (the shared "which rooms does this
 * door connect" probe) and `roomCentroid.ts:roomLabelPosition` so it never
 * re-derives geometry the app already owns. Pure — no store / React / three.
 */

import { planLevels } from './levels'
import { roomsAcrossOpening } from './openingProbe'
import { roomCategory } from './roomCategory'
import { roomLabelPosition } from './roomCentroid'
import type { FloorPlan, PlanRoom, RoomCategory } from './types'

/** Probe offset (m) either side of a door — matches finishSchedule / daylight. */
const PROBE_OFFSET = 0.2

/** Wet room categories that warrant a kerb/step at a dry-room threshold. */
const KERB_CATEGORIES: ReadonlySet<RoomCategory> = new Set<RoomCategory>(['bath', 'powder'])

/** Resolve a room's finished-floor-level offset (mm); absent / non-finite → 0. */
export function roomFloorLevelMm(room: Pick<PlanRoom, 'floorLevelMm'>): number {
  const v = room.floorLevelMm
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** True when a room carries an EXPLICIT floor-level offset (drives whether an
 *  FFL tag is emitted — an unset room stays at the implicit datum). */
export function hasExplicitFloorLevel(room: Pick<PlanRoom, 'floorLevelMm'>): boolean {
  return typeof room.floorLevelMm === 'number' && Number.isFinite(room.floorLevelMm)
}

/** Format a floor-level offset as an FFL tag, e.g. `FFL ±0` / `FFL +25` / `FFL −50`. */
export function fflTag(mm: number): string {
  const v = Math.round(mm)
  if (v === 0) return 'FFL ±0'
  return `FFL ${v > 0 ? '+' : '−'}${Math.abs(v)}`
}

/** One room's FFL tag for rendering at its label position. */
export interface RoomFflTag {
  roomId: string
  roomName: string
  mm: number
  tag: string
  /** World `[x, z]` of the room label. */
  labelPos: [number, number]
  /** Storey (undefined = ground). */
  levelId?: string
}

/** FFL tags for rooms with an explicit level set (all storeys). */
export function buildRoomFflTags(plan: FloorPlan): RoomFflTag[] {
  const out: RoomFflTag[] = []
  for (const level of planLevels(plan)) {
    for (const room of level.rooms) {
      if (!hasExplicitFloorLevel(room)) continue
      const mm = roomFloorLevelMm(room)
      out.push({
        roomId: room.id,
        roomName: room.name,
        mm,
        tag: fflTag(mm),
        labelPos: roomLabelPosition(room),
        levelId: level.id === 'ground' ? undefined : level.id,
      })
    }
  }
  return out
}

/** A step / transition between two rooms at different levels, across a doorway. */
export interface FloorTransition {
  openingId: string
  roomAId: string
  roomAName: string
  roomBId: string
  roomBName: string
  levelAMm: number
  levelBMm: number
  /** Absolute step height (mm). */
  stepMm: number
  /** World `[x, z]` centre of the doorway. */
  center: [number, number]
  /** Storey (undefined = ground). */
  levelId?: string
  /** Ready-made marker caption ("25 mm step + transition strip"). */
  note: string
}

/** Doorways connecting two rooms at different floor levels (all storeys). */
export function buildFloorTransitions(plan: FloorPlan): FloorTransition[] {
  const out: FloorTransition[] = []
  for (const level of planLevels(plan)) {
    const walls = Array.isArray(level.walls) ? level.walls : []
    const openings = Array.isArray(level.openings) ? level.openings : []
    const rooms = Array.isArray(level.rooms) ? level.rooms : []
    for (const op of openings) {
      if (op.kind !== 'door') continue
      const wall = walls.find((w) => w.id === op.wallId)
      if (!wall) continue
      const across = roomsAcrossOpening(rooms, wall, op, PROBE_OFFSET, true)
      if (!across?.plus || !across.minus) continue
      const a = across.plus
      const b = across.minus
      const levelAMm = roomFloorLevelMm(a)
      const levelBMm = roomFloorLevelMm(b)
      if (levelAMm === levelBMm) continue
      const stepMm = Math.abs(levelAMm - levelBMm)
      out.push({
        openingId: op.id,
        roomAId: a.id,
        roomAName: a.name,
        roomBId: b.id,
        roomBName: b.name,
        levelAMm,
        levelBMm,
        stepMm,
        center: across.center,
        levelId: level.id === 'ground' ? undefined : level.id,
        note: `${Math.round(stepMm)} mm step + transition strip`,
      })
    }
  }
  return out
}

/** A kerb/step advisory — a wet room level with its adjacent dry room. */
export interface KerbAdvisory {
  openingId: string
  wetRoomName: string
  dryRoomName: string
  levelId?: string
  note: string
}

/**
 * Wet rooms (bath/powder) that sit at the SAME finished-floor level as an
 * adjacent dry room across a doorway — a fall/kerb risk the owner should confirm
 * a hob/kerb for. A wet room that is ALREADY stepped down (different level) is
 * not flagged. All storeys.
 */
export function buildKerbAdvisories(plan: FloorPlan): KerbAdvisory[] {
  const out: KerbAdvisory[] = []
  for (const level of planLevels(plan)) {
    const walls = Array.isArray(level.walls) ? level.walls : []
    const openings = Array.isArray(level.openings) ? level.openings : []
    const rooms = Array.isArray(level.rooms) ? level.rooms : []
    for (const op of openings) {
      if (op.kind !== 'door') continue
      const wall = walls.find((w) => w.id === op.wallId)
      if (!wall) continue
      const across = roomsAcrossOpening(rooms, wall, op, PROBE_OFFSET, true)
      if (!across?.plus || !across.minus) continue
      const a = across.plus
      const b = across.minus
      const aWet = KERB_CATEGORIES.has(roomCategory(a))
      const bWet = KERB_CATEGORIES.has(roomCategory(b))
      if (aWet === bWet) continue // both wet or both dry — no bath↔dry threshold
      const wet = aWet ? a : b
      const dry = aWet ? b : a
      if (roomFloorLevelMm(wet) !== roomFloorLevelMm(dry)) continue // already stepped
      out.push({
        openingId: op.id,
        wetRoomName: wet.name,
        dryRoomName: dry.name,
        levelId: level.id === 'ground' ? undefined : level.id,
        note: `No step/kerb between ${wet.name} and ${dry.name} — verify hob/kerb + fall-to-trap with contractor.`,
      })
    }
  }
  return out
}
