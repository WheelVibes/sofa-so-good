// @vitest-environment happy-dom
/**
 * Mount + feature-gate tests for the real-photo paint visualizer.
 * `PaintVizModal` itself is flag-agnostic (its owner gates it); these tests
 * cover the self-contained modal DOM plus a `useFeature('paintVisualizer')`
 * gate wrapper in BOTH Simple and Pro mode (simple-tier → on in both).
 */
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useFeature } from '../../features/useFeature'
import { useStore } from '../../state/store'
import { type PaintSwatch, PaintVizModal } from './PaintVizModal'

const SWATCHES: PaintSwatch[] = [
  { id: 'paint-white', name: 'Chalk White', hex: '#f4f2ec' },
  { id: 'paint-blue', name: 'Harbour Blue', hex: '#2a5aa0' },
]

function Gate() {
  const on = useFeature('paintVisualizer')
  if (!on) return null
  return <PaintVizModal open onClose={() => {}} swatches={SWATCHES} />
}

beforeEach(() => {
  useStore.getState().__resetForTest?.()
})

afterEach(() => {
  useStore.getState().setUiMode('simple')
})

describe('PaintVizModal mount', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <PaintVizModal open={false} onClose={() => {}} swatches={SWATCHES} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows the title, the client-side privacy copy and the upload prompt', () => {
    render(<PaintVizModal open onClose={() => {}} swatches={SWATCHES} />)
    expect(screen.getByText('Preview paint on your photo')).toBeTruthy()
    expect(screen.getByText(/stays on this device/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /upload photo/i })).toBeTruthy()
  })

  it('hides the swatch palette until a photo is uploaded (upload-first flow)', () => {
    render(<PaintVizModal open onClose={() => {}} swatches={SWATCHES} />)
    // Colours only matter once there's a photo + mask, so they aren't shown yet.
    expect(screen.queryByRole('button', { name: 'Chalk White' })).toBeNull()
    expect(screen.queryByRole('group', { name: /paint colours/i })).toBeNull()
  })
})

describe('paintVisualizer gating', () => {
  it('renders in Simple mode (simple-tier default-on)', () => {
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    render(<Gate />)
    expect(screen.getByText('Preview paint on your photo')).toBeTruthy()
  })

  it('renders in Pro mode too', () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    render(<Gate />)
    expect(screen.getByText('Preview paint on your photo')).toBeTruthy()
  })

  it('renders nothing when the flag is forced off', () => {
    useStore.setState({
      featureFlags: { ...useStore.getState().featureFlags, paintVisualizer: false },
    })
    const { container } = render(<Gate />)
    expect(container.firstChild).toBeNull()
  })
})
