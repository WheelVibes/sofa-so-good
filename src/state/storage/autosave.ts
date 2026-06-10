import { serialize } from '../schema'
import { useStore } from '../store'
import { AUTOSAVE_SLOT, LocalStorageAdapter } from './LocalStorageAdapter'
import { type StorageAdapter, StorageError } from './StorageAdapter'

const DEBOUNCE_MS = 500

/** Subset of the root state that should trigger an autosave. Comparing
 *  these by reference catches any persistent change without recreating
 *  on every selectedItemId / nearbyDoorId / catalogOpen flip.
 *
 *  IMPORTANT: every field that `serialize()` (schema.ts) writes must be
 *  watched here, or a change to an unwatched-but-persisted field is lost on
 *  reload unless some *other* watched field also happens to change. Keep this
 *  list in lock-step with `serialize()`. (`finishes.wallAccents` is covered by
 *  the `finishes` object reference; `floorPlan` is reference-stable because the
 *  floor-plan slice replaces the object on every edit.) */
type Persistent = {
  items: unknown
  floorPlan: unknown
  doors: unknown
  finishes: unknown
  userFurniture: unknown
  userMaterials: unknown
  timeMode: unknown
  manualHour: unknown
  lightsMode: unknown
  annotations: unknown
  cameraMode: unknown
  orientationDeg: unknown
  location: unknown
  locationPromptDismissed: unknown
  designNote: unknown
}

function pickPersistent(): Persistent {
  const s = useStore.getState()
  return {
    items: s.items,
    floorPlan: s.floorPlan,
    doors: s.doors,
    finishes: s.finishes,
    userFurniture: s.userFurniture,
    userMaterials: s.userMaterials,
    timeMode: s.timeMode,
    manualHour: s.manualHour,
    lightsMode: s.lightsMode,
    annotations: s.annotations,
    cameraMode: s.cameraMode,
    orientationDeg: s.orientationDeg,
    location: s.location,
    locationPromptDismissed: s.locationPromptDismissed,
    designNote: s.designNote,
  }
}

function shallowEqual(a: Persistent, b: Persistent): boolean {
  return (
    a.items === b.items &&
    a.floorPlan === b.floorPlan &&
    a.doors === b.doors &&
    a.finishes === b.finishes &&
    a.userFurniture === b.userFurniture &&
    a.userMaterials === b.userMaterials &&
    a.timeMode === b.timeMode &&
    a.manualHour === b.manualHour &&
    a.lightsMode === b.lightsMode &&
    a.annotations === b.annotations &&
    a.cameraMode === b.cameraMode &&
    a.orientationDeg === b.orientationDeg &&
    a.location === b.location &&
    a.locationPromptDismissed === b.locationPromptDismissed &&
    a.designNote === b.designNote
  )
}

export interface AutosaveOptions {
  adapter?: StorageAdapter
  onError?: (e: StorageError) => void
  /** Fired after a successful write (only when the previous write failed),
   *  so a "couldn't save" warning can auto-clear once saving resumes. */
  onRecover?: () => void
}

/** Subscribes to the store and writes the autosave slot at most once
 *  per `DEBOUNCE_MS`. Returns an unsubscribe + flush handle. */
export function startAutosave({
  adapter = LocalStorageAdapter,
  onError,
  onRecover,
}: AutosaveOptions = {}): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let last = pickPersistent()
  let failed = false

  const flush = () => {
    timer = null
    const state = useStore.getState()
    const payload = serialize(state)
    adapter
      .save(AUTOSAVE_SLOT, payload)
      .then(() => {
        useStore.getState().setLastSavedAt(Date.now())
        if (failed) {
          failed = false
          onRecover?.()
        }
      })
      .catch((e) => {
        failed = true
        if (e instanceof StorageError) onError?.(e)
      })
  }

  const unsubscribe = useStore.subscribe(() => {
    const next = pickPersistent()
    if (shallowEqual(next, last)) return
    last = next
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, DEBOUNCE_MS)
  })

  // Flush a pending debounced write before the page goes away, so an edit made
  // within the debounce window isn't lost on a quick reload/close. localStorage
  // writes synchronously inside save(), so the data persists even as we unload.
  // `pagehide` covers reload/close; `visibilitychange`→hidden covers mobile
  // backgrounding (where `pagehide`/`beforeunload` are unreliable).
  const flushPending = () => {
    if (!timer) return
    clearTimeout(timer)
    flush()
  }
  const onPageHide = () => flushPending()
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flushPending()
  }
  window.addEventListener('pagehide', onPageHide)
  document.addEventListener('visibilitychange', onVisibility)

  return () => {
    flushPending()
    window.removeEventListener('pagehide', onPageHide)
    document.removeEventListener('visibilitychange', onVisibility)
    unsubscribe()
  }
}
