// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetModalGuardForTests } from '../controls/modalGuard'
import { SHORTCUT_GROUPS } from '../controls/shortcutHelp'
import { useStore } from '../state/store'
import { ShortcutsModal } from './ShortcutsModal'

beforeEach(() => {
  resetModalGuardForTests()
  useStore.getState().setShortcutsHelpOpen(false)
})

describe('ShortcutsModal', () => {
  it('renders nothing while closed', () => {
    render(<ShortcutsModal />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders a labelled dialog with every group + a kbd chip per key when open', () => {
    useStore.getState().setShortcutsHelpOpen(true)
    render(<ShortcutsModal />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'Keyboard shortcuts')

    // Every group heading + every row description shows.
    for (const g of SHORTCUT_GROUPS) {
      expect(within(dialog).getByText(g.title)).toBeInTheDocument()
      for (const row of g.rows) {
        expect(within(dialog).getByText(row.desc)).toBeInTheDocument()
      }
    }

    // Total <kbd> chips == the sum of all key chips across every row.
    const expectedChips = SHORTCUT_GROUPS.reduce(
      (n, g) => n + g.rows.reduce((m, r) => m + r.keys.length, 0),
      0,
    )
    const chips = dialog.querySelectorAll('kbd')
    expect(chips.length).toBe(expectedChips)
    // The rotate key chip (from KEYBINDINGS) is present.
    expect(within(dialog).getAllByText('R').length).toBeGreaterThan(0)
  })
})
