import { useStore } from '../store';
import { serialize } from '../schema';
import { AUTOSAVE_SLOT, LocalStorageAdapter } from './LocalStorageAdapter';
import { StorageError, type StorageAdapter } from './StorageAdapter';

const DEBOUNCE_MS = 500;

/** Subset of the root state that should trigger an autosave. Comparing
 *  these by reference catches any persistent change without recreating
 *  on every selectedItemId / nearbyDoorId / catalogOpen flip. */
type Persistent = {
  items: unknown;
  doors: unknown;
  finishes: unknown;
  userFurniture: unknown;
  userMaterials: unknown;
  timeMode: unknown;
  manualHour: unknown;
  cameraMode: unknown;
  location: unknown;
  locationPromptDismissed: unknown;
};

function pickPersistent(): Persistent {
  const s = useStore.getState();
  return {
    items: s.items,
    doors: s.doors,
    finishes: s.finishes,
    userFurniture: s.userFurniture,
    userMaterials: s.userMaterials,
    timeMode: s.timeMode,
    manualHour: s.manualHour,
    cameraMode: s.cameraMode,
    location: s.location,
    locationPromptDismissed: s.locationPromptDismissed,
  };
}

function shallowEqual(a: Persistent, b: Persistent): boolean {
  return (
    a.items === b.items &&
    a.doors === b.doors &&
    a.finishes === b.finishes &&
    a.userFurniture === b.userFurniture &&
    a.userMaterials === b.userMaterials &&
    a.timeMode === b.timeMode &&
    a.manualHour === b.manualHour &&
    a.cameraMode === b.cameraMode &&
    a.location === b.location &&
    a.locationPromptDismissed === b.locationPromptDismissed
  );
}

export interface AutosaveOptions {
  adapter?: StorageAdapter;
  onError?: (e: StorageError) => void;
}

/** Subscribes to the store and writes the autosave slot at most once
 *  per `DEBOUNCE_MS`. Returns an unsubscribe + flush handle. */
export function startAutosave({
  adapter = LocalStorageAdapter,
  onError,
}: AutosaveOptions = {}): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = pickPersistent();

  const flush = () => {
    timer = null;
    const state = useStore.getState();
    const payload = serialize(state);
    adapter.save(AUTOSAVE_SLOT, payload).catch((e) => {
      if (e instanceof StorageError) onError?.(e);
    });
  };

  const unsubscribe = useStore.subscribe(() => {
    const next = pickPersistent();
    if (shallowEqual(next, last)) return;
    last = next;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  });

  return () => {
    if (timer) {
      clearTimeout(timer);
      flush();
    }
    unsubscribe();
  };
}
