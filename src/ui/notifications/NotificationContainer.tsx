import { useEffect, useMemo, useRef, useState } from 'react'
import type { Notification, NotificationDetail } from '../../state/slices/notificationsSlice'
import { useStore } from '../../state/store'
import { Modal } from '../Modal'
import { Icon, type IconName } from '../toolbar/icons'

const KIND_ICON: Record<Notification['kind'], IconName> = {
  info: 'Help',
  progress: 'Versions',
  success: 'Check',
  error: 'Checks',
}

/** Visually-hidden style for the screen-reader live regions: present in the
 *  accessibility tree but invisible + zero-footprint, so announcements never
 *  affect layout/appearance. */
const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  border: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
}

/** Build the single line a screen reader should read for a toast. */
function announceText(n: Notification): string {
  const lead = n.kind === 'error' ? 'Error: ' : ''
  return n.message ? `${lead}${n.title}. ${n.message}` : `${lead}${n.title}`
}

/**
 * Drives the visually-hidden live regions. The visible `.toast-host` list is
 * `aria-hidden` (it re-renders constantly — de-dupe reorders, progress ticks —
 * and would otherwise spam/duplicate announcements). Instead we announce each
 * toast exactly ONCE here, routed by priority:
 *   - errors → assertive region (`role="alert"`) so they interrupt
 *   - everything else → polite region (`role="status"`)
 *
 * A toast is (re-)announced when it first appears OR when its kind changes
 * (e.g. a `progress` toast resolving to `success`/`error`). Plain progress
 * *value* updates keep the same id + kind, so they never re-announce — no
 * announcement spam while a bar fills. Each region holds only the single newest
 * message, so assistive tech reads it once and stops.
 */
function useToastAnnouncer(notifications: Notification[]): {
  polite: string
  assertive: string
} {
  // Remember the kind we last announced per toast id, so a kind transition
  // (progress→success/error) re-announces but a progress tick does not.
  const announced = useRef(new Map<string, Notification['kind']>())
  const [polite, setPolite] = useState('')
  const [assertive, setAssertive] = useState('')

  useEffect(() => {
    const live = new Set(notifications.map((n) => n.id))
    // Drop bookkeeping for dismissed toasts so an id reused later re-announces.
    for (const id of announced.current.keys()) {
      if (!live.has(id)) announced.current.delete(id)
    }
    // Find the most-recent toast that is new or whose kind just changed.
    let nextPolite: string | null = null
    let nextAssertive: string | null = null
    for (const n of notifications) {
      const prev = announced.current.get(n.id)
      if (prev === n.kind) continue
      announced.current.set(n.id, n.kind)
      const text = announceText(n)
      if (n.kind === 'error') nextAssertive = text
      else nextPolite = text
    }
    if (nextPolite != null) setPolite(nextPolite)
    if (nextAssertive != null) setAssertive(nextAssertive)
  }, [notifications])

  return useMemo(() => ({ polite, assertive }), [polite, assertive])
}

