import { describe, expect, it } from 'vitest'
import {
  mirrorItem,
  mirrorPosition,
  mirrorRotation,
  mirrorSelection,
  selectionCentroid,
} from './mirrorSelection'
import type { FurnitureItem } from './types'

const item = (id: string, x: number, z: number, rotation = 0): FurnitureItem => ({
  id,
  defId: 'sofa-3seat',
  position: [x, z],
  rotation,
  props: {},
})

describe('mirrorPosition', () => {
  it('reflects X about the centre, keeps Z (axis x)', () => {
    expect(mirrorPosition([1, 2], 'x', 3)).toEqual([5, 2])
  })

  it('reflects Z about the centre, keeps X (axis z)', () => {
    expect(mirrorPosition([1, 2], 'z', 3)).toEqual([1, 4])
  })
})

describe('mirrorRotation', () => {
  it('negates the heading for axis x', () => {
    expect(mirrorRotation(0.5, 'x')).toBeCloseTo(-0.5)
    expect(mirrorRotation(0, 'x')).toBeCloseTo(0)
  })

  it('reflects the heading through pi for axis z', () => {
    expect(mirrorRotation(0, 'z')).toBeCloseTo(Math.PI)
    expect(mirrorRotation(Math.PI / 2, 'z')).toBeCloseTo(Math.PI / 2)
  })

  it('a facing-+Z item ends up facing -Z when mirrored across z, and vice versa', () => {
    // rotation 0 -> forward (sin0, cos0) = (0, 1) i.e. +Z. Mirrored across z
    // should now face -Z, i.e. forward (0, -1) -> rotation = pi.
    const r = mirrorRotation(0, 'z')
    expect(Math.sin(r)).toBeCloseTo(0)
    expect(Math.cos(r)).toBeCloseTo(-1)
  })
})

describe('mirrorItem', () => {
  it('axis x: reflects position, negates rotation, toggles flipX (not flipZ)', () => {
    const m = mirrorItem({ ...item('a', 1, 2, 0.5), flipX: false, flipZ: true }, 'x', 3)
    expect(m.position).toEqual([5, 2])
    expect(m.rotation).toBeCloseTo(-0.5)
    expect(m.flipX).toBe(true)
    expect(m.flipZ).toBe(true) // untouched
  })

  it('axis z: reflects position, flips rotation through pi, toggles flipZ (not flipX)', () => {
    const m = mirrorItem({ ...item('a', 1, 2, 0.5), flipX: true, flipZ: false }, 'z', 3)
    expect(m.position).toEqual([1, 4])
    expect(m.rotation).toBeCloseTo(Math.PI - 0.5)
    expect(m.flipZ).toBe(true)
    expect(m.flipX).toBe(true) // untouched
  })

  it('is its own inverse on both axes (mirroring twice restores the original)', () => {
    const a = item('a', 1.25, 2.5, 0.8)
    for (const axis of ['x', 'z'] as const) {
      const back = mirrorItem(mirrorItem(a, axis, 3), axis, 3)
      expect(back.position[0]).toBeCloseTo(a.position[0])
      expect(back.position[1]).toBeCloseTo(a.position[1])
      expect(back.rotation).toBeCloseTo(a.rotation)
      expect(!!back.flipX).toBe(!!a.flipX)
      expect(!!back.flipZ).toBe(!!a.flipZ)
    }
  })

  it('preserves props and other fields untouched', () => {
    const a = { ...item('a', 1, 2, 0.5), props: { tint: '#ff0000' }, locked: false }
    const m = mirrorItem(a, 'x', 0)
    expect(m.props).toEqual({ tint: '#ff0000' })
    expect(m.id).toBe('a')
    expect(m.defId).toBe('sofa-3seat')
  })
})

describe('selectionCentroid', () => {
  it('is the mean position along the given axis', () => {
    const items = [item('a', 0, 0), item('b', 4, 2), item('c', 2, 10)]
    expect(selectionCentroid(items, 'x')).toBeCloseTo(2)
    expect(selectionCentroid(items, 'z')).toBeCloseTo(4)
  })

  it('is 0 for an empty selection', () => {
    expect(selectionCentroid([], 'x')).toBe(0)
  })
})

describe('mirrorSelection', () => {
  it('mirrors a rigid group across its own centroid, preserving spacing', () => {
    // Two items 2m apart on X, centroid at x=1.
    const items = [item('a', 0, 0), item('b', 2, 0)]
    const mirrored = mirrorSelection(items, 'x')
    expect(mirrored.map((i) => i.position[0])).toEqual([2, 0])
    // Spacing between the pair is preserved (still 2m apart, swapped sides).
    expect(Math.abs(mirrored[0].position[0] - mirrored[1].position[0])).toBeCloseTo(2)
  })

  it('mirrors an asymmetric layout (different distances from centroid) correctly', () => {
    const items = [item('a', 0, 0), item('b', 1, 0), item('c', 6, 0)]
    // centroid x = (0+1+6)/3 = 7/3
    const mirrored = mirrorSelection(items, 'x')
    const cx = 7 / 3
    for (const [i, orig] of items.entries()) {
      expect(mirrored[i].position[0]).toBeCloseTo(2 * cx - orig.position[0])
    }
  })

  it('returns items in the same order with the same ids, none mutated', () => {
    const items = [item('a', 0, 0), item('b', 2, 0)]
    const mirrored = mirrorSelection(items, 'z')
    expect(mirrored.map((i) => i.id)).toEqual(['a', 'b'])
    expect(items[0].position).toEqual([0, 0]) // original untouched
  })

  it('handles a single-item selection (mirrors about its own position -> no-op position, flips rotation/flag)', () => {
    const items = [item('a', 5, 5, 0.3)]
    const mirrored = mirrorSelection(items, 'x')
    expect(mirrored[0].position).toEqual([5, 5])
    expect(mirrored[0].rotation).toBeCloseTo(-0.3)
    expect(mirrored[0].flipX).toBe(true)
  })
})
