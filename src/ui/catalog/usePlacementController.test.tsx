// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { IkeaGltfDef } from '../../furniture/types'
import { useStore } from '../../state/store'
import { usePlacementController } from './usePlacementController'

/** Click the canvas like a real commit click (target = the canvas element the
 *  controller's window-level listener checks `instanceof HTMLCanvasElement`
 *  against). */
function clickCanvas(canvas: HTMLCanvasElement, init: MouseEventInit = {}) {
  act(() => {
    canvas.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }),
    )
  })
}

const IKEA_MULTI: IkeaGltfDef = {
  id: 'ikea-malm-test',
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
      articleNumber: '1',
      url: 'https://www.ikea.com/sg/en/p/malm/',
      assetId: 'asset-white',
      glbMaterials: [],
    },
    {
      finish: 'black-brown',
      label: 'Black-brown',
      articleNumber: '2',
      url: 'https://www.ikea.com/sg/en/p/malm/',
      assetId: 'asset-black',
      glbMaterials: [],
    },
  ],
  defaultFootprint: { w: 0.97, d: 2.09, h: 1.0 },
  uploadedAt: '2026-05-31T00:00:00.000Z',
  license: 'IKEA',
  attribution: 'IKEA — MALM',
}

describe('usePlacementController — CATALOG-VARIANT commit merge', () => {
  let canvas: HTMLCanvasElement

  beforeEach(() => {
    useStore.getState().__resetForTest()
    canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    // A valid ghost position so a commit click actually adds the item.
    useStore.getState().setGhostWorld([1, 1], true)
  })
  afterEach(() => {
    canvas.remove()
  })

  it('an armed variant patch overrides the def default but leaves other schema defaults alone', () => {
    const hook = renderHook(() => usePlacementController())
    act(() => useStore.getState().armWithVariant('sofa-3seat', { color: '#2b2b2e' }))
    clickCanvas(canvas)
    const items = useStore.getState().items
    expect(items).toHaveLength(1)
    expect(items[0].props.color).toBe('#2b2b2e')
    // Untouched schema defaults still filled in by defaultItemProps.
    expect(items[0].props.material).toBe('fabric')
    expect(items[0].props.cushionCount).toBe(3)
    hook.unmount()
  })

  it('a plain arm (no variant) keeps the def default colour', () => {
    const hook = renderHook(() => usePlacementController())
    act(() => useStore.getState().setActiveDefId('sofa-3seat'))
    clickCanvas(canvas)
    const items = useStore.getState().items
    expect(items).toHaveLength(1)
    expect(items[0].props.color).toBe('#8aa1a8') // schema default
    hook.unmount()
  })

  it('an armed IKEA finish lands as the { variant } prop the inspector understands', () => {
    useStore.setState({ userFurniture: [IKEA_MULTI] })
    const hook = renderHook(() => usePlacementController())
    act(() => useStore.getState().armWithVariant('ikea-malm-test', { variant: 'black-brown' }))
    clickCanvas(canvas)
    const items = useStore.getState().items
    expect(items).toHaveLength(1)
    expect(items[0].props.variant).toBe('black-brown')
    hook.unmount()
  })

  it('a stamp/shift commit keeps the armed variant for the next drop', () => {
    const hook = renderHook(() => usePlacementController())
    act(() => useStore.getState().armWithVariant('sofa-3seat', { color: '#4a5a78' }))
    clickCanvas(canvas, { shiftKey: true })
    // Still armed (shift keeps placement live) with the same variant.
    expect(useStore.getState().activeDefId).toBe('sofa-3seat')
    expect(useStore.getState().armedVariantProps).toEqual({ color: '#4a5a78' })
    useStore.getState().setGhostWorld([2, 2], true)
    clickCanvas(canvas, { shiftKey: true })
    const items = useStore.getState().items
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.props.color === '#4a5a78')).toBe(true)
    hook.unmount()
  })

  it('cancelling the armed placement drops the stashed variant', () => {
    const hook = renderHook(() => usePlacementController())
    act(() => useStore.getState().armWithVariant('sofa-3seat', { color: '#4a5a78' }))
    act(() => useStore.getState().cancelPlacement())
    expect(useStore.getState().armedVariantProps).toBeNull()
    expect(useStore.getState().activeDefId).toBeNull()
    hook.unmount()
  })
})
