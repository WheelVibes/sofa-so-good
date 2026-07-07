// @vitest-environment happy-dom
/**
 * Catalog filter control (`catalogFilters`, simple tier). Tested in BOTH Simple
 * and Pro per the CLAUDE.md hard rule (simple-tier → present in both), the
 * flag-off case (no button), and an end-to-end narrow + reset through the popover.
 * The pure filtering logic itself is covered in `catalogBrowse.test.ts`.
 */
import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../state/store'
import { CatalogDrawer } from './CatalogDrawer'

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.setState({
    catalogOpen: true,
    cameraMode: 'orbit',
    roomEditor: { active: true, roomId: 'livingDining' },
  })
})

afterEach(() => {
  useStore.setState({ catalogOpen: false, roomEditor: { active: false, roomId: null } })
})

const filterBtn = () => document.querySelector('button[aria-label="Filter catalog"]')

describe('CatalogDrawer filter control', () => {
  it('shows the filter button in Simple mode (simple-tier, default on)', () => {
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    render(<CatalogDrawer />)
    expect(filterBtn()).not.toBeNull()
  })

  it('shows the filter button in Pro mode too', () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    render(<CatalogDrawer />)
    expect(filterBtn()).not.toBeNull()
  })

  it('hides the filter button when the flag is off', () => {
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    useStore.setState({
      featureFlags: { ...useStore.getState().featureFlags, catalogFilters: false },
    })
    render(<CatalogDrawer />)
    expect(filterBtn()).toBeNull()
  })

  it('narrows the grid by source, then reset restores it', () => {
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    render(<CatalogDrawer />)

    const before = document.querySelectorAll('.card-grid .cat-card').length
    expect(before).toBeGreaterThan(0)

    // Open the popover and pick "My items" — the curated flat has no user/ikea
    // uploads, so the built-in grid empties out.
    fireEvent.click(filterBtn()!)
    const panel = document.querySelector('.cat-filter-panel')
    expect(panel).not.toBeNull()
    const mine = [...panel!.querySelectorAll('.menu-item')].find((b) =>
      b.textContent?.includes('My items'),
    )
    expect(mine).toBeTruthy()
    fireEvent.click(mine!)
    const narrowed = document.querySelectorAll('.card-grid .cat-card').length
    expect(narrowed).toBeLessThan(before)

    // The active filter surfaces a reset control → back to the full grid.
    const reset = [...document.querySelectorAll('.cat-filter-panel .menu-item')].find((b) =>
      b.textContent?.includes('Reset to All'),
    )
    expect(reset).toBeTruthy()
    fireEvent.click(reset!)
    const restored = document.querySelectorAll('.card-grid .cat-card').length
    expect(restored).toBe(before)
  })
})
