import { describe, expect, it } from 'vitest'
import { clearsSelectionOnPanRelease } from './tapDeselect'

describe('clearsSelectionOnPanRelease', () => {
  it('clears on an empty-canvas tap with the select tool', () => {
    expect(
      clearsSelectionOnPanRelease({ moved: false, tool: 'select', tappedElement: false }),
    ).toBe(true)
  })

  it('does NOT clear when the tap landed on an element (view-mode tap-to-inspect)', () => {
    // The element's pointer-down selected it; the bubbled canvas pan must not
    // immediately undo that select — this was the select→deselect flicker.
    expect(clearsSelectionOnPanRelease({ moved: false, tool: 'select', tappedElement: true })).toBe(
      false,
    )
  })

  it('does NOT clear when the gesture actually panned (a drag, not a tap)', () => {
    expect(clearsSelectionOnPanRelease({ moved: true, tool: 'select', tappedElement: false })).toBe(
      false,
    )
  })

  it('does NOT clear under a non-select tool (a draw tool press is not a deselect)', () => {
    expect(clearsSelectionOnPanRelease({ moved: false, tool: 'wall', tappedElement: false })).toBe(
      false,
    )
  })
})
