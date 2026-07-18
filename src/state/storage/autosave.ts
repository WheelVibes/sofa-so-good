import { serialize } from '../schema'
import { useStore } from '../store'
import { flushCloudAutosave, storage } from './adapter'
import { AUTOSAVE_SLOT } from './LocalStorageAdapter'
import { type StorageAdapter, StorageError } from './StorageAdapter'

const DEBOUNCE_MS = 500

/** Subset of the root state that should trigger an autosave. Comparing
 *  these by reference catches any persistent change without recreating
 *  on every selectedItemId / nearbyDoorId / catalogOpen flip.
 *
 *  IMPORTANT: every field that `serialize()` (schema.ts) writes must be
 *  watched here, or a change to an unwatched-but-persisted field is lost on
 *  reload unless some *other* watched field also happens to change. Keep this
 *  list in lock-step with `serialize()` — the guard test in
 *  `autosave.test.ts` fails if `serialize()` gains a field that isn't watched.
 *  (`finishes.wallAccents` is covered by the `finishes` object reference;
 *  `floorPlan` is reference-stable because the floor-plan slice replaces the
 *  object on every edit. Slices for `comments`/`drawingCallouts`/`panoTourStops`/
 *  `quoteTemplate` likewise replace their array/object on each mutation, so a
 *  reference compare suffices.) */
type Persistent = {
  items: unknown
  floorPlan: unknown
  doors: unknown
  finishes: unknown
  userFurniture: unknown
  userMaterials: unknown
  masterPalette: unknown
  roomPalettes: unknown
  timeMode: unknown
  manualHour: unknown
  lightsMode: unknown
  annotations: unknown
  comments: unknown
  drawingCallouts: unknown
  cameraMode: unknown
  orientationDeg: unknown
  location: unknown
  locationPromptDismissed: unknown
  petTypes: unknown
  designNote: unknown
  panoTourStops: unknown
  quoteTemplate: unknown
  priceRules: unknown
}

/** The exact set of root-state keys this watch-list tracks. Exposed so a guard
 *  test can assert it stays a superset of every field `serialize()` persists
 *  (the lock-step invariant). */
export const PERSISTENT_WATCH_KEYS = [
  'items',
  'floorPlan',
  'doors',
  'finishes',
  'userFurniture',
  'userMaterials',
  'masterPalette',
  'roomPalettes',
  'timeMode',
  'manualHour',
  'lightsMode',
  'annotations',
  'comments',
  'drawingCallouts',
  'cameraMode',
  'orientationDeg',
  'location',
  'locationPromptDismissed',
  'petTypes',
  'designNote',
  'panoTourStops',
  'quoteTemplate',
  'priceRules',
] as const satisfies readonly (keyof Persistent)[]

function pickPersistent(): Persistent {
  const s = useStore.getState()
  return {
    items: s.items,
    floorPlan: s.floorPlan,
    doors: s.doors,
    finishes: s.finishes,
    userFurniture: s.userFurniture,
    userMaterials: s.userMaterials,
    masterPalette: s.masterPalette,
    roomPalettes: s.roomPalettes,
    timeMode: s.timeMode,
    manualHour: s.manualHour,
    lightsMode: s.lightsMode,
    annotations: s.annotations,
    comments: s.comments,
    drawingCallouts: s.drawingCallouts,
    cameraMode: s.cameraMode,
    orientationDeg: s.orientationDeg,
    location: s.location,
    locationPromptDismissed: s.locationPromptDismissed,
    petTypes: s.petTypes,
    designNote: s.designNote,
    panoTourStops: s.panoTourStops,
    quoteTemplate: s.quoteTemplate,
    priceRules: s.priceRules,
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
    a.masterPalette === b.masterPalette &&
    a.roomPalettes === b.roomPalettes &&
    a.timeMode === b.timeMode &&
    a.manualHour === b.manualHour &&
    a.lightsMode === b.lightsMode &&
    a.annotations === b.annotations &&
    a.comments === b.comments &&
    a.drawingCallouts === b.drawingCallouts &&
    a.cameraMode === b.cameraMode &&
    a.orientationDeg === b.orientationDeg &&
    a.location === b.location &&
    a.locationPromptDismissed === b.locationPromptDismissed &&
    a.petTypes === b.petTypes &&
    a.designNote === b.designNote &&
    a.panoTourStops === b.panoTourStops &&
    a.quoteTemplate === b.quoteTemplate &&
    a.priceRules === b.priceRules
  )
}

