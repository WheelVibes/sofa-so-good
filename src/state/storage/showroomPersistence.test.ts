// @vitest-environment happy-dom
/**
 * Security review R7, finding S1 — opening a share link must never destroy the
 * visitor's own design. Reproduces the reviewer's probe (a visitor with the
 * 87-item default flat opens a 1-item showroom link, moves the sun, and ended up
 * with a 1-item saved design) and pins every leg of the fix: the view-only
 * persistence gate, the live-hash path, the pre-link recovery copy, "Make it
 * mine", editable links, and the S4 failed-decode state.
 *
 * Real timers throughout: the live-hash path goes through happy-dom's own
 * `hashchange` dispatch, and the autosave debounce is only 500 ms.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { designShareHash, encodeDesignShareCode } from '../../features/designShare'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import { isInteractableWindowFixture } from '../../furniture/windowFixtureInteract'
import { takeEditableCopy } from '../../ui/ShowroomBadge'
import { serialize } from '../schema'
import { useStore } from '../store'
import { pauseAutosave, resumeAutosave, startAutosave } from './autosave'
import {
  installShareRouteListener,
  loadSharedDesignFromUrl,
  resetShareRouteListenerForTests,
  resetShareSessionForTests,
} from './bootstrap'
import { watchFloorPlans } from './floorPlanStore'
import { AUTOSAVE_SLOT, LocalStorageAdapter, PRE_SHARE_SLOT_PREFIX } from './LocalStorageAdapter'
import {
  MAX_PRE_SHARE_BACKUPS,
  resetSharedLinkBackupForTests,
  restorePreShareBackup,
} from './sharedLinkBackup'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Longer than the 500 ms autosave debounce. */
const settle = () => sleep(650)

async function savedItemCount(): Promise<number> {
  return (await LocalStorageAdapter.load(AUTOSAVE_SLOT))?.items.length ?? -1
}

async function backupSlots(): Promise<string[]> {
  return (await LocalStorageAdapter.list())
    .map((m) => m.slot)
    .filter((s) => s.startsWith(PRE_SHARE_SLOT_PREFIX))
}

function lastToast() {
  const n = useStore.getState().notifications
  return n[n.length - 1]
}

/** A 1-item design (a curtain, so the walk-HUD toggle is exercisable), encoded. */
function senderCode(viewOnly: boolean, name = 'Sender flat'): string {
  useStore.getState().resetToDefault()
  const s = useStore.getState()
  const curtain =
    s.items.find((it) => {
      const def = BUILTIN_CATALOG[it.defId]
      return !!def && isInteractableWindowFixture(def)
    }) ?? s.items[0]
  useStore.setState({ items: [curtain], floorPlan: { ...s.floorPlan, id: 'sender', name } })
  return encodeDesignShareCode(useStore.getState(), viewOnly)
}

/** The visitor: the 87-item default flat, already autosaved (their real work). */
async function seedVisitor(): Promise<number> {
  useStore.getState().__resetForTest()
  useStore.getState().resetToDefault()
  useStore.getState().clearHistory()
  await LocalStorageAdapter.save(AUTOSAVE_SLOT, serialize(useStore.getState()))
  return useStore.getState().items.length
}

/** Everything a showroom visitor is allowed to change that is also persisted. */
function doShowroomThings() {
  const s = useStore.getState()
  s.setTimeMode('manual')
  s.setManualHour(19.5)
  s.setWeather('rain')
  s.setLightsMode(s.lightsMode === 'on' ? 'off' : 'on')
  s.setDesignNote('Love the curtains')
  useStore.getState().toggleWindowFixture(useStore.getState().items[0].id)
  useStore.setState({ cameraMode: 'firstPerson' }) // walk mode
}

let stopAutosave: (() => void) | null = null

beforeEach(() => {
  localStorage.clear()
  window.location.hash = ''
  resetSharedLinkBackupForTests()
  resetShareSessionForTests()
  resetShareRouteListenerForTests()
})

afterEach(() => {
  stopAutosave?.()
  stopAutosave = null
  window.location.hash = ''
  useStore.getState().__resetForTest()
})

