import { describe, expect, it } from 'vitest'
import type { DecomposeResult } from './decompose'
import {
  allDecomposePartIds,
  decomposeEntries,
  insertDecomposedSubset,
  subsetDecompose,
} from './decomposeSelect'
import { type AssetEditSpec, createEmptySpec, type PartGroup, type ShapePart } from './editSpec'

/** A box part at a given X with a fixed footprint. */
function part(id: string, x: number, name?: string): ShapePart {
  return { id, kind: 'box', name, position: [x, 0.2, 0], size: [0.1, 0.4, 0.1], color: '#777' }
}

/** A decompose result: a "seat" group (2 meshes) + 4 loose leg parts. */
function chairResult(): DecomposeResult {
  const parts: ShapePart[] = [
    part('seat-a', 0, 'seat top'),
    part('seat-b', 0.05, 'seat rim'),
    part('leg1', -0.4),
    part('leg2', 0.4),
    part('leg3', -0.4),
    part('leg4', 0.4),
  ]
  const groups: PartGroup[] = [{ id: 'seat', name: 'Seat', partIds: ['seat-a', 'seat-b'] }]
  return { parts, groups, triangles: 100, overBudget: false, capped: false }
}

describe('decomposeEntries (Stage 9b part picker)', () => {
  it('emits a group row followed by its indented member rows, then loose parts', () => {
    const entries = decomposeEntries(chairResult())
    // Group "select-all" row governs both members.
    expect(entries[0]).toEqual({
      id: 'seat',
      kind: 'group',
      name: 'Seat',
      partIds: ['seat-a', 'seat-b'],
      member: false,
    })
    // Two indented member rows.
    expect(entries[1]).toMatchObject({ id: 'seat-a', kind: 'part', member: true })
    expect(entries[2]).toMatchObject({ id: 'seat-b', kind: 'part', member: true })
    // Then the 4 loose legs (not members).
    const loose = entries.slice(3)
    expect(loose.map((e) => e.id)).toEqual(['leg1', 'leg2', 'leg3', 'leg4'])
    expect(loose.every((e) => e.kind === 'part' && !e.member && e.partIds.length === 1)).toBe(true)
  })

  it('allDecomposePartIds is every part (the default-all selection)', () => {
    expect(allDecomposePartIds(chairResult())).toEqual([
      'seat-a',
      'seat-b',
      'leg1',
      'leg2',
      'leg3',
      'leg4',
    ])
  })
})

describe('subsetDecompose (grab the legs)', () => {
  it('selecting only the 4 legs yields 4 parts and no group', () => {
    const sel = new Set(['leg1', 'leg2', 'leg3', 'leg4'])
    const { parts, groups } = subsetDecompose(chairResult(), sel)
    expect(groups).toHaveLength(0)
    expect(parts.map((p) => p.id)).toEqual(['leg1', 'leg2', 'leg3', 'leg4'])
  })

  it('a FULLY-selected group survives; a partial one is dropped to loose parts', () => {
    // Both seat members → the group survives.
    const full = subsetDecompose(chairResult(), new Set(['seat-a', 'seat-b']))
    expect(full.groups.map((g) => g.id)).toEqual(['seat'])
    expect(full.parts.map((p) => p.id)).toEqual(['seat-a', 'seat-b'])
    // Only one member → the group drops, the member is a loose part.
    const partial = subsetDecompose(chairResult(), new Set(['seat-a']))
    expect(partial.groups).toHaveLength(0)
    expect(partial.parts.map((p) => p.id)).toEqual(['seat-a'])
  })

  it('an empty selection yields nothing', () => {
    const { parts } = subsetDecompose(chairResult(), new Set())
    expect(parts).toHaveLength(0)
  })
})

describe('insertDecomposedSubset (alongside, fresh ids, +X offset)', () => {
  /** A spec that already holds a slab "top" box at the origin (width 1). */
  function specWithTop(): AssetEditSpec {
    return {
      ...createEmptySpec(),
      parts: [
        { id: 'top', kind: 'box', position: [0, 0.4, 0], size: [1, 0.05, 0.6], color: '#333' },
      ],
    }
  }

  it('inserts the leg subset ALONGSIDE the existing top with fresh ids', () => {
    const { parts } = subsetDecompose(chairResult(), new Set(['leg1', 'leg2', 'leg3', 'leg4']))
    const { spec, partIds, groupIds } = insertDecomposedSubset(specWithTop(), parts, [])
    // 1 existing top + 4 legs = 5 parts.
    expect(spec.parts).toHaveLength(5)
    expect(groupIds).toHaveLength(0)
    expect(partIds).toHaveLength(4)
    // Fresh ids — the decompose leg ids never leak into the live spec.
    for (const id of ['leg1', 'leg2', 'leg3', 'leg4']) {
      expect(spec.parts.some((p) => p.id === id)).toBe(false)
    }
    // The inserted legs are shifted clear of the existing top (max X 0.5) + gap.
    const inserted = spec.parts.filter((p) => partIds.includes(p.id))
    const minX = Math.min(...inserted.map((p) => p.position[0] - p.size[0] / 2))
    expect(minX).toBeGreaterThanOrEqual(0.5)
  })

  it('re-mints group ids and remaps member ids when a group is inserted', () => {
    const { parts, groups } = subsetDecompose(chairResult(), new Set(['seat-a', 'seat-b']))
    const { spec, groupIds } = insertDecomposedSubset(specWithTop(), parts, groups)
    expect(groupIds).toHaveLength(1)
    expect(groupIds[0]).not.toBe('seat')
    const g = spec.partGroups?.find((gr) => gr.id === groupIds[0])
    expect(g?.name).toBe('Seat')
    // The group's members point at the freshly-cloned part ids (all present).
    expect(g?.partIds.every((id) => spec.parts.some((p) => p.id === id))).toBe(true)
    expect(g?.partIds).toHaveLength(2)
  })

  it('inserting into an empty spec uses no offset', () => {
    const { parts } = subsetDecompose(chairResult(), new Set(['leg1']))
    const { spec, partIds } = insertDecomposedSubset(createEmptySpec(), parts, [])
    const inserted = spec.parts.find((p) => p.id === partIds[0])
    expect(inserted?.position[0]).toBe(-0.4)
  })
})
