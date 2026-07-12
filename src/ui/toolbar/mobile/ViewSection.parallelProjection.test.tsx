// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../../state/store'
import { ViewSection } from './ViewSection'

// `parallelProjection` was introduced at 0.20.0.6 (see `src/ui/newBadges.ts`)
// — pin "now" inside its recency window so the badge test below is
// deterministic regardless of the live `APP_VERSION`, which has since moved
// a minor line past it.
vi.mock('../../../version', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../version')>()
  return { ...actual, APP_VERSION: '0.20.0.20' }
})

/**
 * R3-FEAT-3: mobile parity for the "Parallel projection" (orthographic
 * dollhouse) framing toggle — same `parallelProjection` pro-tier gate as the
 * desktop View menu (present in Pro, hidden in Simple).
 */
describe('ViewSection (mobile) parallel-projection toggle (parallelProjection, R3-FEAT-3)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  const renderSection = () =>
    render(<ViewSection activeId="view" act={(fn) => () => fn()} vrSupported={false} />)

  it('shows the Parallel projection item in Pro mode', () => {
    useStore.getState().setUiMode('pro')
    renderSection()
    expect(screen.getByText('Parallel projection')).toBeInTheDocument()
  })

  it('hides the Parallel projection item in Simple mode', () => {
    useStore.getState().setUiMode('simple')
    renderSection()
    expect(screen.queryByText('Parallel projection')).not.toBeInTheDocument()
  })

  it('toggles the store value on click', () => {
    useStore.getState().setUiMode('pro')
    renderSection()
    expect(useStore.getState().parallelProjection).toBe(false)
    fireEvent.click(screen.getByText('Parallel projection'))
    expect(useStore.getState().parallelProjection).toBe(true)
  })

  describe('"New" badge (P27, src/ui/newBadges.ts)', () => {
    it('shows the dot on the Parallel projection row when unseen', () => {
      useStore.getState().setUiMode('pro')
      useStore.setState({
        featureFlags: { ...useStore.getState().featureFlags, newBadges: true } as never,
      })
      renderSection()
      const row = screen.getByText('Parallel projection').closest('button')
      expect(row?.querySelector('.new-dot')).not.toBeNull()
    })

    it('dismisses the dot after the row is clicked (and toggling still works)', () => {
      useStore.getState().setUiMode('pro')
      useStore.setState({
        featureFlags: { ...useStore.getState().featureFlags, newBadges: true } as never,
      })
      const { rerender } = renderSection()
      fireEvent.click(screen.getByText('Parallel projection'))
      expect(useStore.getState().seenBadges).toContain('parallelProjection')
      expect(useStore.getState().parallelProjection).toBe(true)
      rerender(<ViewSection activeId="view" act={(fn) => () => fn()} vrSupported={false} />)
      const row = screen.getByText('Parallel projection').closest('button')
      expect(row?.querySelector('.new-dot')).toBeNull()
    })
  })
})
