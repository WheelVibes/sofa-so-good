import type { IconName } from '../../ui/toolbar/icons'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

type NotificationKind = 'info' | 'progress' | 'success' | 'error'

/** A per-item line shown when a notification is expanded (e.g. each failed
 *  import: which item, and why). */
export interface NotificationDetail {
  name: string
  reason: string
}

export interface Notification {
  id: string
  kind: NotificationKind
  title: string
  message?: string
  /** 0..1 for a determinate bar; `null` = indeterminate (animated, unknown
   *  duration — e.g. a service-worker update check with no real % to report).
   *  Only meaningful for kind: 'progress'. */
  progress?: number | null
  /** Optional per-item breakdown — when present the notification is clickable
   *  and opens a details panel (e.g. the list of failed imports + reasons). */
  details?: NotificationDetail[]
  /** Optional primary action rendered as a button (e.g. "Update" on an
   *  update-available toast). When set, `onAction` runs on click. */
  actionLabel?: string
  onAction?: () => void
  /** Optional body-level click handler — "jump to the result" (e.g. select the
   *  rendered item, open the finished export). Distinct from the trailing
   *  `actionLabel`/`onAction` button: this is the whole card body's affordance.
   *  Survives a progress→success/error resolution via `...n` spreads, so a
   *  "Rendering…" toast set with `onActivate` stays clickable once it resolves. */
  onActivate?: () => void
  /** Override the kind-derived leading icon (e.g. a "Versions" glyph on an
   *  update-available info toast instead of the default info glyph). */
  icon?: IconName
  /** BUG-4: how many times `onAction` should fire when this toast's action
   *  runs. Undefined/1 = normal, single-shot semantics (every toast that
   *  doesn't opt in). Set by a caller whose action is idempotent-per-call and
   *  re-invocable (e.g. `deleteItem`'s `() => get().undo()`) so that when TWO
   *  such toasts de-dupe (same kind+title+message — see `start()`) into one
   *  visible toast, that toast's action still fires once per coalesced call
   *  instead of the later call's contribution being silently discarded along
   *  with its `onAction`. `start()` reads this field off the LIVE notification
   *  (by id) at click time, not a value captured when the toast was created —
   *  so a de-dupe that bumps the count after the toast already rendered is
   *  still honoured.  */
  undoRepeat?: number
  dismissable: boolean
  /** Auto-dismiss timeout in ms; null = never auto-dismiss. */
  autoDismissMs: number | null
  createdAt: number
}

interface NotificationStartOpts {
  title: string
  kind?: NotificationKind
  message?: string
  /** Override auto-dismiss for non-progress kinds. */
  autoDismissMs?: number | null
  /** Primary action button + its handler (e.g. "Update"). */
  actionLabel?: string
  onAction?: () => void
  /** Body-level "jump to result" click handler — see `Notification.onActivate`. */
  onActivate?: () => void
  /** Override the kind-derived leading icon. */
  icon?: IconName
  /** See `Notification.undoRepeat`. When set, `start()` wraps `onAction` to
   *  re-invoke it this many times (re-read from the live notification at
   *  click time), and a de-dupe against an existing toast that ALSO set this
   *  overwrites its stored count with this call's value (the caller is
   *  expected to have already computed the right cumulative count — see
   *  `itemsSlice.deleteItem`). */
  undoRepeat?: number
}

export interface NotificationsSlice {
  notifications: Notification[]
  notify: {
    start: (opts: NotificationStartOpts) => string
    update: (
      id: string,
      patch: Partial<Pick<Notification, 'progress' | 'message' | 'title'>>,
    ) => void
    success: (id: string, message?: string) => void
    error: (id: string, message: string, details?: NotificationDetail[], retry?: () => void) => void
    dismiss: (id: string) => void
  }
}

const SUCCESS_DEFAULT_MS = 3000
const INFO_DEFAULT_MS = 3000

let counter = 0
const nextId = () => `n-${Date.now()}-${counter++}`