describe('S1 — a showroom session never persists', () => {
  it('reproduces the probe: 87 items → 1-item showroom → allowed interactions → still 87 saved', async () => {
    const code = senderCode(true)
    const n = await seedVisitor()
    expect(n).toBe(87)
    stopAutosave = startAutosave()

    window.location.hash = designShareHash(code, true)
    await loadSharedDesignFromUrl()
    expect(useStore.getState().viewOnly).toBe(true)
    expect(useStore.getState().items).toHaveLength(1)

    doShowroomThings()
    await settle()
    expect(await savedItemCount()).toBe(87)

    // Unload paths flush a PENDING write — there must be none to flush.
    window.dispatchEvent(new Event('pagehide'))
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(await savedItemCount()).toBe(87)
    expect(useStore.getState().lastSavedAt).toBeNull()
  })

  it("does not leak the sender's floor plan through the floor-plan store either", async () => {
    const code = senderCode(true, 'Sender custom shell')
    await seedVisitor()
    watchFloorPlans()
    useStore.setState({ timeMode: 'manual' }) // prime the watcher's snapshot
    const before = localStorage.getItem('sofa.floorplans.v1')

    window.location.hash = designShareHash(code, true)
    await loadSharedDesignFromUrl()
    doShowroomThings()
    expect(localStorage.getItem('sofa.floorplans.v1')).toBe(before)
  })

  it('an edit still pending when the link opens is saved as the visitor’s own, not dropped', async () => {
    const code = senderCode(true)
    await seedVisitor()
    stopAutosave = startAutosave()
    useStore.setState((s) => ({ items: s.items.slice(1) })) // 86, debounce pending

    window.location.hash = designShareHash(code, true)
    await loadSharedDesignFromUrl()
    await settle()
    expect(await savedItemCount()).toBe(86)
    const [slot] = await backupSlots()
    expect((await LocalStorageAdapter.load(slot))?.items).toHaveLength(86)
  })

  it('a showroom → showroom hop takes no second copy (the store is not the visitor’s)', async () => {
    const a = senderCode(true, 'A')
    const b = senderCode(true, 'B')
    await seedVisitor()
    window.location.hash = designShareHash(a, true)
    await loadSharedDesignFromUrl()
    window.location.hash = designShareHash(b, true)
    await loadSharedDesignFromUrl()
    const slots = await backupSlots()
    expect(slots).toHaveLength(1)
    expect((await LocalStorageAdapter.load(slots[0]))?.items).toHaveLength(87)
  })
})

describe('S1 — "Make it mine"', () => {
  it('keeps the previous design recoverable, then persists the copy exactly once', async () => {
    const code = senderCode(true)
    await seedVisitor()
    stopAutosave = startAutosave()
    window.location.hash = designShareHash(code, true)
    await loadSharedDesignFromUrl()
    doShowroomThings()
    await settle()
    await takeEditableCopy()
    expect(useStore.getState().viewOnly).toBe(false)
    expect(window.location.hash).toBe('')
    const toast = lastToast()
    expect(toast.title).toBe('This design is yours now')
    expect(toast.message).toMatch(/Before shared link · /)
    expect(toast.actionLabel).toBe('Restore mine')
    // R7-AA: an action toast stays until acted on or dismissed (M3 / WCAG 2.2.1).
    expect(toast.autoDismissMs).toBeNull()

    // The copy IS written (a reload with no hash must not drop it)…
    await settle()
    const saved = await LocalStorageAdapter.load(AUTOSAVE_SLOT)
    expect(saved?.items).toHaveLength(1)
    // …including what the visitor did during the tour (it is theirs now).
    expect(saved?.note).toBe('Love the curtains')
    // …and the previous design survives in exactly one recovery slot.
    const slots = await backupSlots()
    expect(slots).toHaveLength(1)
    expect((await LocalStorageAdapter.load(slots[0]))?.items).toHaveLength(87)

    // Restore mine puts it back, durably.
    expect(await restorePreShareBackup(slots[0])).toBe(true)
    expect(useStore.getState().items).toHaveLength(87)
    await settle()
    expect(await savedItemCount()).toBe(87)
  })

  it('falls back to copying the untouched autosave slot when no entry copy exists', async () => {
    const code = senderCode(true)
    await seedVisitor()
    stopAutosave = startAutosave()
    window.location.hash = designShareHash(code, true)
    await loadSharedDesignFromUrl()
    // Simulate the entry copy having failed (e.g. storage full at that moment).
    for (const s of await backupSlots()) await LocalStorageAdapter.delete(s)
    resetSharedLinkBackupForTests()

    await takeEditableCopy()
    const slots = await backupSlots()
    expect(slots).toHaveLength(1)
    expect((await LocalStorageAdapter.load(slots[0]))?.items).toHaveLength(87)
  })

  it('a first-time visitor (nothing saved) gets no pointless copy', async () => {
    const code = senderCode(true)
    useStore.getState().__resetForTest()
    useStore.getState().resetToDefault()
    window.location.hash = designShareHash(code, true)
    await loadSharedDesignFromUrl()
    await takeEditableCopy()
    expect(await backupSlots()).toEqual([])
    expect(lastToast().message).toMatch(/Every tool is unlocked/)
  })

  it('still writes once on exit even if a pause/resume resynced the snapshot mid-session', async () => {
    const code = senderCode(true)
    await seedVisitor()
    stopAutosave = startAutosave()
    window.location.hash = designShareHash(code, true)
    await loadSharedDesignFromUrl()
    pauseAutosave()
    resumeAutosave() // resyncs lastPersistent to the SHOWROOM state
    await takeEditableCopy()
    await settle()
    expect(await savedItemCount()).toBe(1)
  })
})

