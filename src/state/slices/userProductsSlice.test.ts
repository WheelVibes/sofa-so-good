// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import type { ConfigurableProduct } from '../../furniture/configurator/model'
import { useStore } from '../store'

function product(id: string, label = 'My table'): ConfigurableProduct {
  return {
    id,
    label,
    category: 'tables',
    base: {
      footprint: { w: 1.2, d: 0.8, h: 0.75 },
      price: 0,
      gltfUrl: 'data:model/gltf-binary;base64,AA==',
    },
    slots: [
      {
        id: 'Legs',
        label: 'Legs',
        anchor: { position: [0, 0, 0] },
        defaultOptionId: 'round',
        options: [
          {
            id: 'round',
            label: 'Round',
            price: 40,
            footprint: { w: 1, d: 0.6, h: 0.7 },
            gltfUrl: 'data:x,AA==',
          },
          {
            id: 'square',
            label: 'Square',
            price: 60,
            footprint: { w: 1, d: 0.6, h: 0.7 },
            gltfUrl: 'data:x,AA==',
          },
        ],
      },
    ],
  }
}

describe('userProductsSlice (Stage 3d)', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.getState().setUserConfigurableProducts([])
  })

  it('registers an exported product', () => {
    useStore.getState().addUserConfigurableProduct(product('user-cfg-1'))
    expect(useStore.getState().userConfigurableProducts.map((p) => p.id)).toEqual(['user-cfg-1'])
  })

  it('replaces by id instead of duplicating', () => {
    useStore.getState().addUserConfigurableProduct(product('user-cfg-1', 'A'))
    useStore.getState().addUserConfigurableProduct(product('user-cfg-1', 'B'))
    const list = useStore.getState().userConfigurableProducts
    expect(list).toHaveLength(1)
    expect(list[0].label).toBe('B')
  })

  it('removes by id', () => {
    useStore.getState().addUserConfigurableProduct(product('user-cfg-1'))
    useStore.getState().addUserConfigurableProduct(product('user-cfg-2'))
    useStore.getState().removeUserConfigurableProduct('user-cfg-1')
    expect(useStore.getState().userConfigurableProducts.map((p) => p.id)).toEqual(['user-cfg-2'])
  })

  it('rejects structurally-invalid products', () => {
    // Missing slots/base — the guard drops it.
    useStore.getState().addUserConfigurableProduct({ id: 'bad' } as unknown as ConfigurableProduct)
    expect(useStore.getState().userConfigurableProducts).toHaveLength(0)
  })

  it('persists to localStorage and survives a reload of the JSON', () => {
    useStore.getState().addUserConfigurableProduct(product('user-cfg-1'))
    const raw = localStorage.getItem('hdb_user_products')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw as string) as ConfigurableProduct[]
    expect(parsed.map((p) => p.id)).toEqual(['user-cfg-1'])
  })

  it('clears the localStorage key when the last product is removed', () => {
    useStore.getState().addUserConfigurableProduct(product('user-cfg-1'))
    useStore.getState().removeUserConfigurableProduct('user-cfg-1')
    expect(localStorage.getItem('hdb_user_products')).toBeNull()
  })
})