export function NotificationContainer() {
  const notifications = useStore((s) => s.notifications)
  const dismiss = useStore((s) => s.notify.dismiss)
  // The notification whose details panel is open (by id), if any.
  const [openDetails, setOpenDetails] = useState<string | null>(null)
  // Toasts the user is hovering/focusing — their auto-dismiss is paused so a
  // toast never vanishes mid-read or while being interacted with (WCAG 2.2.1).
  const [pausedIds, setPausedIds] = useState<ReadonlySet<string>>(() => new Set())
  const { polite, assertive } = useToastAnnouncer(notifications)

  // Per-toast remaining auto-dismiss budget (ms), self-managed across re-renders
  // and pauses: seeded once from `createdAt`, then decremented by the time each
  // running interval actually consumed. While paused, no timer runs and no time
  // is banked, so the budget freezes and resumes exactly where it left off.
  const remainingRef = useRef(new Map<string, number>())
  const startedAtRef = useRef(new Map<string, number>())

  const pause = (id: string) =>
    setPausedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
  const resume = (id: string) =>
    setPausedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })

  useEffect(() => {
    const remaining = remainingRef.current
    const startedAt = startedAtRef.current
    const live = new Set(notifications.map((n) => n.id))
    // Forget budgets for dismissed toasts (so a reused id starts fresh).
    for (const id of [...remaining.keys()]) {
      if (!live.has(id)) {
        remaining.delete(id)
        startedAt.delete(id)
      }
    }
    const timers: number[] = []
    for (const n of notifications) {
      if (n.autoDismissMs == null) continue
      if (!remaining.has(n.id)) {
        remaining.set(n.id, Math.max(0, n.autoDismissMs - (Date.now() - n.createdAt)))
      }
      if (pausedIds.has(n.id)) {
        startedAt.delete(n.id)
        continue // paused — no running timer
      }
      startedAt.set(n.id, Date.now())
      timers.push(window.setTimeout(() => dismiss(n.id), remaining.get(n.id) ?? 0))
    }
    return () => {
      // Bank the time each running (non-paused) timer actually consumed before
      // this effect re-runs (a new toast, a progress tick, or a pause toggle).
      const now = Date.now()
      for (const [id, start] of startedAt) {
        remaining.set(id, Math.max(0, (remaining.get(id) ?? 0) - (now - start)))
      }
      timers.forEach(window.clearTimeout)
    }
  }, [notifications, pausedIds, dismiss])

  const detailNotif = openDetails ? notifications.find((n) => n.id === openDetails) : null

  return (
    <>
      {/* Screen-reader live regions — always mounted so assistive tech keeps
          observing them; each holds only the newest announcement (read once).
          The polite region carries info/success/progress; errors interrupt via
          the assertive region. These are visually hidden and don't affect the
          toast layout/appearance. */}
      <div style={SR_ONLY} role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div style={SR_ONLY} role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
      {notifications.length > 0 ? (
        // The visible stack itself is NOT a live region — auto-announcements
        // come only from the hidden regions above (so progress ticks + de-dupe
        // reorders can't spam AT). The stack stays in the a11y tree, though, so
        // the interactive Dismiss / View-details buttons remain reachable by
        // keyboard + screen-reader navigation.
        <div className="toast-host">
          {notifications.slice(-5).map((n) => {
            const Glyph = Icon[n.icon ?? KIND_ICON[n.kind]]
            const hasDetails = !!n.details?.length
            const canActivate = hasDetails || !!n.onActivate
            return (
              <div
                key={n.id}
                data-notification
                className={`toast in${n.kind === 'error' ? ' err' : ''}`}
                // Pause auto-dismiss while hovered or keyboard-focused, so the
                // toast stays put while it's being read or acted on (WCAG 2.2.1).
                onMouseEnter={() => pause(n.id)}
                onMouseLeave={() => resume(n.id)}
                onFocus={() => pause(n.id)}
                onBlur={() => resume(n.id)}
              >
                <Glyph
                  className={`icn${n.kind === 'progress' ? ' spin' : ''}${
                    n.kind === 'success' ? ' pop' : ''
                  }`}
                  width={16}
                  height={16}
                />
                <button
                  type="button"
                  disabled={!canActivate}
                  onClick={() => {
                    if (hasDetails) setOpenDetails(n.id)
                    else n.onActivate?.()
                  }}
                  className="toast-msg"
                  style={{
                    minWidth: 0,
                    flex: 1,
                    textAlign: 'left',
                    cursor: canActivate ? 'pointer' : 'default',
                  }}
                >
                  <b>{n.title}</b>
                  {n.message ? <div style={{ marginTop: 1 }}>{n.message}</div> : null}
                  {n.kind === 'progress' &&
                    // `progress == null` ⇒ indeterminate: an animated sweeping
                    // bar (no real % to report, e.g. a SW update check) with
                    // `aria-valuenow` omitted per ARIA. Otherwise a determinate
                    // fill driven by the 0..1 value.
                    (n.progress == null ? (
                      <div
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="bud-bar indet"
                        style={{ marginTop: 6, height: 4 }}
                      >
                        <div className="bud-seg" style={{ background: 'var(--accent)' }} />
                      </div>
                    ) : (
                      <div
                        role="progressbar"
                        aria-valuenow={Math.round(n.progress * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="bud-bar"
                        style={{ marginTop: 6, height: 4 }}
                      >
                        <div
                          className="bud-seg"
                          style={{
                            width: `${Math.round(n.progress * 100)}%`,
                            background: 'var(--accent)',
                          }}
                        />
                      </div>
                    ))}
                  {hasDetails ? (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 'var(--t-2xs)',
                        color: 'var(--accent-soft-text)',
                        fontWeight: 700,
                      }}
                    >
                      View details →
                    </div>
                  ) : n.onActivate ? (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 'var(--t-2xs)',
                        color: 'var(--accent-soft-text)',
                        fontWeight: 700,
                      }}
                    >
                      Jump to result →
                    </div>
                  ) : null}
                </button>
                {n.actionLabel && n.onAction ? (
                  <button
                    type="button"
                    className="toast-act"
                    onClick={() => {
                      n.onAction?.()
                      dismiss(n.id)
                    }}
                  >
                    {n.actionLabel}
                  </button>
                ) : null}
                {n.dismissable && (
                  <button
                    type="button"
                    aria-label="Dismiss notification"
                    onClick={() => dismiss(n.id)}
                    className="icon-btn"
                    style={{ width: 22, height: 22 }}
                  >
                    <Icon.Close width={14} height={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ) : null}
      {detailNotif?.details ? (
        <NotificationDetailsModal
          title={detailNotif.title}
          details={detailNotif.details}
          onClose={() => setOpenDetails(null)}
        />
      ) : null}
    </>
  )
}

function NotificationDetailsModal({
  title,
  details,
  onClose,
}: {
  title: string
  details: NotificationDetail[]
  onClose: () => void
}) {
  // Shared Modal: dialog role + aria-modal + focus trap/restore + Escape for free
  // (UX-008) instead of the hand-rolled overlay.
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      width="var(--modal-sm)"
      footer={
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: 'var(--s-3) var(--s-4)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button type="button" className="btn btn-soft" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <p
        className="panel-sub"
        style={{ textTransform: 'none', letterSpacing: 0, margin: '0 0 var(--s-3)' }}
      >
        {details.length} item{details.length === 1 ? '' : 's'} could not be imported:
      </p>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {details.map((d, i) => (
          <li
            key={i}
            style={{
              borderRadius: 'var(--r-2)',
              background: 'var(--danger-soft)',
              padding: '6px 8px',
              fontSize: 'var(--t-xs)',
            }}
          >
            <span style={{ fontWeight: 700, color: 'var(--danger)' }}>{d.name}</span>
            <span style={{ color: 'var(--danger)' }}> — {d.reason}</span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
