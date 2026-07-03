// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { IkeaGltfDef } from '../../furniture/types'
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
})
