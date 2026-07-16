import { describe, expect, it } from 'vitest'
import type { AssetEditSpec, ShapePart } from './editSpec'
import { hasSplittableGroups, splitSpecByGroups } from './setSplit'

function box(
  id: string,
  position: [number, number, number],
  size: [number, number, number],
): ShapePart {
  return { id, kind: 'box', position, size, color: '#888888' }
}

/** A table group (top + 2 legs) at origin + a bookshelf group offset on +X. */
function twoGroupSpec(): AssetEditSpec {
  return {
    sourceScale: 1,
    meshOverrides: {},
    parts: [
      box('top', [0, 0.74, 0], [1.2, 0.03, 0.8]),
      box('legA', [-0.5, 0.37, 0], [0.05, 0.74, 0.05]),
      box('legB', [0.5, 0.37, 0], [0.05, 0.74, 0.05]),
      box('shelf', [0, 0.9, 0], [0.8, 0.02, 0.3]),
      box('side', [-0.4, 0.9, 0], [0.02, 1.8, 0.3]),
    ],
    partGroups: [
      { id: 'g-table', name: 'Table', partIds: ['top', 'legA', 'legB'] },
      // Bookshelf sits 2 m to the right via a group transform.
      { id: 'g-shelf', name: 'Bookshelf', partIds: ['shelf', 'side'], position: [2, 0, 0] },
    ],
  }
}

describe('splitSpecByGroups (Stage 3d sets)', () => {
  it('emits one asset per top-level group, named after the group', () => {
    const assets = splitSpecByGroups(twoGroupSpec())
    expect(assets).toHaveLength(2)
    expect(assets.map((a) => a.name)).toEqual(['Table', 'Bookshelf'])
  })

  it('carries only that group members into each sub-spec', () => {
    const [table, shelf] = splitSpecByGroups(twoGroupSpec())
    expect(table.spec.parts.map((p) => p.id).sort()).toEqual(['legA', 'legB', 'top'])
    expect(shelf.spec.parts.map((p) => p.id).sort()).toEqual(['shelf', 'side'])
    // Each sub-spec is a clean standalone spec (no source, no groups).
    expect(table.spec.sourceScale).toBe(1)
    expect(table.spec.partGroups).toBeUndefined()
  })

  it('flattens the group transform into members so the piece keeps its pose', () => {
    const [, shelf] = splitSpecByGroups(twoGroupSpec())
    // The bookshelf group had a +2m X offset — its parts must be re-posed by it.
    const shelfPart = shelf.spec.parts.find((p) => p.id === 'shelf')!
    expect(shelfPart.position[0]).toBeCloseTo(2, 5)
    const sidePart = shelf.spec.parts.find((p) => p.id === 'side')!
    expect(sidePart.position[0]).toBeCloseTo(1.6, 5)
  })

  it('suffixes duplicate group names so each piece is a distinct asset', () => {
    const spec: AssetEditSpec = {
      sourceScale: 1,
      meshOverrides: {},
      parts: [
        box('a', [0, 0.5, 0], [0.4, 1, 0.4]),
        box('b', [1, 0.5, 0], [0.4, 1, 0.4]),
        box('c', [2, 0.5, 0], [0.4, 1, 0.4]),
      ],
      partGroups: [
        { id: 'g1', name: 'Cabinet', partIds: ['a'] },
        { id: 'g2', name: 'Cabinet', partIds: ['b'] },
        { id: 'g3', name: 'Cabinet', partIds: ['c'] },
      ],
    }
    expect(splitSpecByGroups(spec).map((a) => a.name)).toEqual([
      'Cabinet',
      'Cabinet 2',
      'Cabinet 3',
    ])
  })

  it('includes a combine group only when fully inside the split group', () => {
    const spec = twoGroupSpec()
    spec.combineGroups = [
      { id: 'c1', name: 'Combine 1', partIds: ['top', 'legA'], op: 'union' }, // inside Table
      { id: 'c2', name: 'Combine 2', partIds: ['top', 'shelf'], op: 'union' }, // spans groups
    ]
    const [table] = splitSpecByGroups(spec)
    expect(table.spec.combineGroups).toHaveLength(1)
    expect(table.spec.combineGroups?.[0].id).toBe('c1')
  })

  it('returns [] for a spec with no groups', () => {
    const spec: AssetEditSpec = {
      sourceScale: 1,
      meshOverrides: {},
      parts: [box('a', [0, 0, 0], [1, 1, 1])],
    }
    expect(splitSpecByGroups(spec)).toEqual([])
    expect(hasSplittableGroups(spec)).toBe(false)
  })

  it('hasSplittableGroups is true with ≥1 group', () => {
    expect(hasSplittableGroups(twoGroupSpec())).toBe(true)
  })
})
