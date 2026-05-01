import { describe, expect, it, beforeEach } from 'vitest';
import { useStore } from '../store';

describe('notificationsSlice', () => {
  beforeEach(() => {
    useStore.setState({ notifications: [] });
  });

  it('start() pushes a progress notification and returns its id', () => {
    const { notify } = useStore.getState();
    const id = notify.start({ title: 'Installing pack', kind: 'progress' });
    const list = useStore.getState().notifications;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id);
    expect(list[0].kind).toBe('progress');
    expect(list[0].title).toBe('Installing pack');
  });

  it('update() patches a notification by id', () => {
    const { notify } = useStore.getState();
    const id = notify.start({ title: 'X', kind: 'progress' });
    notify.update(id, { progress: 0.5, message: 'halfway' });
    const n = useStore.getState().notifications.find((x) => x.id === id);
    expect(n?.progress).toBe(0.5);
    expect(n?.message).toBe('halfway');
  });

  it('success() converts a progress notification', () => {
    const { notify } = useStore.getState();
    const id = notify.start({ title: 'X', kind: 'progress' });
    notify.success(id, 'done');
    const n = useStore.getState().notifications.find((x) => x.id === id);
    expect(n?.kind).toBe('success');
    expect(n?.message).toBe('done');
    expect(n?.dismissable).toBe(true);
  });

  it('error() converts to error and stays dismissable', () => {
    const { notify } = useStore.getState();
    const id = notify.start({ title: 'X', kind: 'progress' });
    notify.error(id, 'broken');
    const n = useStore.getState().notifications.find((x) => x.id === id);
    expect(n?.kind).toBe('error');
    expect(n?.message).toBe('broken');
    expect(n?.dismissable).toBe(true);
  });

  it('dismiss() removes the notification', () => {
    const { notify } = useStore.getState();
    const id = notify.start({ title: 'X', kind: 'info' });
    notify.dismiss(id);
    expect(useStore.getState().notifications).toHaveLength(0);
  });
});
