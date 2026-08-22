// @vitest-environment happy-dom
/**
 * UIUX-19: a capture-phase scroll should close a Popover ONLY when the
 * scrolled container can actually move the anchor (it contains it — or it's
 * the document/page). A scroll inside an unrelated container (the plan canvas
 * under a header menu, an auto-scrolling list) must NOT close the panel — that
 * was closing every plan-editor menu the instant the canvas emitted a scroll.
 */
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Popover } from './Popover'

function fireScroll(target: EventTarget) {
  const e = new Event('scroll', { bubbles: false })
  Object.defineProperty(e, 'target', { value: target })
  window.dispatchEvent(e)
}

let anchorEl: HTMLButtonElement
let unrelated: HTMLDivElement

beforeEach(() => {
  anchorEl = document.createElement('button')
  unrelated = document.createElement('div')
  document.body.append(anchorEl, unrelated)
})
afterEach(() => {
  anchorEl.remove()
  unrelated.remove()
})

describe('Popover scroll-close containment (UIUX-19)', () => {
  it('ignores scrolls in containers that cannot move the anchor', () => {
    const onClose = vi.fn()
    const anchorRef = { current: anchorEl }
    render(
      <Popover open anchorRef={anchorRef} onClose={onClose}>
        <div>panel</div>
      </Popover>,
    )
    fireScroll(unrelated)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('still closes on a scroll of a container holding the anchor, and on page scroll', () => {
    const onClose = vi.fn()
    const wrap = document.createElement('div')
    wrap.appendChild(anchorEl)
    document.body.appendChild(wrap)
    const anchorRef = { current: anchorEl }
    render(
      <Popover open anchorRef={anchorRef} onClose={onClose}>
        <div>panel</div>
      </Popover>,
    )
    fireScroll(wrap)
    expect(onClose).toHaveBeenCalledTimes(1)
    fireScroll(document)
    expect(onClose).toHaveBeenCalledTimes(2)
    wrap.remove()
  })
})
