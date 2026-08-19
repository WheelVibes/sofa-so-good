// @vitest-environment happy-dom
/**
 * UIUX-1 / P35 destructive-confirmation policy: deleting a saved layout SLOT is
 * irreversible (no undo toast, no history entry), so both the desktop File menu
 * and the mobile sheet's File section must gate it on `confirmAction` (the
 * themed confirm modal) rather than deleting silently. Mirrors
 * `VersionsPanel.confirmDelete.test.tsx`.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../../../features/featureFlags'
import { serialize } from '../../../state/schema'
import { storage } from '../../../state/storage/adapter'
import { useStore } from '../../../state/store'
import { FileSection } from '../mobile/FileSection'
import { FileMenu } from './FileMenu'

const SLOT = 'living-room-v1'

beforeEach(async () => {
  useStore.getState().__resetForTest()
  setResolvedFlags(resolveFlags(true))
  localStorage.clear()
  await storage.save(SLOT, serialize(useStore.getState()))
})
afterEach(() => {
  setResolvedFlags(resolveFlags(true))
  localStorage.clear()
})

describe('desktop FileMenu saved-layout delete confirmation', () => {
  async function clickDelete() {
    render(<FileMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: `Delete layout "${SLOT}"` })).toBeTruthy(),
    )
    fireEvent.click(screen.getByRole('button', { name: `Delete layout "${SLOT}"` }))
  }

  it('opens a danger confirm request instead of deleting immediately', async () => {
    await clickDelete()
    await waitFor(() => expect(useStore.getState().confirmRequest).not.toBeNull())
    expect(useStore.getState().confirmRequest?.danger).toBe(true)
    await expect(storage.load(SLOT)).resolves.not.toBeNull()
  })

  it('resolving false leaves the layout in place', async () => {
    await clickDelete()
    await waitFor(() => expect(useStore.getState().confirmRequest).not.toBeNull())
    useStore.getState().resolveConfirm(false)
    await waitFor(() => expect(useStore.getState().confirmRequest).toBeNull())
    await expect(storage.load(SLOT)).resolves.not.toBeNull()
  })

  it('resolving true deletes the layout', async () => {
    await clickDelete()
    await waitFor(() => expect(useStore.getState().confirmRequest).not.toBeNull())
    useStore.getState().resolveConfirm(true)
    await waitFor(async () => {
      expect(await storage.load(SLOT)).toBeNull()
    })
  })
})

describe('mobile FileSection saved-layout delete confirmation', () => {
  function renderWithSlot() {
    render(
      <FileSection
        activeId="file"
        act={(fn: () => void) => fn}
        slots={[{ slot: SLOT, savedAt: new Date().toISOString() }]}
        refreshSlots={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: `Delete ${SLOT}` }))
  }

  it('opens a danger confirm request instead of deleting immediately', async () => {
    renderWithSlot()
    await waitFor(() => expect(useStore.getState().confirmRequest).not.toBeNull())
    expect(useStore.getState().confirmRequest?.danger).toBe(true)
    await expect(storage.load(SLOT)).resolves.not.toBeNull()
  })

  it('resolving true deletes the layout', async () => {
    renderWithSlot()
    await waitFor(() => expect(useStore.getState().confirmRequest).not.toBeNull())
    useStore.getState().resolveConfirm(true)
    await waitFor(async () => {
      expect(await storage.load(SLOT)).toBeNull()
    })
  })
})
