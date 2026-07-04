// @vitest-environment happy-dom
/**
 * BUG-2 repro + fix proof: an IndexedDB blob eviction (or any reason a
 * user-uploaded def's blob can't be read back — private-mode wipe, storage
 * pressure, a corrupt record) must not let `hydrate()` silently drop the
 * placed furniture that referenced it, because the very next autosave would
 * then persist that loss permanently. See `docs/research/
 * 2026-07-04-deep-audit-and-opportunities.md` BUG-2 and `schema.ts`'s
 * `preserveUnresolvedItems`.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import type { SerializedState } from '../schema'
import { serialize } from '../schema'
import { useStore } from '../store'
import { hydrate } from './hydrate'
import { IdbAssetStore } from './IdbAssetStore'
import { AUTOSAVE_SLOT, LocalStorageAdapter } from './LocalStorageAdapter'

function itemsForDef(defId: string, count: number): SerializedState['items'] {
  return Array.from({ length: count }, (_, i) => ({
    id: `it-${i}`,
    defId,
    position: [i, i] as [number, number],
    rotation: 0,
    props: {},
  }))
}

function fakeSave(items: SerializedState['items']): SerializedState {
  return {
    version: 2,
    apartmentId: 'serangoon-north-vista-4r',
    items,
    doors: {},
    finishes: { floor: {}, walls: {} },
    userFurniture: [],
    userMaterials: [],
    timeMode: 'system',
    manualHour: 12,
    cameraMode: 'orbit',
    location: null,
    locationPromptDismissed: false,
    savedAt: '2026-07-01T00:00:00.000Z',
  }
}

describe('hydrate — BUG-2 (evicted/missing blob must not silently drop placed furniture)', () => {
  beforeEach(async () => {
    useStore.getState().__resetForTest()
    localStorage.clear()
    for (const a of await IdbAssetStore.list()) await IdbAssetStore.delete(a.assetId)
  })

  it('retains items whose def blob is missing from IDB instead of dropping them', async () => {
    // Simulate a prior session that placed 5 instances of one uploaded GLB
    // (multiple items sharing one blob) and autosaved — but the def's IDB
    // asset record is now gone (eviction/private-mode wipe/corruption): no
    // `IdbAssetStore` record exists for `abc123`, so `hydrateUserAssets()`
    // can't rebuild the `user-abc123` def this boot.
    const items = itemsForDef('user-abc123', 5)
    await LocalStorageAdapter.save(AUTOSAVE_SLOT, fakeSave(items))

    const result = await hydrate()

    expect(result.hydratedFromAutosave).toBe(true)
    // Reported as unresolved (informational), not silently discarded.
    expect(result.unresolvedItemIds.sort()).toEqual(items.map((it) => it.id).sort())
    // The items are still in the live store — not wiped.
    const liveIds = useStore.getState().items.map((it) => it.id)
    expect(liveIds.sort()).toEqual(items.map((it) => it.id).sort())
    for (const it of useStore.getState().items) {
      expect(it.defId).toBe('user-abc123')
    }
  })

  it('a subsequent autosave does not permanently erase the unresolved items', async () => {
    const items = itemsForDef('user-abc123', 5)
    await LocalStorageAdapter.save(AUTOSAVE_SLOT, fakeSave(items))
    await hydrate()

    // What the next debounced autosave (storage/autosave.ts `flush`) would
    // write to localStorage right now — must still carry the 5 items.
    const nextSavePayload = serialize(useStore.getState())
    expect(nextSavePayload.items.map((it) => it.id).sort()).toEqual(items.map((it) => it.id).sort())

    // And actually persisting that payload + rebooting must keep restoring
    // them (they don't get lost on a second round-trip either).
    await LocalStorageAdapter.save(AUTOSAVE_SLOT, nextSavePayload)
    useStore.getState().__resetForTest()
    const second = await hydrate()
    expect(second.unresolvedItemIds.length).toBe(5)
    expect(useStore.getState().items.length).toBe(5)
  })

  it('restores normally (no unresolved items) when the def IS resolvable', async () => {
    // Control case: a builtin def is always "known" — nothing should be
    // treated as unresolved, and this must not regress into re-adding
    // legitimate builtin items twice.
    const items = itemsForDef('sofa-3seat', 2)
    expect(BUILTIN_CATALOG['sofa-3seat']).toBeDefined()
    await LocalStorageAdapter.save(AUTOSAVE_SLOT, fakeSave(items))

    const result = await hydrate()

    expect(result.unresolvedItemIds).toEqual([])
    expect(useStore.getState().items.length).toBe(2)
  })

  // A NaN/Infinity transform can't actually reach this point through a real
  // localStorage round-trip — `LocalStorageAdapter.save` JSON-serializes (NaN
  // becomes `null`) and `.load` re-validates via `SerializedStateZ`, which
  // rejects a non-numeric position outright, treating the WHOLE slot as
  // corrupt (a separate, pre-existing `StorageError('corrupt', …)` path, not
  // a BUG-2 item-loss case). The "still drops a genuinely corrupt transform
  // while retaining an unresolved-def sibling" case is exercised directly
  // against `applySerialized`/`preserveUnresolvedItems` in `schema.test.ts`,
  // bypassing that JSON round-trip the way a future non-JSON storage backend
  // (or a hand-edited record) could.
})
