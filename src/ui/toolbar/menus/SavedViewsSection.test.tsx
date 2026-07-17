// @vitest-environment happy-dom
/**
 * P35 destructive-confirmation policy: deleting a saved camera view is
 * irreversible (no undo), so it must gate on `confirmAction` (the themed
 * confirm modal) rather than deleting silently. Mirrors `LevelMenu.removeLevel`.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../../../features/featureFlags'
import { useStore } from '../../../state/store'
import { SavedViewsSection } from './SavedViewsSection'

beforeEach(() => {
  for (const v of [...useStore.getState().savedViews]) useStore.getState().deleteView(v.id)
  useStore.getState().saveCurrentView('Living room angle')
})

describe('SavedViewsSection delete confirmation', () => {
  it('opens a confirm request instead of deleting immediately', async () => {
    render(<SavedViewsSection />)
    const del = screen.getByRole('button', { name: /delete view/i })
    fireEvent.click(del)

    await waitFor(() => expect(useStore.getState().confirmRequest).not.toBeNull())
    expect(useStore.getState().confirmRequest?.danger).toBe(true)
    expect(useStore.getState().savedViews).toHaveLength(1)
  })

  it('resolving false leaves the view in place', async () => {
    render(<SavedViewsSection />)
    fireEvent.click(screen.getByRole('button', { name: /delete view/i }))
    useStore.getState().resolveConfirm(false)

    await waitFor(() => expect(useStore.getState().confirmRequest).toBeNull())
    expect(useStore.getState().savedViews).toHaveLength(1)
  })

  it('resolving true deletes the view', async () => {
    render(<SavedViewsSection />)
    fireEvent.click(screen.getByRole('button', { name: /delete view/i }))
    useStore.getState().resolveConfirm(true)

    await waitFor(() => expect(useStore.getState().savedViews).toHaveLength(0))
  })

  it('still calls stopPropagation on the delete click so the menu stays open', async () => {
    render(
      <div
        onClick={() => {
          throw new Error('propagated — menu would close')
        }}
      >
        <SavedViewsSection />
      </div>,
    )
    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: /delete view/i })),
    ).not.toThrow()
  })
})

describe('"Suggest views" — flag + tier gating (SAVED-VIEWS-SUGGEST)', () => {
  afterEach(() => {
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
  })

  it('shows in Pro mode', () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    render(<SavedViewsSection />)
    expect(screen.getByText('Suggest views')).toBeInTheDocument()
  })

  it('is hidden in Simple mode (pro-tier feature)', () => {
    expect(FEATURE_FLAGS.suggestedViews.tier).toBe('pro')
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    render(<SavedViewsSection />)
    expect(screen.queryByText('Suggest views')).not.toBeInTheDocument()
  })
})
