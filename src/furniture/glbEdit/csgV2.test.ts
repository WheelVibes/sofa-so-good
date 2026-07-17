/**
 * CSG v2 (Stage 1b) — non-destructive combine groups + the shared evaluator.
 * Pure spec-level tests (group recording, hole semantics, multi-operand, bake,
 * prune) plus geometry-level tests for `foldCsg` / `combineGroupToMeshPart`
 * (union/subtract/intersect vertex sanity + bounding boxes; a hole inside a
 * solid decreases volume; a disjoint intersect/hole is degenerate). Runs in the
 * default node env so the worker pool falls back to the main-thread fold.
 */

import { type BufferGeometry, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { partGeometry } from './buildObject'
import { bakedPartGeometry } from './csgCombine'
import { type CsgOperand, combineGroupToMeshPart, evaluateAllGroups, foldCsg } from './csgEval'
import {
  type AssetEditSpec,
  addCombineGroup,
  bakeCombineGroup,
  type CombineOp,
  combinedPartIds,
  combineGroups,
  createEmptySpec,
  groupForPart,
  pruneCombineGroups,
  removeCombineGroup,
  removePart,
  type ShapePart,
  setPartRole,
} from './editSpec'

function box(
  id: string,
  position: [number, number, number],
  size: [number, number, number] = [1, 1, 1],
  extra: Partial<ShapePart> = {},
): ShapePart {
  return { id, kind: 'box', position, size, color: '#112233', ...extra }
}

function cyl(
  id: string,
  position: [number, number, number],
  size: [number, number, number],
  extra: Partial<ShapePart> = {},
): ShapePart {
  return { id, kind: 'cylinder', position, size, color: '#445566', ...extra }
}

function specWith(...parts: ShapePart[]): AssetEditSpec {
  return { ...createEmptySpec(), parts }
}

/** Signed mesh volume via the divergence theorem (Σ v0·(v1×v2)/6). A watertight
 *  CSG result's |volume| tracks how much solid remains. */
function meshVolume(geo: BufferGeometry): number {
  const pos = geo.getAttribute('position')
  const index = geo.getIndex()
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  let vol = 0
  const tri = (i0: number, i1: number, i2: number) => {
    a.fromBufferAttribute(pos, i0)
    b.fromBufferAttribute(pos, i1)
    c.fromBufferAttribute(pos, i2)
    vol += a.dot(b.clone().cross(c)) / 6
  }
  if (index) {
    for (let i = 0; i < index.count; i += 3)
      tri(index.getX(i), index.getX(i + 1), index.getX(i + 2))
  } else {
    for (let i = 0; i < pos.count; i += 3) tri(i, i + 1, i + 2)
  }
  return Math.abs(vol)
}

// -------------------------------------------------------------------------
// Spec-level: combine group recording (non-destructive)
// -------------------------------------------------------------------------
describe('addCombineGroup', () => {
  it('records a group over ≥2 free parts without removing them (non-destructive)', () => {
    const spec = specWith(box('a', [0, 0, 0]), box('b', [0.5, 0, 0]))
    const { spec: next, groupId } = addCombineGroup(spec, ['a', 'b'], 'union')
    expect(groupId).toBeTruthy()
    // Operands stay editable.
    expect(next.parts.map((p) => p.id)).toEqual(['a', 'b'])
    expect(combineGroups(next)).toHaveLength(1)
    expect(combineGroups(next)[0]).toMatchObject({ partIds: ['a', 'b'], op: 'union' })
  })

  it('preserves selection order in partIds (subtract base is first)', () => {
    const spec = specWith(box('a', [0, 0, 0]), box('b', [0.5, 0, 0]), box('c', [1, 0, 0]))
    const { spec: next } = addCombineGroup(spec, ['c', 'a', 'b'], 'subtract')
    expect(combineGroups(next)[0].partIds).toEqual(['c', 'a', 'b'])
  })

  it('rejects <2 parts, unknown ids, and already-grouped parts', () => {
    const base = specWith(box('a', [0, 0, 0]), box('b', [0.5, 0, 0]), box('c', [1, 0, 0]))
    expect(addCombineGroup(base, ['a'], 'union').groupId).toBeNull()
    expect(addCombineGroup(base, ['a', 'ghost'], 'union').groupId).toBeNull()
    const { spec: grouped } = addCombineGroup(base, ['a', 'b'], 'union')
    // 'a' is now consumed → can't join a second group.
    expect(addCombineGroup(grouped, ['a', 'c'], 'union').groupId).toBeNull()
  })

  it('deduplicates repeated ids in the selection', () => {
    const spec = specWith(box('a', [0, 0, 0]), box('b', [0.5, 0, 0]))
    const { spec: next } = addCombineGroup(spec, ['a', 'a', 'b'], 'union')
    expect(combineGroups(next)[0].partIds).toEqual(['a', 'b'])
  })
})

describe('combinedPartIds / groupForPart', () => {
  it('reports every consumed part + its owning group', () => {
    const spec = specWith(box('a', [0, 0, 0]), box('b', [0.5, 0, 0]), box('c', [2, 0, 0]))
    const { spec: next, groupId } = addCombineGroup(spec, ['a', 'b'], 'union')
    expect([...combinedPartIds(next)].sort()).toEqual(['a', 'b'])
    expect(groupForPart(next, 'a')?.id).toBe(groupId)
    expect(groupForPart(next, 'c')).toBeNull()
  })
})

describe('setPartRole (hole semantics)', () => {
  it('marks a part as a hole and clears back to solid (drops the field)', () => {
    const spec = specWith(box('a', [0, 0, 0]))
    const holed = setPartRole(spec, 'a', 'hole')
    expect(holed.parts[0].role).toBe('hole')
    const back = setPartRole(holed, 'a', 'solid')
    expect(back.parts[0].role).toBeUndefined()
  })
})

describe('removeCombineGroup (ungroup) + removePart pruning', () => {
  it('ungroup dissolves the group but keeps every member part untouched', () => {
    const spec = specWith(box('a', [0, 0, 0]), box('b', [0.5, 0, 0]))
    const { spec: grouped, groupId } = addCombineGroup(spec, ['a', 'b'], 'union')
    const ungrouped = removeCombineGroup(grouped, groupId as string)
    expect(combineGroups(ungrouped)).toHaveLength(0)
    expect(ungrouped.combineGroups).toBeUndefined() // field stripped when empty
    expect(ungrouped.parts.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('removing a member below 2 dissolves its group', () => {
    const spec = specWith(box('a', [0, 0, 0]), box('b', [0.5, 0, 0]))
    const { spec: grouped } = addCombineGroup(spec, ['a', 'b'], 'union')
    const pruned = removePart(grouped, 'b')
    expect(pruned.parts.map((p) => p.id)).toEqual(['a'])
    expect(combineGroups(pruned)).toHaveLength(0)
  })

  it('removing one of ≥3 members keeps the group (still ≥2)', () => {
    const spec = specWith(box('a', [0, 0, 0]), box('b', [0.5, 0, 0]), box('c', [1, 0, 0]))
    const { spec: grouped } = addCombineGroup(spec, ['a', 'b', 'c'], 'union')
    const pruned = removePart(grouped, 'c')
    expect(combineGroups(pruned)[0].partIds).toEqual(['a', 'b'])
  })

  it('pruneCombineGroups is a no-op when nothing dangles', () => {
    const spec = specWith(box('a', [0, 0, 0]), box('b', [0.5, 0, 0]))
    const { spec: grouped } = addCombineGroup(spec, ['a', 'b'], 'union')
    expect(pruneCombineGroups(grouped)).toBe(grouped)
  })
})

describe('bakeCombineGroup', () => {
  it('replaces the group + members with the baked mesh in the first member’s slot', () => {
    const spec = specWith(
      box('x', [-1, 0, 0]),
      box('a', [0, 0, 0]),
      box('b', [0.5, 0, 0]),
      box('y', [2, 0, 0]),
    )
    const { spec: grouped, groupId } = addCombineGroup(spec, ['a', 'b'], 'union')
    const mesh: ShapePart = {
      ...box('m', [0, 0, 0]),
      kind: 'mesh',
      geometry: { positions: [], normals: [] },
    }
    const baked = bakeCombineGroup(grouped, groupId as string, mesh)
    // 'a' + 'b' collapse into 'm' at a's slot; x/y keep their order.
    expect(baked.parts.map((p) => p.id)).toEqual(['x', 'm', 'y'])
    expect(combineGroups(baked)).toHaveLength(0)
  })
})

// -------------------------------------------------------------------------
// Geometry-level: the shared evaluator (foldCsg)
// -------------------------------------------------------------------------
function operand(part: ShapePart, materialIndex = 0): CsgOperand {
  return { geometry: bakedPartGeometry(part), materialIndex, role: part.role ?? 'solid' }
}

describe('foldCsg (multi-operand booleans)', () => {
  it('union of two overlapping unit boxes spans both (bbox 1.5 on X)', async () => {
    const ops = [operand(box('a', [0, 0.5, 0])), operand(box('b', [0.5, 0.5, 0]), 1)]
    const { geometry } = await foldCsg(ops, 'union')
    geometry.computeBoundingBox()
    const s = geometry.boundingBox!.getSize(new Vector3())
    expect(s.x).toBeCloseTo(1.5, 3)
    expect(s.y).toBeCloseTo(1, 3)
    ops.forEach((o) => {
      o.geometry.dispose()
    })
    geometry.dispose()
  })

  it('union of THREE boxes in a row spans all three (multi-operand fold)', async () => {
    const ops = [
      operand(box('a', [0, 0.5, 0])),
      operand(box('b', [0.8, 0.5, 0])),
      operand(box('c', [1.6, 0.5, 0])),
    ]
    const { geometry } = await foldCsg(ops, 'union')
    geometry.computeBoundingBox()
    const s = geometry.boundingBox!.getSize(new Vector3())
    expect(s.x).toBeCloseTo(2.6, 2) // spans -0.5 … 2.1
    ops.forEach((o) => {
      o.geometry.dispose()
    })
    geometry.dispose()
  })

  it('intersect keeps only the overlap (bbox 0.5 on X)', async () => {
    const ops = [operand(box('a', [0, 0.5, 0])), operand(box('b', [0.5, 0.5, 0]))]
    const { geometry } = await foldCsg(ops, 'intersect')
    geometry.computeBoundingBox()
    const s = geometry.boundingBox!.getSize(new Vector3())
    expect(s.x).toBeCloseTo(0.5, 3)
    ops.forEach((o) => {
      o.geometry.dispose()
    })
    geometry.dispose()
  })

  it('subtract with no roles = first minus the rest (un-carved half remains)', async () => {
    const ops = [operand(box('a', [0, 0.5, 0])), operand(box('b', [0.5, 0.5, 0]))]
    const { geometry } = await foldCsg(ops, 'subtract')
    geometry.computeBoundingBox()
    const bb = geometry.boundingBox!
    expect(bb.getSize(new Vector3()).x).toBeCloseTo(0.5, 3)
    expect(bb.getCenter(new Vector3()).x).toBeCloseTo(-0.25, 3)
    ops.forEach((o) => {
      o.geometry.dispose()
    })
    geometry.dispose()
  })

  it('subtract carves the HOLE-role operand out of the solid (roles win over order)', async () => {
    // Order puts the hole first, but role — not order — decides the base.
    const holeOp = operand(box('b', [0.5, 0.5, 0], [1, 1, 1], { role: 'hole' }))
    const solidOp = operand(box('a', [0, 0.5, 0]))
    const { geometry } = await foldCsg([holeOp, solidOp], 'subtract')
    geometry.computeBoundingBox()
    // Solid 'a' minus hole 'b' → the un-overlapped half of 'a' at x≈-0.25.
    expect(geometry.boundingBox!.getCenter(new Vector3()).x).toBeCloseTo(-0.25, 3)
    holeOp.geometry.dispose()
    solidOp.geometry.dispose()
    geometry.dispose()
  })

  it('a hole entirely inside a solid decreases its volume but keeps the bbox', async () => {
    // A thin cylinder fully inside a 1m box → a cavity: same bbox, less volume.
    const solid = operand(box('a', [0, 0.5, 0], [1, 1, 1]))
    const hole = operand(cyl('h', [0, 0.5, 0], [0.3, 0.6, 0.3], { role: 'hole' }), 1)
    const boxGeo = bakedPartGeometry(box('a', [0, 0.5, 0], [1, 1, 1]))
    const boxVol = meshVolume(boxGeo)
    const { geometry } = await foldCsg([solid, hole], 'subtract')
    geometry.computeBoundingBox()
    const s = geometry.boundingBox!.getSize(new Vector3())
    expect(s.x).toBeCloseTo(1, 3)
    expect(s.y).toBeCloseTo(1, 3)
    expect(meshVolume(geometry)).toBeLessThan(boxVol)
    boxGeo.dispose()
    solid.geometry.dispose()
    hole.geometry.dispose()
    geometry.dispose()
  })

  it('preserves per-operand material indices in the result groups', async () => {
    const ops = [operand(box('a', [0, 0.5, 0]), 0), operand(box('b', [0.5, 0.5, 0]), 1)]
    const { groups } = await foldCsg(ops, 'union')
    const indices = new Set(groups.map((g) => g.materialIndex))
    // Both source materials should survive on their own faces.
    expect(indices.has(0)).toBe(true)
    expect(indices.has(1)).toBe(true)
    ops.forEach((o) => {
      o.geometry.dispose()
    })
  })

  it('a disjoint intersect yields an empty result geometry (degeneracy caught downstream)', async () => {
    const ops = [operand(box('a', [0, 0.5, 0])), operand(box('b', [5, 0.5, 0]))]
    const { geometry } = await foldCsg(ops, 'intersect')
    const pos = geometry.getAttribute('position')
    expect(pos ? pos.count : 0).toBe(0)
    geometry.dispose()
    ops.forEach((o) => {
      o.geometry.dispose()
    })
  })
})

// -------------------------------------------------------------------------
// Orchestration: group → mesh part (main-thread fallback in node)
// -------------------------------------------------------------------------
describe('combineGroupToMeshPart', () => {
  it('evaluates a subtract group into a re-openable mesh part (id result:<groupId>)', async () => {
    const spec = specWith(
      box('a', [0, 0.5, 0], [1, 1, 1]),
      cyl('h', [0, 0.5, 0], [0.3, 1.4, 0.3], { role: 'hole' }),
    )
    const { spec: grouped, groupId } = addCombineGroup(spec, ['a', 'h'], 'subtract')
    const group = combineGroups(grouped)[0]
    const part = await combineGroupToMeshPart(grouped, group)
    expect(part.kind).toBe('mesh')
    expect(part.id).toBe(`result:${groupId}`)
    expect(part.geometry!.positions.length).toBeGreaterThan(0)
    // The through-hole carved the box → less solid than the box alone.
    const rebuilt = partGeometry(part)
    const boxGeo = bakedPartGeometry(box('a', [0, 0.5, 0], [1, 1, 1]))
    expect(meshVolume(rebuilt)).toBeLessThan(meshVolume(boxGeo))
    rebuilt.dispose()
    boxGeo.dispose()
  })

  it('bake mode mints a fresh id (persistable, not the transient result id)', async () => {
    const spec = specWith(box('a', [0, 0.5, 0]), box('b', [0.5, 0.5, 0]))
    const { spec: grouped } = addCombineGroup(spec, ['a', 'b'], 'union')
    const group = combineGroups(grouped)[0]
    const part = await combineGroupToMeshPart(grouped, group, { bake: true })
    expect(part.id).not.toBe(`result:${group.id}`)
    expect(part.kind).toBe('mesh')
  })

  it('evaluateAllGroups omits a degenerate group and keeps the valid one', async () => {
    const spec = specWith(
      box('a', [0, 0.5, 0]),
      box('b', [0.5, 0.5, 0]),
      box('c', [10, 0.5, 0]),
      box('d', [20, 0.5, 0]),
    )
    const g1 = addCombineGroup(spec, ['a', 'b'], 'union')
    const g2 = addCombineGroup(g1.spec, ['c', 'd'], 'intersect') // disjoint → degenerate
    const results = await evaluateAllGroups(g2.spec)
    expect(results.has(g1.groupId as string)).toBe(true)
    expect(results.has(g2.groupId as string)).toBe(false)
  })

  it('op fold semantics reach the mesh part', async () => {
    for (const op of ['union', 'intersect', 'subtract'] as CombineOp[]) {
      const spec = specWith(box('a', [0, 0.5, 0]), box('b', [0.5, 0.5, 0]))
      const { spec: grouped } = addCombineGroup(spec, ['a', 'b'], op)
      const part = await combineGroupToMeshPart(grouped, combineGroups(grouped)[0])
      expect(part.geometry!.positions.length).toBeGreaterThan(0)
    }
  })
})
