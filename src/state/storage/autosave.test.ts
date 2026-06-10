import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store'
import { startAutosave } from './autosave'
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
