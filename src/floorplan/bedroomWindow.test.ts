import { describe, expect, it } from 'vitest'
import { planLevels } from './levels'
import { roomCategory } from './roomCategory'
import { PLAN_TEMPLATES } from './templates'
import { pointInRoom } from './types'

/**
 * BEDROOM-WINDOW (v0.31.5.113) — a habitable room needs natural light, and a
 * template bedroom should own a window on one of its own walls.
 *
 * This is a RATCHET, like `templateEnclosure.test.ts`. The listed bedrooms ship
 * windowless today and fixing them means moving glass in hand-authored
 * Singapore reference plans — a content decision, recorded as item (h) in
 * `docs/open-graphics-decisions.md`. The test exists so a NEW template cannot
 * add another, and so fixing one shows up as a required edit to the list.
 *
 * **Do NOT add an entry to silence a failure.** A new entry means a plan ships a
 * bedroom with no daylight.
 */
const KNOWN_WINDOWLESS_BEDROOMS = [
  // Down from 15 to 3. `v0.31.5.115`/`.116`/`.118` corrected three MIRRORED offsets (the
  // `perimeter()` bug: S and W walls are built backwards, so an offset written as an absolute
  // coordinate lands in the wrong room). `v0.31.7.192` and `.193` added NINE new windows — the
  // mirror is a position FINDER, not a fix, because flipping an existing window merely swaps it
  // between two rooms and leaves the count unchanged (measured).
  //
  // These three are the genuine remainder: a scan of every EXTERNAL wall (`perimeter()` marks its
  // four `thickness: 'external'`) finds no span on a wall of their own where 1.5 m of glass would
  // open outdoors. They need the plan restructured, not a window moved — which is what item (h)
  // said all along.
  'tpl-hdb-4room/h4-bed3',
  'tpl-hdb-5room/h5-bed3',
  'tpl-hdb-exec/ex-bed3',
]

/** Does this room own `win`? Probe 0.3 m either side of the glass centre — the
 *  room-side hit means the window opens into it. Room rects are inset from wall
 *  centrelines, so an on-wall point itself is outside every room. */
function ownsWindow(
  room: Parameters<typeof pointInRoom>[0],
  wall: { start: [number, number]; end: [number, number] },
  offset: number,
  width: number,
) {
  const [ax, az] = wall.start
  const [bx, bz] = wall.end
  const len = Math.hypot(bx - ax, bz - az)
  if (len === 0) return false
  const t = (offset + width / 2) / len
  const cx = ax + (bx - ax) * t
  const cz = az + (bz - az) * t
  const nx = -(bz - az) / len
  const nz = (bx - ax) / len
  return [0.3, -0.3].some((d) => pointInRoom(room, cx + nx * d, cz + nz * d))
}

describe('template bedrooms have daylight', () => {
  it('every bedroom owns a window on one of its own walls', () => {
    const windowless: string[] = []
    for (const tpl of PLAN_TEMPLATES)
      for (const level of planLevels(tpl)) {
        const wins = level.openings.filter((o) => o.kind === 'window')
        for (const room of level.rooms) {
          const c = roomCategory(room)
          if (c !== 'bedroom' && c !== 'masterBedroom') continue
          const owns = wins.some((w) => {
            const wall = level.walls.find((x) => x.id === w.wallId)
            return wall ? ownsWindow(room, wall, w.offset, w.width) : false
          })
          if (!owns) windowless.push(`${tpl.id}/${room.id}`)
        }
      }
    expect(windowless).toEqual(KNOWN_WINDOWLESS_BEDROOMS)
  })

  // The probe must be able to say YES, or the list above would be vacuous — 29
  // of the 44 template bedrooms DO own a window.
  it('the ownership probe is not vacuous', () => {
    let owning = 0
    for (const tpl of PLAN_TEMPLATES)
      for (const level of planLevels(tpl)) {
        const wins = level.openings.filter((o) => o.kind === 'window')
        for (const room of level.rooms) {
          const c = roomCategory(room)
          if (c !== 'bedroom' && c !== 'masterBedroom') continue
          const owns = wins.some((w) => {
            const wall = level.walls.find((x) => x.id === w.wallId)
            return wall ? ownsWindow(room, wall, w.offset, w.width) : false
          })
          if (owns) owning++
        }
      }
    // 29 until v0.31.5.115 (4-room), 30 until `.116` (5-room), 31 until `.118`
    // (exec) gave their masters their windows back; 35 after `v0.31.7.192` and **41** after
    // `.193`, which added six more on external walls. 41 of 44 template bedrooms now have daylight.
    expect(owning).toBe(41)
  })
})
