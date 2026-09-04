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
  'tpl-hdb-4room/h4-bed3',
  'tpl-hdb-5room/h5-bed3',
  'tpl-hdb-exec/ex-bed3',
  // ex-master FIXED in v0.31.5.118 — `ex-m-win`'s offset was mirrored and put the
  // master's window in the KITCHEN. Corrected to the exact mirror (9.8 -> 0.4).
  // c4-bed4 FIXED on the feat/blender-render merge. `v0.31.8.41` added a window here and REVERTED
  // it, because at every offset in `c4-n`'s clear span the room's wardrobe stood in front of the
  // glass — trading this ratchet for `windowSightline`'s. That reason no longer holds: under the
  // arranger as it stands after `v0.31.9.26`'s `reserveRetry: false` and ROUTE-UNSEAL, `c4-b4win`
  // does NOT appear in `windowSightline`'s blocked list, so the trade the revert was avoiding does
  // not happen. Re-measured on the merge, both ratchets improve together.
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
    // (exec) gave their masters their windows back; 34 from v0.31.8.29, when the
    // jumbo re-author gave jb-master and jb-bed3 windows on their OWN walls —
    // `jb-m-win` had been at z=2.9, inside the kitchen; 37 from `.30`, the 3Gen
    // re-author, which fixed the SAME class of bug (`g3-m-win` at z=1.7, also in
    // the kitchen, and `g3-b3-win` at z=4.3, inside bedroom 2) and gave the
    // grandparent suite a window on the south wall it owns; 38 from `.31`, the
    // 3-room re-author — `h3-b2-win` had been at z=2.0, in the KITCHEN, and
    // bedroom 2 does not reach that wall at all.
    // 41 on the feat/blender-render merge: `c4-b4win` (see the list above) gives Bedroom 4 its
    // own window, which the revert at `v0.31.8.41` had left off.
    expect(owning).toBe(41)
  })
})
