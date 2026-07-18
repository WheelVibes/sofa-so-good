import { describe, expect, it, vi } from 'vitest'
import {
  captureVersionComparePair,
  type TemporaryDesignDeps,
  withTemporaryDesign,
} from './versionCompare'

/** A tiny fake store (plain object) that mimics just enough of the real
 *  Zustand store's shape for these deps: mutable state + a history counter +
 *  an autosave-pause counter, so the orchestration can be asserted against a
 *  round-trip without mounting the real app store. */
function makeFakeStore(initial: Record<string, unknown>) {
  let state = { ...initial }
  let historyPushes = 0
  let autosavePauses = 0
  let autosaveResumes = 0
  let suppressed = false

  const deps: TemporaryDesignDeps = {
    pick: (keys) => Object.fromEntries(keys.map((k) => [k, state[k]])),
    apply: (patch) => {
      if (!suppressed) historyPushes++ // a real store's setState would be undoable outside suppression
      state = { ...state, ...patch }
    },
    runWithoutHistory: (fn) => {
      const prev = suppressed
      suppressed = true
      try {
        fn()
      } finally {
        suppressed = prev
      }
    },
    pauseAutosave: () => {
      autosavePauses++
    },
    resumeAutosave: () => {
      autosaveResumes++
    },
  }

  return {
    deps,
    getState: () => state,
    getHistoryPushes: () => historyPushes,
    getAutosavePauses: () => autosavePauses,
    getAutosaveResumes: () => autosaveResumes,
  }
}

describe('withTemporaryDesign', () => {
  it('applies the patch for the duration of fn, then restores the exact prior values', async () => {
    const store = makeFakeStore({ items: ['sofa'], floorPlan: 'default', other: 42 })
    let seenDuring: Record<string, unknown> | null = null

    const result = await withTemporaryDesign(
      { items: ['bed'], floorPlan: 'custom' },
      store.deps,
      () => {
        seenDuring = { ...store.getState() }
        return 'captured'
      },
    )

    expect(result).toBe('captured')
    expect(seenDuring).toEqual({ items: ['bed'], floorPlan: 'custom', other: 42 })
    // Restored byte-for-byte, including the untouched key.
    expect(store.getState()).toEqual({ items: ['sofa'], floorPlan: 'default', other: 42 })
  })

  it('restores even when fn throws, and still resumes autosave', async () => {
    const store = makeFakeStore({ items: ['sofa'] })
    await expect(
      withTemporaryDesign({ items: ['bed'] }, store.deps, () => {
        throw new Error('capture failed')
      }),
    ).rejects.toThrow('capture failed')

    expect(store.getState()).toEqual({ items: ['sofa'] })
    expect(store.getAutosavePauses()).toBe(1)
    expect(store.getAutosaveResumes()).toBe(1)
  })

  it('never leaves a net history push (swap-in + restore are both suppressed)', async () => {
    const store = makeFakeStore({ items: ['sofa'] })
    const before = store.getHistoryPushes()
    await withTemporaryDesign({ items: ['bed'] }, store.deps, () => 'ok')
    // Both the swap-in `apply` and the restore `apply` ran inside
    // `runWithoutHistory`, so neither incremented the fake "history" counter.
    expect(store.getHistoryPushes()).toBe(before)
  })

  it('pauses autosave before touching state and resumes only after the restore', async () => {
    const store = makeFakeStore({ items: ['sofa'] })
    const order: string[] = []
    const deps: TemporaryDesignDeps = {
      ...store.deps,
      pauseAutosave: () => {
        order.push('pause')
        store.deps.pauseAutosave()
      },
      resumeAutosave: () => {
        order.push('resume')
        store.deps.resumeAutosave()
      },
      apply: (patch) => {
        order.push(`apply:${JSON.stringify(patch)}`)
        store.deps.apply(patch)
      },
    }
    await withTemporaryDesign({ items: ['bed'] }, deps, () => {
      order.push('fn')
      return 'ok'
    })
    expect(order).toEqual([
      'pause',
      'apply:{"items":["bed"]}',
      'fn',
      'apply:{"items":["sofa"]}',
      'resume',
    ])
  })
})

describe('captureVersionComparePair', () => {
  it('captures current first, then swaps in the saved patch, captures it, and restores', async () => {
    const store = makeFakeStore({ items: ['sofa'] })
    const captures: string[] = []
    const capture = vi.fn(() => {
      const snap = JSON.stringify(store.getState())
      captures.push(snap)
      return `png:${snap}`
    })

    const pair = await captureVersionComparePair({
      getSavedPatch: () => ({ items: ['bed', 'desk'] }),
      temporary: store.deps,
      capture,
      wait: async () => {},
    })

    expect(pair.current).toBe('png:{"items":["sofa"]}')
    expect(pair.saved).toBe('png:{"items":["bed","desk"]}')
    // The live store is back to the original design after capture.
    expect(store.getState()).toEqual({ items: ['sofa'] })
    expect(store.getAutosavePauses()).toBe(1)
    expect(store.getAutosaveResumes()).toBe(1)
  })

  it('throws a user-facing message when the canvas is not capturable for "current"', async () => {
    const store = makeFakeStore({ items: ['sofa'] })
    await expect(
      captureVersionComparePair({
        getSavedPatch: () => ({ items: ['bed'] }),
        temporary: store.deps,
        capture: () => null,
        wait: async () => {},
      }),
    ).rejects.toThrow('Open the 3D view first')
    // Never even attempted the swap.
    expect(store.getAutosavePauses()).toBe(0)
  })

  it('restores the live design even if the saved-frame capture fails', async () => {
    const store = makeFakeStore({ items: ['sofa'] })
    let calls = 0
    await expect(
      captureVersionComparePair({
        getSavedPatch: () => ({ items: ['bed'] }),
        temporary: store.deps,
        capture: () => {
          calls++
          return calls === 1 ? 'png:current' : null // saved-frame capture fails
        },
        wait: async () => {},
      }),
    ).rejects.toThrow('Could not capture the saved version.')
    expect(store.getState()).toEqual({ items: ['sofa'] })
    expect(store.getAutosaveResumes()).toBe(1)
  })
})
