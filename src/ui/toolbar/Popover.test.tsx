// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { Popover } from './Popover'

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <div data-testid="scroll-ancestor" style={{ overflowX: 'auto' }}>
      <button ref={ref}>trigger</button>
      <Popover open={open} anchorRef={ref} onClose={onClose}>
        <div>panel-body</div>
        <div data-testid="inner-list" style={{ overflowY: 'auto' }}>
          inner-list
        </div>
      </Popover>
    </div>
  )
}

describe('Popover', () => {
  it('renders children only when open', () => {
    const { rerender } = render(<Harness open={false} onClose={() => {}} />)
    expect(screen.queryByText('panel-body')).toBeNull()
    rerender(<Harness open onClose={() => {}} />)
    expect(screen.getByText('panel-body')).toBeTruthy()
  })

  it('calls onClose on Escape', () => {
    let closed = false
    render(
      <Harness
        open
        onClose={() => {
          closed = true
        }}
      />,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(closed).toBe(true)
  })

  it('returns focus to the trigger on Escape (keyboard menu-button pattern)', () => {
    render(<Harness open onClose={() => {}} />)
    const trigger = screen.getByText('trigger')
    // Focus starts elsewhere (inside the panel, say); Escape should land it back
    // on the trigger so a keyboard user isn't stranded.
    ;(document.body as HTMLElement).focus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.activeElement).toBe(trigger)
  })

  it('calls onClose on outside pointerdown', () => {
    let closed = false
    render(
      <Harness
        open
        onClose={() => {
          closed = true
        }}
      />,
    )
    fireEvent.pointerDown(document.body)
    expect(closed).toBe(true)
  })

  // The toolbar island scrolls horizontally on narrow desktops; the popover is
  // fixed-positioned to its trigger, so any ancestor scroll must close it
  // before it detaches from the button (POPOVER-SCROLL).
  it('calls onClose when a scrollable ancestor scrolls (e.g. the toolbar island)', () => {
    let closed = false
    render(
      <Harness
        open
        onClose={() => {
          closed = true
        }}
      />,
    )
    fireEvent.scroll(screen.getByTestId('scroll-ancestor'))
    expect(closed).toBe(true)
  })

  it('calls onClose on document scroll', () => {
    let closed = false
    render(
      <Harness
        open
        onClose={() => {
          closed = true
        }}
      />,
    )
    fireEvent.scroll(document)
    expect(closed).toBe(true)
  })

  // A Select opened from inside a menu panel portals its OWN option list to a
  // SIBLING body node — the parent's outside-pointerdown check must treat that
  // descendant portal as "inside", or the parent closes on pointerdown before
  // the option's click ever lands and the pick is silently dropped
  // (TB-1 / the IXT nested-Select bug).
  describe('nested descendant portals', () => {
    function NestedHarness({
      onParentClose,
      onChildClose,
    }: {
      onParentClose: () => void
      onChildClose: () => void
    }) {
      const parentAnchor = useRef<HTMLButtonElement>(null)
      const childAnchor = useRef<HTMLButtonElement>(null)
      return (
        <div>
          <button ref={parentAnchor}>parent-trigger</button>
          <Popover open anchorRef={parentAnchor} onClose={onParentClose}>
            <div>parent-panel</div>
            {/* A nested Select-style trigger living INSIDE the parent panel… */}
            <button ref={childAnchor}>child-trigger</button>
            {/* …whose option list portals to a sibling document.body node. */}
            <Popover open anchorRef={childAnchor} onClose={onChildClose}>
              <button>child-option</button>
            </Popover>
          </Popover>
        </div>
      )
    }

    it('pointerdown on a descendant portal panel does NOT close the parent', () => {
      let parentClosed = false
      render(<NestedHarness onParentClose={() => (parentClosed = true)} onChildClose={() => {}} />)
      fireEvent.pointerDown(screen.getByText('child-option'))
      expect(parentClosed).toBe(false)
      expect(screen.getByText('parent-panel')).toBeTruthy()
    })

    it('pointerdown on a descendant portal still closes on truly-outside clicks', () => {
      let parentClosed = false
      let childClosed = false
      render(
        <NestedHarness
          onParentClose={() => (parentClosed = true)}
          onChildClose={() => (childClosed = true)}
        />,
      )
      fireEvent.pointerDown(document.body)
      expect(parentClosed).toBe(true)
      expect(childClosed).toBe(true)
    })

    it('scrolling inside a descendant portal does NOT close the parent', () => {
      let parentClosed = false
      render(<NestedHarness onParentClose={() => (parentClosed = true)} onChildClose={() => {}} />)
      fireEvent.scroll(screen.getByText('child-option'))
      expect(parentClosed).toBe(false)
    })
  })

  // Some menus (File's saved layouts, Arrange) have their own overflow list —
  // scrolling *inside* the panel doesn't move the anchor and must not close it.
  it('does NOT close when scrolling a list inside the panel', () => {
    let closed = false
    render(
      <Harness
        open
        onClose={() => {
          closed = true
        }}
      />,
    )
    fireEvent.scroll(screen.getByTestId('inner-list'))
    expect(closed).toBe(false)
    expect(screen.getByText('panel-body')).toBeTruthy()
  })
})
