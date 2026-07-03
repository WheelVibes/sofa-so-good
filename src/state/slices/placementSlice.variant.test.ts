import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

/**
 * `armedVariantProps` reducer logic (CATALOG-VARIANT) — the extra initial props
 * a catalog card's quick-look swatch popover arms onto a placement, ahead of
 * `defaultItemProps(def)`. `usePlacementController` merges these at commit; here
 * we exercise the slice transitions directly (arm / re-arm / cancel / stamp).
 */
describe('placementSlice — armed variant props', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('starts with no armed variant', () => {
    expect(useStore.getState().armedVariantProps).toBeNull()
  })

  it('armWithVariant arms the def AND stashes the variant patch', () => {
    useStore.getState().armWithVariant('ikea-malm', { variant: 'black-brown' })
    const s = useStore.getState()
    expect(s.activeDefId).toBe('ikea-malm')
    expect(s.armedVariantProps).toEqual({ variant: 'black-brown' })
    expect(s.ghostRotation).toBe(0)
    expect(s.stampMode).toBe(false)
  })

  it('a plain setActiveDefId arm clears any previously-armed variant', () => {
    useStore.getState().armWithVariant('ikea-malm', { variant: 'black-brown' })
    useStore.getState().setActiveDefId('sofa-3seat')
    const s = useStore.getState()
    expect(s.activeDefId).toBe('sofa-3seat')
    expect(s.armedVariantProps).toBeNull()
  })

  it('re-arming with a different variant replaces the stashed patch', () => {
    useStore.getState().armWithVariant('sofa-3seat', { color: '#2b2b2e' })
    useStore.getState().armWithVariant('sofa-3seat', { color: '#4a5a78' })
    expect(useStore.getState().armedVariantProps).toEqual({ color: '#4a5a78' })
  })

  it('cancelPlacement (Esc / Done) clears the armed variant', () => {
    useStore.getState().armWithVariant('sofa-3seat', { color: '#2b2b2e' })
    useStore.getState().cancelPlacement()
    expect(useStore.getState().armedVariantProps).toBeNull()
    expect(useStore.getState().activeDefId).toBeNull()
  })

  it('startStamp on a def clears any previously-armed variant (stamp starts fresh)', () => {
    useStore.getState().armWithVariant('sofa-3seat', { color: '#2b2b2e' })
    useStore.getState().startStamp('sofa-3seat')
    expect(useStore.getState().armedVariantProps).toBeNull()
    expect(useStore.getState().stampMode).toBe(true)
  })

  it('setArmedVariantProps writes the patch without touching the armed def', () => {
    useStore.getState().setActiveDefId('sofa-3seat')
    useStore.getState().setArmedVariantProps({ color: '#9c8f7a' })
    const s = useStore.getState()
    expect(s.activeDefId).toBe('sofa-3seat')
    expect(s.armedVariantProps).toEqual({ color: '#9c8f7a' })
  })
})
