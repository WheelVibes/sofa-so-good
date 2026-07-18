// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_QUOTE_TEMPLATE } from '../../export/quoteTemplate'
import { serialize } from '../schema'
import { useStore } from '../store'
import { PERSISTENT_WATCH_KEYS, pauseAutosave, resumeAutosave, startAutosave } from './autosave'
import type { StorageAdapter } from './StorageAdapter'
import { StorageError } from './StorageAdapter'

/** Build a stub adapter whose save() resolution is controllable per-call. */
function makeAdapter(behaviour: () => Promise<void>): StorageAdapter {
  return {
    save: vi.fn(behaviour),
    load: vi.fn(async () => null),
    list: vi.fn(async () => []),
    delete: vi.fn(async () => {}),
  }
}

describe('startAutosave error handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useStore.getState().resetToDefault()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('reports a StorageError via onError and recovers via onRecover', async () => {
    let shouldFail = true
    const adapter = makeAdapter(async () => {
      if (shouldFail) throw new StorageError('quota', 'full')
    })
    const onError = vi.fn()
    const onRecover = vi.fn()
    const stop = startAutosave({ adapter, onError, onRecover })

    // Trigger a persistent change → debounced flush → failing save.
    useStore.getState().resetToDefault()
    useStore.setState((s) => ({ items: [...s.items] }) as never)
    await vi.advanceTimersByTimeAsync(600)
    await Promise.resolve()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toBeInstanceOf(StorageError)
    expect(onRecover).not.toHaveBeenCalled()

    // Next save succeeds → onRecover fires once.
    shouldFail = false
    useStore.setState((s) => ({ items: [...s.items] }) as never)
    await vi.advanceTimersByTimeAsync(600)
    await Promise.resolve()
    expect(onRecover).toHaveBeenCalledTimes(1)

    stop()
  })

  it('flushes a pending debounced write on pagehide (no edit lost on reload)', async () => {
    const adapter = makeAdapter(async () => {})
    const stop = startAutosave({ adapter })

    // A persistent change schedules a debounced save; before the debounce fires
    // the adapter hasn't been called.
    useStore.setState((s) => ({ items: [...s.items] }) as never)
    expect(adapter.save).not.toHaveBeenCalled()

    // pagehide must flush the pending write synchronously.
    window.dispatchEvent(new Event('pagehide'))
    await Promise.resolve()
    expect(adapter.save).toHaveBeenCalledTimes(1)

    stop()
  })

  // Regression: every field `serialize()` persists must trigger an autosave on
  // its own. Before this guard, editing only the floor plan / lights / a pinned
  // annotation / orientation / the design note left autosave silent, so the
  // change was lost on reload unless an unrelated tracked field also changed.
  it.each([
    ['lightsMode', (s: ReturnType<typeof useStore.getState>) => s.setLightsMode?.('on')],
    ['orientationDeg', () => useStore.setState({ orientationDeg: 90 })],
    ['designNote', (s: ReturnType<typeof useStore.getState>) => s.setDesignNote('client brief')],
    [
      'annotations',
      () => useStore.setState({ annotations: [{ id: 'a1', a: [0, 0], b: [1, 1], shape: 'line' }] }),
    ],
    [
      'floorPlan',
      (s: ReturnType<typeof useStore.getState>) =>
        useStore.setState({ floorPlan: { ...s.floorPlan, name: 'Renamed plan' } }),
    ],
    // BUG-001: these four are written by serialize() but were NOT watched, so
    // editing only one of them used to leave autosave silent → lost on reload.
    [
      'comments',
      (s: ReturnType<typeof useStore.getState>) =>
        s.addComment({ position: [1, 2], text: 'Move sofa left' }),
    ],
    [
      'drawingCallouts',
      (s: ReturnType<typeof useStore.getState>) =>
        s.addDrawingCallout({ sheet: 'floor-plan', text: 'Power point here', x: 0.4, y: 0.6 }),
    ],
    [
      'panoTourStops',
      () =>
        useStore.setState((s) => ({
          panoTourStops: [...s.panoTourStops, { id: 'stop1', label: 'Entry', position: [0, 0] }],
        })),
    ],
    [
      'quoteTemplate',
      (s: ReturnType<typeof useStore.getState>) =>
        s.setQuoteTemplate({ ...DEFAULT_QUOTE_TEMPLATE, companyName: 'Acme Interiors' }),
    ],
    ['petTypes', (s: ReturnType<typeof useStore.getState>) => s.togglePetType('cat')],
  ])('autosaves when only %s changes', async (_label, mutate) => {
    const adapter = makeAdapter(async () => {})
    const stop = startAutosave({ adapter })
    mutate(useStore.getState())
    await vi.advanceTimersByTimeAsync(600)
    await Promise.resolve()
    expect(adapter.save).toHaveBeenCalledTimes(1)
    stop()
  })

  it('flushes on visibilitychange → hidden', async () => {
    const adapter = makeAdapter(async () => {})
    const stop = startAutosave({ adapter })
    useStore.setState((s) => ({ items: [...s.items] }) as never)
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()
    expect(adapter.save).toHaveBeenCalledTimes(1)
    stop()
  })
})

