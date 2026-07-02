import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SharedLibraryItem } from '../../catalog/packs/sharedLibrary'
import { useStore } from '../../state/store'
import { SharedCard } from './SharedCard'

const item: SharedLibraryItem = {
  group: 'alex',
  groupKey: 'alex',
  name: 'ALEX Desk',
  type: 'Desk',
  category: 'tables',
  size: '',
  series: 'ALEX',
  variants: 2,
  thumbnail: 'white.jpg',
  price: 199,
  currency: 'SGD',
}

describe('SharedCard', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('renders the proxy thumbnail URL', () => {
    render(<SharedCard item={item} onResolved={() => {}} />)
    const img = screen.getByRole('img', { name: /ALEX Desk/ }) as HTMLImageElement
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.src).toContain('/assets/ikea/alex/white.jpg')
  })

  it('shows Library badge and an IKEA source pill on the thumbnail', () => {
    render(<SharedCard item={item} onResolved={() => {}} />)
    expect(screen.getByText('Library')).toBeTruthy()
    const pill = screen.getByText('IKEA')
    expect(pill.className).toContain('source-pill')
    expect(pill.closest('.card-thumb')).toBeTruthy()
  })

  it('adds the group on click and reports the resolved id', async () => {
    const add = vi.fn(async () => 'ikea-alex')
    const onResolved = vi.fn()
    useStore.setState({ addSharedGroup: add } as never)
    render(<SharedCard item={item} onResolved={onResolved} />)
    fireEvent.click(screen.getByRole('button', { name: /Add ALEX Desk/ }))
    await waitFor(() => expect(add).toHaveBeenCalledWith('alex'))
    expect(onResolved).toHaveBeenCalledWith('ikea-alex')
  })

  it('does not call onResolved when the add fails', async () => {
    const add = vi.fn(async () => null)
    const onResolved = vi.fn()
    useStore.setState({ addSharedGroup: add } as never)
    render(<SharedCard item={item} onResolved={onResolved} />)
    fireEvent.click(screen.getByRole('button', { name: /Add ALEX Desk/ }))
    await waitFor(() => expect(add).toHaveBeenCalled())
    expect(onResolved).not.toHaveBeenCalled()
  })
})
