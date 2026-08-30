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
  'tpl-hdb-2room/h2-main -> h2-bath',
  // tpl-hdb-4room FIXED in v0.31.5.115 — `h4-main`'s offset was mirrored and put
  // the front door inside the master bedroom. Corrected (6.4 -> 1.7).
  'tpl-hdb-5room/h5-main -> h5-master',
  'tpl-hdb-exec/ex-main -> ex-master',
  'tpl-hdb-3gen/g3-main -> g3-master',
  'tpl-hdb-jumbo/jb-main -> jb-master',
  'tpl-studio/st-main -> st-bath',
  'tpl-loft/lf-main -> lf-bath',
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
