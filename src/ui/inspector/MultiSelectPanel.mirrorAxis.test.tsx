// @vitest-environment happy-dom
/**
 * Tests for the axis-choice mirror control in `MultiSelectPanel` (FEAT-2):
 * "Mirror Z" (front↔back) is gated by the `mirrorSelection` pro-tier flag,
 * hidden in Simple mode; the pre-existing "Mirror" (left↔right, X axis) stays
 * ungated in both modes but relabels to "Mirror X" once the axis picker is on
 * so the two buttons read as a pair.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../../features/featureFlags'
import { useStore } from '../../state/store'
import { MultiSelectPanel } from './MultiSelectPanel'

// Placed well inside the default plan's Living/Dining room (origin [8.55, 1.4],
// 4 x 5.4 m) so the mirror action's collision check has real room walls to
// validate against — arbitrary [0,0]-ish coords sit outside every room and
// make the all-or-nothing mirror a silent no-op.
function selectTwo() {
  const s = useStore.getState()
  const a = s.addItem({ defId: 'dining-chair', position: [9.5, 2.5], rotation: 0, props: {} })
  const b = s.addItem({ defId: 'dining-chair', position: [10.5, 3.1], rotation: 0, props: {} })
  useStore.getState().setSelectedItemIds([a, b])
  return [a, b]
}

beforeEach(() => {
  useStore.getState().__resetForTest?.()
})

describe('mirrorSelection flag', () => {
  it('is a pro-tier default-on flag, forced off in Simple', () => {
    const flag = FEATURE_FLAGS.mirrorSelection
    expect(flag.tier).toBe('pro')
    expect(flag.default).toBe(true)

    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.mirrorSelection).toBe(false)

    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.mirrorSelection).toBe(true)
  })
})

describe('MultiSelectPanel mirror-axis control', () => {
  afterEach(() => {
    useStore.getState().setSelectedItemIds([])
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
  })

  it('Simple mode: only the plain "Mirror" (X) button shows, no "Mirror Z"', () => {
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    selectTwo()
    render(<MultiSelectPanel />)
    expect(screen.getByText('Mirror')).toBeInTheDocument()
    expect(screen.queryByText('Mirror X')).toBeNull()
    expect(screen.queryByText('Mirror Z')).toBeNull()
  })

  it('Pro mode: both "Mirror X" and "Mirror Z" show', () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    selectTwo()
    render(<MultiSelectPanel />)
    expect(screen.getByText('Mirror X')).toBeInTheDocument()
    expect(screen.getByText('Mirror Z')).toBeInTheDocument()
    expect(screen.queryByText('Mirror', { exact: true })).toBeNull()
  })

  it('clicking "Mirror Z" reflects Z (keeps X) and flips heading for both items', () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    const [a, b] = selectTwo()
    const before = new Map(useStore.getState().items.map((i) => [i.id, [...i.position]]))
    render(<MultiSelectPanel />)
    fireEvent.click(screen.getByText('Mirror Z'))
    const after = new Map(useStore.getState().items.map((i) => [i.id, i]))
    for (const id of [a, b]) {
      expect(after.get(id)!.position[0]).toBeCloseTo(before.get(id)![0]) // X unchanged
      expect(after.get(id)!.position[1]).not.toBeCloseTo(before.get(id)![1]) // Z moved
      expect(after.get(id)!.flipZ).toBe(true)
    }
  })
})
