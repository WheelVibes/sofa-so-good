/**
 * Feature-gate tests for `PresentationMode` (v0.9.0.24). The full-screen
 * slideshow rendered unconditionally, guarded only by internal `presenting`
 * state — so a stray `presenting` could surface a pro feature even with the
 * `presentation` flag off (e.g. Simple mode). Now gated by `useFeature`.
 */
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../features/featureFlags'
import type { SavedView } from '../state/slices/cameraViewsSlice'
import { useStore } from '../state/store'
import { PresentationMode } from './PresentationMode'

const VIEW: SavedView = {
  id: 'v1',
  name: 'Living room',
  pos: [4, 2, 6],
  target: [3, 1, 3],
}

function setFlag(on: boolean) {
  useStore.setState({ featureFlags: { ...useStore.getState().featureFlags, presentation: on } })
}

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.setState({ presenting: true, savedViews: [VIEW] })
})

afterEach(() => {
  useStore.setState({ presenting: false, savedViews: [] })
})

describe('presentation flag', () => {
  it('is a pro-tier default-on flag', () => {
    expect(FEATURE_FLAGS.presentation.tier).toBe('pro')
    expect(FEATURE_FLAGS.presentation.default).toBe(true)
  })

  it('is forced OFF in Simple mode and ON in Pro mode', () => {
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.presentation).toBe(false)

    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.presentation).toBe(true)
  })
})

describe('PresentationMode gating', () => {
  it('renders the slideshow when presenting with the flag on', () => {
    setFlag(true)
    const { container } = render(<PresentationMode />)
    expect(container.firstChild).not.toBeNull()
  })

  it('renders nothing when the flag is off, even while presenting', () => {
    setFlag(false)
    const { container } = render(<PresentationMode />)
    expect(container.firstChild).toBeNull()
  })
})
