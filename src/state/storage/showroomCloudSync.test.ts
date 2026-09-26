// @vitest-environment happy-dom
/**
 * Security review R7, finding S1 — the CLOUD leg. For a signed-in user on a
 * backend build, the autosave slot is mirrored to `/api/designs/autosave` and
 * reconciled latest-wins across devices, so a showroom session that reached the
 * autosave would have pushed the SENDER's design to every device the visitor
 * owns. This drives the real `storage` adapter (cloud-mirror path) with the API
 * client mocked, and asserts no autosave PUT happens during a showroom session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn(async (_path: string, _init?: RequestInit) => ({}))
vi.mock('../../features/api/client', async (orig) => ({
  ...(await orig<typeof import('../../features/api/client')>()),
  hasBackend: () => true,
  apiFetch: (path: string, init?: RequestInit) => apiFetch(path, init),
}))

const { designShareHash, encodeDesignShareCode } = await import('../../features/designShare')
const { takeEditableCopy } = await import('../../ui/ShowroomBadge')
const { serialize } = await import('../schema')
const { useStore } = await import('../store')
const { flushCloudAutosave, isCloudActive } = await import('./adapter')
const { startAutosave } = await import('./autosave')
const { loadSharedDesignFromUrl, resetShareSessionForTests } = await import('./bootstrap')
const { AUTOSAVE_SLOT, LocalStorageAdapter } = await import('./LocalStorageAdapter')
const { resetSharedLinkBackupForTests } = await import('./sharedLinkBackup')

/** Every design PUT the cloud received: slot → item counts, in order. */
function cloudPuts(): { slot: string; items: number }[] {
  return apiFetch.mock.calls
    .filter(([, init]) => init?.method === 'PUT')
    .map(([path, init]) => ({
      slot: decodeURIComponent(String(path).replace('/designs/', '')),
      items: (JSON.parse(String(init?.body)) as { items: unknown[] }).items.length,
    }))
}

let stop: (() => void) | null = null

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  apiFetch.mockClear()
  resetSharedLinkBackupForTests()
  resetShareSessionForTests()
  window.location.hash = ''
})

afterEach(() => {
  stop?.()
  stop = null
  vi.useRealTimers()
  window.location.hash = ''
  useStore.getState().__resetForTest()
})

describe('S1 — cloud sync during a showroom session', () => {
  it('never pushes the sender’s design to the visitor’s cloud autosave', async () => {
    // Sender: 1 item, as a showroom link.
    useStore.getState().resetToDefault()
    useStore.setState((s) => ({ items: s.items.slice(0, 1) }))
    const code = encodeDesignShareCode(useStore.getState(), true)

    // Visitor: signed in, 87-item design saved.
    useStore.getState().__resetForTest()
    useStore.getState().resetToDefault()
    useStore.setState({ currentUser: { id: 'u1', name: 'Visitor', role: 'user' } } as never)
    expect(isCloudActive()).toBe(true)
    await LocalStorageAdapter.save(AUTOSAVE_SLOT, serialize(useStore.getState()))
    stop = startAutosave()

    window.location.hash = designShareHash(code, true)
    await loadSharedDesignFromUrl()
    expect(useStore.getState().viewOnly).toBe(true)

    // Allowed showroom interactions, well past the debounce AND the 60 s cloud throttle.
    const s = useStore.getState()
    s.setTimeMode('manual')
    s.setManualHour(20)
    s.setDesignNote('nice')
    useStore.setState({ cameraMode: 'firstPerson' })
    await vi.advanceTimersByTimeAsync(61_000)
    window.dispatchEvent(new Event('pagehide'))
    flushCloudAutosave()
    await vi.advanceTimersByTimeAsync(61_000)

    const puts = cloudPuts()
    expect(puts.filter((p) => p.slot === AUTOSAVE_SLOT)).toEqual([])
    // The only cloud write is the recovery copy of the VISITOR's design.
    expect(puts).toHaveLength(1)
    expect(puts[0].slot).toMatch(/^before-shared-link-/)
    expect(puts[0].items).toBe(87)
    expect((await LocalStorageAdapter.load(AUTOSAVE_SLOT))?.items).toHaveLength(87)

    // "Make it mine" is the visitor's explicit choice: from then on the copy
    // syncs like any design of theirs (throttled), with the previous one kept.
    await takeEditableCopy()
    await vi.advanceTimersByTimeAsync(61_000)
    flushCloudAutosave()
    const after = cloudPuts().filter((p) => p.slot === AUTOSAVE_SLOT)
    expect(after).toEqual([{ slot: AUTOSAVE_SLOT, items: 1 }])
  })
})
