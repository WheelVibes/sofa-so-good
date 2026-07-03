// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SourceLine } from './SourceLine'

describe('SourceLine', () => {
  it('renders nothing when there is no attribution', () => {
    const { container } = render(<SourceLine />)
    expect(container.firstChild).toBeNull()
  })

  it('renders attribution and license', () => {
    render(<SourceLine attribution="Kenney" license="CC0" />)
    expect(screen.getByText(/Kenney/)).toBeInTheDocument()
    expect(screen.getByText(/CC0/)).toBeInTheDocument()
  })

  it('renders a link when sourceUrl is present', () => {
    render(
      <SourceLine attribution="Poly Haven" license="CC0" sourceUrl="https://polyhaven.com/x" />,
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://polyhaven.com/x')
  })

  it('renders inert text (no link) for a javascript: sourceUrl (SEC-001)', () => {
    render(
      <SourceLine attribution="Evil" license="CC0" sourceUrl="javascript:alert(document.domain)" />,
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/Evil/)).toBeInTheDocument()
  })
})