// BUG: overlapping version-compare captures corrupt restore + risk an autosave
// leak — pauseAutosave/resumeAutosave must be a NESTING counter, not a plain
// boolean, so two overlapping pause windows can't have the second's resume
// prematurely re-enable autosave while the first's swap is still live.
describe('pauseAutosave/resumeAutosave nesting counter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useStore.getState().resetToDefault()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('a single pause/resume pair behaves as before (no change scheduled while paused, resumes after)', async () => {
    const adapter = makeAdapter(async () => {})
    const stop = startAutosave({ adapter })

    pauseAutosave()
    useStore.setState((s) => ({ items: [...s.items] }) as never)
    await vi.advanceTimersByTimeAsync(600)
    expect(adapter.save).not.toHaveBeenCalled()

    resumeAutosave()
    useStore.setState((s) => ({ items: [...s.items] }) as never)
    await vi.advanceTimersByTimeAsync(600)
    expect(adapter.save).toHaveBeenCalledTimes(1)

    stop()
  })

  it('double pause needs double resume — a single resume does NOT re-enable scheduling', async () => {
    const adapter = makeAdapter(async () => {})
    const stop = startAutosave({ adapter })

    // Two overlapping pauses (e.g. two overlapping version-compare captures).
    pauseAutosave()
    pauseAutosave()

    // One resume (the first capture finishing) must NOT re-enable autosave —
    // the second capture's swap may still be live.
    resumeAutosave()
    useStore.setState((s) => ({ items: [...s.items] }) as never)
    await vi.advanceTimersByTimeAsync(600)
    expect(adapter.save).not.toHaveBeenCalled()

    // The matching second resume finally re-enables it.
    resumeAutosave()
    useStore.setState((s) => ({ items: [...s.items] }) as never)
    await vi.advanceTimersByTimeAsync(600)
    expect(adapter.save).toHaveBeenCalledTimes(1)

    stop()
  })

  it('an extra resume beyond the pause count does not go negative / misbehave on the next real pause', async () => {
    const adapter = makeAdapter(async () => {})
    const stop = startAutosave({ adapter })

    // Resume with no prior pause — should clamp at 0, not go negative.
    resumeAutosave()
    pauseAutosave()
    useStore.setState((s) => ({ items: [...s.items] }) as never)
    await vi.advanceTimersByTimeAsync(600)
    expect(adapter.save).not.toHaveBeenCalled()

    resumeAutosave()
    useStore.setState((s) => ({ items: [...s.items] }) as never)
    await vi.advanceTimersByTimeAsync(600)
    expect(adapter.save).toHaveBeenCalledTimes(1)

    stop()
  })
})

