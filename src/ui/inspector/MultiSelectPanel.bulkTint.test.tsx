// @vitest-environment happy-dom
/**
 * Tests for the bulk-recolour ("Tint all") section of `MultiSelectPanel`
 * (v0.9.0.25) — a direct multi-select tint picker (vs the copy-then-paste
 * appearance path). Gated by `bulkAppearance` (simple, on in both modes).
 *
 * BUG fix coverage: bulk-tint used to write only `props.tint`, which the
 * parametric render path never reads (GLB-only) — so tinting stock furniture
 * (e.g. `dining-chair`) was a silent render no-op. `recolorItems` now targets
 * each item's own def: `tint` for gltf/ikea, every `color`-kind paramSchema
 * field for parametric.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../../features/featureFlags'
import type { UserGltfDef } from '../../furniture/types'
import { useStore } from '../../state/store'
import { MultiSelectPanel } from './MultiSelectPanel'

// A user-uploaded gltf def (source 'user') so the store's merged catalog
// resolves a real `kind: 'gltf'` def alongside builtin parametric defs.
const GLTF_DEF: UserGltfDef = {
  id: 'user-lamp-test',
  name: 'Test lamp',
  category: 'lighting',
  kind: 'gltf',
  source: 'user',
  assetId: 'asset-lamp-test',
  uploadedAt: new Date().toISOString(),
  defaultFootprint: { w: 0.3, d: 0.3, h: 0.5 },
}

function selectTwoParametric() {
  const s = useStore.getState()
  const a = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
  const b = s.addItem({ defId: 'dining-chair', position: [1, 0], rotation: 0, props: {} })
  useStore.getState().setSelectedItemIds([a, b])
  return [a, b]
}

function selectParametricAndGltf() {
  useStore.setState({ userFurniture: [GLTF_DEF] })
  const s = useStore.getState()
  const chair = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
  const lamp = s.addItem({ defId: GLTF_DEF.id, position: [1, 0], rotation: 0, props: {} })
  useStore.getState().setSelectedItemIds([chair, lamp])
  return [chair, lamp]
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
    selectTwoParametric()
    render(<MultiSelectPanel />)
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.getByLabelText('Tint every selected item')).toBeInTheDocument()
  })

  it('hides the section when the flag is off', () => {
    selectTwoParametric()
    useStore.setState({
      featureFlags: { ...useStore.getState().featureFlags, bulkAppearance: false },
    })
    render(<MultiSelectPanel />)
    expect(screen.queryByText('Appearance')).toBeNull()
  })

  it('recolours a parametric item by its own color field (not props.tint)', () => {
    const [a, b] = selectTwoParametric()
    const n = useStore.getState().recolorItems([a, b], '#ff8800')
    expect(n).toBe(2)
    const byId = new Map(useStore.getState().items.map((i) => [i.id, i]))
    // dining-chair's FIRST color field is `seatColor`.
    expect(byId.get(a)?.props.seatColor).toBe('#ff8800')
    expect(byId.get(b)?.props.seatColor).toBe('#ff8800')
    // props.tint is untouched — the parametric render path never reads it.
    expect(byId.get(a)?.props.tint).toBeUndefined()
  })

  it('recolours a gltf item via props.tint, byte-identical to before', () => {
    const [, lamp] = selectParametricAndGltf()
    useStore.getState().recolorItems([lamp], '#00ffaa')
    const byId = new Map(useStore.getState().items.map((i) => [i.id, i]))
    expect(byId.get(lamp)?.props.tint).toBe('#00ffaa')
  })

  it('recolours BOTH a parametric and a gltf item in one bulk call', () => {
    const [chair, lamp] = selectParametricAndGltf()
    const n = useStore.getState().recolorItems([chair, lamp], '#123456')
    expect(n).toBe(2)
    const byId = new Map(useStore.getState().items.map((i) => [i.id, i]))
    expect(byId.get(chair)?.props.seatColor).toBe('#123456')
    expect(byId.get(lamp)?.props.tint).toBe('#123456')
  })

  it('clear resets a parametric item to its schema default, and a gltf item drops tint', () => {
    const [chair, lamp] = selectParametricAndGltf()
    useStore.getState().recolorItems([chair, lamp], '#123456')
    useStore.getState().recolorItems([chair, lamp], null)
    const byId = new Map(useStore.getState().items.map((i) => [i.id, i]))
    expect(byId.get(chair)?.props.seatColor).toBe('#7a5c3c') // dining-chair schema default
    expect(byId.get(lamp)?.props.tint).toBeUndefined()
  })

  it('offers a clear-tint affordance once the selection shares a recolour value', () => {
    const [a, b] = selectTwoParametric()
    useStore.getState().recolorItems([a, b], '#ff0000')
    render(<MultiSelectPanel />)
    expect(screen.getByLabelText('Clear tint')).toBeInTheDocument()
  })

  it('offers clear-tint even when the selection has MIXED recolour values, and clicking it resets each to its own default', () => {
    const [a, b] = selectTwoParametric()
    useStore.getState().recolorItems([a], '#ff0000')
    useStore.getState().recolorItems([b], '#0000ff')
    render(<MultiSelectPanel />)
    // Different values → no shared swatch, but a reset is still useful.
    const clear = screen.getByLabelText('Clear tint')
    expect(clear).toBeInTheDocument()
    fireEvent.click(clear)
    const byId = new Map(useStore.getState().items.map((i) => [i.id, i]))
    expect(byId.get(a)?.props.seatColor).toBe('#7a5c3c')
    expect(byId.get(b)?.props.seatColor).toBe('#7a5c3c')
  })

  it('a parametric selection always has a recolour value to show/clear (schema default counts)', () => {
    // Unlike gltf `tint` (absent until bulk-tinted), a parametric item always
    // carries a real color value (its schema default), so `currentRecolorValue`
    // is never '' for it — the clear affordance is offered even before any
    // bulk action, which is harmless (it just re-applies the same default).
    selectTwoParametric()
    render(<MultiSelectPanel />)
    expect(screen.getByLabelText('Clear tint')).toBeInTheDocument()
  })
})
