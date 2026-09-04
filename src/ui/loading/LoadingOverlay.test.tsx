// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LoadingOverlay } from './LoadingOverlay'

afterEach(cleanup)

/** The furnishing-room loader must keep animating while the main thread is
 *  blocked by scene mounts/shader compiles. Browsers only run CSS
 *  transform/opacity animations on the compositor thread for HTML elements —
 *  animated SVG *children* fall back to the main thread and starve. So every
 *  element carrying an animation class must be an HTML element. */
describe('LoadingOverlay', () => {
  it('puts every animation class on an HTML element, never an SVG node', () => {
    render(<LoadingOverlay active label="" />)
    const overlay = document.body.querySelector('[role="status"]')
    expect(overlay).not.toBeNull()
    const animated = (overlay as Element).querySelectorAll('.hdb-room, .hdb-draw, .hdb-pop')
    // bob wrapper + 2 draw layers + 4 furniture pop layers
    expect(animated.length).toBe(7)
    for (const el of animated) {
      expect(
        el instanceof HTMLElement,
        `<${el.tagName.toLowerCase()}> carries ${el.className}`,
      ).toBe(true)
    }
  })

  /**
   * The visual harness waits on this attribute to know the transition splash has
   * cleared, so it is a contract, not decoration. Two selectors that looked
   * adequate are not: `role="status"` is shared with the notification region and
   * the FPS HUD, and matching the label TEXT both ignores `opacity` (so a
   * scenario passes while the splash is still painted) and passes VACUOUSLY when
   * it runs before React has rendered the new label. `backdrop-walk-simple`'s
   * final screenshot had been capturing the splash instead of the scene for that
   * reason — see v0.31.8.88.
   */
  it('exposes the data-transition-overlay automation hook while mounted', () => {
    render(<LoadingOverlay active label="Switching to overview…" />)
    expect(document.body.querySelectorAll('[data-transition-overlay]').length).toBe(1)
  })

  it('still renders the line-art SVG content inside the animated layers', () => {
    render(<LoadingOverlay active label="" />)
    const overlay = document.body.querySelector('[role="status"]') as Element
    expect(overlay.querySelectorAll('svg').length).toBeGreaterThan(0)
  })
})
