import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetModalGuardForTests } from '../controls/modalGuard'
import { useStore } from '../state/store'
import { CommandPalette } from './CommandPalette'

// Regression test for the ⌘K entrance-stagger fix: `.stagger-in > *` only
// animates DIRECT children, so each `.cmdk-item`'s inline `--i` (the flat
// index driving the 50ms cascade) only takes effect when the item's parent
// carries `stagger-in` — not when `stagger-in` sits on `.cmdk-results` two
// levels up (the group wrapper `<div>` swallows the rule).
describe('CommandPalette entrance stagger', () => {
  beforeEach(() => {
    resetModalGuardForTests()
    useStore.getState().setCmdkOpen(true)
  })

  it('every .cmdk-item is a direct child of a .stagger-in element with a non-empty inline --i', () => {
    render(<CommandPalette />)

    const items = document.querySelectorAll('.cmdk-item')
    expect(items.length).toBeGreaterThan(0)

    for (const item of Array.from(items)) {
      const parent = item.parentElement
      expect(parent).not.toBeNull()
      expect(parent?.classList.contains('stagger-in')).toBe(true)

      const inlineI = (item as HTMLElement).style.getPropertyValue('--i')
      expect(inlineI).not.toBe('')
    }
  })

  it('does not put stagger-in on the results container itself', () => {
    render(<CommandPalette />)
    const results = document.querySelector('.cmdk-results')
    expect(results).not.toBeNull()
    expect(results?.classList.contains('stagger-in')).toBe(false)
  })
})
