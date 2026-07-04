// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { FurnitureDef, IkeaGltfDef, ParametricDef } from '../../furniture/types'
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

  describe('quick-look finish popover (CATALOG-VARIANT)', () => {
    const IKEA_MULTI: IkeaGltfDef = {
      ...IKEA_DEF,
      variants: [
        ...IKEA_DEF.variants,
        {
          finish: 'black-brown',
          label: 'Black-brown',
          articleNumber: '002.495.56',
          url: 'https://www.ikea.com/sg/en/p/malm/',
          assetId: 'ikea-asset-2',
          glbMaterials: [],
        },
      ],
    }

    const SOFA_PARAMETRIC: ParametricDef = {
      id: 'test-parametric-sofa',
      name: 'Test parametric sofa',
      category: 'seating',
      kind: 'parametric',
      primitive: 'Sofa',
      defaultFootprint: { w: 2.1, d: 0.9, h: 0.85 },
      paramSchema: [{ kind: 'color', key: 'color', label: 'Upholstery', default: '#8aa1a8' }],
    }

    const trigger = () => screen.queryByRole('button', { name: /Choose a finish/i })

    it('shows the trigger for a multi-variant IKEA product', () => {
      render(<CatalogCard def={IKEA_MULTI} />)
      expect(trigger()).toBeInTheDocument()
    })

    it('hides the trigger for a single-variant IKEA product', () => {
      render(<CatalogCard def={IKEA_DEF} />)
      expect(trigger()).toBeNull()
    })

    it('hides the trigger for a plain GLB def (nothing distinct to pre-place pick)', () => {
      render(<CatalogCard def={SOFA_DEF} />)
      expect(trigger()).toBeNull()
    })

    it('shows the trigger for a tintable parametric def', () => {
      render(<CatalogCard def={SOFA_PARAMETRIC} />)
      expect(trigger()).toBeInTheDocument()
    })

    it('is hidden when the catalogVariantPick flag is off', () => {
      useStore.setState((s) => ({ featureFlags: { ...s.featureFlags, catalogVariantPick: false } }))
      render(<CatalogCard def={IKEA_MULTI} />)
      expect(trigger()).toBeNull()
    })

    it('picking a swatch arms placement with the resolved variant props', () => {
      render(<CatalogCard def={IKEA_MULTI} />)
      const t = trigger()
      if (!t) throw new Error('trigger not found')
      fireEvent.click(t)
      const swatch = screen.getByRole('button', { name: /Place in Black-brown/i })
      fireEvent.click(swatch)
      const s = useStore.getState()
      expect(s.activeDefId).toBe(IKEA_MULTI.id)
      expect(s.armedVariantProps).toEqual({ variant: 'black-brown' })
    })

    it('is present in BOTH Simple and Pro mode (simple-tier flag)', () => {
      useStore.getState().setUiMode('simple')
      const r1 = render(<CatalogCard def={SOFA_PARAMETRIC} />)
      expect(screen.queryByRole('button', { name: /Choose a finish/i })).toBeInTheDocument()
      r1.unmount()
      useStore.getState().setUiMode('pro')
      render(<CatalogCard def={SOFA_PARAMETRIC} />)
      expect(screen.queryByRole('button', { name: /Choose a finish/i })).toBeInTheDocument()
    })
  })
})
