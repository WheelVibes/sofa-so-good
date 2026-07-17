import { describe, expect, it } from 'vitest'
import { alignParts, distributeParts, partWorldExtent, selectionBounds } from './arrange'
import type { AssetEditSpec, ShapePart } from './editSpec'

function box(
  id: string,
  position: [number, number, number],
  size: [number, number, number],
  rotation?: [number, number, number],
): ShapePart {
  return { id, kind: 'box', position, size, color: '#888888', rotation }
}

function spec(parts: ShapePart[]): AssetEditSpec {
  return { sourceScale: 1, meshOverrides: {}, parts }
}

describe('partWorldExtent', () => {
  it('is the size for an axis-aligned box', () => {
    expect(partWorldExtent(box('a', [0, 0, 0], [1, 2, 3]))).toEqual([1, 2, 3])
  })

  it('swaps X/Z under a 90° Y rotation', () => {
    const ext = partWorldExtent(box('a', [0, 0, 0], [1, 2, 3], [0, 90, 0]))
    expect(ext[0]).toBeCloseTo(3, 5)
    expect(ext[1]).toBeCloseTo(2, 5)
    expect(ext[2]).toBeCloseTo(1, 5)
  })

  it('remaps a lathe/sweep diameter onto X and Z', () => {
    const lathe: ShapePart = {
      id: 'l',
      kind: 'lathe',
      position: [0, 0, 0],
      size: [0.2, 0.5, 0.9],
      color: '#888',
    }
    expect(partWorldExtent(lathe)).toEqual([0.2, 0.5, 0.2])
  })
})

describe('alignParts', () => {
  it('aligns centres on X', () => {
    const s = spec([
      box('a', [0, 0, 0], [0.4, 0.4, 0.4]),
      box('b', [1, 0, 0], [0.4, 0.4, 0.4]),
      box('c', [2, 0, 0], [0.4, 0.4, 0.4]),
    ])
    const out = alignParts(s, ['a', 'b', 'c'], 'x', 'center')
    const xs = out.parts.map((p) => p.position[0])
    // Centre of overall bounds = (0 + 2) / 2 = 1.
    expect(xs).toEqual([1, 1, 1])
  })

  it('aligns min faces on X (accounting for size)', () => {
    const s = spec([box('a', [0, 0, 0], [0.4, 0.4, 0.4]), box('b', [1, 0, 0], [1.0, 0.4, 0.4])])
    const out = alignParts(s, ['a', 'b'], 'x', 'min')
    const bounds = out.parts.map((p) => p.position[0] - partWorldExtent(p)[0] / 2)
    expect(bounds[0]).toBeCloseTo(bounds[1], 6)
  })

  it('no-ops for fewer than 2 ids', () => {
    const s = spec([box('a', [0, 0, 0], [0.4, 0.4, 0.4])])
    expect(alignParts(s, ['a'], 'x', 'center')).toBe(s)
  })
})

describe('distributeParts', () => {
  it('leaves equal gaps between adjacent boxes on Z', () => {
    const s = spec([
      box('a', [0, 0, 0], [0.4, 0.4, 0.4]),
      box('b', [0, 0, 0.5], [0.4, 0.4, 0.4]),
      box('c', [0, 0, 3], [0.4, 0.4, 0.4]),
    ])
    const out = distributeParts(s, ['a', 'b', 'c'], 'z')
    const sorted = out.parts.map((p) => p).sort((x, y) => x.position[2] - y.position[2])
    const g1 = sorted[1].position[2] - sorted[0].position[2]
    const g2 = sorted[2].position[2] - sorted[1].position[2]
    expect(g1).toBeCloseTo(g2, 6)
  })

  it('keeps the outermost parts fixed', () => {
    const s = spec([
      box('a', [0, 0, 0], [0.4, 0.4, 0.4]),
      box('b', [0, 0, 0.5], [0.4, 0.4, 0.4]),
      box('c', [0, 0, 3], [0.4, 0.4, 0.4]),
    ])
    const out = distributeParts(s, ['a', 'b', 'c'], 'z')
    const byId = new Map(out.parts.map((p) => [p.id, p]))
    expect(byId.get('a')!.position[2]).toBeCloseTo(0, 6)
    expect(byId.get('c')!.position[2]).toBeCloseTo(3, 6)
  })

  it('no-ops for fewer than 3 ids', () => {
    const s = spec([box('a', [0, 0, 0], [0.4, 0.4, 0.4]), box('b', [0, 0, 1], [0.4, 0.4, 0.4])])
    expect(distributeParts(s, ['a', 'b'], 'z')).toBe(s)
  })
})

describe('selectionBounds', () => {
  it('unions the parts into one AABB', () => {
    const b = selectionBounds([box('a', [0, 0, 0], [1, 1, 1]), box('b', [2, 0, 0], [1, 1, 1])])
    expect(b).not.toBeNull()
    expect(b!.size[0]).toBeCloseTo(3, 6) // -0.5 .. 2.5
    expect(b!.center[0]).toBeCloseTo(1, 6)
  })

  it('is null for an empty selection', () => {
    expect(selectionBounds([])).toBeNull()
  })
})
