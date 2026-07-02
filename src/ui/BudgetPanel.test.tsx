/**
 * Empty-state CTA coverage for BudgetPanel (P28 — empty-state CTA sweep).
 * Both "No saved items" (Saved tab) and "No furniture placed yet" (List tab)
 * get a "Browse catalog" CTA wired to the real catalog-open lever
 * (`setLeftMode('catalog')` + `setCatalogOpen(true)` — same idiom as
 * `EmptyRoomHint`'s "Open catalog" button).
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { BudgetPanel } from './BudgetPanel'

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.setState({ budgetOpen: true, items: [] })
})

afterEach(() => {
  useStore.setState({ budgetOpen: false, catalogOpen: false, leftMode: 'catalog' })
})

describe('BudgetPanel empty states', () => {
  it('renders "Browse catalog" CTA on the List tab when nothing is placed', () => {
    useStore.setState({ shopTab: 'list' })
    render(<BudgetPanel />)
    expect(screen.getByText('No furniture placed yet')).toBeInTheDocument()
    const btn = screen.getByRole('button', { name: 'Browse catalog' })
    expect(btn).toBeInTheDocument()
  })

  it('fires the real catalog-open lever from the List tab CTA', () => {
    useStore.setState({ shopTab: 'list' })
    render(<BudgetPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Browse catalog' }))
    expect(useStore.getState().catalogOpen).toBe(true)
    expect(useStore.getState().leftMode).toBe('catalog')
  })

  it('renders + fires "Browse catalog" CTA on the Saved tab when no items are saved', () => {
    useStore.setState({ shopTab: 'saved', favouriteDefIds: [] })
    render(<BudgetPanel />)
    expect(screen.getByText('No saved items')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Browse catalog' }))
    expect(useStore.getState().catalogOpen).toBe(true)
  })

  it('behaves identically in Simple and Pro mode (budget is a simple-tier flag)', () => {
    for (const mode of ['simple', 'pro'] as const) {
      useStore.getState().setUiMode(mode)
      useStore.getState().reresolveFeatureFlags()
      useStore.setState({ shopTab: 'list', catalogOpen: false })
      const { unmount } = render(<BudgetPanel />)
      fireEvent.click(screen.getByRole('button', { name: 'Browse catalog' }))
      expect(useStore.getState().catalogOpen).toBe(true)
      unmount()
    }
  })
})
