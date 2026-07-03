// @vitest-environment happy-dom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('spins the icon while a progress toast is in flight', () => {
    render(<NotificationContainer />)
    act(() => {
      useStore.getState().notify.start({ title: 'Checking for updates…', kind: 'progress' })
    })
    const host = document.querySelector('.toast-host') as HTMLElement
    expect(host.querySelector('.icn.spin')).not.toBeNull()
  })

  it('renders an indeterminate bar (no aria-valuenow) when progress is null', () => {
    render(<NotificationContainer />)
    act(() => {
      const id = useStore.getState().notify.start({ title: 'Checking…', kind: 'progress' })
      useStore.getState().notify.update(id, { progress: null })
    })
    const bar = document.querySelector('[role="progressbar"]') as HTMLElement
    expect(bar).not.toBeNull()
    expect(bar.classList.contains('indet')).toBe(true)
    expect(bar.hasAttribute('aria-valuenow')).toBe(false)
  })

  it('pauses auto-dismiss while hovered, then resumes with the time that remained', () => {
    vi.useFakeTimers()
    try {
      render(<NotificationContainer />)
      act(() => {
        useStore.getState().notify.start({ title: 'Hover me', kind: 'info', autoDismissMs: 3000 })
      })
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      const toast = document.querySelector('[data-notification]') as HTMLElement
      expect(toast).not.toBeNull()
      // Hover → pause: further time no longer dismisses it.
      fireEvent.mouseEnter(toast)
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(document.querySelector('[data-notification]')).not.toBeNull()
      // Unhover → resume with ~2000ms left.
      fireEvent.mouseLeave(toast)
      act(() => {
        vi.advanceTimersByTime(1999)
      })
      expect(document.querySelector('[data-notification]')).not.toBeNull()
      act(() => {
        vi.advanceTimersByTime(2)
      })
      expect(document.querySelector('[data-notification]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders an action button that runs onAction and dismisses', () => {
    render(<NotificationContainer />)
    let ran = false
    let id = ''
    act(() => {
      id = useStore.getState().notify.start({
        title: 'Update available',
        kind: 'info',
        actionLabel: 'Update',
        onAction: () => {
          ran = true
        },
      })
    })
    const btn = screen.getByRole('button', { name: 'Update' })
    expect(btn).toBeInTheDocument()
    act(() => {
      btn.click()
    })
    expect(ran).toBe(true)
    expect(useStore.getState().notifications.find((n) => n.id === id)).toBeUndefined()
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

  it('opens the import-errors detail dialog as a shared Modal (UX-008)', () => {
    render(<NotificationContainer />)
    act(() => {
      const id = useStore.getState().notify.start({ title: 'Import finished', kind: 'progress' })
      useStore
        .getState()
        .notify.error(id, 'Some items failed', [{ name: 'chair.glb', reason: 'bad file' }])
    })
    // Click the toast message to open the details dialog.
    const host = document.querySelector('.toast-host') as HTMLElement
    const msgBtn = within(host).getByRole('button', { name: /Import finished/i })
    act(() => {
      msgBtn.click()
    })
    // Now a real dialog (shared Modal) — role + focusable, not a bare overlay.
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(/could not be imported/i)).toBeInTheDocument()
    expect(within(dialog).getByText('chair.glb')).toBeInTheDocument()
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

  it('enables the body button and calls onActivate when a toast has onActivate but no details', () => {
    render(<NotificationContainer />)
    let ran = false
    act(() => {
      useStore.getState().notify.start({
        title: 'Render ready',
        kind: 'success',
        onActivate: () => {
          ran = true
        },
      })
    })
    const host = document.querySelector('.toast-host') as HTMLElement
    const msgBtn = within(host).getByRole('button', { name: /Render ready/i })
    expect(msgBtn).toBeEnabled()
    act(() => {
      msgBtn.click()
    })
    expect(ran).toBe(true)
  })

  it('disables the body button when a toast has neither details nor onActivate', () => {
    render(<NotificationContainer />)
    act(() => {
      useStore.getState().notify.start({ title: 'Just info', kind: 'info' })
    })
    const host = document.querySelector('.toast-host') as HTMLElement
    const msgBtn = within(host).getByRole('button', { name: /Just info/i })
    expect(msgBtn).toBeDisabled()
  })

  it('renders a Retry action on an error toast and calls retry on click', () => {
    render(<NotificationContainer />)
    let retried = false
    act(() => {
      const id = useStore.getState().notify.start({ title: 'Render', kind: 'progress' })
      useStore.getState().notify.error(id, 'Render failed', undefined, () => {
        retried = true
      })
    })
    const btn = screen.getByRole('button', { name: 'Retry' })
    expect(btn).toBeInTheDocument()
    act(() => {
      btn.click()
    })
    expect(retried).toBe(true)
  })
})
