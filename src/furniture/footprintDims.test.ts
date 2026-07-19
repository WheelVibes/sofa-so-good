import { describe, expect, it } from 'vitest'
import { resolveFootprintDims } from './footprintDims'

/**
 * `resolveFootprintDims` is the single source for the six former inline copies
 * (collision/placement, dragHelpers, ScatterFill, InspectorHeader,
 * PlanFurnitureInspector, ikeaSets) — a real logic regression here would ripple
 * into collision, drag ghosts, and the inspector footprint readout at once.
 */
describe('resolveFootprintDims', () => {
  it('falls back to width/depth props with no footprintParams map', () => {
    const out = resolveFootprintDims({}, { width: 1.2, depth: 0.6 }, { w: 9, d: 9 })
    expect(out).toEqual({ w: 1.2, d: 0.6 })
  })

  it('reads through a custom footprintParams key map', () => {
    const def = { footprintParams: { w: 'diameter', d: 'diameter' } }
    const out = resolveFootprintDims(def, { diameter: 0.9 }, { w: 1, d: 1 })
    expect(out).toEqual({ w: 0.9, d: 0.9 })
  })

  it('accepts a numeric-string prop value (enum whose values are metre strings)', () => {
    const def = { footprintParams: { w: 'size', d: 'size' } }
    const out = resolveFootprintDims(def, { size: '0.45' }, { w: 0.38, d: 0.38 })
    expect(out).toEqual({ w: 0.45, d: 0.45 })
  })

  it('falls back per-axis when a prop is missing entirely', () => {
    const out = resolveFootprintDims({}, { width: 1.4 }, { w: 0.5, d: 0.7 })
    expect(out).toEqual({ w: 1.4, d: 0.7 })
  })

  it('a non-numeric string (e.g. dog-crate "S"/"M") falls back to the conservative default', () => {
    const def = { footprintParams: { w: 'size', d: 'size' } }
    const out = resolveFootprintDims(def, { size: 'M' }, { w: 0.9, d: 0.6 })
    expect(out).toEqual({ w: 0.9, d: 0.6 })
  })

  it('rejects zero and negative numbers, falling back to the default', () => {
    expect(resolveFootprintDims({}, { width: 0, depth: -1 }, { w: 1, d: 1 })).toEqual({
      w: 1,
      d: 1,
    })
  })

  it('rejects non-finite numbers (NaN / Infinity)', () => {
    const out = resolveFootprintDims(
      {},
      { width: Number.NaN, depth: Number.POSITIVE_INFINITY },
      {
        w: 1,
        d: 1,
      },
    )
    expect(out).toEqual({ w: 1, d: 1 })
  })

  it('rejects a blank/whitespace-only string prop', () => {
    const out = resolveFootprintDims({}, { width: '   ', depth: '' }, { w: 2, d: 3 })
    expect(out).toEqual({ w: 2, d: 3 })
  })

  it('rejects other value types (bool/object/null/undefined)', () => {
    const out = resolveFootprintDims(
      {},
      { width: true as unknown as number, depth: undefined },
      { w: 1.1, d: 1.2 },
    )
    expect(out).toEqual({ w: 1.1, d: 1.2 })
  })
})
