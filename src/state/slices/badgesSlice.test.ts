// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** R3-TEST-3 — corrupt-localStorage resilience + dedup for the seen "New"
 *  feature badges (`hdb_seen_badges`), mirroring `calloutsSlice.test.ts`. */
const LS_KEY = 'hdb_seen_badges'

async function freshSlice() {
  vi.resetModules()
  const mod = await import('./badgesSlice')
  let state: Record<string, unknown>
  const set = (patch: object) => {
    state = { ...state, ...patch }
  }
  const get = () => state
  state = mod.createBadgesSlice(set as never, get as never, {} as never) as never
  return { get: () => state as { seenBadges: string[]; markBadgeSeen: (id: string) => void } }
}

describe('badgesSlice — localStorage guards (R3-TEST-3)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('corrupt JSON degrades to an empty list, not a crash', async () => {
    localStorage.setItem(LS_KEY, 'not-json[')
    const { get } = await freshSlice()
    expect(get().seenBadges).toEqual([])
  })

  it('non-array JSON degrades to an empty list', async () => {
    localStorage.setItem(LS_KEY, '"just-a-string"')
    const { get } = await freshSlice()
    expect(get().seenBadges).toEqual([])
  })

  it('filters non-string entries out of a mixed array', async () => {
    localStorage.setItem(LS_KEY, JSON.stringify([1, 'wallFadeSlider', false, [], 'panoTour']))
    const { get } = await freshSlice()
    expect(get().seenBadges).toEqual(['wallFadeSlider', 'panoTour'])
  })

  it('markBadgeSeen dedupes, ignores blank ids, and persists', async () => {
    const { get } = await freshSlice()
    get().markBadgeSeen('panoTour')
    get().markBadgeSeen('panoTour')
    get().markBadgeSeen('')
    expect(get().seenBadges).toEqual(['panoTour'])
    expect(JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')).toEqual(['panoTour'])
  })

  it('round-trips: a seen badge is visible to the next module load', async () => {
    const first = await freshSlice()
    first.get().markBadgeSeen('styleQuiz')
    const second = await freshSlice()
    expect(second.get().seenBadges).toEqual(['styleQuiz'])
  })
})
