/**
 * "Your design before you opened a shared link" — the recovery copy that makes
 * opening ANY share link (`#/design/`, `#/showroom/`, `#/plans/`, at boot or via
 * the live `hashchange` listener) non-destructive. Security review R7, finding S1.
 *
 * Every share loader replaces the whole store and clears undo, with no prompt.
 * For a showroom link the autosave is now gated (`autosave.ts`), so the visitor's
 * own design survives in the autosave slot — but the moment they press
 * **Make it mine**, or open an *editable* `#/design/` / `#/plans/` link, the next
 * autosave writes the sender's design over theirs. Before this module that was
 * silent and unrecoverable.
 *
 * No new storage: the copy is an ordinary save slot, so the existing File-menu
 * saved-layout list (Simple mode, desktop + mobile) and the Versions panel are
 * the restore path, with thumbnail, date and delete. Two things differ from a
 * user-named slot, both in `LocalStorageAdapter.ts`:
 *  - the id carries {@link PRE_SHARE_SLOT_PREFIX}, which EXEMPTS it from the
 *    10-named-slot eviction (a recovery copy must never evict the user's own
 *    save, nor be evicted by one);
 *  - its own count is capped at {@link MAX_PRE_SHARE_BACKUPS}, oldest dropped,
 *    so opening links all day can't fill localStorage.
 *
 * Deliberately NOT backed up (nothing would be lost):
 *  - while the session is already view-only — the store holds a showroom, not
 *    the visitor's work, and their own design is untouched in the autosave slot
 *    (and was copied when that showroom opened);
 *  - when nothing of the user's is persisted yet (no autosave slot — the store
 *    is the untouched default seed of a first-time visitor);
 *  - when the store is still the untouched design a previous link applied (it
 *    is recoverable from that link, and copying it would push a real design out
 *    of the capped set).
 */
import { parseDesignRoute } from '../../features/designShare'
import { parsePlanRoute } from '../../features/planShare'
import { knownFurnitureDefIds } from '../../furniture/knownDefIds'
import {
  applySerialized,
  preserveUnresolvedItems,
  type SerializedState,
  serialize,
} from '../schema'
import { type RootState, useStore } from '../store'
import { isCloudActive, storage } from './adapter'
import { flushPendingAutosave } from './autosave'
import {
  AUTOSAVE_SLOT,
  hasSavedSlot,
  LocalStorageAdapter,
  PRE_SHARE_SLOT_PREFIX,
} from './LocalStorageAdapter'
import { ServerAdapter } from './ServerAdapter'
import { slotDisplayName } from './slotLabels'
import { captureThumb, deleteThumb, saveThumb } from './slotThumbs'

/** How many pre-shared-link recovery copies are kept (newest wins). */
export const MAX_PRE_SHARE_BACKUPS = 3

/** Outcome of a backup attempt. `slot` is the recovery slot that now holds the
 *  user's own design (null when there was nothing to keep); `failed` is true
 *  when there WAS something to keep and the write threw (e.g. storage full). */
export interface PreShareBackup {
  slot: string | null
  failed: boolean
}

/** Store references of the last design a share link applied, to recognise an
 *  untouched shared design (every edit replaces at least one of these). */
let lastApplied: Pick<RootState, 'items' | 'floorPlan' | 'finishes' | 'doors'> | null = null
/** The recovery slot for the CURRENT share session (the copy taken when the
 *  most recent link replaced a design of the user's), or null. */
let sessionBackupSlot: string | null = null

/** Record that a share loader just applied a design (call right after
 *  `setState(patch)`), so a second link opened before any edit doesn't back up
 *  the first link's untouched content. */
export function noteSharedDesignApplied(): void {
  const s = useStore.getState()
  lastApplied = { items: s.items, floorPlan: s.floorPlan, finishes: s.finishes, doors: s.doors }
}

function isUntouchedSharedDesign(s: RootState): boolean {
  return (
    !!lastApplied &&
    s.items === lastApplied.items &&
    s.floorPlan === lastApplied.floorPlan &&
    s.finishes === lastApplied.finishes &&
    s.doors === lastApplied.doors
  )
}

const pad = (n: number) => String(n).padStart(2, '0')

