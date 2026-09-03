import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('uiSlice lights mode', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('defaults to off', () => {
    expect(useStore.getState().lightsMode).toBe('off')
  })

  it('setLightsMode sets the mode directly', () => {
    useStore.getState().setLightsMode('on')
    expect(useStore.getState().lightsMode).toBe('on')
    useStore.getState().setLightsMode('off')
    expect(useStore.getState().lightsMode).toBe('off')
  })

  it('cycleLightsMode toggles off → on → off', () => {
    const cycle = () => useStore.getState().cycleLightsMode()
    expect(useStore.getState().lightsMode).toBe('off')
    cycle()
    expect(useStore.getState().lightsMode).toBe('on')
    cycle()
    expect(useStore.getState().lightsMode).toBe('off')
  })

  it('picking a tier manually clears the adaptive shadow-shed fallback', () => {
    useStore.getState().setAutoShadowsOff(true)
    expect(useStore.getState().autoShadowsOff).toBe(true)
    useStore.getState().setQualityTier('performance')
    expect(useStore.getState().autoShadowsOff).toBe(false)
  })

  it('cycleQuality steps performance → realistic → performance', () => {
    useStore.getState().setQualityTier('performance')
    const cycle = () => useStore.getState().cycleQuality()
    cycle()
    expect(useStore.getState().qualityTier).toBe('realistic')
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

describe('uiSlice recent colours', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('defaults to an empty list', () => {
    expect(useStore.getState().recentColors).toEqual([])
  })

  it('pushes newest-first', () => {
    const push = (h: string) => useStore.getState().pushRecentColor(h)
    push('#111111')
    push('#222222')
    expect(useStore.getState().recentColors).toEqual(['#222222', '#111111'])
  })

  it('caps at 10, dropping the oldest', () => {
    const push = (h: string) => useStore.getState().pushRecentColor(h)
    // Push 12 distinct colours; only the newest 10 survive.
    for (let i = 0; i < 12; i++) push(`#0000${i.toString().padStart(2, '0')}`)
    const recents = useStore.getState().recentColors
    expect(recents).toHaveLength(10)
    // Newest first; the two oldest (#000000, #000001) are dropped.
    expect(recents[0]).toBe('#000011')
    expect(recents[9]).toBe('#000002')
    expect(recents).not.toContain('#000000')
    expect(recents).not.toContain('#000001')
  })

  it('re-pushing an existing colour moves it to the front (deduped, case-insensitive)', () => {
    const push = (h: string) => useStore.getState().pushRecentColor(h)
    push('#aaaaaa')
    push('#bbbbbb')
    push('#cccccc')
    push('#AAAAAA') // same as #aaaaaa, different case
    const recents = useStore.getState().recentColors
    expect(recents).toEqual(['#AAAAAA', '#cccccc', '#bbbbbb'])
    expect(recents).toHaveLength(3) // no duplicate entry
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

describe('uiSlice wall-types 3D overlay toggle', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('defaults to off', () => {
    expect(useStore.getState().showWallTypes).toBe(false)
  })

  it('toggleWallTypes flips the flag on and off', () => {
    useStore.getState().toggleWallTypes()
    expect(useStore.getState().showWallTypes).toBe(true)
    useStore.getState().toggleWallTypes()
    expect(useStore.getState().showWallTypes).toBe(false)
  })
})
