import { beforeEach, describe, expect, it } from 'vitest'
import {
  FOCAL_DEFAULT_MM,
  FOCUS_DEFAULT_M,
  FSTOP_DEFAULT,
} from '../../scene/cameras/cameraLensSettings'
import { useStore } from '../store'
import { loadQualityPrefs } from './qualityPrefs'

describe('qualityPrefs persistence', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    localStorage.clear()
  })

  it('loads a persisted explicit asset tier and migrates legacy "low" render tier → "performance"', () => {
    localStorage.setItem(
      'sofa.graphics.v1',
      JSON.stringify({ tier: 'low', overrides: {}, userSet: true, assetTier: 'high' }),
    )
    loadQualityPrefs()
    expect(useStore.getState().assetTier).toBe('high')
    // Legacy 'low' render tier → 'performance' (the new flat tier).
    expect(useStore.getState().qualityTier).toBe('performance')
  })

  it('preserves a persisted "maximum" render tier as-is', () => {
    localStorage.setItem(
      'sofa.graphics.v1',
      JSON.stringify({ tier: 'maximum', overrides: {}, userSet: true }),
    )
    loadQualityPrefs()
    expect(useStore.getState().qualityTier).toBe('maximum')
  })

  it('defaults asset tier to Auto (null) when absent from saved prefs', () => {
    localStorage.setItem(
      'sofa.graphics.v1',
      JSON.stringify({ tier: 'medium', overrides: {}, userSet: false }),
    )
    loadQualityPrefs()
    expect(useStore.getState().assetTier).toBeNull()
  })

  it('round-trips the lens + DoF fields (PC2-CAM-DOF-LENS)', () => {
    localStorage.setItem(
      'sofa.graphics.v1',
      JSON.stringify({
        tier: 'high',
        overrides: {},
        userSet: true,
        lensFocalMm: 85,
        dofFStop: 2.8,
        dofFocusDistance: 4.5,
        dofAuto: false,
      }),
    )
    loadQualityPrefs()
    const s = useStore.getState()
    expect(s.lensFocalMm).toBe(85)
    expect(s.dofFStop).toBe(2.8)
    expect(s.dofFocusDistance).toBe(4.5)
    expect(s.dofAuto).toBe(false)
  })

  it('back-compat: legacy prefs without lens/DoF load the defaults', () => {
    localStorage.setItem(
      'sofa.graphics.v1',
      JSON.stringify({ tier: 'medium', overrides: {}, userSet: false }),
    )
    loadQualityPrefs()
    const s = useStore.getState()
    expect(s.lensFocalMm).toBe(FOCAL_DEFAULT_MM)
    expect(s.dofFStop).toBe(FSTOP_DEFAULT)
    expect(s.dofFocusDistance).toBe(FOCUS_DEFAULT_M)
    expect(s.dofAuto).toBe(true)
  })

  it('clamps out-of-range persisted lens/DoF values on load', () => {
    localStorage.setItem(
      'sofa.graphics.v1',
      JSON.stringify({ tier: 'high', lensFocalMm: 9999, dofFStop: -3, dofFocusDistance: 0.001 }),
    )
    loadQualityPrefs()
    const s = useStore.getState()
    expect(s.lensFocalMm).toBe(200) // FOCAL_MAX_MM
    expect(s.dofFStop).toBe(0) // negative → off
    expect(s.dofFocusDistance).toBe(0.2) // FOCUS_MIN_M
  })
})