// BUG-001 guard: the autosave watch-list MUST be a superset of every field
// serialize() persists, or a change to an unwatched-but-persisted field is
// silently lost on reload. This test fails if serialize() gains a new persisted
// field that isn't added to PERSISTENT_WATCH_KEYS in autosave.ts.
describe('autosave ⊇ serialize() invariant', () => {
  // resetToDefault() only resets items/selection — clear the persisted slices
  // these tests touch so they don't leak across cases.
  const clearPersisted = () => {
    useStore.getState().resetToDefault()
    useStore.setState({
      comments: [],
      drawingCallouts: [],
      panoTourStops: [],
      annotations: [],
      quoteTemplate: DEFAULT_QUOTE_TEMPLATE,
      designNote: '',
    })
  }
  beforeEach(clearPersisted)
  afterEach(clearPersisted)

  /** serialize() output keys that are persistence metadata, not store fields —
   *  they always exist and don't need a watch-list entry. */
  const META_KEYS = new Set(['version', 'apartmentId', 'savedAt'])
  /** serialize() emits some fields under a different key than the store slice
   *  they read from. Map serialize-key → the watch-list (store) key. */
  const SERIALIZE_TO_STORE: Record<string, string> = { note: 'designNote' }

  it('every field serialize() writes is covered by PERSISTENT_WATCH_KEYS', () => {
    // Populate every conditionally-emitted persisted field so serialize()
    // outputs the maximal key set (annotations/comments/drawingCallouts/
    // panoTourStops/quoteTemplate/floorPlan are only emitted when non-empty /
    // non-default). A non-default floor plan exercises the `floorPlan` key.
    const s = useStore.getState()
    s.addComment({ position: [1, 1], text: 'pin' })
    s.addDrawingCallout({ sheet: 'floor-plan', text: 'callout', x: 0.5, y: 0.5 })
    s.setQuoteTemplate({ ...DEFAULT_QUOTE_TEMPLATE, companyName: 'Co' })
    useStore.setState((st) => ({
      annotations: [{ id: 'a1', a: [0, 0], b: [1, 1], shape: 'line' }],
      panoTourStops: [{ id: 'st1', label: 'Entry', position: [0, 0] }],
      floorPlan: { ...st.floorPlan, name: 'Custom plan' },
      designNote: 'a note',
      petTypes: ['cat'],
    }))

    const persistedKeys = Object.keys(serialize(useStore.getState()))
      .filter((k) => !META_KEYS.has(k))
      .map((k) => SERIALIZE_TO_STORE[k] ?? k)

    const watched = new Set<string>(PERSISTENT_WATCH_KEYS)
    const missing = persistedKeys.filter((k) => !watched.has(k))
    expect(missing).toEqual([])
  })

  it('round-trips comments / drawingCallouts / panoTourStops / quoteTemplate through serialize()', () => {
    const s = useStore.getState()
    const commentId = s.addComment({ position: [2, 3], text: 'Swap rug' })
    s.addDrawingCallout({ sheet: 'floor-plan', text: 'Outlet', x: 0.2, y: 0.8 })
    s.setQuoteTemplate({ ...DEFAULT_QUOTE_TEMPLATE, companyName: 'Studio One' })
    useStore.setState((st) => ({
      panoTourStops: [...st.panoTourStops, { id: 'st-rt', label: 'Living', position: [1, 1] }],
    }))

    const out = serialize(useStore.getState())
    expect(commentId).toBeTruthy()
    expect(out.comments?.[0]?.text).toBe('Swap rug')
    expect(out.drawingCallouts?.[0]?.text).toBe('Outlet')
    expect(out.panoTourStops?.find((p) => p.id === 'st-rt')?.label).toBe('Living')
    expect(out.quoteTemplate?.companyName).toBe('Studio One')
  })
})
