/**
 * Door-aware collision walls for the **per-room editor**: built from the
 * isolated room's clipped wall segments (not the whole flat), so a walk-mode
 * player is bounded to the room. Mirrors `buildCollisionWalls` but iterates
 * `roomShell(roomId).walls` and clamps every door cutout to each clipped span.
 */

import { DOORS } from '../apartment/constants'
import { roomShell } from '../apartment/roomShellGeometry'
import type { RoomId } from '../apartment/types'
import { wallThicknessMetres } from '../apartment/wallSegments'
import type { PlanRoomShell } from '../floorplan/planRoomShell'
import type { CollisionWall } from './walls'

export function buildRoomCollisionWalls(
  roomId: RoomId,
  doorState: Record<string, { open: boolean }>,
): CollisionWall[] {
  const shell = roomShell(roomId)
  const segs: CollisionWall[] = []

  for (const clip of shell.walls) {
    const wall = clip.spec
    // Full-wall axis + unit vector (door offsets are measured along this).
    const wdx = wall.end[0] - wall.start[0]
    const wdz = wall.end[1] - wall.start[1]
    const wlen = Math.hypot(wdx, wdz)
    if (wlen === 0) continue
    const ux = wdx / wlen
    const uz = wdz / wlen
    const thickness = wallThicknessMetres(wall)

    // Clipped span expressed as a [t0, t1] range of distance along the wall.
    const t0raw = (clip.start[0] - wall.start[0]) * ux + (clip.start[1] - wall.start[1]) * uz
    const t1raw = (clip.end[0] - wall.start[0]) * ux + (clip.end[1] - wall.start[1]) * uz
    const t0 = Math.min(t0raw, t1raw)
    const t1 = Math.max(t0raw, t1raw)

    // Open-door spans on this wall, clamped to the clip range.
    const openSpans: Array<{ start: number; end: number }> = []
    for (const c of wall.cutouts) {
      if (c.kind !== 'door') continue
      const door = DOORS.find(
        (d) => d.wallId === wall.id && d.offset === c.offset && d.width === c.width,
      )
      if (!door) continue
      const isOpen = doorState[door.id]?.open ?? door.defaultOpen
      if (!isOpen) continue
      const s = Math.max(c.offset, t0)
      const e = Math.min(c.offset + c.width, t1)
      if (e > s) openSpans.push({ start: s, end: e })
    }
    openSpans.sort((a, b) => a.start - b.start)

    const pointAt = (t: number): [number, number] => [
      wall.start[0] + ux * t,
      wall.start[1] + uz * t,
    ]

    // Walk the clip range, emitting solid sub-segments between open doors.
    let cursor = t0
    for (const span of openSpans) {
      if (span.start > cursor) {
        const [ax, az] = pointAt(cursor)
        const [bx, bz] = pointAt(span.start)
        segs.push({ ax, az, bx, bz, thickness })
      }
      cursor = Math.max(cursor, span.end)
    }
    if (cursor < t1) {
      const [ax, az] = pointAt(cursor)
      const [bx, bz] = pointAt(t1)
      segs.push({ ax, az, bx, bz, thickness })
    }
  }

  return segs
}

/**
 * Door-aware collision walls for a **custom-plan** per-room editor, built from a
 * `PlanRoomShell`'s clipped walls. Door openings are treated as passable gaps
 * (an open doorway, like the full flat); windows stay solid (the wall below the
 * sill blocks walking). Keeps a walk-mode player bounded to the custom room.
 */
export function buildPlanRoomCollisionWalls(shell: PlanRoomShell): CollisionWall[] {
  const segs: CollisionWall[] = []
  for (const clip of shell.walls) {
    const sx = clip.start[0]
    const sz = clip.start[1]
    const dx = clip.end[0] - sx
    const dz = clip.end[1] - sz
    const len = Math.hypot(dx, dz)
    if (len < 1e-6) continue
    const ux = dx / len
    const uz = dz / len
    const thickness = clip.thickness === 'external' ? 0.2 : 0.1

    // Door gaps on this wall, as [t0,t1] ranges along the clipped span.
    const gaps: Array<{ start: number; end: number }> = []
    for (const { opening, center } of shell.openings) {
      if (opening.kind !== 'door' || opening.wallId !== clip.wallId) continue
      const tc = (center[0] - sx) * ux + (center[1] - sz) * uz
      const s = Math.max(0, tc - opening.width / 2)
      const e = Math.min(len, tc + opening.width / 2)
      if (e > s) gaps.push({ start: s, end: e })
    }
    gaps.sort((a, b) => a.start - b.start)

    const pointAt = (t: number): [number, number] => [sx + ux * t, sz + uz * t]
    let cursor = 0
    for (const g of gaps) {
      if (g.start > cursor) {
        const [ax, az] = pointAt(cursor)
        const [bx, bz] = pointAt(g.start)
        segs.push({ ax, az, bx, bz, thickness })
      }
      cursor = Math.max(cursor, g.end)
    }
    if (cursor < len) {
      const [ax, az] = pointAt(cursor)
      const [bx, bz] = pointAt(len)
      segs.push({ ax, az, bx, bz, thickness })
    }
  }
  return segs
}
