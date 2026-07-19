// @vitest-environment happy-dom
/**
 * Mobile parity for "Suggest views" (SAVED-VIEWS-SUGGEST) — same
 * `suggestedViews` pro-tier gate as the desktop View menu (present in Pro,
 * hidden in Simple), and wired to `suggestSavedViews`.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../../../features/featureFlags'
import { useStore } from '../../../state/store'
import { ViewSection } from './ViewSection'

const renderSection = () =>
  render(<ViewSection activeId="view" act={(fn) => () => fn()} vrSupported={false} />)

describe('ViewSection (mobile) "Suggest views"', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('shows the item in Pro mode', () => {
    useStore.getState().setUiMode('pro')
    renderSection()
    expect(screen.getByText('Suggest views')).toBeInTheDocument()
  })

  it('hides the item in Simple mode (pro-tier feature)', () => {
    expect(FEATURE_FLAGS.suggestedViews.tier).toBe('pro')
    useStore.getState().setUiMode('simple')
    renderSection()
    expect(screen.queryByText('Suggest views')).not.toBeInTheDocument()
  })

  it('calls suggestSavedViews on click', () => {
    useStore.getState().setUiMode('pro')
    renderSection()
    expect(useStore.getState().savedViews).toHaveLength(0)
    fireEvent.click(screen.getByText('Suggest views'))
    expect(useStore.getState().savedViews.length).toBeGreaterThan(0)
  })
})