const defaultDismissable = (k: NotificationKind) => k !== 'progress'
const defaultAutoDismissMs = (k: NotificationKind): number | null => {
  if (k === 'success') return SUCCESS_DEFAULT_MS
  if (k === 'info') return INFO_DEFAULT_MS
  return null
}

export const NOTIFICATIONS_INITIAL: Pick<NotificationsSlice, 'notifications'> = {
  notifications: [],
}

export const createNotificationsSlice: SliceCreator<NotificationsSlice, RootState> = (
  set,
  get,
) => ({
  ...NOTIFICATIONS_INITIAL,
  notify: {
    start: ({
      title,
      kind = 'info',
      message,
      autoDismissMs,
      actionLabel,
      onAction,
      onActivate,
      icon,
      undoRepeat,
    }) => {
      const id = nextId()
      // BUG-4: when `undoRepeat` is set, wrap the caller's action so it
      // re-reads the CURRENT count off the live notification (by this `id`,
      // which a de-dupe below preserves across merges) rather than closing
      // over the value known at creation time — a later delete can bump the
      // count after this toast already exists.
      const wrappedOnAction =
        undoRepeat !== undefined
          ? () => {
              const live = get().notifications.find((x) => x.id === id)
              const times = live?.undoRepeat ?? 1
              for (let i = 0; i < times; i++) onAction?.()
            }
          : onAction
      const n: Notification = {
        id,
        kind,
        title,
        message,
        progress: kind === 'progress' ? 0 : undefined,
        actionLabel,
        onAction: wrappedOnAction,
        onActivate,
        icon,
        undoRepeat,
        dismissable: defaultDismissable(kind),
        autoDismissMs: autoDismissMs !== undefined ? autoDismissMs : defaultAutoDismissMs(kind),
        createdAt: Date.now(),
      }
      // De-dupe identical toasts (same kind + title + message): instead of
      // stacking a copy when the same action fires repeatedly (e.g. tapping a
      // wall that's already a room), RESURFACE the existing one — restart its
      // auto-dismiss timer (the container re-derives timers from `createdAt`)
      // and move it to the front. Progress toasts are keyed by their returned id
      // for live updates, so they never de-dupe.
      let resultId = id
      set((s) => {
        const dup =
          kind !== 'progress'
            ? s.notifications.find(
                (x) =>
                  x.kind === kind && x.title === title && (x.message ?? '') === (message ?? ''),
              )
            : undefined
        if (dup) {
          resultId = dup.id
          return {
            notifications: [
              ...s.notifications.filter((x) => x.id !== dup.id),
              {
                ...dup,
                createdAt: Date.now(),
                // BUG-4: the OLD toast's `onAction`/id are kept (its wrapped
                // closure already re-reads `undoRepeat` live), but the NEW
                // call's `undoRepeat` — the caller's freshly-computed
                // cumulative count — wins, so a second rapid delete's
                // contribution isn't silently dropped along with its
                // (otherwise-discarded) `onAction`/`n`.
                ...(undoRepeat !== undefined ? { undoRepeat } : {}),
              },
            ],
          }
        }
        return { notifications: [...s.notifications, n] }
      })
      return resultId
    },
    update: (id, patch) =>
      set((s) => ({
        notifications: s.notifications.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      })),
    success: (id, message) =>
      set((s) => ({
        notifications: s.notifications.map((n) =>
          n.id === id
            ? {
                ...n,
                kind: 'success',
                message: message ?? n.message,
                dismissable: true,
                autoDismissMs: SUCCESS_DEFAULT_MS,
                progress: undefined,
              }
            : n,
        ),
      })),
    error: (id, message, details, retry) =>
      set((s) => ({
        notifications: s.notifications.map((n) =>
          n.id === id
            ? {
                ...n,
                kind: 'error',
                message,
                details: details && details.length > 0 ? details : undefined,
                dismissable: true,
                autoDismissMs: null,
                progress: undefined,
                ...(retry ? { actionLabel: 'Retry', onAction: retry } : null),
              }
            : n,
        ),
      })),
    dismiss: (id) => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
  },
})
