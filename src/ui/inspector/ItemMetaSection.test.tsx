// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useStore } from '../../state/store'
import { ItemMetaSection } from './ItemMetaSection'

afterEach(() => {
  useStore.getState().__resetForTest()
})

function place() {
  const id = useStore
    .getState()
    .addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
  return id
}

/** The section starts collapsed for an item with no metadata yet — expand it
 *  so its fields are in the DOM (mirrors a real user clicking the header). */
function openSection() {
  fireEvent.click(screen.getByRole('button', { name: 'Notes & link' }))
}

/** Type a value into a field and blur it — happy-dom only fires the `blur`
 *  event handler when the element was actually the focused/active element
 *  first (mirrors a real user tabbing in, typing, then tabbing out). */
function typeAndBlur(el: HTMLElement, value: string) {
  ;(el as HTMLInputElement | HTMLTextAreaElement).focus()
  fireEvent.change(el, { target: { value } })
  fireEvent.blur(el)
}

describe('ItemMetaSection', () => {
  it('shows the Book indicator only once the item carries any metadata', () => {
    const id = place()
    const item = () => useStore.getState().items.find((i) => i.id === id)!
    const { rerender } = render(<ItemMetaSection item={item()} />)
    expect(screen.queryByTitle('Has notes')).toBeNull()

    useStore.getState().setItemMeta(id, { remarks: 'existing — retain' })
    rerender(<ItemMetaSection item={item()} />)
    expect(screen.queryByTitle('Has notes')).not.toBeNull()
  })

  it('commits the description/remarks textareas on blur via setItemMeta', () => {
    const id = place()
    const item = useStore.getState().items.find((i) => i.id === id)!
    render(<ItemMetaSection item={item} />)
    openSection()
    typeAndBlur(screen.getByLabelText('Item description'), 'A nice chair')
    typeAndBlur(screen.getByLabelText('Special remarks'), 'client to purchase')
    const saved = useStore.getState().items.find((i) => i.id === id)
    expect(saved?.meta?.description).toBe('A nice chair')
    expect(saved?.meta?.remarks).toBe('client to purchase')
  })

  it('commits brand/model/supplier and a valid price on blur', () => {
    const id = place()
    const item = useStore.getState().items.find((i) => i.id === id)!
    render(<ItemMetaSection item={item} />)
    openSection()
    typeAndBlur(screen.getByLabelText('Brand / manufacturer'), 'Acme')
    typeAndBlur(screen.getByLabelText('Model or SKU'), 'X-100')
    typeAndBlur(screen.getByLabelText('Supplier / vendor'), 'Acme Direct')
    typeAndBlur(screen.getByLabelText('Custom price override (SGD)'), '249')
    const saved = useStore.getState().items.find((i) => i.id === id)
    expect(saved?.meta).toMatchObject({
      brand: 'Acme',
      model: 'X-100',
      supplier: 'Acme Direct',
      price: 249,
    })
  })

  it('shows an inline error and does NOT commit an invalid (negative) price', () => {
    const id = place()
    const item = useStore.getState().items.find((i) => i.id === id)!
    render(<ItemMetaSection item={item} />)
    openSection()
    typeAndBlur(screen.getByLabelText('Custom price override (SGD)'), '-5')
    expect(screen.getByRole('alert')).toHaveTextContent(/0 or more/)
    expect(useStore.getState().items.find((i) => i.id === id)?.meta?.price).toBeUndefined()
  })

  it('shows an inline error for an invalid URL and never blocks the other fields', () => {
    const id = place()
    const item = useStore.getState().items.find((i) => i.id === id)!
    render(<ItemMetaSection item={item} />)
    openSection()
    typeAndBlur(screen.getByLabelText('Custom item URL'), 'not-a-url')
    expect(screen.getByRole('alert')).toHaveTextContent(/http/)
    // The invalid URL never reaches the store...
    expect(useStore.getState().items.find((i) => i.id === id)?.meta?.url).toBeUndefined()
    // ...but the remarks field still commits fine.
    typeAndBlur(screen.getByLabelText('Special remarks'), 'still works')
    expect(useStore.getState().items.find((i) => i.id === id)?.meta?.remarks).toBe('still works')
  })

  it('renders an "Open" link for a valid, already-saved URL', () => {
    const id = place()
    useStore.getState().setItemMeta(id, { url: 'https://example.com/chair' })
    const item = useStore.getState().items.find((i) => i.id === id)!
    render(<ItemMetaSection item={item} />)
    const open = screen.getByText('Open') as HTMLAnchorElement
    expect(open.tagName).toBe('A')
    expect(open.getAttribute('href')).toBe('https://example.com/chair')
    expect(open.getAttribute('target')).toBe('_blank')
    expect(open.getAttribute('rel')).toContain('noopener')
  })

  describe('Custom fields', () => {
    it('adds a row via "Add field", fills key/value, and commits on blur', () => {
      const id = place()
      const item = useStore.getState().items.find((i) => i.id === id)!
      render(<ItemMetaSection item={item} />)
      openSection()
      fireEvent.click(screen.getByRole('button', { name: 'Add custom field' }))
      typeAndBlur(screen.getByLabelText('Custom field name'), 'Fabric')
      typeAndBlur(screen.getByLabelText('Custom field value'), 'Linen')
      expect(useStore.getState().items.find((i) => i.id === id)?.meta?.custom).toEqual([
        { key: 'Fabric', value: 'Linen' },
      ])
    })

    it('edits an existing custom field row', () => {
      const id = place()
      useStore.getState().setItemMeta(id, { custom: [{ key: 'Fabric', value: 'Linen' }] })
      const item = useStore.getState().items.find((i) => i.id === id)!
      render(<ItemMetaSection item={item} />)
      typeAndBlur(screen.getByLabelText('Custom field value'), 'Velvet')
      expect(useStore.getState().items.find((i) => i.id === id)?.meta?.custom).toEqual([
        { key: 'Fabric', value: 'Velvet' },
      ])
    })

    it('removes a custom field row immediately (no blur needed)', () => {
      const id = place()
      useStore.getState().setItemMeta(id, {
        custom: [
          { key: 'Fabric', value: 'Linen' },
          { key: 'Warranty', value: '2 years' },
        ],
      })
      const item = useStore.getState().items.find((i) => i.id === id)!
      render(<ItemMetaSection item={item} />)
      const removeButtons = screen.getAllByRole('button', { name: 'Remove custom field' })
      expect(removeButtons).toHaveLength(2)
      fireEvent.click(removeButtons[0]!)
      expect(useStore.getState().items.find((i) => i.id === id)?.meta?.custom).toEqual([
        { key: 'Warranty', value: '2 years' },
      ])
    })

    it('disables "Add field" once CUSTOM_META_MAX_ENTRIES rows are showing', () => {
      const id = place()
      const many = Array.from({ length: 20 }, (_, i) => ({ key: `k${i}`, value: `v${i}` }))
      useStore.getState().setItemMeta(id, { custom: many })
      const item = useStore.getState().items.find((i) => i.id === id)!
      render(<ItemMetaSection item={item} />)
      expect(screen.getByRole('button', { name: 'Add custom field' })).toBeDisabled()
    })
  })
})
