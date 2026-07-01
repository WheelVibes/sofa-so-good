/**
 * Tests for the bulk-recolour ("Tint all") section of `MultiSelectPanel`
 * (v0.9.0.25) — a direct multi-select tint picker (vs the copy-then-paste
 * appearance path). Gated by `bulkAppearance` (simple, on in both modes).
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../../features/featureFlags'
import { useStore } from '../../state/store'
import { MultiSelectPanel } from './MultiSelectPanel'

function selectTwo() {
  const s = useStore.getState()
  const a = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
  const b = s.addItem({ defId: 'dining-chair', position: [1, 0], rotation: 0, props: {} })
  useStore.getState().setSelectedItemIds([a, b])
  return [a, b]
}

beforeEach(() => {
  useStore.getState().__resetForTest?.()
})

describe('bulkAppearance flag', () => {
  it('is a simple-tier default-on flag, on in BOTH modes', () => {
    const flag = FEATURE_FLAGS.bulkAppearance
    expect(flag.tier).toBe('simple')
    expect(flag.default).toBe(true)

    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.bulkAppearance).toBe(true)
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.bulkAppearance).toBe(true)
  })
})

describe('MultiSelectPanel bulk tint section', () => {
  afterEach(() => {
    useStore.getState().setSelectedItemIds([])
  })

  it('shows the "Tint all" control when the flag is on and 2+ are selected', () => {
    selectTwo()
    render(<MultiSelectPanel />)
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.getByLabelText('Tint every selected item')).toBeInTheDocument()
  })

  it('hides the section when the flag is off', () => {
    selectTwo()
    useStore.setState({
      featureFlags: { ...useStore.getState().featureFlags, bulkAppearance: false },
    })
    render(<MultiSelectPanel />)
    expect(screen.queryByText('Appearance')).toBeNull()
  })

  it('offers a clear-tint affordance once the selection shares a tint', () => {
    const [a, b] = selectTwo()
    useStore.getState().updateManyItemProps([a, b], { tint: '#ff0000' })
    render(<MultiSelectPanel />)
    expect(screen.getByLabelText('Clear tint')).toBeInTheDocument()
  })

  it('offers clear-tint even when the selection has MIXED tints', () => {
    const [a, b] = selectTwo()
    useStore.getState().updateManyItemProps([a], { tint: '#ff0000' })
    useStore.getState().updateManyItemProps([b], { tint: '#0000ff' })
    render(<MultiSelectPanel />)
    // Different tints → no shared swatch, but a reset is still useful.
    const clear = screen.getByLabelText('Clear tint')
    expect(clear).toBeInTheDocument()
    fireEvent.click(clear)
    const byId = new Map(useStore.getState().items.map((i) => [i.id, i]))
    expect(byId.get(a)?.props.tint).toBe('')
    expect(byId.get(b)?.props.tint).toBe('')
  })

  it('hides clear-tint when nothing is tinted', () => {
    selectTwo()
    render(<MultiSelectPanel />)
    expect(screen.queryByLabelText('Clear tint')).toBeNull()
  })
})