export interface AutosaveOptions {
  adapter?: StorageAdapter
  onError?: (e: StorageError) => void
  /** Fired after a successful write (only when the previous write failed),
   *  so a "couldn't save" warning can auto-clear once saving resumes. */
  onRecover?: () => void
}

/** Module-level pause COUNTER (VERSION-COMPARE-VIEW): lets a caller that
 *  temporarily swaps a DIFFERENT design into the live store (e.g. the version
 *  split-view's capture-then-restore) guarantee the debounced write can never
 *  fire mid-swap and persist that scratch state over the real autosave slot —
 *  regardless of how long the swap holds the store (no race with `DEBOUNCE_MS`).
 *  There's only ever one `startAutosave()` instance app-wide (wired once in
 *  `bootstrap.ts`), so a module-level counter (rather than a per-instance one
 *  threaded through closures) is sufficient and lets any caller reach it
 *  without a store reference.
 *
 *  It's a NESTING counter, not a boolean (overlapping-capture hazard): two
 *  overlapping `withTemporaryDesign` windows (e.g. a second version-compare
 *  capture starting before the first's restore has finished) each call
 *  `pauseAutosave()`/`resumeAutosave()` once. With a plain boolean, whichever
 *  `resumeAutosave()` ran first would flip autosave back on while the OTHER
 *  swap still had a different design live in the store, letting the debounced
 *  write persist that scratch state. Counting pauses/resumes means autosave
 *  only actually resumes once the count drops back to 0 — i.e. once every
 *  overlapping swap has finished restoring. */
let autosavePauseCount = 0
/** Pending debounce timer, hoisted to module scope so `pauseAutosave` can
 *  cancel a write that's already scheduled when the pause begins. */
let pendingTimer: ReturnType<typeof setTimeout> | null = null
/** Last-seen persisted snapshot, hoisted to module scope so `resumeAutosave`
 *  can resync it to the just-restored state without a spurious write. */
let lastPersistent: Persistent | null = null

/** Suspend autosave scheduling: cancels any pending debounced write and
 *  ignores further store changes until every matching {@link resumeAutosave}
 *  call has run (nesting counter — see `autosavePauseCount` above). */
export function pauseAutosave(): void {
  autosavePauseCount++
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
}

/** Resume autosave scheduling ONE nesting level; only actually re-enables
 *  scheduling once every {@link pauseAutosave} call has been matched (count
 *  back to 0) — so an inner/overlapping resume can't prematurely re-enable
 *  autosave while an outer pause is still in effect. On the FINAL resume,
 *  resyncs the watched snapshot to the CURRENT state (called right after the
 *  caller has restored the store to its pre-swap values), so the restore
 *  itself is never mistaken for a change needing a write. */
export function resumeAutosave(): void {
  autosavePauseCount = Math.max(0, autosavePauseCount - 1)
  if (autosavePauseCount > 0) return
  lastPersistent = pickPersistent()
}

/** Subscribes to the store and writes the autosave slot at most once
 *  per `DEBOUNCE_MS`. Returns an unsubscribe + flush handle. */
export function startAutosave({
  adapter = storage,
  onError,
  onRecover,
}: AutosaveOptions = {}): () => void {
  lastPersistent = pickPersistent()
  let failed = false

  const flush = () => {
    pendingTimer = null
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
    // Ignore store changes entirely while a temporary-design swap (VERSION-
    // COMPARE-VIEW) is in progress — `resumeAutosave()` resyncs `lastPersistent`
    // once the LAST overlapping swap restores the real state (nesting counter
    // back to 0), so no write is ever scheduled for the scratch state and none
    // is missed for the restore either.
    if (autosavePauseCount > 0) return
    const next = pickPersistent()
    if (lastPersistent && shallowEqual(next, lastPersistent)) return
    lastPersistent = next
    if (pendingTimer) clearTimeout(pendingTimer)
    pendingTimer = setTimeout(flush, DEBOUNCE_MS)
  })

  // Flush a pending debounced write before the page goes away, so an edit made
  // within the debounce window isn't lost on a quick reload/close. localStorage
  // writes synchronously inside save(), so the data persists even as we unload.
  // `pagehide` covers reload/close; `visibilitychange`→hidden covers mobile
  // backgrounding (where `pagehide`/`beforeunload` are unreliable).
  const flushPending = () => {
    // Push any pending cloud autosave up before the page goes away.
    flushCloudAutosave()
    if (!pendingTimer) return
    clearTimeout(pendingTimer)
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
