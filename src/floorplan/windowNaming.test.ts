import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from './defaultPlan'
import { planLevels } from './levels'
import { roomsAcrossOpening } from './openingProbe'
import { PLAN_TEMPLATES } from './templates'
import type { FloorPlan } from './types'

/**
 * WINDOW-NAMING (v0.31.8.42) — does a window called `<room>-win` actually open
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

/** Windows named for a room they do not open into. */
const KNOWN_MISNAMED: string[] = []

describe('window naming', () => {
  it('matches the known-misnamed ratchet exactly', { timeout: 60_000 }, () => {
    const found = [
      ...mismatches('DEFAULT', buildDefaultPlan()),
      ...PLAN_TEMPLATES.flatMap((t) => mismatches(t.id ?? '?', t)),
    ]
    expect(found.sort()).toEqual([...KNOWN_MISNAMED].sort())
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
