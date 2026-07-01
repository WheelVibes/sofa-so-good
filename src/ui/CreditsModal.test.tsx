import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreditsModal } from './CreditsModal'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        furniture: [
          {
            id: 'a',
            name: 'Armchair',
            attribution: 'Kenney',
            sourceUrl: 'https://k.nl',
            license: 'CC0',
          },
        ],
        materials: [
          {
            id: 'm',
            name: 'Oak',
            attribution: 'Poly Haven',
            sourceUrl: 'https://p.com',
            license: 'CC0',
          },
        ],
      }),
    })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CreditsModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<CreditsModal open={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('fetches and displays credits when opened', async () => {
    render(<CreditsModal open={true} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText(/Armchair/)).toBeInTheDocument())
    expect(screen.getByText(/Oak/)).toBeInTheDocument()
    expect(screen.getAllByText(/CC0/).length).toBeGreaterThan(0)
  })

  // A11Y (v0.9.0.34): rebuilt on the shared Modal → dialog role + Escape close.
  it('exposes a dialog role with the title when open', () => {
    render(<CreditsModal open onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Asset credits')).toBeInTheDocument()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<CreditsModal open onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the header Close button is clicked', () => {
    const onClose = vi.fn()
    render(<CreditsModal open onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })
})
