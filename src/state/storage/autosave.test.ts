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
})
