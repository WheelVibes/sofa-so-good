// @vitest-environment happy-dom
/**
 * Empty-state CTA coverage for LayersPanel (P28 — empty-state CTA sweep).
 * "Nothing placed yet" gets an "Open catalog" CTA wired to the real
 * catalog-open lever (`setLeftMode('catalog')` + `setCatalogOpen(true)` —
 * same idiom as `EmptyRoomHint`). "No objects match" (search-no-results)
 * gets a "Clear filter" CTA wired to the panel's own local filter setter.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FurnitureItem } from '../../furniture/types'
import { useStore } from '../../state/store'
import { LayersPanel } from './LayersPanel'

const ITEM: FurnitureItem = {
  id: 'i1',
  defId: 'sofa-basic-1',
  position: [1, 1],
  rotation: 0,
  props: {},
}

beforeEach(() => {
  useStore.getState().__resetForTest?.()
})

afterEach(() => {
  useStore.setState({ items: [], catalogOpen: false, leftMode: 'catalog' })
})

describe('LayersPanel empty states', () => {
  it('renders + fires "Open catalog" CTA when nothing is placed', () => {
    useStore.setState({ items: [], leftMode: 'layers' })
    render(<LayersPanel />)
    expect(screen.getByText('Nothing placed yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open catalog' }))
    expect(useStore.getState().catalogOpen).toBe(true)
    expect(useStore.getState().leftMode).toBe('catalog')
  })

  it('renders + fires "Clear filter" CTA when the filter matches nothing', () => {
    useStore.setState({ items: [ITEM] })
    render(<LayersPanel />)
    const input = screen.getByPlaceholderText(/Filter \d+ objects/)
    fireEvent.change(input, { target: { value: 'zzz-no-match' } })
    expect(screen.getByText('No objects match')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    expect((input as HTMLInputElement).value).toBe('')
  })
})

describe('LayersPanel hidden-row dimming', () => {
  it('applies the "hidden" class to a row whose item is in hiddenItemIds, not to a visible row', () => {
    const item2: FurnitureItem = { ...ITEM, id: 'i2' }
    useStore.setState({ items: [ITEM, item2], hiddenItemIds: [ITEM.id] })
    render(<LayersPanel />)
    const hiddenRow = screen.getByTitle('Show').closest('.lyr-row')
    const visibleRow = screen.getByTitle('Hide').closest('.lyr-row')
    expect(hiddenRow).toHaveClass('hidden')
    expect(visibleRow).not.toHaveClass('hidden')
  })
})
