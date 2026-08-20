// @vitest-environment happy-dom
/**
 * COLOR-GRADE — the Graphics panel's scene Warmth + Saturation dials: flag
 * registration (simple tier, on in BOTH modes), slider presence/absence by
 * flag, store round-trip with clamping, and qualityPrefs persistence keys.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../features/featureFlags'
import { useStore } from '../state/store'
import { GraphicsSettings } from './GraphicsSettings'

beforeEach(() => {
  useStore.getState().__resetForTest?.()
})

afterEach(() => {
  useStore.setState({ sceneWarmth: 0, sceneSaturation: 1 })
})

describe('colorGrade flag', () => {
  it('is registered as a simple-tier, default-on, prod-safe flag', () => {
    const flag = FEATURE_FLAGS.colorGrade
    expect(flag).toBeDefined()
    expect(flag.tier).toBe('simple')
    expect(flag.default).toBe(true)
    expect(flag.devOnly).toBeFalsy()
  })

  it('resolves ON in BOTH Simple and Pro modes', () => {
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.colorGrade).toBe(true)
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.colorGrade).toBe(true)
  })
})

describe('GraphicsSettings colour-grade dials', () => {
  const warmth = () => screen.queryByRole('slider', { name: 'Scene warmth (white balance)' })
  const saturation = () => screen.queryByRole('slider', { name: 'Scene saturation' })

  it('renders both dials beside Exposure when the flag is on (default Simple)', () => {
    render(<GraphicsSettings open onClose={() => {}} />)
    expect(screen.getByRole('slider', { name: 'Exposure' })).toBeTruthy()
    expect(warmth()).toBeTruthy()
    expect(saturation()).toBeTruthy()
  })

  it('renders both dials in Pro mode too', () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    render(<GraphicsSettings open onClose={() => {}} />)
    expect(warmth()).toBeTruthy()
    expect(saturation()).toBeTruthy()
  })

  it('hides both dials when the flag is off (Exposure stays)', () => {
    useStore.getState().setFeatureFlag('colorGrade', false)
    render(<GraphicsSettings open onClose={() => {}} />)
    expect(screen.getByRole('slider', { name: 'Exposure' })).toBeTruthy()
    expect(warmth()).toBeNull()
    expect(saturation()).toBeNull()
  })

  it('dragging the dials writes clamped store values', () => {
    render(<GraphicsSettings open onClose={() => {}} />)
    fireEvent.change(warmth() as HTMLElement, { target: { value: '-0.5' } })
    expect(useStore.getState().sceneWarmth).toBe(-0.5)
    fireEvent.change(saturation() as HTMLElement, { target: { value: '0.4' } })
    expect(useStore.getState().sceneSaturation).toBe(0.4)
    // Direct action calls clamp out-of-range values.
    useStore.getState().setSceneWarmth(9)
    expect(useStore.getState().sceneWarmth).toBe(1)
    useStore.getState().setSceneSaturation(-3)
    expect(useStore.getState().sceneSaturation).toBe(0)
  })
})
