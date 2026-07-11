// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { MobileSheet, type SheetRailItem } from './MobileSheet'

/** TB-9: the sheet's section rail is a WAI-ARIA tablist with a roving
 *  tabindex — one Tab stop, Arrow/Home/End move focus AND select. */

const RAIL: SheetRailItem[] = [
  { id: 'view', icon: 'Orbit', title: 'View' },
  { id: 'scene', icon: 'Time', title: 'Scene' },
  { id: 'file', icon: 'Save', title: 'File' },
]

function Harness() {
  const [activeId, setActiveId] = useState('view')
  return (
    <MobileSheet
      open
      onClose={() => {}}
      title="Test sheet"
      railItems={RAIL}
      activeId={activeId}
      onSelectSection={setActiveId}
    >
      <div>body</div>
    </MobileSheet>
  )
}

describe('MobileSheet rail — roving tablist (TB-9)', () => {
  it('only the active section tab is in the Tab order', () => {
    render(<Harness />)
    expect(screen.getAllByRole('tab').map((t) => t.tabIndex)).toEqual([0, -1, -1])
  })

  it('ArrowDown selects and focuses the next section; Home returns to the first', () => {
    render(<Harness />)
    const list = screen.getByRole('tablist')
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    let tabs = screen.getAllByRole('tab')
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs[1])
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1])
    fireEvent.keyDown(list, { key: 'Home' })
    tabs = screen.getAllByRole('tab')
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
  })
})
