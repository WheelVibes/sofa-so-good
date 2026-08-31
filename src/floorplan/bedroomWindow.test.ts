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
  'tpl-hdb-3room/h3-bed2',
  'tpl-hdb-4room/h4-bed3',
  // h4-master FIXED in v0.31.5.115 — `h4-m-win`'s offset was mirrored and put the
  // master's window in the KITCHEN. Corrected to the exact mirror (7.4 -> 0.6).
  'tpl-hdb-5room/h5-bed3',
  // h5-master FIXED in v0.31.5.116 — `h5-m-win`'s offset was mirrored and put the
  // master's window in the KITCHEN. Corrected to the exact mirror (8.2 -> 1.0).
  'tpl-hdb-exec/ex-bed3',
  'tpl-hdb-exec/ex-bed2b',
  // ex-master FIXED in v0.31.5.118 — `ex-m-win`'s offset was mirrored and put the
  // master's window in the KITCHEN. Corrected to the exact mirror (9.8 -> 0.4).
  'tpl-hdb-3gen/g3-gen',
  'tpl-hdb-3gen/g3-bed3',
  'tpl-hdb-3gen/g3-master',
  'tpl-hdb-jumbo/jb-bed3',
  'tpl-hdb-jumbo/jb-master',
  'tpl-condo-4bed/c4-bed4',
  'tpl-condo-penthouse/cp-master',
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
    // (exec) gave their masters their windows back.
    expect(owning).toBe(32)
  })
})
