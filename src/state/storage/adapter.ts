/**
 * Storage adapter selection. Guests (and the offline / GitHub Pages build) use
 * `LocalStorageAdapter`. A signed-in user on a backend-enabled build uses a
 * cloud-mirroring adapter: writes go to localStorage synchronously (offline
 * cache + zero-latency) AND up to the cloud, and reads prefer the cloud with a
 * local fallback.
 *
 * D1 free-tier write budget (100k rows/day) is respected by THROTTLING the
 * high-frequency autosave slot to at most one cloud write per `CLOUD_AUTOSAVE_MS`
 * while still persisting every change locally. Named-slot saves/deletes are
 * infrequent, so they mirror to the cloud immediately.
 */
import { hasBackend } from '../../features/api/client'
import { isFeatureEnabled } from '../../features/featureFlags'
import type { SerializedState } from '../schema'
import { useStore } from '../store'
import { AUTOSAVE_SLOT, LocalStorageAdapter } from './LocalStorageAdapter'
import { ServerAdapter } from './ServerAdapter'
import type { SlotMeta, StorageAdapter } from './StorageAdapter'

/** Minimum spacing between cloud autosave writes (guards the D1 write budget). */
const CLOUD_AUTOSAVE_MS = 60_000

/** Is cloud sync active right now? (backend present + signed in + flag on) */
export function isCloudActive(): boolean {
  return hasBackend() && !!useStore.getState().currentUser && isFeatureEnabled('accounts')
}

// --- Throttled cloud autosave push -------------------------------------------
let pendingAutosave: SerializedState | null = null
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
let lastAutosavePush = 0

function scheduleAutosavePush(state: SerializedState): void {
  pendingAutosave = state
  if (autosaveTimer) return
  const wait = Math.max(0, CLOUD_AUTOSAVE_MS - (Date.now() - lastAutosavePush))
  autosaveTimer = setTimeout(flushAutosavePush, wait)
}

function flushAutosavePush(): void {
  autosaveTimer = null
  const state = pendingAutosave
  pendingAutosave = null
  if (!state || !isCloudActive()) return
  lastAutosavePush = Date.now()
  void ServerAdapter.save(AUTOSAVE_SLOT, state).catch(() => {
    /* best-effort; local copy is authoritative offline */
  })
}

/** Flush any pending cloud autosave immediately (e.g. on sign-out / pagehide). */
export function flushCloudAutosave(): void {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
    autosaveTimer = null
  }
  flushAutosavePush()
}

/** Cloud-mirroring adapter: local is always written; cloud is mirrored. */
const CloudMirrorAdapter: StorageAdapter = {
  async save(slot, state) {
    await LocalStorageAdapter.save(slot, state)
    if (slot === AUTOSAVE_SLOT) scheduleAutosavePush(state)
    else await ServerAdapter.save(slot, state)
  },
  async load(slot) {
    try {
      const cloud = await ServerAdapter.load(slot)
      if (cloud) return cloud
    } catch {
      /* fall back to local */
    }
    return LocalStorageAdapter.load(slot)
  },
  async list() {
    const cloud = await ServerAdapter.list().catch(() => [] as SlotMeta[])
    if (cloud.length > 0) return cloud
    return LocalStorageAdapter.list()
  },
  async delete(slot) {
    await LocalStorageAdapter.delete(slot)
    await ServerAdapter.delete(slot).catch(() => {
      /* best-effort */
    })
  },
}

/** The adapter to use right now, chosen dynamically (login state can change). */
export function getStorageAdapter(): StorageAdapter {
  return isCloudActive() ? CloudMirrorAdapter : LocalStorageAdapter
}

/**
 * A stable adapter object that dispatches to `getStorageAdapter()` per call, so
 * callers (autosave loop, File menu, Versions panel) transparently follow the
 * current sign-in state without being re-instantiated.
 */
export const storage: StorageAdapter = {
  save: (slot, state) => getStorageAdapter().save(slot, state),
  load: (slot) => getStorageAdapter().load(slot),
  list: () => getStorageAdapter().list(),
  delete: (slot) => getStorageAdapter().delete(slot),
}
