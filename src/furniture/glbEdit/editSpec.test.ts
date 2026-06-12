import { describe, expect, it } from 'vitest'
import {
  type AssetEditSpec,
  addPart,
  createEmptySpec,
  duplicatePart,
  isBuildable,
  mirrorPart,
  removePart,
  setMeshOverride,
  updatePart,
} from './editSpec'

describe('AssetEditSpec', () => {
  it('starts empty and not buildable', () => {
    const s = createEmptySpec()
    expect(s.parts).toEqual([])
    expect(s.sourceScale).toBe(1)
    expect(isBuildable(s)).toBe(false)
  })

  it('a source GLB or any part makes it buildable', () => {
    expect(isBuildable({ ...createEmptySpec(), sourceAssetId: 'a1' })).toBe(true)
    expect(isBuildable(addPart(createEmptySpec(), 'box'))).toBe(true)
  })

  it('adds, updates and removes parts immutably', () => {
    const s0 = createEmptySpec()
    const s1 = addPart(s0, 'cylinder')
    expect(s0.parts).toHaveLength(0) // original untouched
    expect(s1.parts).toHaveLength(1)
    const id = s1.parts[0].id
    const s2 = updatePart(s1, id, { color: '#ff0000' })
    expect(s2.parts[0].color).toBe('#ff0000')
    expect(s2.parts[0].id).toBe(id) // id preserved
    const s3 = removePart(s2, id)
    expect(s3.parts).toHaveLength(0)
  })

  it('staggers each new part along +X so they do not overlap at the origin', () => {
    let s = createEmptySpec()
    s = addPart(s, 'box')
    s = addPart(s, 'box')
    s = addPart(s, 'box')
    const xs = s.parts.map((p) => p.position[0])
    expect(xs).toEqual([0, 0.5, 1])
  })
})

describe('setMeshOverride', () => {
  it('records a recolour / hide keyed by mesh name', () => {
    const s = setMeshOverride(createEmptySpec(), 'Seat', { color: '#ff0000' })
    expect(s.meshOverrides.Seat).toEqual({ color: '#ff0000' })
  })

  it('merges patches for the same mesh', () => {
    let s = setMeshOverride(createEmptySpec(), 'Legs', { color: '#222' })
    s = setMeshOverride(s, 'Legs', { hidden: true })
    expect(s.meshOverrides.Legs).toEqual({ color: '#222', hidden: true })
  })

  it('drops an override that becomes empty (back to original look)', () => {
    let s = setMeshOverride(createEmptySpec(), 'Seat', { hidden: true })
    s = setMeshOverride(s, 'Seat', { hidden: false })
    expect(s.meshOverrides.Seat).toBeUndefined()
  })

  it('clearing a colour with no hide removes the override', () => {
    let s = setMeshOverride(createEmptySpec(), 'Seat', { color: '#abc' })
    s = setMeshOverride(s, 'Seat', { color: undefined })
    expect(s.meshOverrides.Seat).toBeUndefined()
  })

  it('duplicatePart clones transform + material with a fresh id and deep-copied arrays', () => {
    let s = addPart(createEmptySpec(), 'box')
    const orig = s.parts[0]!
    s = updatePart(s, orig.id, { metalness: 0.8, rotation: [0, 45, 0] })
    const before = s.parts.find((p) => p.id === orig.id)!
    s = duplicatePart(s, orig.id)
    expect(s.parts).toHaveLength(2)
    const copy = s.parts[1]!
    expect(copy.id).not.toBe(before.id)
    expect(copy.metalness).toBe(0.8)
    expect(copy.rotation).toEqual([0, 45, 0])
    // Deep-copied: mutating the clone's tuples doesn't touch the original.
    copy.rotation![1] = 90
    copy.size[0] = 999
    expect(before.rotation).toEqual([0, 45, 0])
    expect(before.size[0]).not.toBe(999)
    // Offset along X so the copy is visible.
    expect(copy.position[0]).toBeCloseTo(before.position[0] + 0.2)
  })

  it('duplicatePart is a no-op for an unknown id', () => {
    const s = addPart(createEmptySpec(), 'box')
    expect(duplicatePart(s, 'nope')).toBe(s)
  })

  it('mirrorPart clones across the X centre with Y/Z rotation negated', () => {
    let s = addPart(createEmptySpec(), 'box')
    const id = s.parts[0]!.id
    s = updatePart(s, id, { position: [0.4, 0.2, 0.1], rotation: [10, 30, 45] })
    s = mirrorPart(s, id)
    expect(s.parts).toHaveLength(2)
    const m = s.parts[1]!
    expect(m.id).not.toBe(id)
    expect(m.position).toEqual([-0.4, 0.2, 0.1])
    expect(m.rotation).toEqual([10, -30, -45])
    // Deep-copied tuples (mutating the mirror doesn't touch the source).
    m.position[1] = 9
    expect(s.parts[0]!.position[1]).toBe(0.2)
  })

  it('mirrorPart is a no-op for an unknown id', () => {
    const s = addPart(createEmptySpec(), 'box')
    expect(mirrorPart(s, 'nope')).toBe(s)
  })
})

describe('per-part texture finish (GE3c) — schema + back-compat', () => {
  it('updatePart sets and clears a finish', () => {
    let s = addPart(createEmptySpec(), 'box')
    const id = s.parts[0]!.id
    s = updatePart(s, id, { finish: 'mat:floor-wood-oak' })
    expect(s.parts[0]!.finish).toBe('mat:floor-wood-oak')
    s = updatePart(s, id, { finish: undefined })
    expect(s.parts[0]!.finish).toBeUndefined()
  })

  it('a new part has no finish (solid colour default unchanged)', () => {
    const s = addPart(createEmptySpec(), 'cylinder')
    expect(s.parts[0]!.finish).toBeUndefined()
  })

  it('duplicate and mirror carry the finish onto the copy', () => {
    let s = addPart(createEmptySpec(), 'box')
    const id = s.parts[0]!.id
    s = updatePart(s, id, { finish: 'mat:floor-tile-marble' })
    s = duplicatePart(s, id)
    expect(s.parts[1]!.finish).toBe('mat:floor-tile-marble')
    s = mirrorPart(s, id)
    expect(s.parts[2]!.finish).toBe('mat:floor-tile-marble')
  })

  it('a finish survives a JSON round trip (save → reload)', () => {
    let s = addPart(createEmptySpec(), 'box')
    s = updatePart(s, s.parts[0]!.id, { finish: 'mat:ambientcg:Wood048:1k' })
    const revived = JSON.parse(JSON.stringify(s)) as AssetEditSpec
    expect(revived.parts[0]!.finish).toBe('mat:ambientcg:Wood048:1k')
  })

  it('a pre-GE3c spec (no finish anywhere) round-trips unchanged and stays buildable', () => {
    const legacy: AssetEditSpec = {
      sourceScale: 1,
      parts: [
        { id: 'a', kind: 'box', position: [0, 0.2, 0], size: [0.4, 0.4, 0.4], color: '#b08d57' },
      ],
      meshOverrides: {},
    }
    const revived = JSON.parse(JSON.stringify(legacy)) as AssetEditSpec
    expect(revived).toEqual(legacy)
    expect(revived.parts[0]!.finish).toBeUndefined()
    expect(isBuildable(revived)).toBe(true)
    // Editing a legacy part never invents a finish.
    const next = updatePart(revived, 'a', { color: '#112233' })
    expect(next.parts[0]!.finish).toBeUndefined()
  })
})
