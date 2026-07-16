/**
 * Asset Studio Stage 9a — pure decompose core (`decomposeObject`). Builds a
 * synthetic three object (a "chair": seat + a 4-leg group) and asserts the
 * decompose produces the right part/group counts, preserves each mesh's world
 * position (a leg lands at the leg position), is invariant to the root's own
 * transform, emits REFERENCE parts in ref mode, and honours the instance cap.
 */

import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from 'three'
import { describe, expect, it } from 'vitest'
import { decomposeObject } from './decompose'

/** A seat board (loose) + a "legs" group of 4 corner legs. */
function buildChair(): Object3D {
  const root = new Group()
  root.name = 'chair'
  const seat = new Mesh(
    new BoxGeometry(0.5, 0.05, 0.5),
    new MeshStandardMaterial({ color: '#8a5a2b' }),
  )
  seat.name = 'seat'
  seat.position.set(0, 0.45, 0)
  root.add(seat)
  const legs = new Group()
  legs.name = 'legs'
  const corners: [number, number][] = [
    [0.2, 0.2],
    [-0.2, 0.2],
    [0.2, -0.2],
    [-0.2, -0.2],
  ]
  for (const [x, z] of corners) {
    const leg = new Mesh(
      new BoxGeometry(0.05, 0.4, 0.05),
      new MeshStandardMaterial({ color: '#333' }),
    )
    leg.position.set(x, 0.2, z)
    legs.add(leg)
  }
  root.add(legs)
  return root
}

describe('decomposeObject — procedural bake', () => {
  it('produces one part per mesh and a group per multi-mesh top-level child', () => {
    const res = decomposeObject(buildChair(), {})
    expect(res.parts).toHaveLength(5) // seat + 4 legs
    expect(res.groups).toHaveLength(1) // the "legs" group (seat stays loose)
    expect(res.groups[0].name).toBe('legs')
    expect(res.groups[0].partIds).toHaveLength(4)
    // Every part is a baked mesh part (inline geometry, no ref).
    for (const p of res.parts) {
      expect(p.kind).toBe('mesh')
      expect(p.geometry?.positions.length).toBeGreaterThan(0)
      expect(p.srcRef).toBeUndefined()
    }
    expect(res.triangles).toBeGreaterThan(0)
    expect(res.overBudget).toBe(false)
    expect(res.capped).toBe(false)
  })

  it('preserves each mesh world position — a leg lands at the leg corner', () => {
    const res = decomposeObject(buildChair(), {})
    const legGroup = res.groups[0]
    const legParts = res.parts.filter((p) => legGroup.partIds.includes(p.id))
    // A leg at [0.2, 0.2, 0.2] re-centres its geometry so position = the corner.
    const corner = legParts.find(
      (p) => Math.abs(p.position[0] - 0.2) < 1e-4 && Math.abs(p.position[2] - 0.2) < 1e-4,
    )
    expect(corner).toBeDefined()
    expect(corner?.position[1]).toBeCloseTo(0.2, 4)
    expect(corner?.size[1]).toBeCloseTo(0.4, 4)
    // The seat sits at its centre height.
    const seat = res.parts.find((p) => !legGroup.partIds.includes(p.id))
    expect(seat?.position[1]).toBeCloseTo(0.45, 4)
  })

  it('is invariant to the root object own transform', () => {
    const base = decomposeObject(buildChair(), {})
    const shifted = buildChair()
    shifted.position.set(3, 1, -2)
    shifted.rotation.set(0, Math.PI / 3, 0)
    const res = decomposeObject(shifted, {})
    // Positions are relative to the root, so the shift/rotation of the root itself
    // doesn't move the parts.
    const sortY = (a: { position: number[] }, b: { position: number[] }) =>
      a.position[1] - b.position[1] || a.position[0] - b.position[0]
    const b = [...base.parts].sort(sortY)
    const r = [...res.parts].sort(sortY)
    for (let i = 0; i < b.length; i++) {
      expect(r[i].position[0]).toBeCloseTo(b[i].position[0], 4)
      expect(r[i].position[1]).toBeCloseTo(b[i].position[1], 4)
      expect(r[i].position[2]).toBeCloseTo(b[i].position[2], 4)
    }
  })

  it('captures the mesh material colour', () => {
    const res = decomposeObject(buildChair(), {})
    const seat = res.parts.find((p) => p.position[1] > 0.4)
    expect(seat?.color.toLowerCase()).toBe('#8a5a2b')
  })
})

describe('decomposeObject — reference mode (GLB defs)', () => {
  it('emits srcRef parts (defId + distinct mesh paths) instead of baked arrays', () => {
    const res = decomposeObject(buildChair(), { ref: { defId: 'sofa-3seat' } })
    expect(res.parts).toHaveLength(5)
    const paths = new Set<string>()
    for (const p of res.parts) {
      expect(p.srcRef?.defId).toBe('sofa-3seat')
      expect(p.geometry).toBeUndefined()
      expect(p.srcRef).toBeDefined()
      if (p.srcRef) paths.add(p.srcRef.meshPath)
    }
    expect(paths.size).toBe(5) // one distinct index per mesh
  })
})

describe('decomposeObject — instanced cap', () => {
  function instancedRoot(count: number): Object3D {
    const root = new Group()
    const im = new InstancedMesh(new BoxGeometry(0.1, 0.1, 0.1), new MeshStandardMaterial(), count)
    im.name = 'slats'
    const m = new Matrix4()
    for (let i = 0; i < count; i++) {
      m.makeTranslation(i * 0.2, 0.05, 0)
      im.setMatrixAt(i, m)
    }
    root.add(im)
    return root
  }

  it('de-instances one-to-one under the cap', () => {
    const res = decomposeObject(instancedRoot(3), {})
    expect(res.parts).toHaveLength(3)
    expect(res.capped).toBe(false)
    // Instances land at their per-instance translations.
    const xs = res.parts.map((p) => p.position[0]).sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(0, 4)
    expect(xs[2]).toBeCloseTo(0.4, 4)
  })

  it('merges instances into one part beyond the cap', () => {
    const res = decomposeObject(instancedRoot(5), { instanceCap: 2 })
    expect(res.parts).toHaveLength(1)
    expect(res.capped).toBe(true)
    expect(res.parts[0].geometry?.positions.length).toBeGreaterThan(0)
  })
})

describe('decomposeObject — budget guard', () => {
  it('flags overBudget without failing', () => {
    const res = decomposeObject(buildChair(), { triBudget: 1 })
    expect(res.overBudget).toBe(true)
    expect(res.parts.length).toBeGreaterThan(0)
  })
})
