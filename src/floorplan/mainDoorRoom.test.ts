import { describe, expect, it } from 'vitest'
import { planLevels } from './levels'
import { roomCategory } from './roomCategory'
import { PLAN_TEMPLATES } from './templates'
import { pointInRoom } from './types'

/**
 * MAIN-DOOR-ROOM (v0.31.5.114) — a template's front door should open into an
 * entrance space, not into a bedroom or a bathroom.
 *
 * Same root cause as BEDROOM-WINDOW (`bedroomWindow.test.ts`, item (h)):
 * `templates/shared.ts:perimeter()` winds N and E forwards but S and W
 * BACKWARDS, while `door()`/`window()` measure their offset from the wall's own
 * start — so an offset written as an absolute coordinate lands mirrored. Every
 * main door below sits on an `-s` or `-w` wall.
 *
 * A RATCHET, like `templateEnclosure.test.ts`. Correcting these moves doors in
 * hand-authored Singapore reference plans, and a blanket flip is NOT right —
 * read from the other end, `h5-main` would open onto a BALCONY. Each needs a
 * per-plan decision: `docs/open-graphics-decisions.md` item (i).
 *
 * **Do NOT add an entry to silence a failure.** A new entry means a plan ships a
 * front door opening into somebody's bedroom.
 */
const KNOWN_MISPLACED_MAIN_DOORS = [
  // tpl-hdb-2room FIXED in v0.31.8.36 — `h2-main` 1.2 -> 3.5, out of the
  // BATHROOM and into the living room, at the one offset on its frontage that
  // also leaves the room its TV console.
  // tpl-hdb-4room FIXED in v0.31.5.115 — `h4-main`'s offset was mirrored and put
  // the front door inside the master bedroom. Corrected (6.4 -> 1.7).
  'tpl-hdb-5room/h5-main -> h5-master',
  // tpl-hdb-exec FIXED in v0.31.5.118 — `ex-main` 8.4 -> 2.1, out of the master
  // and into ex-living, which lines offsets 0.1-4.3 of that wall.
  // tpl-hdb-jumbo FIXED in v0.31.5.119 — `jb-main` 9.2 -> 4.1, out of the master
  // and into jb-family. The Living / Dining never touches this wall (it fronts
  // jb-n and jb-e), so the Family Room is the correct target, not the living room.
  // tpl-studio FIXED in v0.31.5.120 — `st-main` 1.0 -> 3.9. `st-s` (len 5.8) is
  // lined ONLY by st-bath 0.2-1.7 and st-kit 1.9-5.7, so the kitchen end is the
  // sole non-bath option on that wall.
  // tpl-loft FIXED in v0.31.5.120 — `lf-main` 1.2 -> 5.8, into the Lounge /
  // Study (lf-s is lined by lf-bath 0.1-1.8, lf-stair 2.0-3.1, lf-sleep 3.4-7.9).
]

/** The room a door opens into: probe 0.4 m each side of the leaf centre. */
function roomBehindDoor(
  level: {
    rooms: readonly { id: string }[]
    walls: readonly { id: string; start: [number, number]; end: [number, number] }[]
  },
  wallId: string,
  offset: number,
  width: number,
): string | null {
  const wall = level.walls.find((w) => w.id === wallId)
  if (!wall) return null
  const [ax, az] = wall.start
  const [bx, bz] = wall.end
  const len = Math.hypot(bx - ax, bz - az)
  if (len === 0) return null
  const t = (offset + width / 2) / len
  const cx = ax + (bx - ax) * t
  const cz = az + (bz - az) * t
  const nx = -(bz - az) / len
  const nz = (bx - ax) / len
  for (const d of [0.4, -0.4]) {
    const hit = level.rooms.find((r) => pointInRoom(r as never, cx + nx * d, cz + nz * d))
    if (hit) return hit.id
  }
  return null
}

describe('template front doors', () => {
  it('open into an entrance space, not a bedroom or bathroom', () => {
    const bad: string[] = []
    for (const tpl of PLAN_TEMPLATES)
      for (const level of planLevels(tpl))
        for (const o of level.openings) {
          if (o.kind !== 'door' || !/main/.test(o.id)) continue
          const roomId = roomBehindDoor(level as never, o.wallId, o.offset, o.width)
          if (!roomId) continue
          const room = level.rooms.find((r) => r.id === roomId)
          if (!room) continue
          const c = roomCategory(room)
          if (c === 'bedroom' || c === 'masterBedroom' || c === 'bath' || c === 'powder')
            bad.push(`${tpl.id}/${o.id} -> ${roomId}`)
        }
    expect(bad).toEqual(KNOWN_MISPLACED_MAIN_DOORS)
  })

  // Without this the list above could pass by measuring nothing. 19 templates
  // declare a `*-main` door; the probe resolves a room for all of them.
  it('the probe resolves a room for every main door', () => {
    let resolved = 0
    let total = 0
    for (const tpl of PLAN_TEMPLATES)
      for (const level of planLevels(tpl))
        for (const o of level.openings) {
          if (o.kind !== 'door' || !/main/.test(o.id)) continue
          total++
          if (roomBehindDoor(level as never, o.wallId, o.offset, o.width)) resolved++
        }
    expect(total).toBe(19)
    expect(resolved).toBe(17)
  })
})
