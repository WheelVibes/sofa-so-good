// @vitest-environment happy-dom
/**
 * The context menu shows keyboard-shortcut chips (R / F / ⌘D / Del) next to the
 * rows that have one. On touch devices there is no keyboard, so those chips are
 * noise — they must be suppressed under the mobile breakpoint (MOBILE-CTX-KBD),
 * while the rows themselves still render (the menu row is the affordance).
 */
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../state/store'
import { ContextMenu } from './ContextMenu'

const ITEM = {
  id: 'it-1',
  defId: 'sofa-3seat' as const,
  position: [3, 3] as [number, number],
  rotation: 0,
  props: {},
}

function setMobile(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

const originalMatchMedia = window.matchMedia

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.setState({ items: [ITEM] })
  useStore.getState().openContextMenu({ x: 100, y: 100, target: { kind: 'item', id: 'it-1' } })
})

afterEach(() => {
  window.matchMedia = originalMatchMedia
  useStore.getState().closeContextMenu()
})

describe('ContextMenu keyboard-shortcut chips (MOBILE-CTX-KBD)', () => {
  it('renders shortcut chips on desktop', () => {
    setMobile(false)
    render(<ContextMenu />)
    expect(document.body.querySelectorAll('kbd.sk').length).toBeGreaterThan(0)
  })

  it('suppresses every shortcut chip on mobile (no keyboard) but keeps the rows', () => {
    setMobile(true)
    const { getByText } = render(<ContextMenu />)
    expect(document.body.querySelectorAll('kbd.sk').length).toBe(0)
    // Rows themselves still render — the chip is the only thing removed.
    expect(getByText('Rotate 90°')).toBeInTheDocument()
    expect(getByText('Duplicate')).toBeInTheDocument()
  })
})
