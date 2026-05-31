import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Notification, NotificationDetail } from '../../state/slices/notificationsSlice'
import { useStore } from '../../state/store'

const KIND_STYLES: Record<Notification['kind'], string> = {
  info: 'bg-slate-700 text-white',
  progress: 'bg-slate-700 text-white',
  success: 'bg-emerald-700 text-white',
  error: 'bg-rose-700 text-white',
}

const KIND_ICON: Record<Notification['kind'], string> = {
  info: 'i',
  progress: '↻',
  success: '✓',
  error: '!',
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
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 max-w-sm">
      {notifications.slice(-5).map((n) => {
        const hasDetails = !!n.details?.length
        return (
          <div
            key={n.id}
            data-notification
            className={`rounded shadow-lg p-3 ${KIND_STYLES[n.kind]} flex items-start gap-2`}
          >
            <span aria-hidden className="font-mono">
              {KIND_ICON[n.kind]}
            </span>
            <button
              type="button"
              disabled={!hasDetails}
              onClick={() => hasDetails && setOpenDetails(n.id)}
              className={`flex-1 min-w-0 text-left ${hasDetails ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
            >
              <div className="font-semibold truncate">{n.title}</div>
              {n.message && <div className="text-sm opacity-80 truncate">{n.message}</div>}
              {n.kind === 'progress' && (
                <div
                  role="progressbar"
                  aria-valuenow={Math.round((n.progress ?? 0) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-1 bg-white/20 rounded mt-2 overflow-hidden"
                >
                  <div
                    className="h-full bg-white transition-[width] duration-200"
                    style={{ width: `${Math.round((n.progress ?? 0) * 100)}%` }}
                  />
                </div>
              )}
              {hasDetails ? (
                <div className="mt-1 text-xs underline opacity-80">View details →</div>
              ) : null}
            </button>
            {n.dismissable && (
              <button
                aria-label="Dismiss notification"
                onClick={() => dismiss(n.id)}
                className="opacity-60 hover:opacity-100"
              >
                ×
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
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-[480px] max-w-[90vw] flex-col rounded-lg bg-white text-sm text-neutral-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h2 className="font-semibold text-neutral-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-400 hover:text-neutral-700"
          >
            ×
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <p className="mb-2 text-xs text-neutral-500">
            {details.length} item{details.length === 1 ? '' : 's'} could not be imported:
          </p>
          <ul className="space-y-1.5">
            {details.map((d, i) => (
              <li key={i} className="rounded bg-rose-50 px-2 py-1.5 text-xs">
                <span className="font-medium text-rose-800">{d.name}</span>
                <span className="text-rose-600"> — {d.reason}</span>
              </li>
            ))}
          </ul>
        </div>
        <footer className="flex justify-end border-t border-neutral-200 px-4 py-2.5">
          <button
            onClick={onClose}
            className="rounded bg-neutral-800 px-3 py-1 text-sm text-white hover:bg-neutral-700"
          >
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
