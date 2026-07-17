import { describe, expect, it } from 'vitest'
import { addPart, addPartGroup, type PartGroup, updatePart } from './editSpec'
import { flattenMember, groupedPartWorldPosition, ungroupPartGroup } from './groupTransform'

/** A spec with two boxes grouped into one transform group. */
function grouped() {
  let s = addPart(addPart({ sourceScale: 1, parts: [], meshOverrides: {} }, 'box'), 'box')
  const ids = s.parts.map((p) => p.id)
  s = updatePart(s, ids[0], { position: [0.5, 0.2, 0] })
  s = updatePart(s, ids[1], { position: [-0.5, 0.2, 0] })
  const { spec, groupId } = addPartGroup(s, ids)
  return { spec, groupId: groupId as string, ids }
}

describe('groupTransform', () => {
  it('grouped part world position = group transform ∘ part transform (translate)', () => {
    const group: PartGroup = { id: 'g', name: 'G', partIds: ['a'], position: [1, 0, 0.5] }
    const part = {
      id: 'a',
      kind: 'box' as const,
      position: [0.5, 0.2, 0] as [number, number, number],
      size: [0.4, 0.4, 0.4] as [number, number, number],
      color: '#fff',
    }
    expect(groupedPartWorldPosition(group, part)).toEqual([1.5, 0.2, 0.5])
  })

  it('grouped part world position honours a group Y-rotation', () => {
    const group: PartGroup = { id: 'g', name: 'G', partIds: ['a'], rotation: [0, 90, 0] }
    const part = {
      id: 'a',
      kind: 'box' as const,
      position: [0.5, 0, 0] as [number, number, number],
      size: [0.4, 0.4, 0.4] as [number, number, number],
      color: '#fff',
    }
    // +X rotated 90° about Y lands on −Z.
    const w = groupedPartWorldPosition(group, part)
    expect(w[0]).toBeCloseTo(0, 5)
    expect(w[1]).toBeCloseTo(0, 5)
    expect(w[2]).toBeCloseTo(-0.5, 5)
  })

  it('flattenMember with identity group transform is the part transform unchanged', () => {
    const group: PartGroup = { id: 'g', name: 'G', partIds: ['a'] }
    const part = {
      id: 'a',
      kind: 'box' as const,
      position: [0.5, 0.2, -0.1] as [number, number, number],
      size: [0.4, 0.4, 0.4] as [number, number, number],
      color: '#fff',
      rotation: [0, 30, 0] as [number, number, number],
    }
    const flat = flattenMember(group, part)
    expect(flat.position).toEqual([0.5, 0.2, -0.1])
    expect(flat.rotation![1]).toBeCloseTo(30, 4)
  })

  it('ungroup keeps every member at its exact world position (no jump)', () => {
    let { spec, groupId, ids } = grouped()
    // Move + rotate the group so a naive drop would make parts jump.
    spec = {
      ...spec,
      partGroups: spec.partGroups!.map((g) =>
        g.id === groupId ? { ...g, position: [1, 0, 0.3], rotation: [0, 45, 0] } : g,
      ),
    }
    // Expected world positions BEFORE ungroup.
    const group = spec.partGroups![0]
    const expected = ids.map((id) =>
      groupedPartWorldPosition(group, spec.parts.find((p) => p.id === id)!),
    )
    const after = ungroupPartGroup(spec, groupId)
    expect(after.partGroups).toBeUndefined()
    ids.forEach((id, i) => {
      const p = after.parts.find((pp) => pp.id === id)!
      p.position.forEach((v, k) => {
        expect(v).toBeCloseTo(expected[i][k], 4)
      })
    })
  })

  it('ungroup is a no-op for an unknown group id', () => {
    const { spec } = grouped()
    expect(ungroupPartGroup(spec, 'nope')).toBe(spec)
  })
})
