import { describe, expect, it } from 'vitest'
import type { FurnitureDef, IkeaGltfDef, ParametricDef } from '../types'
import {
  CURATED_COLOR_SWATCHES,
  catalogVariantOptions,
  hasCatalogVariants,
  initialVariantProps,
} from './catalogVariants'

const IKEA_MULTI: IkeaGltfDef = {
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
      assetId: 'asset-white',
      swatchHex: '#f2f2f2',
      glbMaterials: [],
    },
    {
      finish: 'black-brown',
      label: 'Black-brown',
      articleNumber: '002.495.56',
      url: 'https://www.ikea.com/sg/en/p/malm/',
      assetId: 'asset-black',
      swatchHex: '#2b2320',
      glbMaterials: [],
    },
    {
      // A stubbed finish (not yet crawled) — offered but disabled.
      finish: 'oak-veneer',
      label: 'Oak veneer',
      articleNumber: '002.495.57',
      url: 'https://www.ikea.com/sg/en/p/malm/',
      assetId: null,
      glbMaterials: [],
    },
  ],
  defaultFootprint: { w: 0.97, d: 2.09, h: 1.0 },
  uploadedAt: '2026-05-31T00:00:00.000Z',
  license: 'IKEA',
  attribution: 'IKEA — MALM',
}

const IKEA_SINGLE: IkeaGltfDef = {
  ...IKEA_MULTI,
  id: 'ikea-single',
  variants: [IKEA_MULTI.variants[0]],
}

const SOFA_PARAMETRIC: ParametricDef = {
  id: 'sofa-3seat',
  name: '3-seat sofa',
  category: 'seating',
  kind: 'parametric',
  primitive: 'Sofa',
  defaultFootprint: { w: 2.1, d: 0.9, h: 0.85 },
  paramSchema: [
    { kind: 'color', key: 'color', label: 'Upholstery', default: '#8aa1a8' },
    {
      kind: 'enum',
      key: 'material',
      label: 'Material',
      default: 'fabric',
      options: [
        { value: 'fabric', label: 'Fabric' },
        { value: 'leather', label: 'Leather' },
      ],
    },
  ],
}

/** No `color` field named `color`, but a `potColor` colour field further down
 *  the schema — the "pick the first qualifying colour field" branch. */
const DECOR_NO_BARE_COLOR: ParametricDef = {
  id: 'trailing-plant',
  name: 'Trailing plant',
  category: 'decor',
  kind: 'parametric',
  primitive: 'TrailingPlant',
  defaultFootprint: { w: 0.28, d: 0.28, h: 0.32 },
  paramSchema: [
    {
      kind: 'number',
      key: 'surfaceHeight',
      label: 'Sits at',
      min: 0,
      max: 1.4,
      step: 0.02,
      default: 0.42,
    },
    { kind: 'color', key: 'potColor', label: 'Pot', default: '#cdbb9a' },
    { kind: 'color', key: 'leafColor', label: 'Foliage', default: '#4a7a44' },
  ],
}

/** Purely numeric/integer params — the "non-tintable" edge case. */
const NO_COLOR_FIELD: ParametricDef = {
  id: 'walkway-marker',
  name: 'Walkway marker',
  category: 'decor',
  kind: 'parametric',
  primitive: 'SmallSculpture',
  defaultFootprint: { w: 0.2, d: 0.2, h: 0.1 },
  paramSchema: [{ kind: 'integer', key: 'count', label: 'Count', min: 1, max: 5, default: 1 }],
}

const NO_SCHEMA: ParametricDef = {
  id: 'bare',
  name: 'Bare item',
  category: 'decor',
  kind: 'parametric',
  primitive: 'SmallSculpture',
  defaultFootprint: { w: 0.2, d: 0.2, h: 0.1 },
  paramSchema: [],
}

const PLAIN_GLB: FurnitureDef = {
  id: 'test-sofa',
  name: 'Test Sofa',
  category: 'seating',
  kind: 'gltf',
  source: 'builtin',
  url: '/models/test-sofa.glb',
  license: 'CC0',
  defaultFootprint: { w: 1.8, d: 0.9, h: 0.8 },
}

describe('catalogVariantOptions / hasCatalogVariants', () => {
  it('offers every IKEA variant (incl. a disabled stub) for a multi-variant product', () => {
    const opts = catalogVariantOptions(IKEA_MULTI)
    expect(opts.map((o) => o.id)).toEqual(['white', 'black-brown', 'oak-veneer'])
    expect(opts[0]).toMatchObject({ label: 'White', swatchHex: '#f2f2f2', disabled: false })
    expect(opts[2]).toMatchObject({ label: 'Oak veneer', disabled: true })
    expect(hasCatalogVariants(IKEA_MULTI)).toBe(true)
  })

  it('offers nothing for a single-variant IKEA product (no popover)', () => {
    expect(catalogVariantOptions(IKEA_SINGLE)).toEqual([])
    expect(hasCatalogVariants(IKEA_SINGLE)).toBe(false)
  })

  it('offers the curated swatch palette for a tintable parametric def', () => {
    const opts = catalogVariantOptions(SOFA_PARAMETRIC)
    expect(opts).toHaveLength(CURATED_COLOR_SWATCHES.length)
    expect(opts.every((o) => typeof o.swatchHex === 'string')).toBe(true)
    expect(hasCatalogVariants(SOFA_PARAMETRIC)).toBe(true)
  })

  it('still offers swatches when the colour field is not literally named "color"', () => {
    expect(hasCatalogVariants(DECOR_NO_BARE_COLOR)).toBe(true)
  })

  it('offers nothing for a parametric def with no colour field (non-tintable)', () => {
    expect(catalogVariantOptions(NO_COLOR_FIELD)).toEqual([])
    expect(hasCatalogVariants(NO_COLOR_FIELD)).toBe(false)
  })

  it('offers nothing for a parametric def with an empty schema', () => {
    expect(catalogVariantOptions(NO_SCHEMA)).toEqual([])
    expect(hasCatalogVariants(NO_SCHEMA)).toBe(false)
  })

  it('offers nothing for a plain GLB def (builtin/user/remote/pack/local)', () => {
    expect(catalogVariantOptions(PLAIN_GLB)).toEqual([])
    expect(hasCatalogVariants(PLAIN_GLB)).toBe(false)
  })
})

describe('initialVariantProps', () => {
  it('resolves an IKEA finish to the { variant } patch the inspector already uses', () => {
    expect(initialVariantProps(IKEA_MULTI, 'black-brown')).toEqual({ variant: 'black-brown' })
  })

  it('returns {} for a disabled/stub IKEA variant', () => {
    expect(initialVariantProps(IKEA_MULTI, 'oak-veneer')).toEqual({})
  })

  it('returns {} for an unknown IKEA finish id', () => {
    expect(initialVariantProps(IKEA_MULTI, 'nonexistent')).toEqual({})
  })

  it('resolves a swatch hex to the primary colour field patch', () => {
    expect(initialVariantProps(SOFA_PARAMETRIC, '#2b2b2e')).toEqual({ color: '#2b2b2e' })
  })

  it('resolves to the first qualifying colour field when none is literally "color"', () => {
    expect(initialVariantProps(DECOR_NO_BARE_COLOR, '#2b2b2e')).toEqual({ potColor: '#2b2b2e' })
  })

  it('returns {} for a def with no colour field', () => {
    expect(initialVariantProps(NO_COLOR_FIELD, '#2b2b2e')).toEqual({})
  })

  it('returns {} for a plain GLB def', () => {
    expect(initialVariantProps(PLAIN_GLB, '#2b2b2e')).toEqual({})
  })
})
