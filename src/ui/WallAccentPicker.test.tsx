// @vitest-environment happy-dom
/**
 * Tests for the `WallAccentPicker` feature gate (v0.9.0.23). The accent-wall
 * panel previously shipped with NO feature flag (a hard-rule violation — "no
 * feature ships ungated"). It's now gated by `wallAccentPicker` (simple, on in
 * both modes). Verifies the flag config, both-mode resolution, and that the
 * panel mounts only when the flag is on and a wall is selected.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_FLAGS } from '../features/featureFlags'
import { useStore } from '../state/store'
import { WallAccentPicker } from './WallAccentPicker'

// Swatch thumbnails paint a 2D canvas, which happy-dom doesn't implement.
vi.mock('../materials/procedural/generators', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  proceduralThumbnailDataUrl: () => 'data:,',
}))

const WALL = { wallId: 'w1', roomId: 'livingDining' }

beforeEach(() => {
  useStore.getState().__resetForTest?.()
})

afterEach(() => {
  useStore.setState({ selectedWall: null })
})

describe('wallAccentPicker flag', () => {
  it('is registered as a simple-tier default-on flag', () => {
    const flag = FEATURE_FLAGS.wallAccentPicker
    expect(flag).toBeDefined()
    expect(flag.tier).toBe('simple')
    expect(flag.default).toBe(true)
    expect(flag.devOnly).toBeFalsy()
  })

  it('resolves ON in BOTH Simple and Pro modes', () => {
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.wallAccentPicker).toBe(true)

    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.wallAccentPicker).toBe(true)
  })
})

describe('WallAccentPicker mount gating', () => {
  it('renders nothing when no wall is selected', () => {
    const { container } = render(<WallAccentPicker />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the accent panel when a wall is selected and the flag is on', () => {
    useStore.setState({ selectedWall: WALL })
    render(<WallAccentPicker />)
    expect(screen.getByText('Accent wall')).toBeInTheDocument()
    expect(screen.getByText('Match room finish')).toBeInTheDocument()
  })

  it('renders nothing when the flag is off, even with a wall selected', () => {
    useStore.setState({
      selectedWall: WALL,
      featureFlags: { ...useStore.getState().featureFlags, wallAccentPicker: false },
    })
    const { container } = render(<WallAccentPicker />)
    expect(container.firstChild).toBeNull()
  })
})

describe('WallAccentPicker colour override (FINISH-RECOLOR)', () => {
  const KEY = `${WALL.wallId}:${WALL.roomId}`

  it('a tinted accent highlights its base texture tile', () => {
    useStore.setState({ selectedWall: WALL })
    useStore.getState().setWallAccent(KEY, 'tint:wall-brick-red:#3aa0ff!r')
    render(<WallAccentPicker />)
    expect(screen.getByTitle('Exposed brick')).toHaveClass('on')
  })

  it('custom colour repaints the current textured accent instead of flattening it', () => {
    useStore.setState({ selectedWall: WALL })
    useStore.getState().setWallAccent(KEY, 'wall-brick-red')
    render(<WallAccentPicker />)
    // Open the themed picker and commit a hex — the accent must become a
    // repaint tint of the SAME brick base, not a bare `#hex` (flat plaster).
    fireEvent.click(screen.getByRole('button', { name: 'Custom accent colour' }))
    fireEvent.change(screen.getByLabelText('Hex colour'), { target: { value: '#3aa0ff' } })
    expect(useStore.getState().finishes.wallAccents[KEY]).toBe('tint:wall-brick-red:#3aa0ff!r')
  })

  it('flag off → custom colour keeps the legacy flat paint behaviour', () => {
    useStore.setState({
      selectedWall: WALL,
      featureFlags: { ...useStore.getState().featureFlags, finishRecolor: false },
    })
    useStore.getState().setWallAccent(KEY, 'wall-brick-red')
    render(<WallAccentPicker />)
    fireEvent.click(screen.getByRole('button', { name: 'Custom accent colour' }))
    fireEvent.change(screen.getByLabelText('Hex colour'), { target: { value: '#3aa0ff' } })
    expect(useStore.getState().finishes.wallAccents[KEY]).toBe('#3aa0ff')
  })
})
