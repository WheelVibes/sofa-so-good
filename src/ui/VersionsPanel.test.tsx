// @vitest-environment happy-dom
/**
 * Empty-state CTA coverage for VersionsPanel (P28 — empty-state CTA sweep).
 * "No saved versions yet" gets a "Save current version" CTA wired to the
 * panel's real `save()` (verified by the prompt it opens — `promptText`
 * flips `textPrompt` from null, proving the real handler ran, not a stub).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { serialize } from '../state/schema'
import { storage } from '../state/storage/adapter'
import { useStore } from '../state/store'
import { VersionsPanel } from './VersionsPanel'

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.setState({ versionsOpen: true })
})

afterEach(() => {
  useStore.setState({ versionsOpen: false, textPrompt: null })
  localStorage.clear()
})

describe('VersionsPanel empty state', () => {
  it('renders the "Save current version" CTA when there are no saved versions', () => {
    render(<VersionsPanel />)
    expect(screen.getByText('No saved versions yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save current version' })).toBeInTheDocument()
  })

  it('fires the real save() handler on click (opens the save-version prompt)', () => {
    render(<VersionsPanel />)
    expect(useStore.getState().textPrompt).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save current version' }))
    expect(useStore.getState().textPrompt).not.toBeNull()
    expect(useStore.getState().textPrompt?.title).toBe('Save version')
  })

  it('behaves identically in Simple and Pro mode for save() (its own gate lives upstream in toolActions/menu visibility)', () => {
    for (const mode of ['simple', 'pro'] as const) {
      useStore.getState().setUiMode(mode)
      useStore.getState().reresolveFeatureFlags()
      const { unmount } = render(<VersionsPanel />)
      fireEvent.click(screen.getByRole('button', { name: 'Save current version' }))
      expect(useStore.getState().textPrompt).not.toBeNull()
      useStore.setState({ textPrompt: null })
      unmount()
    }
  })
})

describe('VersionsPanel "Compare in 3D" row action (versionCompareView gating)', () => {
  beforeEach(async () => {
    await storage.save('scandi-living-room', serialize(useStore.getState()))
  })

  it('is ON in Pro mode: renders the row action and opens the compare modal for that slot', async () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    render(<VersionsPanel />)
    const btn = await screen.findByRole('button', { name: /Compare in 3D/ })
    fireEvent.click(btn)
    expect(useStore.getState().versionCompareOpen).toBe(true)
    expect(useStore.getState().versionCompareSlot).toBe('scandi-living-room')
  })

  it('is forced OFF in Simple mode: the row action is not rendered', async () => {
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    render(<VersionsPanel />)
    await waitFor(() => expect(screen.getByText('scandi-living-room')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Compare in 3D/ })).not.toBeInTheDocument()
  })
})
