// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { FurnitureDef } from '../../furniture/types'
import { useStore } from '../../state/store'
import { RECENT_STRIP_MAX, RecentStrip } from './RecentStrip'

function def(id: string, name = id): FurnitureDef {
  return {
    id,
    name,
    category: 'seating',
    kind: 'gltf',
    source: 'builtin',
    url: `/models/${id}.glb`,
    license: 'CC0',
    defaultFootprint: { w: 1, d: 1, h: 1 },
  }
}

describe('RecentStrip', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('renders nothing when there are no recent defs', () => {
    const { container } = render(<RecentStrip defs={[]} />)
    expect(container.querySelector('.cat-recent-strip')).toBeNull()
  })

  it('renders one tap-to-place chip per def, newest-first order preserved', () => {
    render(<RecentStrip defs={[def('a', 'Alpha'), def('b', 'Beta')]} />)
    const chips = screen.getAllByRole('button', { name: /^Place / })
    expect(chips.map((c) => c.getAttribute('aria-label'))).toEqual(['Place Alpha', 'Place Beta'])
  })

  it(`caps the strip at ${RECENT_STRIP_MAX} chips even when more recents exist`, () => {
    const many = Array.from({ length: RECENT_STRIP_MAX + 5 }, (_, i) => def(`item-${i}`))
    render(<RecentStrip defs={many} />)
    expect(screen.getAllByRole('button', { name: /^Place / })).toHaveLength(RECENT_STRIP_MAX)
  })

  it('arms placement for the def when a chip is tapped (reuses the card place path)', () => {
    render(<RecentStrip defs={[def('armchair', 'Armchair')]} />)
    expect(useStore.getState().activeDefId).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Place Armchair' }))
    expect(useStore.getState().activeDefId).toBe('armchair')
  })
})
