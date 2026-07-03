// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuxPanelHead } from './AuxPanelHead'

describe('AuxPanelHead', () => {
  it('close-X variant: title/sub stack, close button trails', () => {
    render(<AuxPanelHead title="Graphics" sub="Render & assets" onClose={vi.fn()} />)
    const head = document.querySelector('.panel-head') as HTMLElement
    expect(head.className).not.toContain('panel-head-back')
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    const titleWrap = document.querySelector('.panel-head-title') as HTMLElement
    // Stacked (not the inline one-line variant) in the plain close-X header.
    expect(titleWrap.className).not.toContain('panel-head-title-inline')
  })

  it('back-button variant: back arrow leads, title+sub render inline on one line, no close-X', () => {
    render(<AuxPanelHead title="Graphics" sub="Render & assets" onClose={vi.fn()} showBack />)
    const head = document.querySelector('.panel-head') as HTMLElement
    expect(head.className).toContain('panel-head-back')
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()

    // Back button is the first child, immediately followed by the title block —
    // this is the structural fix for the "title right-aligned" bug (space-between
    // used to shove it to the far edge).
    const children = Array.from(head.children)
    expect(children[0]).toHaveAttribute('aria-label', 'Back')
    const titleWrap = children[1] as HTMLElement
    expect(titleWrap.className).toContain('panel-head-title')
    expect(titleWrap.className).toContain('panel-head-title-inline')

    // Title renders before sub, both inside the same one-line container.
    const title = titleWrap.querySelector('.panel-title') as HTMLElement
    const sub = titleWrap.querySelector('.panel-sub') as HTMLElement
    expect(title).toBeInTheDocument()
    expect(sub).toBeInTheDocument()
    expect(title.compareDocumentPosition(sub) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(title.textContent).toBe('Graphics')
    expect(sub.textContent).toBe('Render & assets')
  })
})
