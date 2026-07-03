// @vitest-environment happy-dom
/**
 * Tests for the Ceiling section of the per-room `FinishPicker` (v0.9.0.22).
 * The `ceilingFinish` flag (simple, default on) previously had no UI — this
 * verifies the section renders, respects the flag in BOTH Simple and Pro
 * modes, applies via `setCeilingFinish`, and resets via `clearCeilingFinish`.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_FLAGS } from '../features/featureFlags'
import { useStore } from '../state/store'
import { FinishPicker } from './FinishPicker'

// Swatch thumbnails paint a 2D canvas, which happy-dom doesn't implement —
// stub just the data-URL generator (everything else in the module is real).
vi.mock('../materials/procedural/generators', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  proceduralThumbnailDataUrl: () => 'data:,',
}))

const ROOM = 'livingDining'

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.getState().selectRoom(ROOM)
})

afterEach(() => {
  useStore.getState().selectRoom(null)
})

describe('ceilingFinish flag', () => {
  it('is registered as a simple-tier default-on flag', () => {
    const flag = FEATURE_FLAGS.ceilingFinish
    expect(flag).toBeDefined()
    expect(flag.tier).toBe('simple')
    expect(flag.default).toBe(true)
  })

  it('resolves ON in BOTH Simple and Pro modes', () => {
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.ceilingFinish).toBe(true)

    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.ceilingFinish).toBe(true)
  })
})

describe('FinishPicker ceiling section', () => {
  it('renders a Ceiling swatch group when the flag is on', () => {
    render(<FinishPicker />)
    expect(screen.getByText('Ceiling')).toBeInTheDocument()
    expect(screen.getByTitle('Use this ceiling finish in every room')).toBeInTheDocument()
  })

  it('hides the Ceiling section when the flag is off', () => {
    useStore.setState({
      featureFlags: { ...useStore.getState().featureFlags, ceilingFinish: false },
    })
    render(<FinishPicker />)
    expect(screen.queryByText('Ceiling')).toBeNull()
    // Floor + Walls still render.
    expect(screen.getByText('Floor')).toBeInTheDocument()
    expect(screen.getByText('Walls')).toBeInTheDocument()
  })

  it('applies a ceiling finish and exposes a reset-to-white action', () => {
    useStore.getState().setCeilingFinish(ROOM, 'wall-white')
    render(<FinishPicker />)
    // With a ceiling set, the reset button appears.
    const reset = screen.getByTitle("Reset this room's ceiling back to plain white")
    expect(reset).toBeInTheDocument()
    expect(useStore.getState().finishes.ceiling[ROOM]).toBe('wall-white')
    fireEvent.click(reset)
    expect(useStore.getState().finishes.ceiling[ROOM]).toBeUndefined()
  })

  it('disables "Apply ceiling to all rooms" and hides reset until a ceiling is chosen', () => {
    render(<FinishPicker />)
    // No ceiling set (default white) → apply-all disabled, no reset button.
    expect(screen.getByTitle('Use this ceiling finish in every room')).toBeDisabled()
    expect(screen.queryByTitle("Reset this room's ceiling back to plain white")).toBeNull()
  })
})
