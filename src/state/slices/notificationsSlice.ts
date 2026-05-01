import type { SliceCreator } from './types';
import type { RootState } from '../store';

export type NotificationKind = 'info' | 'progress' | 'success' | 'error';

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  message?: string;
  /** 0..1, only for kind: 'progress' */
  progress?: number;
  dismissable: boolean;
  /** Auto-dismiss timeout in ms; null = never auto-dismiss. */
  autoDismissMs: number | null;
  createdAt: number;
}

export interface NotificationStartOpts {
  title: string;
  kind?: NotificationKind;
  message?: string;
  /** Override auto-dismiss for non-progress kinds. */
  autoDismissMs?: number | null;
}

export interface NotificationsSlice {
  notifications: Notification[];
  notify: {
    start: (opts: NotificationStartOpts) => string;
    update: (
      id: string,
      patch: Partial<Pick<Notification, 'progress' | 'message' | 'title'>>,
    ) => void;
    success: (id: string, message?: string) => void;
    error: (id: string, message: string) => void;
    dismiss: (id: string) => void;
  };
}

const SUCCESS_DEFAULT_MS = 3000;
const INFO_DEFAULT_MS = 3000;

let counter = 0;
const nextId = () => `n-${Date.now()}-${counter++}`;

const defaultDismissable = (k: NotificationKind) => k !== 'progress';
const defaultAutoDismissMs = (k: NotificationKind): number | null => {
  if (k === 'success') return SUCCESS_DEFAULT_MS;
  if (k === 'info') return INFO_DEFAULT_MS;
  return null;
};

export const NOTIFICATIONS_INITIAL: Pick<NotificationsSlice, 'notifications'> = {
  notifications: [],
};

export const createNotificationsSlice: SliceCreator<NotificationsSlice, RootState> = (set) => ({
  ...NOTIFICATIONS_INITIAL,
  notify: {
    start: ({ title, kind = 'info', message, autoDismissMs }) => {
      const id = nextId();
      const n: Notification = {
        id,
        kind,
        title,
        message,
        progress: kind === 'progress' ? 0 : undefined,
        dismissable: defaultDismissable(kind),
        autoDismissMs: autoDismissMs !== undefined ? autoDismissMs : defaultAutoDismissMs(kind),
        createdAt: Date.now(),
      };
      set((s) => ({ notifications: [...s.notifications, n] }));
      return id;
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
    error: (id, message) =>
      set((s) => ({
        notifications: s.notifications.map((n) =>
          n.id === id
            ? {
                ...n,
                kind: 'error',
                message,
                dismissable: true,
                autoDismissMs: null,
                progress: undefined,
              }
            : n,
        ),
      })),
    dismiss: (id) =>
      set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
  },
});
