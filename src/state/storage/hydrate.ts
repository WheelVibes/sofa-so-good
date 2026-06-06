/**
 * Boot-time hydration: pulls user assets out of IndexedDB AND the
 * autosaved layout out of localStorage, then applies both to the
 * store before the first React paint.
 *
 * The two sources are independent — failing to recover assets does
 * not block layout hydration and vice versa.
 */

import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import type { IkeaGltfDef } from '../../furniture/types'
import { applySerialized } from '../schema'
import { useStore } from '../store'
import { hydrateUserAssets, resolveIkeaRuntimeUrls } from './hydrateAssets'
import { hydratePacks } from './hydratePacks'
import { AUTOSAVE_SLOT, LocalStorageAdapter } from './LocalStorageAdapter'
import { StorageError } from './StorageAdapter'

export interface HydrateResult {
  hydratedFromAutosave: boolean
  droppedItemIds: string[]
  errors: StorageError[]
}

export async function hydrate(): Promise<HydrateResult> {
  const errors: StorageError[] = []
  await hydrateUserAssets().catch(() => {
    /* fail soft — IDB unavailable */
  })
  await hydratePacks().catch(() => {
    /* fail soft — IDB unavailable */
  })

  let saved: Awaited<ReturnType<typeof LocalStorageAdapter.load>>
  try {
    saved = await LocalStorageAdapter.load(AUTOSAVE_SLOT)
  } catch (e) {
    if (e instanceof StorageError) errors.push(e)
    saved = null
  }

  if (!saved) {
    return { hydratedFromAutosave: false, droppedItemIds: [], errors }
  }

  // IKEA defs are NOT rebuildable from IDB blob meta alone — their rich
  // metadata (variants/productInfo/compatibility) lives only in the saved
  // layout JSON. Pull them out, re-resolve each variant's runtime blob URL
  // from IDB, and merge into the store WITHOUT clobbering the user defs that
  // hydrateUserAssets already loaded. This must happen BEFORE the `known`
  // set below is computed, otherwise placed IKEA items get dropped as orphans.
  const ikeaDefs = saved.userFurniture.filter(
    (d) => d.source === 'ikea',
  ) as unknown as IkeaGltfDef[]
  if (ikeaDefs.length > 0) {
    const resolved = await resolveIkeaRuntimeUrls(ikeaDefs).catch(() => ikeaDefs)
    const existing = useStore.getState().userFurniture
    const ids = new Set(resolved.map((d) => d.id))
    useStore.getState().setUserFurniture([...existing.filter((d) => !ids.has(d.id)), ...resolved])
  }

  // Build the set of resolvable def ids (built-ins + already-hydrated
  // user uploads + restored IKEA defs). Items referencing missing defs are dropped.
  const userIds = useStore.getState().userFurniture.map((d) => d.id)
  const packIds = useStore.getState().packFurniture.map((d) => d.id)
  const known = new Set<string>([...Object.keys(BUILTIN_CATALOG), ...userIds, ...packIds])
  const droppedItemIds = saved.items.filter((it) => !known.has(it.defId)).map((it) => it.id)

  const patch = applySerialized(saved, known)
  useStore.setState(patch)
  return { hydratedFromAutosave: true, droppedItemIds, errors }
}