describe('S1 — editable links are protected too', () => {
  it('#/design/ copies the visitor’s design first and offers Restore mine', async () => {
    const code = senderCode(false)
    await seedVisitor()
    stopAutosave = startAutosave()
    window.location.hash = designShareHash(code, false)
    await loadSharedDesignFromUrl()
    expect(useStore.getState().viewOnly).toBe(false)
    const toast = lastToast()
    expect(toast.message).toMatch(/Your previous design is kept as “Before shared link · /)
    expect(toast.actionLabel).toBe('Restore mine')
    // R7-AA: an action toast stays until acted on or dismissed (M3 / WCAG 2.2.1).
    expect(toast.autoDismissMs).toBeNull()

    await settle()
    expect(await savedItemCount()).toBe(1) // an editable link IS yours
    const [slot] = await backupSlots()
    expect((await LocalStorageAdapter.load(slot))?.items).toHaveLength(87)
  })

  it('a second link opened before any edit does not copy the first link’s untouched design', async () => {
    const one = senderCode(false, 'One')
    const two = senderCode(false, 'Two')
    await seedVisitor()
    window.location.hash = designShareHash(one, false)
    await loadSharedDesignFromUrl()
    window.location.hash = designShareHash(two, false)
    await loadSharedDesignFromUrl()
    const slots = await backupSlots()
    expect(slots).toHaveLength(1)
    expect((await LocalStorageAdapter.load(slots[0]))?.items).toHaveLength(87)
  })

  it(`recovery copies are capped at ${MAX_PRE_SHARE_BACKUPS} and never evict the user’s own saves`, async () => {
    await seedVisitor()
    for (let i = 0; i < 10; i++) {
      await LocalStorageAdapter.save(`mine-${i}`, serialize(useStore.getState()))
    }
    for (let i = 0; i < MAX_PRE_SHARE_BACKUPS + 2; i++) {
      const code = senderCode(false, `L${i}`)
      await seedVisitor() // an edited, non-pristine design each time
      window.location.hash = designShareHash(code, false)
      await loadSharedDesignFromUrl()
    }
    const all = (await LocalStorageAdapter.list()).map((m) => m.slot)
    for (let i = 0; i < 10; i++) expect(all).toContain(`mine-${i}`)
    expect(await backupSlots()).toHaveLength(MAX_PRE_SHARE_BACKUPS)
  })
})

describe('S4 — a failed decode changes nothing, and the URL says so', () => {
  it('editable session + broken #/showroom/ → stays editable, design kept, hash cleared', async () => {
    const n = await seedVisitor()
    window.location.hash = '#/showroom/not-a-real-code'
    await loadSharedDesignFromUrl()
    expect(useStore.getState().viewOnly).toBe(false)
    expect(useStore.getState().items).toHaveLength(n)
    expect(window.location.hash).toBe('')
    expect(lastToast().title).toBe("Couldn't open that showroom link")
    expect(await backupSlots()).toEqual([]) // a broken link replaces nothing
  })

  it('showroom session + broken #/design/ → stays gated, URL back on the showroom', async () => {
    const code = senderCode(true)
    await seedVisitor()
    const showroom = designShareHash(code, true)
    window.location.hash = showroom
    await loadSharedDesignFromUrl()

    window.location.hash = '#/design/garbage'
    await loadSharedDesignFromUrl()
    expect(useStore.getState().viewOnly).toBe(true)
    expect(useStore.getState().items).toHaveLength(1)
    expect(window.location.hash).toBe(showroom)
  })
})

// LAST in the file on purpose: a `hashchange` listener cannot be uninstalled, so
// once this runs every later `location.hash` write in this file would re-trigger
// a share loader behind the test's back.
describe('S1 — the live hashchange path', () => {
  it('the live hashchange path is gated too (an already-open tab)', async () => {
    const code = senderCode(true)
    await seedVisitor()
    stopAutosave = startAutosave()
    installShareRouteListener()

    window.location.hash = designShareHash(code, true)
    await sleep(0)
    await sleep(0)
    expect(useStore.getState().viewOnly).toBe(true)
    expect(useStore.getState().items).toHaveLength(1)

    doShowroomThings()
    await settle()
    expect(await savedItemCount()).toBe(87)
    // …and the visitor's design was copied before the swap.
    expect(await backupSlots()).toHaveLength(1)
  })
})
