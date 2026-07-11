// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** R3-TEST-3 — corrupt-localStorage resilience + dedup for the dismissed
 *  info-callout ids (`hdb_dismissed_callouts`). The loader runs once at module
 *  init, so each load-path test re-imports the module after seeding storage. */
const LS_KEY = 'hdb_dismissed_callouts'

async function freshSlice() {
  vi.resetModules()
  const mod = await import('./calloutsSlice')
  // Minimal zustand-style harness: state IS the slice object, `set` merges.
  let state: Record<string, unknown>
  const set = (patch: object) => {
    state = { ...state, ...patch }
  }
  const get = () => state
  state = mod.createCalloutsSlice(set as never, get as never, {} as never) as never
  return {
    get: () => state as { dismissedCallouts: string[]; dismissCallout: (id: string) => void },
  }
}

describe('calloutsSlice — localStorage guards (R3-TEST-3)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('corrupt JSON degrades to an empty list, not a crash', async () => {
    localStorage.setItem(LS_KEY, '{not json!!')
    const { get } = await freshSlice()
    expect(get().dismissedCallouts).toEqual([])
  })

  it('non-array JSON degrades to an empty list', async () => {
    localStorage.setItem(LS_KEY, '{"a":1}')
    const { get } = await freshSlice()
    expect(get().dismissedCallouts).toEqual([])
  })

  it('filters non-string entries out of a mixed array', async () => {
    localStorage.setItem(LS_KEY, JSON.stringify(['walk-mode', 42, null, 'plan-editor', {}]))
    const { get } = await freshSlice()
    expect(get().dismissedCallouts).toEqual(['walk-mode', 'plan-editor'])
  })

  it('dismissCallout dedupes, ignores blank ids, and persists', async () => {
    const { get } = await freshSlice()
    get().dismissCallout('walk-mode')
    get().dismissCallout('walk-mode')
    get().dismissCallout('')
    expect(get().dismissedCallouts).toEqual(['walk-mode'])
    expect(JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')).toEqual(['walk-mode'])
  })

  it('round-trips: a dismissal is visible to the next module load', async () => {
    const first = await freshSlice()
    first.get().dismissCallout('room-editor')
    const second = await freshSlice()
    expect(second.get().dismissedCallouts).toEqual(['room-editor'])
  })
})
