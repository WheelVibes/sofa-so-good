import { useEffect } from 'react';
import { useStore } from '../../state/store';
import type { Notification } from '../../state/slices/notificationsSlice';

const KIND_STYLES: Record<Notification['kind'], string> = {
  info: 'bg-slate-700 text-white',
  progress: 'bg-slate-700 text-white',
  success: 'bg-emerald-700 text-white',
  error: 'bg-rose-700 text-white',
};

const KIND_ICON: Record<Notification['kind'], string> = {
  info: 'i',
  progress: '↻',
  success: '✓',
  error: '!',
};

export function NotificationContainer() {
  const notifications = useStore((s) => s.notifications);
  const dismiss = useStore((s) => s.notify.dismiss);

  useEffect(() => {
    const timers: number[] = [];
    for (const n of notifications) {
      if (n.autoDismissMs == null) continue;
      const elapsed = Date.now() - n.createdAt;
      const remaining = Math.max(0, n.autoDismissMs - elapsed);
      const t = window.setTimeout(() => dismiss(n.id), remaining);
      timers.push(t);
    }
    return () => timers.forEach(window.clearTimeout);
  }, [notifications, dismiss]);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {notifications.slice(-5).map((n) => (
        <div
          key={n.id}
          data-notification
          className={`rounded shadow-lg p-3 ${KIND_STYLES[n.kind]} flex items-start gap-2`}
        >
          <span aria-hidden className="font-mono">
            {KIND_ICON[n.kind]}
          </span>
          <div className="flex-1 min-w-0">
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
          </div>
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
      ))}
    </div>
  );
}
