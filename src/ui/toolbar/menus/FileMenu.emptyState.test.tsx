// @vitest-environment happy-dom
/**
 * UIUX-11: the File menu's "Saved layouts" list renders the shared EmptyState
 * when no layouts exist, and the .saved-view-row vocabulary when they do
 * (matching the View menu's bookmark rows) — not a hand-rolled Tailwind clone.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../../../features/featureFlags'
import { serialize } from '../../../state/schema'
import { storage } from '../../../state/storage/adapter'
import { useStore } from '../../../state/store'
import { FileMenu } from './FileMenu'

beforeEach(() => {
  useStore.getState().__resetForTest()
  setResolvedFlags(resolveFlags(true))
  localStorage.clear()
})

describe('FileMenu saved-layouts list (UIUX-11)', () => {
  it('renders the shared EmptyState when no layouts are saved', async () => {
    render(<FileMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    await waitFor(() => expect(screen.getByText('No saved layouts yet')).toBeTruthy())
    expect(document.querySelector('.empty-mini')).not.toBeNull()
  })

  it('renders saved slots as .saved-view-row entries with thumb slot + delete', async () => {
    await storage.save('living-room-v1', serialize(useStore.getState()))
    render(<FileMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    await waitFor(() => expect(screen.getByText('living-room-v1')).toBeTruthy())
    const row = document.querySelector('.saved-view-row')
    expect(row).not.toBeNull()
    expect(row!.querySelector('.saved-view-apply .mi-main')?.textContent).toBe('living-room-v1')
    expect(row!.querySelector('.saved-view-del')).not.toBeNull()
  })
})
