// @vitest-environment happy-dom
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
    // A persisted `maximum` maps onto `realistic`, whose `capable` variant IS the
    // old maximum preset — so the returning user's picture is unchanged.
    expect(useStore.getState().qualityTier).toBe('realistic')
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

  it('round-trips the two-point-perspective / vertical-lock toggle (FEAT-D)', () => {
    localStorage.setItem(
      'sofa.graphics.v1',
      JSON.stringify({ tier: 'high', overrides: {}, userSet: true, verticalLock: true }),
    )
    loadQualityPrefs()
    expect(useStore.getState().verticalLock).toBe(true)
  })

  it('back-compat: legacy prefs without verticalLock default to off', () => {
    localStorage.setItem(
      'sofa.graphics.v1',
      JSON.stringify({ tier: 'medium', overrides: {}, userSet: false }),
    )
    loadQualityPrefs()
    expect(useStore.getState().verticalLock).toBe(false)
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

  describe('the learned ceiling is a re-probe HINT, never a restored cap (R7-V)', () => {
    it('boots UN-CAPPED with a persisted ceiling present, keeping it as the hint', () => {
      localStorage.setItem(
        'sofa.graphics.v1',
        JSON.stringify({ tier: 'realistic', autoMaxDevice: 'weak' }),
      )
      loadQualityPrefs()
      const s = useStore.getState()
      // The live ceiling starts empty, so the ladder re-probes the full quality
      // once per session instead of inheriting a verdict it can never re-test.
      expect(s.autoMaxDevice).toBeNull()
      // ...but the previous session's verdict is not thrown away: it shortens
      // the re-probe (`adaptiveTier.ts:demoteWindowsFor`).
      expect(s.autoMaxDeviceHint).toBe('weak')
    })

    it('leaves both empty on a device that has never settled', () => {
      localStorage.setItem('sofa.graphics.v1', JSON.stringify({ tier: 'performance' }))
      loadQualityPrefs()
      expect(useStore.getState().autoMaxDevice).toBeNull()
      expect(useStore.getState().autoMaxDeviceHint).toBeNull()
    })

    it('discards a legacy value that names a retired tier', () => {
      localStorage.setItem(
        'sofa.graphics.v1',
        JSON.stringify({ tier: 'high', autoMaxDevice: 'medium' }),
      )
      loadQualityPrefs()
      expect(useStore.getState().autoMaxDeviceHint).toBeNull()
    })

    it('re-persists the hint when the session never re-failed', async () => {
      const { watchQualityPrefs } = await import('./qualityPrefs')
      localStorage.setItem(
        'sofa.graphics.v1',
        JSON.stringify({ tier: 'realistic', autoMaxDevice: 'weak' }),
      )
      loadQualityPrefs()
      watchQualityPrefs()
      // Any store write flushes a snapshot; the hint must survive it, or the NEXT
      // visit loses the accelerator and pays the slow two-window re-probe again.
      useStore.setState({ exposure: 1.1 })
      const raw = JSON.parse(localStorage.getItem('sofa.graphics.v1') as string)
      expect(raw.autoMaxDevice).toBe('weak')
    })

    it('persists what THIS session learned in preference to the hint', async () => {
      const { watchQualityPrefs } = await import('./qualityPrefs')
      loadQualityPrefs()
      watchQualityPrefs()
      useStore.setState({ autoMaxDeviceHint: 'capable', autoMaxDevice: 'weak' })
      const raw = JSON.parse(localStorage.getItem('sofa.graphics.v1') as string)
      expect(raw.autoMaxDevice).toBe('weak')
    })
  })
})
