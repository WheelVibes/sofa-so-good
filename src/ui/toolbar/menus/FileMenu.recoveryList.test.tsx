// @vitest-environment happy-dom
/**
 * R7-AA — File's saved-layout list is the restore path the shared-link toast
 * names, so it must (a) show a recovery copy written AFTER the menu mounted (a
 * link opened mid-session via the live `hashchange` path), and (b) label the
 * copies so three of them can be told apart. Both desktop and the mobile sheet.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../../../features/featureFlags'
import { serialize } from '../../../state/schema'
import { LocalStorageAdapter } from '../../../state/storage/LocalStorageAdapter'
import { slotDisplayName } from '../../../state/storage/slotLabels'
import { useStore } from '../../../state/store'
import { MobileToolbar } from '../MobileToolbar'
import { FileMenu } from './FileMenu'

const RECOVERY = 'before-shared-link-2026-09-26-00-14-05'

beforeEach(async () => {
  useStore.getState().__resetForTest()
  setResolvedFlags(resolveFlags(true))
  localStorage.clear()
  await LocalStorageAdapter.save('my-layout', serialize(useStore.getState()))
})
afterEach(() => {
  setResolvedFlags(resolveFlags(true))
  localStorage.clear()
})

describe('slotDisplayName', () => {
  it('turns a recovery-copy id into a readable, distinguishable label', () => {
    expect(slotDisplayName(RECOVERY)).toBe('Before shared link · 26 Sep, 00:14:05')
    expect(slotDisplayName(`${RECOVERY}-2`)).toBe('Before shared link · 26 Sep, 00:14:05 (2)')
    expect(slotDisplayName('before-shared-link-2026-01-02-09-05-00')).toBe(
      'Before shared link · 2 Jan, 09:05:00',
    )
  })
  it('leaves user-named and unparseable slots alone', () => {
    expect(slotDisplayName('living-room-v2')).toBe('living-room-v2')
    expect(slotDisplayName('before-shared-link-garbage')).toBe('before-shared-link-garbage')
    expect(slotDisplayName('before-shared-link-2026-13-02-09-05-00')).toBe(
      'before-shared-link-2026-13-02-09-05-00',
    )
  })
})

describe('desktop File menu saved-layout list stays current', () => {
  it('shows a recovery copy written while the menu is already mounted and open', async () => {
    render(<FileMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    await waitFor(() => expect(screen.getByText('my-layout')).toBeTruthy())
    expect(screen.queryByText(slotDisplayName(RECOVERY))).toBeNull()

    // A shared link opened mid-session writes its recovery copy now.
    await act(async () => {
      await LocalStorageAdapter.save(RECOVERY, serialize(useStore.getState()))
    })
    await waitFor(() => expect(screen.getByText(slotDisplayName(RECOVERY))).toBeTruthy())

    // …and pruning/deleting it drops it from the open list too.
    await act(async () => {
      await LocalStorageAdapter.delete(RECOVERY)
    })
    await waitFor(() => expect(screen.queryByText(slotDisplayName(RECOVERY))).toBeNull())
  })
})

describe('mobile File sheet saved-layout list stays current', () => {
  it('shows a recovery copy written while the sheet is open', async () => {
    render(<MobileToolbar />)
    fireEvent.click(screen.getByRole('button', { name: /menu/i }))
    // The sheet opens on View; switch its rail to File.
    fireEvent.click(await screen.findByRole('tab', { name: 'File' }))
    await waitFor(() => expect(screen.getAllByText('my-layout').length).toBeGreaterThan(0))
    await act(async () => {
      await LocalStorageAdapter.save(RECOVERY, serialize(useStore.getState()))
    })
    await waitFor(() =>
      expect(screen.getAllByText(slotDisplayName(RECOVERY)).length).toBeGreaterThan(0),
    )
  })
})
