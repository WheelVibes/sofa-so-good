// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

/** Dispatch a touch-type window pointer event (the controller's placement-drag
 *  listeners are window-level, not canvas-level, so `elementFromPoint` at the
 *  event's coordinates is what decides "on the canvas" — see `mockElementFromPoint`). */
function firePointer(
  type: 'pointermove' | 'pointerup' | 'pointercancel',
  pointerId: number,
  init: PointerEventInit = {},
) {
  act(() => {
    window.dispatchEvent(
      new PointerEvent(type, { pointerId, pointerType: 'touch', bubbles: true, ...init }),
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

/** MOBILE-3: the touch-drag placement ghost is driven by window `pointermove`/
 *  `pointerup`/`pointercancel` (see `usePlacementController.ts`). Placement
 *  arms off-window (a catalog-card long-press timer that already fired), so
 *  the controller latches its `dragPointerId` onto the first pointer event it
 *  observes rather than a `pointerdown` — these tests drive that latch/gate
 *  directly with synthetic touch PointerEvents, mirroring the BUG-1/MOBILE-1/
 *  MOBILE-2 two-pointer scenarios (`dragHelpers.ts:isActiveDragPointer`). */
describe('usePlacementController — MOBILE-3 placement-drag pointerId gating', () => {
  let canvas: HTMLCanvasElement

  beforeEach(() => {
    useStore.getState().__resetForTest()
    canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    useStore.getState().setGhostWorld([1, 1], true)
    // The controller resolves "is this touch lifting over the canvas?" via
    // `document.elementFromPoint` (a window-level listener has no target of
    // its own to test) — happy-dom doesn't implement real hit-testing, so
    // stub it to the canvas for these tests.
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(canvas)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    canvas.remove()
    // Restore Simple mode so a stamp-specific test opting into Pro can't leak
    // the pro-tier flag set into later tests/files.
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
  })

  it('a second finger touching down mid-drag does not move the ghost cursor', () => {
    const hook = renderHook(() => usePlacementController())
    act(() => useStore.getState().setActiveDefId('sofa-3seat'))
    firePointer('pointermove', 1, { clientX: 10, clientY: 10 })
    expect(useStore.getState().cursor).toEqual({ x: 10, y: 10 })
    // A different finger's move is a no-op — it never latched the drag.
    firePointer('pointermove', 2, { clientX: 500, clientY: 500 })
    expect(useStore.getState().cursor).toEqual({ x: 10, y: 10 })
    // The originating finger can still keep driving the ghost.
    firePointer('pointermove', 1, { clientX: 20, clientY: 20 })
    expect(useStore.getState().cursor).toEqual({ x: 20, y: 20 })
    hook.unmount()
  })

  it("a second finger's pointerup does not commit or cancel the drag; the initiating finger's does", () => {
    const hook = renderHook(() => usePlacementController())
    act(() => useStore.getState().setActiveDefId('sofa-3seat'))
    firePointer('pointermove', 1, { clientX: 10, clientY: 10 })
    // A stray second finger lifting off the canvas must not end the gesture.
    firePointer('pointerup', 2, { clientX: 10, clientY: 10 })
    expect(useStore.getState().activeDefId).toBe('sofa-3seat')
    expect(useStore.getState().items).toHaveLength(0)
    // The finger that's actually dragging commits on its own lift.
    firePointer('pointerup', 1, { clientX: 10, clientY: 10 })
    expect(useStore.getState().items).toHaveLength(1)
    hook.unmount()
  })

  it("a second finger's pointercancel does not abort the drag; the initiating finger's does", () => {
    const hook = renderHook(() => usePlacementController())
    act(() => useStore.getState().setActiveDefId('sofa-3seat'))
    firePointer('pointermove', 1, { clientX: 10, clientY: 10 })
    firePointer('pointercancel', 2)
    expect(useStore.getState().activeDefId).toBe('sofa-3seat')
    firePointer('pointercancel', 1)
    expect(useStore.getState().activeDefId).toBeNull()
    hook.unmount()
  })

  it('a stamp commit re-latches for whichever finger drives the next drop', () => {
    // stampPlace is pro-tier — the module boots in Simple mode (CLAUDE.md
    // "Test BOTH modes"), so opt into Pro for this stamp-specific scenario.
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    const hook = renderHook(() => usePlacementController())
    act(() => useStore.getState().startStamp('sofa-3seat'))
    // First drop, driven by finger 1.
    firePointer('pointermove', 1, { clientX: 10, clientY: 10 })
    firePointer('pointerup', 1, { clientX: 10, clientY: 10 })
    expect(useStore.getState().items).toHaveLength(1)
    // Stamp mode keeps the same activeDefId armed (no effect remount) — a
    // completely different finger driving the next drop must not be gated
    // out by a stale latch from finger 1.
    useStore.getState().setGhostWorld([2, 2], true)
    firePointer('pointermove', 7, { clientX: 30, clientY: 30 })
    expect(useStore.getState().cursor).toEqual({ x: 30, y: 30 })
    firePointer('pointerup', 7, { clientX: 30, clientY: 30 })
    expect(useStore.getState().items).toHaveLength(2)
    hook.unmount()
  })
})
