import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('uiSlice lights mode', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('defaults to auto', () => {
    expect(useStore.getState().lightsMode).toBe('auto')
  })

  it('setLightsMode sets the mode directly', () => {
    useStore.getState().setLightsMode('on')
    expect(useStore.getState().lightsMode).toBe('on')
    useStore.getState().setLightsMode('off')
    expect(useStore.getState().lightsMode).toBe('off')
  })

  it('cycleLightsMode cycles auto → on → off → auto', () => {
    const cycle = () => useStore.getState().cycleLightsMode()
    expect(useStore.getState().lightsMode).toBe('auto')
    cycle()
    expect(useStore.getState().lightsMode).toBe('on')
    cycle()
    expect(useStore.getState().lightsMode).toBe('off')
    cycle()
    expect(useStore.getState().lightsMode).toBe('auto')
  })

  it('picking a tier manually clears the adaptive shadow-shed fallback', () => {
    useStore.getState().setAutoShadowsOff(true)
    expect(useStore.getState().autoShadowsOff).toBe(true)
    useStore.getState().setQualityTier('performance')
    expect(useStore.getState().autoShadowsOff).toBe(false)
  })

  it('cycleQuality steps performance → medium → high → maximum → performance', () => {
    useStore.getState().setQualityTier('performance')
    const cycle = () => useStore.getState().cycleQuality()
    cycle()
    expect(useStore.getState().qualityTier).toBe('medium')
    cycle()
    expect(useStore.getState().qualityTier).toBe('high')
    cycle()
    expect(useStore.getState().qualityTier).toBe('maximum')
    cycle()
    expect(useStore.getState().qualityTier).toBe('performance')
  })
})

describe('uiSlice drawing-set layers (PARITY-DRAWLAYERS)', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('defaults to an empty map (= all layers included)', () => {
    expect(useStore.getState().drawingLayers).toEqual({})
  })

  it('setDrawingLayer toggles a single layer without disturbing the others', () => {
    useStore.getState().setDrawingLayer('electrical', false)
    expect(useStore.getState().drawingLayers).toEqual({ electrical: false })
    useStore.getState().setDrawingLayer('plumbing', false)
    expect(useStore.getState().drawingLayers).toEqual({ electrical: false, plumbing: false })
    // Re-enabling flips just that key back on.
    useStore.getState().setDrawingLayer('electrical', true)
    expect(useStore.getState().drawingLayers).toEqual({ electrical: true, plumbing: false })
  })
})

describe('uiSlice asset quality', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('defaults to Auto (null — follows the render tier)', () => {
    expect(useStore.getState().assetTier).toBeNull()
  })

  it('setAssetTier sets and clears the explicit tier', () => {
    useStore.getState().setAssetTier('high')
    expect(useStore.getState().assetTier).toBe('high')
    useStore.getState().setAssetTier(null)
    expect(useStore.getState().assetTier).toBeNull()
  })

  it('an FPS auto-downgrade of the render tier leaves an explicit asset tier unchanged', () => {
    useStore.getState().setAssetTier('high')
    useStore.getState().autoSetQualityTier('performance')
    expect(useStore.getState().assetTier).toBe('high')
  })
})
