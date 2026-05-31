import { act, render, screen } from '@testing-library/react'
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
    expect(screen.getByText('Installing X')).toBeInTheDocument()
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
})
