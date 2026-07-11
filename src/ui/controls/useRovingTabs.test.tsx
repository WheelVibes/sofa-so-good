// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { useRovingTabs } from './useRovingTabs'

/** Minimal WAI-ARIA tablist harness wired exactly like the real consumers
 *  (MobileSheet rail / FinishPicker surface tabs). */
function Tabs({ items, initial = 0 }: { items: string[]; initial?: number }) {
  const [active, setActive] = useState(initial)
  const roving = useRovingTabs({
    count: items.length,
    activeIndex: active,
    onActivate: setActive,
  })
  return (
    <div role="tablist" aria-label="Test tabs" ref={roving.listRef} onKeyDown={roving.onKeyDown}>
      {items.map((label, i) => (
        <button
          key={label}
          type="button"
          role="tab"
          aria-selected={i === active}
          tabIndex={roving.tabIndexFor(i)}
          onClick={() => setActive(i)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

const tabs = () => screen.getAllByRole('tab')
const tablist = () => screen.getByRole('tablist')

describe('useRovingTabs — WAI-ARIA tabs keyboard pattern (TB-9)', () => {
  it('is ONE tab stop: only the active tab has tabIndex 0', () => {
    render(<Tabs items={['A', 'B', 'C']} initial={1} />)
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0, -1])
  })

  it('falls back to the first tab as the stop when nothing is active', () => {
    render(<Tabs items={['A', 'B', 'C']} initial={-1} />)
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1])
  })

  it('ArrowRight moves focus AND selects the next tab', () => {
    render(<Tabs items={['A', 'B', 'C']} />)
    fireEvent.keyDown(tablist(), { key: 'ArrowRight' })
    const [a, b] = tabs()
    expect(b.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(b)
    expect(a.tabIndex).toBe(-1)
    expect(b.tabIndex).toBe(0)
  })

  it('ArrowDown / ArrowUp work too (vertical tablists like the mobile rail)', () => {
    render(<Tabs items={['A', 'B', 'C']} />)
    fireEvent.keyDown(tablist(), { key: 'ArrowDown' })
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tablist(), { key: 'ArrowUp' })
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true')
  })

  it('wraps around at both ends', () => {
    render(<Tabs items={['A', 'B', 'C']} initial={2} />)
    fireEvent.keyDown(tablist(), { key: 'ArrowRight' })
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tablist(), { key: 'ArrowLeft' })
    expect(tabs()[2].getAttribute('aria-selected')).toBe('true')
  })

  it('Home / End jump to the first / last tab', () => {
    render(<Tabs items={['A', 'B', 'C']} initial={1} />)
    fireEvent.keyDown(tablist(), { key: 'End' })
    expect(tabs()[2].getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs()[2])
    fireEvent.keyDown(tablist(), { key: 'Home' })
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs()[0])
  })

  it('ignores unrelated keys', () => {
    render(<Tabs items={['A', 'B']} />)
    fireEvent.keyDown(tablist(), { key: 'Tab' })
    fireEvent.keyDown(tablist(), { key: 'Enter' })
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true')
  })
})
