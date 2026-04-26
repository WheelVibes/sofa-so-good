/**
 * Boot-time hydration: pulls user assets out of IndexedDB AND the
 * autosaved layout out of localStorage, then applies both to the
 * store before the first React paint.
 *
 * The two sources are independent — failing to recover assets does
 * not block layout hydration and vice versa.
 */

import { applySerialized } from '../schema';
import { useStore } from '../store';
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog';
import { hydrateUserAssets } from './hydrateAssets';
import { LocalStorageAdapter, AUTOSAVE_SLOT } from './LocalStorageAdapter';
import { StorageError } from './StorageAdapter';

export interface HydrateResult {
  hydratedFromAutosave: boolean;
  droppedItemIds: string[];
  errors: StorageError[];
}

export async function hydrate(): Promise<HydrateResult> {
  const errors: StorageError[] = [];
  await hydrateUserAssets().catch(() => {
    /* fail soft — IDB unavailable */
  });

  let saved;
  try {
    saved = await LocalStorageAdapter.load(AUTOSAVE_SLOT);
  } catch (e) {
    if (e instanceof StorageError) errors.push(e);
    saved = null;
  }

  if (!saved) {
    return { hydratedFromAutosave: false, droppedItemIds: [], errors };
  }

  // Build the set of resolvable def ids (built-ins + already-hydrated
  // user uploads). Items referencing missing defs are dropped.
  const userIds = useStore.getState().userFurniture.map((d) => d.id);
  const known = new Set<string>([...Object.keys(BUILTIN_CATALOG), ...userIds]);
  const droppedItemIds = saved.items
    .filter((it) => !known.has(it.defId))
    .map((it) => it.id);

  const patch = applySerialized(saved, known);
  useStore.setState(patch);
  return { hydratedFromAutosave: true, droppedItemIds, errors };
}
