import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('notificationsSlice', () => {
  beforeEach(() => {
    useStore.setState({ notifications: [] })
  })

  it('start() pushes a progress notification and returns its id', () => {
    const { notify } = useStore.getState()
    const id = notify.start({ title: 'Installing pack', kind: 'progress' })
    const list = useStore.getState().notifications
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(id)
    expect(list[0].kind).toBe('progress')
    expect(list[0].title).toBe('Installing pack')
  })

  it('update() patches a notification by id', () => {
    const { notify } = useStore.getState()
    const id = notify.start({ title: 'X', kind: 'progress' })
    notify.update(id, { progress: 0.5, message: 'halfway' })
    const n = useStore.getState().notifications.find((x) => x.id === id)
    expect(n?.progress).toBe(0.5)
    expect(n?.message).toBe('halfway')
  })

  it('update() accepts an indeterminate progress (null)', () => {
    const { notify } = useStore.getState()
    const id = notify.start({ title: 'Checking', kind: 'progress' })
    notify.update(id, { progress: null })
    const n = useStore.getState().notifications.find((x) => x.id === id)
    expect(n?.progress).toBeNull()
  })

  it('start() carries an action + icon override through to the notification', () => {
    const { notify } = useStore.getState()
    const onAction = () => {}
    const id = notify.start({
      title: 'Update available',
      kind: 'info',
      actionLabel: 'Update',
      onAction,
      icon: 'Versions',
    })
    const n = useStore.getState().notifications.find((x) => x.id === id)
    expect(n?.actionLabel).toBe('Update')
    expect(n?.onAction).toBe(onAction)
    expect(n?.icon).toBe('Versions')
  })

  it('success() converts a progress notification', () => {
    const { notify } = useStore.getState()
    const id = notify.start({ title: 'X', kind: 'progress' })
    notify.success(id, 'done')
    const n = useStore.getState().notifications.find((x) => x.id === id)
    expect(n?.kind).toBe('success')
    expect(n?.message).toBe('done')
    expect(n?.dismissable).toBe(true)
  })

  it('error() converts to error and stays dismissable', () => {
    const { notify } = useStore.getState()
    const id = notify.start({ title: 'X', kind: 'progress' })
    notify.error(id, 'broken')
    const n = useStore.getState().notifications.find((x) => x.id === id)
    expect(n?.kind).toBe('error')
    expect(n?.message).toBe('broken')
    expect(n?.dismissable).toBe(true)
  })

  it('error() attaches details when provided', () => {
    const { notify } = useStore.getState()
    const id = notify.start({ title: 'Import', kind: 'progress' })
    notify.error(id, '2 failed', [
      { name: 'malm', reason: 'No GLB matched' },
      { name: 'billy', reason: 'Invalid metadata' },
    ])
    const n = useStore.getState().notifications.find((x) => x.id === id)
    expect(n?.details).toHaveLength(2)
    expect(n?.details?.[0]).toEqual({ name: 'malm', reason: 'No GLB matched' })
  })

  it('error() leaves details undefined when none/empty', () => {
    const { notify } = useStore.getState()
    const id = notify.start({ title: 'X', kind: 'progress' })
    notify.error(id, 'broken', [])
    expect(useStore.getState().notifications.find((x) => x.id === id)?.details).toBeUndefined()
  })

  it('dismiss() removes the notification', () => {
    const { notify } = useStore.getState()
    const id = notify.start({ title: 'X', kind: 'info' })
    notify.dismiss(id)
    expect(useStore.getState().notifications).toHaveLength(0)
  })

  it('de-dupes an identical toast — resurfaces the existing one instead of stacking', () => {
    const { notify } = useStore.getState()
    const id1 = notify.start({ title: 'This area is already a room', kind: 'info' })
    const id2 = notify.start({ title: 'This area is already a room', kind: 'info' })
    expect(id2).toBe(id1) // same notification resurfaced
    expect(useStore.getState().notifications).toHaveLength(1)
  })

  it('keeps distinct toasts (different title) separate', () => {
    const { notify } = useStore.getState()
    notify.start({ title: 'A', kind: 'info' })
    notify.start({ title: 'B', kind: 'info' })
    expect(useStore.getState().notifications).toHaveLength(2)
  })

  it('never de-dupes progress toasts (tracked by their own id for live updates)', () => {
    const { notify } = useStore.getState()
    const id1 = notify.start({ title: 'Installing', kind: 'progress' })
    const id2 = notify.start({ title: 'Installing', kind: 'progress' })
    expect(id2).not.toBe(id1)
    expect(useStore.getState().notifications).toHaveLength(2)
  })
})
