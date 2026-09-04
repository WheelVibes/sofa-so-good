import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from './defaultPlan'
import { planLevels } from './levels'
import { roomsAcrossOpening } from './openingProbe'
import { PLAN_TEMPLATES } from './templates'
import type { FloorPlan } from './types'

/**
 * OPENING-NAMING (v0.31.8.42, doors added v0.31.8.43) — does a window called `<room>-win` actually open
 * into that room?
 *
 * This class of bug has been found FIVE times by hand, one template at a time, and
 * each instance meant a room shipped with no daylight while another had two:
 * `h4-m-win` and `h5-m-win` and `g3-m-win` all sat in their flat's KITCHEN;
 * `h2-liv-win` sat in the master; `cp-m-win` sat in the master BATHROOM. Rather
 * than keep finding them individually, this sweeps every window in the library.
 *
 * The check is deliberately conservative. A window is only judged when its id
 * resolves to exactly ONE room, so an ambiguous hint is skipped rather than
 * guessed at — 4 of 83 windows are skipped today. That keeps the test from
 * inventing failures, at the cost of not covering everything.
 *
 * Do NOT add an entry to silence a failure: one means a window is named for a room
 * it does not serve, and some room is probably dark.
 */

/** `jb-b3-win` -> `bed3`; `cp-liv-win` -> `living`; `h5-m-win` -> `master`. The
 *  aliases are the abbreviations the template ids actually use. */
const HINT_ALIAS: Record<string, string> = {
  m: 'master',
  liv: 'living',
  din: 'dining',
  kit: 'kit',
  b2: 'bed2',
  b3: 'bed3',
  b4: 'bed4',
  b5: 'bed5',
  b2b: 'bed2b',
  hs: 'shelter',
  cb: 'cbath',
  mb: 'mbath',
  bal: 'balcony',
}

function hintOf(winId: string): string | null {
  const m = winId.match(/^[a-z0-9]+-(.+?)-?win$/)
  if (!m) return null
  const h = m[1].replace(/-$/, '')
  return HINT_ALIAS[h] ?? h
}

function mismatches(planId: string, plan: FloorPlan): string[] {
  const out: string[] = []
  for (const level of planLevels(plan))
    for (const o of level.openings) {
      if (o.kind !== 'window') continue
      const hint = hintOf(o.id)
      if (!hint) continue
      const wall = level.walls.find((w) => w.id === o.wallId)
      if (!wall) continue
      // Only judge an unambiguous name.
      const cands = level.rooms.filter((r) => {
        const tail = r.id.replace(/^[a-z0-9]+-/, '')
        return tail === hint || tail.startsWith(hint)
      })
      if (cands.length !== 1) continue
      const across = roomsAcrossOpening(level.rooms, wall, o, 0.3, true)
      const lands = (across?.plus ?? across?.minus)?.id ?? null
      if (lands && lands !== cands[0].id)
        out.push(`${planId}/${level.id}: ${o.id} named for ${cands[0].id}, lands in ${lands}`)
    }
  return out
}

/** A door is judged the same way, except it serves TWO rooms: the named one must
 *  be on one side of it. The front door is excluded — `mainDoorRoom.test.ts` asks
 *  a different and stricter question of it. */
function doorMismatches(planId: string, plan: FloorPlan): string[] {
  const out: string[] = []
  for (const level of planLevels(plan))
    for (const o of level.openings) {
      if (o.kind !== 'door' || /main/.test(o.id)) continue
      const hint = hintOf(o.id.replace(/-door$/, 'win'))
      if (!hint) continue
      const wall = level.walls.find((w) => w.id === o.wallId)
      if (!wall) continue
      const cands = level.rooms.filter((r) => {
        const tail = r.id.replace(/^[a-z0-9]+-/, '')
        return tail === hint || tail.startsWith(hint)
      })
      if (cands.length !== 1) continue
      const across = roomsAcrossOpening(level.rooms, wall, o, 0.35, true)
      const sides = [across?.plus?.id ?? null, across?.minus?.id ?? null]
      if (!sides.includes(cands[0].id))
        out.push(
          `${planId}/${level.id}: ${o.id} named for ${cands[0].id}, opens ${sides.join(' | ')}`,
        )
    }
  return out
}

/** Windows named for a room they do not open into. */
const KNOWN_MISNAMED: string[] = []

/** Doors named for a room they do not serve. */
const KNOWN_MISNAMED_DOORS: string[] = []

describe('window naming', () => {
  it('matches the known-misnamed ratchet exactly', { timeout: 60_000 }, () => {
    const found = [
      ...mismatches('DEFAULT', buildDefaultPlan()),
      ...PLAN_TEMPLATES.flatMap((t) => mismatches(t.id ?? '?', t)),
    ]
    expect(found.sort()).toEqual([...KNOWN_MISNAMED].sort())
  })

  it('matches the known-misnamed DOOR ratchet exactly', { timeout: 60_000 }, () => {
    // Two were found when this arm was written, and both were doors I had added
    // myself in the v0.31.8.38 batch: `ex-hs-door` and `ex-yard-door` sat on
    // `ex-svc-s`, whose south side is entirely BEDROOM 3 — so the exec's kitchen,
    // service yard and shelter were entered by crossing somebody's bedroom. The
    // band now hangs off `ex-liv-w`, the only wall it shares with circulation.
    const found = [
      ...doorMismatches('DEFAULT', buildDefaultPlan()),
      ...PLAN_TEMPLATES.flatMap((t) => doorMismatches(t.id ?? '?', t)),
    ]
    expect(found.sort()).toEqual([...KNOWN_MISNAMED_DOORS].sort())
  })

  it('judges most of the library, so an empty list means something', { timeout: 60_000 }, () => {
    // An all-skipping matcher would pass the case above trivially. At the time of
    // writing 79 of 83 windows resolve to exactly one room.
    let judged = 0
    for (const plan of [buildDefaultPlan(), ...PLAN_TEMPLATES])
      for (const level of planLevels(plan))
        for (const o of level.openings) {
          if (o.kind !== 'window') continue
          const hint = hintOf(o.id)
          if (!hint) continue
          const cands = level.rooms.filter((r) => {
            const tail = r.id.replace(/^[a-z0-9]+-/, '')
            return tail === hint || tail.startsWith(hint)
          })
          if (cands.length === 1) judged++
        }
    expect(judged).toBeGreaterThanOrEqual(70)
  })
})
