/**
 * Empty-state CTA coverage for VersionsPanel (P28 — empty-state CTA sweep).
 * "No saved versions yet" gets a "Save current version" CTA wired to the
 * panel's real `save()` (verified by the prompt it opens — `promptText`
 * flips `textPrompt` from null, proving the real handler ran, not a stub).
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { VersionsPanel } from './VersionsPanel'

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.setState({ versionsOpen: true })
})

afterEach(() => {
  useStore.setState({ versionsOpen: false, textPrompt: null })
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

  it('behaves identically in Simple and Pro mode (component has no tier-conditional logic — the pro-tier gate lives upstream in toolActions/menu visibility)', () => {
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
