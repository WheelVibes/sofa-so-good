import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EmptyState } from './EmptyState'
import { Icon } from './toolbar/icons'

describe('EmptyState', () => {
  it('renders the title and icon', () => {
    const { container } = render(<EmptyState icon={Icon.Heart} title="No saved items" />)
    expect(screen.getByText('No saved items')).toBeInTheDocument()
    // The icon renders as an aria-hidden svg badge.
    expect(container.querySelector('.em-ic svg')).toBeTruthy()
  })

  it('renders the optional description when provided', () => {
    render(
      <EmptyState icon={Icon.Heart} title="No saved items" description="Tap the heart to save." />,
    )
    expect(screen.getByText('Tap the heart to save.')).toBeInTheDocument()
  })

  it('omits the description when not provided', () => {
    const { container } = render(<EmptyState icon={Icon.Heart} title="Empty" />)
    // Only the title <b> exists; no description <span> sibling.
    expect(container.querySelector('.empty-mini > span:not(.em-ic)')).toBeNull()
  })

  it('renders a CTA button and fires its handler on click', () => {
    const onClick = vi.fn()
    render(
      <EmptyState icon={Icon.Search} title="No matches" cta={{ label: 'Clear search', onClick }} />,
    )
    const btn = screen.getByRole('button', { name: 'Clear search' })
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('omits the CTA button when no cta is given', () => {
    render(<EmptyState icon={Icon.Search} title="No matches" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('appends extra class names to the root', () => {
    const { container } = render(
      <EmptyState icon={Icon.Catalog} title="Empty" className="catalog-empty" />,
    )
    expect(container.querySelector('.empty-mini.catalog-empty')).toBeTruthy()
  })
})
