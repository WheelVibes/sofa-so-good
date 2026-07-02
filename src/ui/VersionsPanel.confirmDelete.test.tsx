/**
 * P35 destructive-confirmation policy: deleting a saved version/slot is
 * irreversible (no undo), so it must gate on `confirmAction` (the themed
 * confirm modal) rather than deleting silently. Mirrors the pattern already
 * used by `FinishPicker.clearRoom` / `LevelMenu.removeLevel`.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { serialize } from '../state/schema'
import { LocalStorageAdapter } from '../state/storage/LocalStorageAdapter'
import { useStore } from '../state/store'
import { VersionsPanel } from './VersionsPanel'

beforeEach(async () => {
  localStorage.clear()
  useStore.getState().__resetForTest?.()
  useStore.getState().setVersionsOpen(true)
  await LocalStorageAdapter.save('my-version', serialize(useStore.getState()))
})

/** Wait for the version row (loaded async via `loadRows`) then return its
 *  delete button. */
async function findDeleteButton(): Promise<HTMLElement> {
  await waitFor(() => expect(screen.getByText('my-version')).toBeInTheDocument())
  const delButtons = screen.getAllByRole('button').filter((b) => b.className === 'del')
  expect(delButtons).toHaveLength(1)
  return delButtons[0]!
}

describe('VersionsPanel delete confirmation', () => {
  it('opens a confirm request instead of deleting immediately', async () => {
    render(<VersionsPanel />)
    const del = await findDeleteButton()
    fireEvent.click(del)

    await waitFor(() => expect(useStore.getState().confirmRequest).not.toBeNull())
    expect(useStore.getState().confirmRequest?.danger).toBe(true)
    // Not deleted yet.
    await expect(LocalStorageAdapter.load('my-version')).resolves.not.toBeNull()
  })

  it('resolving false leaves the version in place', async () => {
    render(<VersionsPanel />)
    const del = await findDeleteButton()
    fireEvent.click(del)
    await waitFor(() => expect(useStore.getState().confirmRequest).not.toBeNull())
    useStore.getState().resolveConfirm(false)

    await waitFor(() => expect(useStore.getState().confirmRequest).toBeNull())
    await expect(LocalStorageAdapter.load('my-version')).resolves.not.toBeNull()
  })

  it('resolving true deletes the version', async () => {
    render(<VersionsPanel />)
    const del = await findDeleteButton()
    fireEvent.click(del)
    await waitFor(() => expect(useStore.getState().confirmRequest).not.toBeNull())
    useStore.getState().resolveConfirm(true)

    await waitFor(async () => {
      expect(await LocalStorageAdapter.load('my-version')).toBeNull()
    })
  })
})
