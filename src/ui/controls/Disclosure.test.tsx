// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Disclosure } from './Disclosure'

describe('Disclosure', () => {
  it('renders the summary text', () => {
    render(
      <Disclosure summary="Compose your own…">
        <div>child content</div>
      </Disclosure>,
    )
    expect(screen.getByText('Compose your own…')).toBeInTheDocument()
  })

  it('toggles the details open attribute via a summary click', () => {
    render(
      <Disclosure summary="Compose your own…">
        <div>child content</div>
      </Disclosure>,
    )
    const details = screen.getByText('Compose your own…').closest('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    fireEvent.click(screen.getByText('Compose your own…'))
    expect(details.open).toBe(true)
  })

  it('starts expanded when defaultOpen is set', () => {
    render(
      <Disclosure summary="Apartment colour palette…" defaultOpen>
        <div>child content</div>
      </Disclosure>,
    )
    const details = screen
      .getByText('Apartment colour palette…')
      .closest('details') as HTMLDetailsElement
    expect(details.open).toBe(true)
  })
})