/** `before-shared-link-2026-09-25-14-32-05`, de-duplicated against the index. */
async function freshSlotName(): Promise<string> {
  const d = new Date()
  const base = `${PRE_SHARE_SLOT_PREFIX}${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate(),
  )}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  const taken = new Set((await LocalStorageAdapter.list()).map((m) => m.slot))
  let slot = base
  for (let i = 2; taken.has(slot) || hasSavedSlot(slot); i++) slot = `${base}-${i}`
  return slot
}

/** Drop the oldest recovery copies beyond {@link MAX_PRE_SHARE_BACKUPS}. */
async function pruneBackups(): Promise<void> {
  const backups = (await LocalStorageAdapter.list())
    .filter((m) => m.slot.startsWith(PRE_SHARE_SLOT_PREFIX))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  for (const old of backups.slice(MAX_PRE_SHARE_BACKUPS)) {
    await storage.delete(old.slot).catch(() => {})
    deleteThumb(old.slot)
  }
}

async function writeBackup(payload: SerializedState, thumb: boolean): Promise<PreShareBackup> {
  let slot: string
  try {
    slot = await freshSlotName()
    // Local first and awaited: this is the copy that must exist before the
    // caller swaps the design. The cloud mirror (signed in) is best-effort, and
    // makes the copy visible in the cloud-sourced slot list too.
    await LocalStorageAdapter.save(slot, payload)
  } catch {
    return { slot: null, failed: true }
  }
  if (thumb) saveThumb(slot, captureThumb())
  if (isCloudActive()) void ServerAdapter.save(slot, payload).catch(() => {})
  await pruneBackups().catch(() => {})
  sessionBackupSlot = slot
  return { slot, failed: false }
}

/**
 * Keep a recoverable copy of the user's current design before a share link
 * replaces it. Call AFTER the link decoded successfully (a broken link replaces
 * nothing, so it must not churn the capped set) and BEFORE `setState(patch)`.
 *
 * Also flushes a pending debounced autosave first, so an edit made in the last
 * half-second is persisted as the user's own design rather than lost.
 */
export async function backupBeforeSharedLink(): Promise<PreShareBackup> {
  const s = useStore.getState()
  // Already in a showroom: the store isn't the visitor's; their design is in
  // the (gated, untouched) autosave slot and was copied on the way in.
  if (s.viewOnly) return { slot: sessionBackupSlot, failed: false }
  flushPendingAutosave()
  sessionBackupSlot = null
  if (isUntouchedSharedDesign(s)) return { slot: null, failed: false }
  if (!hasSavedSlot(AUTOSAVE_SLOT)) return { slot: null, failed: false }
  return writeBackup(serialize(s), true)
}

/**
 * "Make it mine": the showroom design is about to become the visitor's editable
 * design, and the first autosave after that overwrites their autosave slot. Make
 * sure their previous design is held in a recovery slot first — the one taken
 * when the showroom opened, or, if there is none (the copy failed, or the
 * showroom replaced an untouched shared design), a copy of the autosave slot
 * itself, which the view-only gate has kept untouched for the whole session.
 */
export async function keepVisitorDesignBeforeTakeover(): Promise<PreShareBackup> {
  if (sessionBackupSlot && hasSavedSlot(sessionBackupSlot)) {
    return { slot: sessionBackupSlot, failed: false }
  }
  if (!hasSavedSlot(AUTOSAVE_SLOT)) return { slot: null, failed: false }
  let own: SerializedState | null
  try {
    own = await LocalStorageAdapter.load(AUTOSAVE_SLOT)
  } catch {
    own = null
  }
  if (!own) return { slot: null, failed: true }
  // No thumbnail: the canvas is showing the showroom, not this design.
  return writeBackup(own, false)
}

/** Clear a share route from the URL (fires no `hashchange`). */
function clearShareHash(): void {
  const hash = globalThis.location?.hash
  if (!parseDesignRoute(hash) && !parsePlanRoute(hash)) return
  try {
    const url = new URL(globalThis.location.href)
    url.hash = ''
    globalThis.history?.replaceState(null, '', url.toString())
  } catch {
    /* no history/URL (non-browser) */
  }
}

/**
 * Put a recovery copy back as the live, editable design (the "Restore mine"
 * toast action). Ends a showroom session if one is active — which forces the
 * autosave to write the restored design, making the recovery durable.
 */
export async function restorePreShareBackup(slot: string): Promise<boolean> {
  let data: SerializedState | null = null
  try {
    data = await LocalStorageAdapter.load(slot)
  } catch {
    data = null
  }
  if (!data && isCloudActive()) data = await ServerAdapter.load(slot).catch(() => null)
  if (!data) {
    useStore.getState().notify.start({
      title: "Couldn't restore your design",
      kind: 'error',
      message: `The saved copy “${slot}” could not be read.`,
    })
    return false
  }
  const st = useStore.getState()
  const known = knownFurnitureDefIds(st)
  const patch = applySerialized(data, known)
  // This is the user's OWN design: an unresolvable def means a missing blob,
  // never a deletion request (BUG-2) — keep those items, as hydrate does.
  preserveUnresolvedItems(data, known, patch)
  useStore.setState(patch)
  if (useStore.getState().viewOnly) useStore.getState().setViewOnly(false)
  clearShareHash()
  lastApplied = null
  useStore.getState().clearHistory?.()
  useStore.getState().requestHomeView?.()
  useStore.getState().notify.start({ title: 'Your design is back', kind: 'success' })
  return true
}

/** One sentence for a toast naming where the recovery copy lives. */
export function backupNotice(b: PreShareBackup): string | undefined {
  if (b.slot) {
    return `Your previous design is kept as “${slotDisplayName(b.slot)}” in File’s saved layouts.`
  }
  if (b.failed) return "We couldn't keep a copy of your previous design (storage may be full)."
  return undefined
}

/**
 * How long a toast carrying **Restore mine** stays up: until the user acts on
 * it or dismisses it (R7-AA). It is the one-click way back to a design a link
 * just replaced, and it used to ride a 3 s success toast — for a link opened at
 * boot it expired before the scene was even on screen. Follows Material 3's
 * snackbar rule (snackbars with an action stay until acted on or dismissed)
 * and WCAG 2.2 SC 2.2.1 Timing Adjustable (an auto-dismiss is a time limit the
 * user must be able to turn off; the toast's close button does the rest).
 */
const RESTORE_TOAST_DISMISS_MS: number | null = null

/** Toast action props offering to put the recovery copy back, or none. */
export function restoreAction(b: PreShareBackup): {
  actionLabel?: string
  onAction?: () => void
  autoDismissMs?: number | null
} {
  const slot = b.slot
  if (!slot) return {}
  return {
    actionLabel: 'Restore mine',
    onAction: () => void restorePreShareBackup(slot),
    autoDismissMs: RESTORE_TOAST_DISMISS_MS,
  }
}

/** Reset module state. Tests only. */
export function resetSharedLinkBackupForTests(): void {
  lastApplied = null
  sessionBackupSlot = null
}
