import type { IconName } from '../../ui/toolbar/icons'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

export type NotificationKind = 'info' | 'progress' | 'success' | 'error'

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
  dismissable: boolean
  /** Auto-dismiss timeout in ms; null = never auto-dismiss. */
  autoDismissMs: number | null
  createdAt: number
}

export interface NotificationStartOpts {
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

export const createNotificationsSlice: SliceCreator<NotificationsSlice, RootState> = (set) => ({
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
    }) => {
      const id = nextId()
      const n: Notification = {
        id,
        kind,
        title,
        message,
        progress: kind === 'progress' ? 0 : undefined,
        actionLabel,
        onAction,
        onActivate,
        icon,
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
              { ...dup, createdAt: Date.now() },
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
