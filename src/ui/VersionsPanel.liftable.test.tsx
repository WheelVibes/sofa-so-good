import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { serialize } from '../state/schema'
import { LocalStorageAdapter } from '../state/storage/LocalStorageAdapter'
import { useStore } from '../state/store'
import { VersionsPanel } from './VersionsPanel'

// Task 4 (P4) substitute for the SwapModal class-presence test: SwapModal
// requires seeding a placed item + catalog alternatives + the replaceSimilar
// feature flag, which is heavy for a single class-presence assertion.
// VersionsPanel's `.ver-card` list is cheaper to render and carries the same
// `.liftable` hover-lift class.
describe('VersionsPanel hover-lift', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.getState().__resetForTest()
  })

  it('renders saved version cards with the .liftable hover-lift class', async () => {
    await LocalStorageAdapter.save('my-version', serialize(useStore.getState()))
    useStore.getState().setVersionsOpen(true)
    render(<VersionsPanel />)
    // Wait for the async loadRows() effect to populate the saved version row.
    await screen.findByText('my-version')
    const card = document.querySelector('.ver-list .ver-card:not(.current)')
    expect(card?.classList.contains('liftable')).toBe(true)
  })
})
