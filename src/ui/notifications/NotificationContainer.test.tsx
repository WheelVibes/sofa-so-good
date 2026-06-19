import { act, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../state/store'
import { NotificationContainer } from './NotificationContainer'

describe('NotificationContainer', () => {
  beforeEach(() => {
    useStore.setState({ notifications: [] })
  })

  it('renders nothing when no notifications', () => {
    const { container } = render(<NotificationContainer />)
    expect(container.querySelectorAll('[data-notification]')).toHaveLength(0)
  })

  it('renders a progress notification with a progress bar', () => {
    render(<NotificationContainer />)
    act(() => {
      const id = useStore.getState().notify.start({ title: 'Installing X', kind: 'progress' })
      useStore.getState().notify.update(id, { progress: 0.42 })
    })
    // Title appears both in the visible toast and the SR live region — scope to
    // the visible host for this assertion.
    const host = document.querySelector('.toast-host') as HTMLElement
    expect(within(host).getByText('Installing X')).toBeInTheDocument()
    const bar = document.querySelector('[role="progressbar"]') as HTMLElement
    expect(bar).not.toBeNull()
    expect(bar.getAttribute('aria-valuenow')).toBe('42')
  })

  it('renders an X button for dismissable notifications and dismisses on click', () => {
    render(<NotificationContainer />)
    let id = ''
    act(() => {
      id = useStore.getState().notify.start({ title: 'Hi', kind: 'info' })
    })
    const btn = screen.getByRole('button', { name: /dismiss/i })
    expect(btn).toBeInTheDocument()
    act(() => {
      btn.click()
    })
    expect(useStore.getState().notifications.find((n) => n.id === id)).toBeUndefined()
  })

  const politeRegion = () =>
    document.querySelector('[aria-live="polite"][role="status"]') as HTMLElement | null
  const assertiveRegion = () =>
    document.querySelector('[aria-live="assertive"][role="alert"]') as HTMLElement | null

  it('mounts a polite status live region and an assertive alert live region', () => {
    render(<NotificationContainer />)
    const polite = politeRegion()
    const assertive = assertiveRegion()
    expect(polite).not.toBeNull()
    expect(assertive).not.toBeNull()
    expect(polite?.getAttribute('aria-atomic')).toBe('true')
    expect(assertive?.getAttribute('aria-atomic')).toBe('true')
    // Live regions exist even with no toasts (so AT keeps observing them) but
    // carry no text — no stray announcement noise.
    expect(polite?.textContent).toBe('')
    expect(assertive?.textContent).toBe('')
  })

  it('announces info/success toasts politely, not assertively', () => {
    render(<NotificationContainer />)
    act(() => {
      useStore.getState().notify.start({ title: 'Saved', message: 'All good', kind: 'info' })
    })
    expect(politeRegion()?.textContent).toContain('Saved')
    expect(politeRegion()?.textContent).toContain('All good')
    expect(assertiveRegion()?.textContent).toBe('')
  })

  it('announces error toasts via the assertive alert region', () => {
    render(<NotificationContainer />)
    act(() => {
      const id = useStore.getState().notify.start({ title: 'Importing', kind: 'progress' })
      useStore.getState().notify.error(id, 'Upload failed')
    })
    expect(assertiveRegion()?.textContent).toContain('Upload failed')
    expect(assertiveRegion()?.textContent?.toLowerCase()).toContain('error')
  })

  it('keeps the visible toast stack out of any live region (no double-announce)', () => {
    render(<NotificationContainer />)
    act(() => {
      useStore.getState().notify.start({ title: 'Hi', kind: 'info' })
    })
    const host = document.querySelector('.toast-host') as HTMLElement
    expect(host).not.toBeNull()
    // The visible host must NOT itself be a live region — announcements come
    // from the dedicated hidden regions, so the stack can't auto-announce.
    expect(host.getAttribute('aria-live')).toBeNull()
    expect(host.getAttribute('role')).toBeNull()
    // Interactive controls stay reachable (not buried under aria-hidden).
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
  })

  it('does not re-announce on progress value updates (no announcement spam)', () => {
    render(<NotificationContainer />)
    let id = ''
    act(() => {
      id = useStore.getState().notify.start({ title: 'Installing', kind: 'progress' })
    })
    expect(politeRegion()?.textContent).toContain('Installing')
    // Mutate the polite region content so we can detect a re-announce.
    act(() => {
      useStore.getState().notify.start({ title: 'Other thing', kind: 'info' })
    })
    expect(politeRegion()?.textContent).toContain('Other thing')
    // A burst of progress ticks must NOT overwrite the live region.
    act(() => {
      useStore.getState().notify.update(id, { progress: 0.3 })
      useStore.getState().notify.update(id, { progress: 0.6 })
      useStore.getState().notify.update(id, { progress: 0.9 })
    })
    expect(politeRegion()?.textContent).toContain('Other thing')
    expect(politeRegion()?.textContent).not.toContain('Installing')
  })

  it('re-announces when a progress toast resolves to success', () => {
    render(<NotificationContainer />)
    let id = ''
    act(() => {
      id = useStore.getState().notify.start({ title: 'Installing pack', kind: 'progress' })
    })
    act(() => {
      useStore.getState().notify.success(id, 'Pack ready')
    })
    expect(politeRegion()?.textContent).toContain('Pack ready')
  })
})
