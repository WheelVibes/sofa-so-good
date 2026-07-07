// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FurnitureDef, IkeaGltfDef } from '../../furniture/types'
import { useStore } from '../../state/store'
import { CatalogCard } from './CatalogCard'

const IKEA_DEF: IkeaGltfDef = {
  id: 'ikea-malm',
  name: 'MALM bed frame',
  category: 'beds',
  kind: 'gltf',
  source: 'ikea',
  groupKey: 'malm',
  activeVariant: 'white',
  variants: [
    {
      finish: 'white',
      label: 'White',
      articleNumber: '002.495.55',
      url: 'https://www.ikea.com/sg/en/p/malm/',
      assetId: 'ikea-asset-1',
      glbMaterials: [],
    },
  ],
  defaultFootprint: { w: 0.97, d: 2.09, h: 1.0 },
  uploadedAt: '2026-05-31T00:00:00.000Z',
  license: 'IKEA',
  attribution: 'IKEA — MALM',
}

const SOFA_DEF: FurnitureDef = {
  id: 'test-sofa',
  name: 'Test Sofa',
  category: 'seating',
  kind: 'gltf',
  source: 'builtin',
  url: '/models/test-sofa.glb',
  license: 'CC0',
  defaultFootprint: { w: 1.8, d: 0.9, h: 0.8 },
}

describe('CatalogCard', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('shows an IKEA source pill on the thumbnail', () => {
    render(<CatalogCard def={IKEA_DEF} />)
    const pill = screen.getByText('IKEA')
    expect(pill.className).toContain('source-pill')
    expect(pill.closest('.card-thumb')).toBeTruthy()
  })

  it('flags an IKEA thumbnail as a photo so the white studio background gets the soft tile', () => {
    render(<CatalogCard def={IKEA_DEF} />)
    // The IKEA product photo ships on a baked white background — the `photo`
    // modifier drives the --photo-tile background + multiply blend (parts.css).
    expect(screen.getByText('IKEA').closest('.card-thumb')?.className).toContain('photo')
  })

  it('shows a remove button for an imported IKEA def when onDelete is given', () => {
    render(<CatalogCard def={IKEA_DEF} onDelete={() => {}} />)
    expect(screen.getByLabelText('Remove downloaded asset')).toBeTruthy()
  })

  it('shows no remove button for a builtin def', () => {
    render(<CatalogCard def={SOFA_DEF} onDelete={() => {}} />)
    expect(screen.queryByLabelText(/Remove .* asset/)).toBeNull()
  })

  it('shows a refresh button only when onRefresh is provided', () => {
    const { unmount } = render(<CatalogCard def={IKEA_DEF} />)
    expect(screen.queryByLabelText('Re-download asset from library')).toBeNull()
    unmount()
    render(<CatalogCard def={IKEA_DEF} onRefresh={() => {}} />)
    expect(screen.getByLabelText('Re-download asset from library')).toBeTruthy()
  })

  it('calls onRefresh (not card placement) when the refresh button is clicked', () => {
    const onRefresh = vi.fn()
    render(<CatalogCard def={IKEA_DEF} onRefresh={onRefresh} />)
    fireEvent.click(screen.getByLabelText('Re-download asset from library'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
    // The click must not arm placement for the card.
    expect(useStore.getState().activeDefId).toBeNull()
  })

  it('disables + marks the refresh button busy while refreshing', () => {
    render(<CatalogCard def={IKEA_DEF} onRefresh={() => {}} refreshing />)
    const btn = screen.getByLabelText('Re-download asset from library')
    expect(btn.getAttribute('aria-busy')).toBe('true')
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  describe('"fits this room" size cue (CATALOG-FITS)', () => {
    it('shows no cue when no room is being edited (roomRects is null)', () => {
      render(<CatalogCard def={SOFA_DEF} roomRects={null} />)
      expect(screen.queryByText(/Won.t fit/)).toBeNull()
      expect(screen.queryByText(/Tight fit/)).toBeNull()
      expect(document.querySelector('.cat-card')?.className).not.toContain('no-fit')
    })

    it('badges + dims the card when the footprint clearly exceeds the room', () => {
      // A 1.8 x 0.9m sofa cannot fit a 1 x 1m room in any orientation.
      render(<CatalogCard def={SOFA_DEF} roomRects={[{ w: 1, d: 1 }]} />)
      expect(screen.getByText(/Won.t fit/)).toBeInTheDocument()
      expect(document.querySelector('.cat-card')?.className).toContain('no-fit')
    })

    it('shows a "tight fit" note (no dimming) when the item only just clears the room', () => {
      // 1.8 x 0.9 sofa in a 2 x 1.2 room: fits, but with less than the
      // comfortable 0.6m walkway margin on both axes.
      render(<CatalogCard def={SOFA_DEF} roomRects={[{ w: 2, d: 1.2 }]} />)
      expect(screen.getByText(/Tight fit/)).toBeInTheDocument()
      expect(document.querySelector('.cat-card')?.className).not.toContain('no-fit')
    })

    it('shows no cue in a spacious room (comfortably fits)', () => {
      render(<CatalogCard def={SOFA_DEF} roomRects={[{ w: 4, d: 4 }]} />)
      expect(screen.queryByText(/Won.t fit/)).toBeNull()
      expect(screen.queryByText(/Tight fit/)).toBeNull()
    })

    it('never shows a false "won\'t fit" for a def with a degenerate footprint', () => {
      const badDef: FurnitureDef = { ...SOFA_DEF, defaultFootprint: { w: 0, d: 0, h: 0 } }
      render(<CatalogCard def={badDef} roomRects={[{ w: 1, d: 1 }]} />)
      expect(screen.queryByText(/Won.t fit/)).toBeNull()
      expect(document.querySelector('.cat-card')?.className).not.toContain('no-fit')
    })

    it('is hidden when the catalogFits flag is off, even for an oversized item', () => {
      useStore.setState((s) => ({ featureFlags: { ...s.featureFlags, catalogFits: false } }))
      render(<CatalogCard def={SOFA_DEF} roomRects={[{ w: 1, d: 1 }]} />)
      expect(screen.queryByText(/Won.t fit/)).toBeNull()
      expect(document.querySelector('.cat-card')?.className).not.toContain('no-fit')
    })
  })

  // The per-card finish (palette) + stamp buttons were removed — duplicating and
  // changing the finish are done from the inspector panel instead, and the card
  // buttons never worked reliably on mobile.
  describe('no per-card finish / stamp buttons', () => {
    it('renders neither a finish-picker nor a stamp button on the card', () => {
      render(<CatalogCard def={IKEA_DEF} />)
      expect(screen.queryByRole('button', { name: /finish/i })).toBeNull()
      expect(screen.queryByRole('button', { name: /stamp/i })).toBeNull()
    })
  })

  describe('favourite heart', () => {
    it('toggles favourite state and marks the button pressed when saved', () => {
      render(<CatalogCard def={SOFA_DEF} />)
      const heart = screen.getByRole('button', { name: /add to favourites/i })
      expect(heart).toHaveAttribute('aria-pressed', 'false')
      fireEvent.click(heart)
      expect(useStore.getState().favouriteDefIds).toContain(SOFA_DEF.id)
      const savedHeart = screen.getByRole('button', { name: /remove from favourites/i })
      expect(savedHeart).toHaveAttribute('aria-pressed', 'true')
    })
  })
})
