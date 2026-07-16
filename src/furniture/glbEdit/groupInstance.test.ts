import { describe, expect, it } from 'vitest'
import { type AssetEditSpec, createEmptySpec, type PartGroup, type ShapePart } from './editSpec'
import { groupInstanceable, MIN_INSTANCE_MEMBERS } from './groupInstance'

/** A leg-like box part at a given position/rotation but otherwise identical. */
function leg(id: string, x: number, z: number, rotation?: [number, number, number]): ShapePart {
  return {
    id,
    kind: 'cylinder',
    position: [x, 0.36, z],
    size: [0.06, 0.72, 0.06],
    color: '#333333',
    rotation,
  }
}

/** A spec with one transform group over the given parts. */
function specWith(parts: ShapePart[], group: PartGroup): AssetEditSpec {
  return { ...createEmptySpec(), parts, partGroups: [group] }
}

describe('groupInstanceable (Stage 6f array instancing detector)', () => {
  it('instances ≥4 geometry+material-identical members (only transforms differ)', () => {
    const parts = [
      leg('a', -0.5, -0.3),
      leg('b', 0.5, -0.3),
      leg('c', -0.5, 0.3),
      leg('d', 0.5, 0.3),
    ]
    const group: PartGroup = { id: 'g', name: 'Array', partIds: ['a', 'b', 'c', 'd'] }
    const inst = groupInstanceable(specWith(parts, group), group)
    expect(inst).not.toBeNull()
    expect(inst?.matrices.length).toBe(4)
    expect(inst?.memberIds).toEqual(['a', 'b', 'c', 'd'])
    // The representative part carries the shared geometry+material.
    expect(inst?.part.id).toBe('a')
    // Matrices encode the distinct positions (col-major translation is [12],[13],[14]).
    const tx = inst?.matrices.map((m) => m.elements[12])
    expect(tx).toEqual([-0.5, 0.5, -0.5, 0.5])
  })

  it('preserves per-instance rotation in the matrix', () => {
    const parts = [
      leg('a', -0.5, -0.3, [0, 0, 0]),
      leg('b', 0.5, -0.3, [0, 90, 0]),
      leg('c', -0.5, 0.3, [0, 180, 0]),
      leg('d', 0.5, 0.3, [0, 270, 0]),
    ]
    const group: PartGroup = { id: 'g', name: 'Array', partIds: ['a', 'b', 'c', 'd'] }
    const inst = groupInstanceable(specWith(parts, group), group)
    // Rotation is NOT part of the instance key (only geometry+material), so the
    // group still instances; the rotations live in the matrices.
    expect(inst).not.toBeNull()
    // A 90° Y rotation makes m[0] (cosθ) ≈ 0 and m[2] (sinθ) ≈ 1.
    expect(inst?.matrices[1].elements[0]).toBeCloseTo(0, 5)
  })

  it('does NOT instance below the member threshold', () => {
    const parts = [leg('a', -0.5, 0), leg('b', 0.5, 0), leg('c', 0, 0.5)]
    expect(parts.length).toBeLessThan(MIN_INSTANCE_MEMBERS)
    const group: PartGroup = { id: 'g', name: 'Trio', partIds: ['a', 'b', 'c'] }
    expect(groupInstanceable(specWith(parts, group), group)).toBeNull()
  })

  it('does NOT instance when members differ in geometry (size)', () => {
    const parts = [
      leg('a', -0.5, -0.3),
      leg('b', 0.5, -0.3),
      leg('c', -0.5, 0.3),
      leg('d', 0.5, 0.3),
    ]
    parts[2] = { ...parts[2], size: [0.06, 0.9, 0.06] } // taller leg
    const group: PartGroup = { id: 'g', name: 'Array', partIds: ['a', 'b', 'c', 'd'] }
    expect(groupInstanceable(specWith(parts, group), group)).toBeNull()
  })

  it('does NOT instance when members differ in material (colour)', () => {
    const parts = [
      leg('a', -0.5, -0.3),
      leg('b', 0.5, -0.3),
      leg('c', -0.5, 0.3),
      leg('d', 0.5, 0.3),
    ]
    parts[1] = { ...parts[1], color: '#ff0000' }
    const group: PartGroup = { id: 'g', name: 'Array', partIds: ['a', 'b', 'c', 'd'] }
    expect(groupInstanceable(specWith(parts, group), group)).toBeNull()
  })

  it('does NOT instance a member consumed by a combine group', () => {
    const parts = [
      leg('a', -0.5, -0.3),
      leg('b', 0.5, -0.3),
      leg('c', -0.5, 0.3),
      leg('d', 0.5, 0.3),
    ]
    const group: PartGroup = { id: 'g', name: 'Array', partIds: ['a', 'b', 'c', 'd'] }
    const spec: AssetEditSpec = {
      ...specWith(parts, group),
      combineGroups: [{ id: 'cg', name: 'Combine', op: 'union', partIds: ['a', 'b'] }],
    }
    expect(groupInstanceable(spec, group)).toBeNull()
  })

  it('handles a large (20-member) array — the scenario case', () => {
    const parts: ShapePart[] = []
    for (let i = 0; i < 20; i++) parts.push(leg(`leg-${i}`, i * 0.1, 0))
    const group: PartGroup = { id: 'g', name: 'Array', partIds: parts.map((p) => p.id) }
    const inst = groupInstanceable(specWith(parts, group), group)
    expect(inst?.matrices.length).toBe(20)
  })
})
