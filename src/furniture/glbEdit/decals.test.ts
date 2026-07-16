import { BoxGeometry, Euler, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { decalGeometry, decalOrientation, decalSizeVec } from './decals'
import {
  addCombineGroup,
  addDecal,
  addPart,
  bakeCombineGroup,
  createEmptySpec,
  type Decal,
  decals,
  decalsForPart,
  duplicatePart,
  mirrorPart,
  pruneDecals,
  removeDecal,
  removePart,
  type ShapePart,
  updateDecal,
  updatePart,
} from './editSpec'
import { parseAssetSpec, serializeAssetSpec } from './specPersist'

function specWithBox() {
  const s = addPart(createEmptySpec(), 'box')
  return { spec: s, partId: s.parts[0].id }
}

const baseDecal = (partId: string): Omit<Decal, 'id'> => ({
  partId,
  position: [0, 0.2, 0],
  normal: [0, 1, 0],
  size: 0.03,
  kind: 'button',
})

describe('decal spec ops', () => {
  it('addDecal appends a decal with a fresh id onto an existing part', () => {
    const { spec, partId } = specWithBox()
    const { spec: next, decalId } = addDecal(spec, baseDecal(partId))
    expect(decalId).toBeTruthy()
    expect(decals(next)).toHaveLength(1)
    expect(next.decals?.[0].id).toBe(decalId)
    expect(next.decals?.[0].partId).toBe(partId)
    // Immutable — the source spec is untouched.
    expect(decals(spec)).toHaveLength(0)
  })

  it('addDecal rejects an unknown part (decalId null, spec unchanged)', () => {
    const { spec } = specWithBox()
    const { spec: next, decalId } = addDecal(spec, baseDecal('nope'))
    expect(decalId).toBeNull()
    expect(next).toBe(spec)
  })

  it('removeDecal drops the field once the last decal is gone', () => {
    const { spec, partId } = specWithBox()
    const { spec: withDecal, decalId } = addDecal(spec, baseDecal(partId))
    const gone = removeDecal(withDecal, decalId!)
    expect(gone.decals).toBeUndefined()
  })

  it('updateDecal patches size/colour but preserves id + partId', () => {
    const { spec, partId } = specWithBox()
    const { spec: withDecal, decalId } = addDecal(spec, baseDecal(partId))
    const next = updateDecal(withDecal, decalId!, { size: 0.05, color: '#ff0000' })
    expect(next.decals?.[0].size).toBe(0.05)
    expect(next.decals?.[0].color).toBe('#ff0000')
    expect(next.decals?.[0].id).toBe(decalId)
    expect(next.decals?.[0].partId).toBe(partId)
  })

  it('decalsForPart filters to the target part', () => {
    const base = specWithBox()
    const partId = base.partId
    let spec = addPart(base.spec, 'box')
    const otherId = spec.parts[1].id
    spec = addDecal(spec, baseDecal(partId)).spec
    spec = addDecal(spec, baseDecal(otherId)).spec
    expect(decalsForPart(spec, partId)).toHaveLength(1)
    expect(decalsForPart(spec, otherId)).toHaveLength(1)
  })

  it('removePart prunes decals projected onto the removed part', () => {
    const { spec, partId } = specWithBox()
    const withDecal = addDecal(spec, baseDecal(partId)).spec
    expect(decals(withDecal)).toHaveLength(1)
    const removed = removePart(withDecal, partId)
    expect(removed.decals).toBeUndefined()
    expect(removed.parts).toHaveLength(0)
  })

  it('pruneDecals is a no-op when every decal still has its part', () => {
    const { spec, partId } = specWithBox()
    const withDecal = addDecal(spec, baseDecal(partId)).spec
    expect(pruneDecals(withDecal)).toBe(withDecal)
  })
})

describe('decals follow a part resize (updatePart)', () => {
  it('scales a decal position proportionally per axis, keeping it on the surface plane', () => {
    // A box default 0.4×0.4×0.4; a decal on its top face (local y = +0.2) near the
    // +X edge. Its normal is +Y (the top face).
    const { spec, partId } = specWithBox()
    const withDecal = addDecal(spec, {
      partId,
      position: [0.1, 0.2, 0],
      normal: [0, 1, 0],
      size: 0.03,
      kind: 'button',
    }).spec
    // Double the X size (0.4 → 0.8); the top face is still at y = half-height 0.2.
    const resized = updatePart(withDecal, partId, { size: [0.8, 0.4, 0.4] })
    const d = resized.decals?.[0]
    expect(d?.position[0]).toBeCloseTo(0.2, 6) // scaled with the doubled X
    expect(d?.position[1]).toBeCloseTo(0.2, 6) // unchanged Y — still the top plane
    expect(d?.position[2]).toBeCloseTo(0, 6)
    expect(d?.normal).toEqual([0, 1, 0]) // normal never changes on resize
  })

  it('leaves decals untouched when the patch does not change size', () => {
    const { spec, partId } = specWithBox()
    const withDecal = addDecal(spec, baseDecal(partId)).spec
    const moved = updatePart(withDecal, partId, { position: [1, 0.2, 0] })
    expect(moved.decals?.[0].position).toEqual([0, 0.2, 0])
  })
})

describe('bakeCombineGroup prunes orphaned decals', () => {
  it('drops decals of the baked-away member parts', () => {
    let spec = addPart(createEmptySpec(), 'box')
    const a = spec.parts[0].id
    spec = addPart(spec, 'box')
    const b = spec.parts[1].id
    spec = addDecal(spec, baseDecal(a)).spec
    const { spec: grouped, groupId } = addCombineGroup(spec, [a, b], 'union')
    expect(groupId).toBeTruthy()
    const meshPart: ShapePart = {
      id: 'baked-mesh',
      kind: 'mesh',
      position: [0, 0, 0],
      size: [1, 1, 1],
      color: '#888',
      geometry: { positions: [], normals: [] },
    }
    const baked = bakeCombineGroup(grouped, groupId!, meshPart)
    // The members a + b are gone; the decal that was on `a` must not orphan.
    expect(baked.parts.map((p) => p.id)).toEqual(['baked-mesh'])
    expect(baked.decals).toBeUndefined()
  })
})

describe('duplicate / mirror clone a part decals', () => {
  it('duplicatePart copies the source decals onto the new part (straight copy)', () => {
    const { spec, partId } = specWithBox()
    const withDecal = addDecal(spec, baseDecal(partId)).spec
    const dup = duplicatePart(withDecal, partId)
    const newPart = dup.parts[1]
    expect(dup.parts).toHaveLength(2)
    expect(decals(dup)).toHaveLength(2)
    const cloned = decalsForPart(dup, newPart.id)
    expect(cloned).toHaveLength(1)
    // Fresh id, retargeted partId, same local pose as a straight copy.
    expect(cloned[0].id).not.toBe(withDecal.decals?.[0].id)
    expect(cloned[0].position).toEqual([0, 0.2, 0])
    expect(cloned[0].normal).toEqual([0, 1, 0])
  })

  it('mirrorPart mirrors the cloned decal local position + normal across X', () => {
    const { spec, partId } = specWithBox()
    // A decal on the +X face (local x = +0.2, normal +X).
    const withDecal = addDecal(spec, {
      partId,
      position: [0.2, 0.2, 0.05],
      normal: [1, 0, 0],
      size: 0.03,
      kind: 'patch',
    }).spec
    const mirrored = mirrorPart(withDecal, partId)
    const newPart = mirrored.parts[1]
    const cloned = decalsForPart(mirrored, newPart.id)
    expect(cloned).toHaveLength(1)
    // X negated (position + normal); Y/Z untouched.
    expect(cloned[0].position).toEqual([-0.2, 0.2, 0.05])
    expect(cloned[0].normal).toEqual([-1, 0, 0])
  })
})

describe('decal orientation + size', () => {
  it('decalOrientation aims the projector +Z along the surface normal', () => {
    const e = decalOrientation([0, 1, 0])
    const aimed = new Vector3(0, 0, 1).applyEuler(e)
    expect(aimed.x).toBeCloseTo(0, 5)
    expect(aimed.y).toBeCloseTo(1, 5)
    expect(aimed.z).toBeCloseTo(0, 5)
  })

  it('a zero normal falls back to +Y (never a degenerate projector)', () => {
    const e = decalOrientation([0, 0, 0])
    expect(e).toBeInstanceOf(Euler)
    const aimed = new Vector3(0, 0, 1).applyEuler(e)
    expect(aimed.y).toBeCloseTo(1, 5)
  })

  it('line kinds get a long thin footprint; buttons stay square', () => {
    const stitch = decalSizeVec('stitch', 0.12)
    expect(stitch.x).toBeGreaterThan(stitch.y)
    const button = decalSizeVec('button', 0.03)
    expect(button.x).toBeCloseTo(button.y, 6)
  })
})

describe('decalGeometry', () => {
  it('projects real geometry (position + normal + uv) onto a target surface', () => {
    const target = new BoxGeometry(0.5, 0.15, 0.5)
    const decal: Decal = {
      id: 'd1',
      partId: 'p1',
      position: [0, 0.075, 0], // on the top face (box half-height 0.075)
      normal: [0, 1, 0],
      size: 0.06,
      kind: 'patch',
    }
    const geo = decalGeometry(target, decal)
    expect(geo.getAttribute('position').count).toBeGreaterThan(0)
    expect(geo.getAttribute('uv')).toBeTruthy()
    expect(geo.getAttribute('normal')).toBeTruthy()
    // The decal sits just ABOVE the top face (stand-off along +Y), never below it.
    const pos = geo.getAttribute('position')
    for (let i = 0; i < pos.count; i++) expect(pos.getY(i)).toBeGreaterThan(0.075 - 1e-4)
    // Every vertex is finite.
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i))).toBe(true)
      expect(Number.isFinite(pos.getZ(i))).toBe(true)
    }
  })

  it('does not mutate the input target geometry', () => {
    const target = new BoxGeometry(0.5, 0.15, 0.5)
    const before = target.getAttribute('position').count
    decalGeometry(target, {
      id: 'd',
      partId: 'p',
      position: [0, 0.075, 0],
      normal: [0, 1, 0],
      size: 0.05,
      kind: 'button',
    })
    expect(target.getAttribute('position').count).toBe(before)
  })
})

describe('decal persistence (envelope v7)', () => {
  it('round-trips decals through serialize/parse', () => {
    const { spec, partId } = specWithBox()
    const withDecal = addDecal(spec, { ...baseDecal(partId), color: '#334455', rotation: 30 }).spec
    const parsed = parseAssetSpec(serializeAssetSpec(withDecal))
    expect(parsed).not.toBeNull()
    expect(parsed?.decals).toHaveLength(1)
    expect(parsed?.decals?.[0].kind).toBe('button')
    expect(parsed?.decals?.[0].color).toBe('#334455')
    expect(parsed?.decals?.[0].rotation).toBe(30)
  })

  it('rejects a malformed decal (bad kind) as un-restorable', () => {
    const bad = JSON.stringify({
      kind: 'asset',
      v: 7,
      payload: {
        sourceScale: 1,
        parts: [],
        meshOverrides: {},
        decals: [
          { id: 'x', partId: 'p', position: [0, 0, 0], normal: [0, 1, 0], size: 1, kind: 'bogus' },
        ],
      },
    })
    expect(parseAssetSpec(bad)).toBeNull()
  })
})
