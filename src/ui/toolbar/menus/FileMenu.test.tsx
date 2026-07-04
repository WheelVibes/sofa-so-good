// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../../../features/featureFlags'
import { serialize } from '../../../state/schema'
import { storage } from '../../../state/storage/adapter'
import { useStore } from '../../../state/store'
import { FileMenu } from './FileMenu'

// A11Y: the per-layout delete "×" button is icon-only (a bare glyph, no
// visible text) — it must carry a real accessible name identifying WHICH
// layout it deletes, not just a generic "Delete" (screen-reader users
// choosing among several saved layouts can't tell them apart otherwise).
describe('FileMenu saved-layout delete button', () => {
  beforeEach(async () => {
    useStore.getState().__resetForTest()
    setResolvedFlags(resolveFlags(true))
    localStorage.clear()
    await storage.save('living-room-v1', serialize(useStore.getState()))
  })
  afterEach(() => {
    setResolvedFlags(resolveFlags(true))
    localStorage.clear()
  })

  it('names the specific layout in its accessible name', async () => {
    render(<FileMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete layout "living-room-v1"' })).toBeTruthy(),
    )
  })
})
