import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WallGaps } from '../collision/clearanceGap'
import { useStore } from '../state/store'
import { DragHud } from './DragHud'

const gaps = (g: Partial<WallGaps>): WallGaps => ({
  left: null,
  right: null,
  back: null,
  front: null,
  ...g,
})

beforeEach(() => {
  useStore.getState().__resetForTest?.()
})

afterEach(() => {
  useStore.setState({ draggingItemId: null, dragWallGaps: null, dragClearance: null })
})

describe('DragHud', () => {
  it('renders nothing when no drag is in progress', () => {
    const { container } = render(<DragHud />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for a multi-item group drag', () => {
    useStore.setState({
      draggingItemId: 'a',
      dragGroupOriginals: [
        { id: 'a', position: [0, 0], rotation: 0 },
        { id: 'b', position: [1, 1], rotation: 0 },
      ],
      dragWallGaps: gaps({ left: 0.5 }),
    })
    const { container } = render(<DragHud />)
    expect(container.firstChild).toBeNull()
  })

  it('shows per-side gaps in metric', () => {
    useStore.setState({
      draggingItemId: 'a',
      dragGroupOriginals: [],
      units: 'metric',
      dragWallGaps: gaps({ left: 0.45, right: 2.45 }),
    })
    render(<DragHud />)
    expect(screen.getByLabelText('left wall')).toHaveTextContent('0.45 m')
    expect(screen.getByLabelText('right wall')).toHaveTextContent('2.45 m')
    // Sides with no facing wall produce no chip.
    expect(screen.queryByLabelText('front wall')).toBeNull()
  })

  it('shows per-side gaps in imperial', () => {
    useStore.setState({
      draggingItemId: 'a',
      dragGroupOriginals: [],
      units: 'imperial',
      dragWallGaps: gaps({ left: 0.305 }), // ~ 1 ft
    })
    render(<DragHud />)
    expect(screen.getByLabelText('left wall')).toHaveTextContent('1′ 0″')
  })

  it('flags a side below the minimum walkway clearance', () => {
    useStore.setState({
      draggingItemId: 'a',
      dragGroupOriginals: [],
      units: 'metric',
      dragWallGaps: gaps({ left: 0.1, right: 1.5 }),
    })
    render(<DragHud />)
    expect(screen.getByLabelText('left wall').className).toContain('warn')
    expect(screen.getByLabelText('right wall').className).not.toContain('warn')
  })

  it('falls back to the single nearest gap when no side has a wall', () => {
    useStore.setState({
      draggingItemId: 'a',
      dragGroupOriginals: [],
      units: 'metric',
      dragWallGaps: null,
      dragClearance: 0.8,
    })
    render(<DragHud />)
    expect(screen.getByText(/Wall clearance/)).toHaveTextContent('0.80 m')
  })

  it('renders nothing when there is no wall to measure to at all', () => {
    useStore.setState({
      draggingItemId: 'a',
      dragGroupOriginals: [],
      dragWallGaps: gaps({}),
      dragClearance: null,
    })
    const { container } = render(<DragHud />)
    // No chips and no fallback gap → empty.
    expect(container.querySelector('.drag-gap')).toBeNull()
    expect(container.textContent).not.toMatch(/Wall clearance/)
  })
})
