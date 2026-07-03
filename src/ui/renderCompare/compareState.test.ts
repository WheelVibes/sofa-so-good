import { beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags } from '../../features/featureFlags'
import { useStore } from '../../state/store'
import {
  clampDivider,
  DEFAULT_PRESET_A,
  DEFAULT_PRESET_B,
  initialCompareState,
  isValidPresetId,
  setHdriA,
  setHdriB,
  setPresetA,
  setPresetB,
  swapAB,
} from './compareState'

describe('compareState — pure logic', () => {
  it('initialCompareState returns sensible defaults', () => {
    const s = initialCompareState()
    expect(s.presetA).toBeTruthy()
    expect(s.presetB).toBeTruthy()
    expect(s.presetA).not.toBe(s.presetB)
    expect(s.divider).toBeCloseTo(0.5, 5)
    expect(s.imageA).toBeNull()
    expect(s.imageB).toBeNull()
    expect(s.samplesA).toBe(0)
    expect(s.samplesB).toBe(0)
    expect(s.renderingA).toBe(false)
    expect(s.renderingB).toBe(false)
    expect(s.hdriA).toBeNull()
    expect(s.hdriB).toBeNull()
  })

  it('setHdriA / setHdriB set the env and clear that slot image (F4)', () => {
    const base = { ...initialCompareState(), imageA: 'data:a', imageB: 'data:b' }
    const a = setHdriA(base, 'venice_sunset')
    expect(a.hdriA).toBe('venice_sunset')
    expect(a.imageA).toBeNull() // re-render needed
    expect(a.imageB).toBe('data:b') // untouched
    const b = setHdriB(a, 'studio')
    expect(b.hdriB).toBe('studio')
    expect(b.imageB).toBeNull()
    // null = procedural; no-op when unchanged returns the same object.
    expect(setHdriA(initialCompareState(), null)).toEqual(initialCompareState())
  })

  it('swapAB also exchanges the HDRI environments (F4)', () => {
    const s = { ...initialCompareState(), hdriA: 'studio', hdriB: null }
    const swapped = swapAB(s)
    expect(swapped.hdriA).toBeNull()
    expect(swapped.hdriB).toBe('studio')
  })

  it('clampDivider clamps to [0, 1]', () => {
    expect(clampDivider(-1)).toBe(0)
    expect(clampDivider(2)).toBe(1)
    expect(clampDivider(0.5)).toBeCloseTo(0.5, 5)
    expect(clampDivider(0)).toBe(0)
    expect(clampDivider(1)).toBe(1)
    expect(clampDivider(Number.NaN)).toBe(0.5)
    expect(clampDivider(Number.POSITIVE_INFINITY)).toBe(1)
    expect(clampDivider(Number.NEGATIVE_INFINITY)).toBe(0)
  })

  it('swapAB exchanges all A/B fields', () => {
    const s = {
      ...initialCompareState(),
      presetA: 'bright-day',
      presetB: 'cozy-evening',
      imageA: 'data:a',
      imageB: 'data:b',
      samplesA: 64,
      samplesB: 128,
      renderingA: true,
      renderingB: false,
    }
    const swapped = swapAB(s)
    expect(swapped.presetA).toBe('cozy-evening')
    expect(swapped.presetB).toBe('bright-day')
    expect(swapped.imageA).toBe('data:b')
    expect(swapped.imageB).toBe('data:a')
    expect(swapped.samplesA).toBe(128)
    expect(swapped.samplesB).toBe(64)
    expect(swapped.renderingA).toBe(false)
    expect(swapped.renderingB).toBe(true)
    // Divider is unchanged
    expect(swapped.divider).toBe(s.divider)
  })

  it('setPresetA clears imageA + samples when preset changes', () => {
    const s = { ...initialCompareState(), imageA: 'data:a', samplesA: 128 }
    const next = setPresetA(s, 'cozy-evening')
    expect(next.presetA).toBe('cozy-evening')
    expect(next.imageA).toBeNull()
    expect(next.samplesA).toBe(0)
    // B untouched
    expect(next.presetB).toBe(s.presetB)
    expect(next.imageB).toBe(s.imageB)
  })

  it('setPresetA is a no-op when the preset is unchanged', () => {
    const s = initialCompareState()
    const next = setPresetA(s, s.presetA)
    expect(next).toBe(s) // same reference
  })

  it('setPresetB clears imageB + samples when preset changes', () => {
    const s = { ...initialCompareState(), imageB: 'data:b', samplesB: 64 }
    const next = setPresetB(s, 'golden-hour')
    expect(next.presetB).toBe('golden-hour')
    expect(next.imageB).toBeNull()
    expect(next.samplesB).toBe(0)
    // A untouched
    expect(next.presetA).toBe(s.presetA)
  })

  it('DEFAULT_PRESET_A and DEFAULT_PRESET_B are different valid preset IDs', () => {
    expect(isValidPresetId(DEFAULT_PRESET_A)).toBe(true)
    expect(isValidPresetId(DEFAULT_PRESET_B)).toBe(true)
    expect(DEFAULT_PRESET_A).not.toBe(DEFAULT_PRESET_B)
  })

  it('isValidPresetId returns false for unknown IDs', () => {
    expect(isValidPresetId('')).toBe(false)
    expect(isValidPresetId('not-a-preset')).toBe(false)
  })
})

describe('renderCompare feature flag — Simple/Pro tiering', () => {
  beforeEach(() => {
    useStore.getState().setUiMode('pro')
  })

  it('renderCompare is OFF by default (opt-in) but simple-tier when enabled in both modes', () => {
    // Default off now — an advanced presentation surface, opt-in.
    expect(resolveFlags(true, {}, false, 'simple').renderCompare).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').renderCompare).toBe(false)
    // When explicitly enabled it is simple-tier, so it shows in BOTH modes.
    expect(resolveFlags(true, { renderCompare: true }, false, 'simple').renderCompare).toBe(true)
    expect(resolveFlags(true, { renderCompare: true }, false, 'pro').renderCompare).toBe(true)
  })

  it('renderCompare stays off across a Simple↔Pro flip until explicitly enabled', () => {
    // setUiMode calls reresolveFeatureFlags internally; a default-off flag stays off.
    useStore.getState().setUiMode('simple')
    expect(useStore.getState().featureFlags.renderCompare).toBe(false)

    useStore.getState().setUiMode('pro')
    expect(useStore.getState().featureFlags.renderCompare).toBe(false)
  })
})
