/**
 * Boot-time cloud reconciliation (backend builds only). After the local-first
 * hydrate, this revalidates the server session and, for a signed-in user:
 *   - merges cloud favourites, and
 *   - reconciles the autosave slot latest-wins by `savedAt` (cloud newer -> pull
 *     and apply; local newer -> push up).
 *
 * Guests and the offline / GitHub Pages build no-op (no backend).
 */
import { hasBackend } from '../../features/api/client'
import { isFeatureEnabled } from '../../features/featureFlags'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import type { IkeaGltfDef } from '../../furniture/types'
import { applySerialized, preserveUnresolvedItems, type SerializedState } from '../schema'
import { useStore } from '../store'
import { resolveIkeaRuntimeUrls } from './hydrateAssets'
import { AUTOSAVE_SLOT, LocalStorageAdapter } from './LocalStorageAdapter'
import { ServerAdapter } from './ServerAdapter'

async function applyCloudDesign(saved: SerializedState): Promise<void> {
  // Re-resolve IKEA def runtime blob URLs from this device's IDB (matches hydrate);
  // user-uploaded defs whose blobs aren't on this device resolve to nothing
  // (documented cross-device limit — blobs are IDB-only, never cloud-synced).
  const ikeaDefs = saved.userFurniture.filter(
    (d) => d.source === 'ikea',
  ) as unknown as IkeaGltfDef[]
  if (ikeaDefs.length > 0) {
    const resolved = await resolveIkeaRuntimeUrls(ikeaDefs).catch(() => ikeaDefs)
    const existing = useStore.getState().userFurniture
    const ids = new Set(resolved.map((d) => d.id))
    useStore.getState().setUserFurniture([...existing.filter((d) => !ids.has(d.id)), ...resolved])
  }
  const userIds = useStore.getState().userFurniture.map((d) => d.id)
  const packIds = useStore.getState().packFurniture.map((d) => d.id)
  const known = new Set<string>([...Object.keys(BUILTIN_CATALOG), ...userIds, ...packIds])
  const patch = applySerialized(saved, known)
  // BUG-2: this reconciles the user's OWN cloud-saved design, not a
  // cross-instance import — an unresolvable def here means this device
  // simply doesn't have the blob (cross-device limit above), not that the
  // user wants the furniture gone. Retaining the item keeps its placement
  // data alive in the save (it'll render correctly again on a device that
  // does have the blob) instead of the next autosave permanently wiping it
  // everywhere, including the cloud copy this device just adopted.
  preserveUnresolvedItems(saved, known, patch)
  useStore.setState(patch)
  useStore.getState().clearHistory?.()
}

async function reconcileAutosave(): Promise<void> {
  const [local, cloud] = await Promise.all([
    LocalStorageAdapter.load(AUTOSAVE_SLOT).catch(() => null),
    ServerAdapter.load(AUTOSAVE_SLOT).catch(() => null),
  ])
  if (cloud && (!local || cloud.savedAt > local.savedAt)) {
    // Cloud is newer — adopt it locally + in the store.
    await LocalStorageAdapter.save(AUTOSAVE_SLOT, cloud).catch(() => {})
    await applyCloudDesign(cloud)
  } else if (local && (!cloud || local.savedAt > cloud.savedAt)) {
    // Local is newer — push it up so the server catches up.
    void ServerAdapter.save(AUTOSAVE_SLOT, local).catch(() => {})
  }
}

export async function cloudBoot(): Promise<void> {
  if (!hasBackend()) return
  await useStore.getState().refreshAuth()
  if (!useStore.getState().currentUser || !isFeatureEnabled('accounts')) return
  await useStore.getState().syncFavouritesFromCloud()
  await reconcileAutosave()
}
