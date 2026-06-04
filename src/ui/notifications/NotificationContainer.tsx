import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Notification, NotificationDetail } from '../../state/slices/notificationsSlice'
import { useStore } from '../../state/store'
import { Icon, type IconName } from '../toolbar/icons'

const KIND_ICON: Record<Notification['kind'], IconName> = {
  info: 'Help',
  progress: 'Versions',
  success: 'Check',
  error: 'Checks',
}

export function NotificationContainer() {
  const notifications = useStore((s) => s.notifications)
  const dismiss = useStore((s) => s.notify.dismiss)
  // The notification whose details panel is open (by id), if any.
  const [openDetails, setOpenDetails] = useState<string | null>(null)

  useEffect(() => {
    const timers: number[] = []
    for (const n of notifications) {
      if (n.autoDismissMs == null) continue
      const elapsed = Date.now() - n.createdAt
      const remaining = Math.max(0, n.autoDismissMs - elapsed)
      const t = window.setTimeout(() => dismiss(n.id), remaining)
      timers.push(t)
    }
    return () => timers.forEach(window.clearTimeout)
  }, [notifications, dismiss])

  const detailNotif = openDetails ? notifications.find((n) => n.id === openDetails) : null

  if (notifications.length === 0) return null

  return (
    <div className="toast-host">
      {notifications.slice(-5).map((n) => {
        const Glyph = Icon[KIND_ICON[n.kind]]
        const hasDetails = !!n.details?.length
        return (
          <div
            key={n.id}
            data-notification
            className={`toast in${n.kind === 'error' ? ' err' : ''}`}
          >
            <Glyph className="icn" width={16} height={16} />
            <button
              type="button"
              disabled={!hasDetails}
              onClick={() => hasDetails && setOpenDetails(n.id)}
              className="toast-msg"
              style={{
                minWidth: 0,
                flex: 1,
                textAlign: 'left',
                cursor: hasDetails ? 'pointer' : 'default',
              }}
            >
              <b>{n.title}</b>
              {n.message ? <div style={{ marginTop: 1 }}>{n.message}</div> : null}
              {n.kind === 'progress' && (
                <div
                  role="progressbar"
                  aria-valuenow={Math.round((n.progress ?? 0) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="bud-bar"
                  style={{ marginTop: 6, height: 4 }}
                >
                  <div
                    className="bud-seg"
                    style={{
                      width: `${Math.round((n.progress ?? 0) * 100)}%`,
                      background: 'var(--accent)',
                    }}
                  />
                </div>
              )}
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
              ) : null}
            </button>
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
      {detailNotif?.details ? (
        <NotificationDetailsModal
          title={detailNotif.title}
          details={detailNotif.details}
          onClose={() => setOpenDetails(null)}
        />
      ) : null}
    </div>
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
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="panel"
        style={{ width: 'min(480px, calc(100vw - 24px))', maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-head">
          <div className="panel-title">{title}</div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon.Close width={16} height={16} />
          </button>
        </div>
        <hr className="hr" />
        <div className="panel-body">
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
        </div>
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
      </div>
    </div>,
    document.body,
  )
}
