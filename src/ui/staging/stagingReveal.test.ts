import { describe, expect, it, vi } from 'vitest'
import { captureStagingPair, type StagingCaptureDeps } from './stagingReveal'

/** Build a deps harness with sensible defaults + spies, overridable per test. */
function makeDeps(over: Partial<StagingCaptureDeps> = {}) {
  let hidden: string[] = over.getHiddenIds ? over.getHiddenIds() : []
  const setHiddenIds = vi.fn((ids: string[]) => {
    hidden = ids
  })
  const setItemsHidden = vi.fn((ids: string[], hide: boolean) => {
    hidden = hide ? [...new Set([...hidden, ...ids])] : hidden.filter((x) => !ids.includes(x))
  })
  const deps: StagingCaptureDeps = {
    getHiddenIds: () => hidden,
    getAllItemIds: () => ['a', 'b'],
    setHiddenIds,
    setItemsHidden,
    capture: vi.fn(() => 'data:image/png;base64,XXX'),
    wait: vi.fn(async () => {}),
    settleMs: 0,
    ...over,
  }
  return { deps, setHiddenIds, setItemsHidden, snapshotHidden: () => hidden }
}

describe('captureStagingPair', () => {
  it('captures after (furnished) then before (empty room), hiding all furniture between', async () => {
    const order: string[] = []
    const setItemsHidden = vi.fn((_ids: string[], _hide: boolean) => {
      order.push('hide-all')
    })
    const { deps } = makeDeps({
      setItemsHidden,
      capture: vi.fn(() => {
        order.push('capture')
        return 'png'
      }),
    })
    const pair = await captureStagingPair(deps)
    expect(pair).toEqual({ before: 'png', after: 'png' })
    // After is captured BEFORE the furniture is hidden; before is captured AFTER.
    expect(order).toEqual(['capture', 'hide-all', 'capture'])
    expect(setItemsHidden).toHaveBeenCalledWith(['a', 'b'], true)
  })

  it('restores the prior hidden set afterwards', async () => {
    const { deps, setHiddenIds } = makeDeps({ getHiddenIds: () => ['b'] })
    await captureStagingPair(deps)
    // The last restore call reinstates exactly the pre-capture hidden set.
    expect(setHiddenIds).toHaveBeenLastCalledWith(['b'])
  })

  it('restores the hidden set even if the empty-room capture fails', async () => {
    let calls = 0
    const { deps, setHiddenIds } = makeDeps({
      getHiddenIds: () => ['x'],
      capture: vi.fn(() => {
        calls += 1
        return calls === 1 ? 'after-png' : null // second (empty) capture fails
      }),
    })
    await expect(captureStagingPair(deps)).rejects.toThrow(/empty room/)
    expect(setHiddenIds).toHaveBeenLastCalledWith(['x'])
  })

  it('throws (and never hides anything) when there is no furniture', async () => {
    const { deps, setItemsHidden } = makeDeps({ getAllItemIds: () => [] })
    await expect(captureStagingPair(deps)).rejects.toThrow(/nothing to reveal/)
    expect(setItemsHidden).not.toHaveBeenCalled()
  })

  it('throws a view-closed message when the furnished capture is unavailable', async () => {
    const { deps, setItemsHidden } = makeDeps({ capture: vi.fn(() => null) })
    await expect(captureStagingPair(deps)).rejects.toThrow(/Open the 3D view/)
    // Never touched visibility since the first capture already failed.
    expect(setItemsHidden).not.toHaveBeenCalled()
  })
})
