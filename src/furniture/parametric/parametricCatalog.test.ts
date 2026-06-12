import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SerializedStateZ, serialize } from '../../state/schema'
import { useStore } from '../../state/store'
import { useCatalog } from '../catalog'
import { itemPrice } from '../furniturePrices'
import { itemsCost } from '../itemsCost'
import type { FurnitureDef, UserGltfDef } from '../types'
import { buildParametric } from './buildParts'
import { estimatePrice } from './price'
import { defaultSpec, specLabel } from './spec'

/** The def `saveParametricAsset` produces (sans the GLB/IDB side effects):
 *  a regular user GLB def carrying the spec-exact footprint + price estimate. */
function generatedDef(): UserGltfDef {
  const spec = defaultSpec('wardrobe')
  const model = buildParametric(spec)
  return {
    id: 'user-param-test',
    name: specLabel(spec),
    kind: 'gltf',
    source: 'user',
    category: 'storage',
    assetId: 'param-asset-1',
    uploadedAt: '2026-06-11T00:00:00.000Z',
    defaultFootprint: model.bounds,
    price: estimatePrice(model),
  }
}

describe('a generated parametric def behaves like any catalog item', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('merges into the catalog with its exact spec-derived footprint', () => {
    const def = generatedDef()
    const { result } = renderHook(() => useCatalog())
    act(() => useStore.getState().addUserFurniture(def))
    const merged = result.current[def.id]
    expect(merged?.name).toBe('Custom wardrobe 120 × 220 cm')
    // Footprint comes from the spec dims (collision/placement input).
    expect(merged?.defaultFootprint.w).toBeCloseTo(1.2, 9)
    expect(merged?.defaultFootprint.h).toBeCloseTo(2.2, 9)
    expect(merged?.defaultFootprint.d).toBeGreaterThanOrEqual(0.6)
  })

  it('prices via the def-level estimate (budget integration)', () => {
    const def = generatedDef()
    expect(itemPrice(def, def.category)).toBe(def.price)
    const catalog: Record<string, FurnitureDef> = { [def.id]: def }
    const items = [
      { id: 'a', defId: def.id, position: [0, 0] as [number, number], rotation: 0, props: {} },
      { id: 'b', defId: def.id, position: [2, 0] as [number, number], rotation: 0, props: {} },
    ]
    expect(itemsCost(items, catalog)).toBe(def.price! * 2)
  })

  it('a plain upload without a price keeps the category fallback', () => {
    const def = { ...generatedDef(), price: undefined }
    expect(itemPrice(def, 'storage')).toBe(380) // CATEGORY_BASE.storage
  })

  it('round-trips through the save schema (price + footprint survive)', () => {
    const def = generatedDef()
    act(() => useStore.getState().addUserFurniture(def))
    const json = JSON.parse(JSON.stringify(serialize(useStore.getState())))
    const parsed = SerializedStateZ.parse(json)
    const saved = parsed.userFurniture.find((d) => d.id === def.id)
    expect(saved).toBeDefined()
    expect(saved && 'price' in saved ? saved.price : undefined).toBe(def.price)
    expect(saved?.defaultFootprint).toEqual(def.defaultFootprint)
  })
})
