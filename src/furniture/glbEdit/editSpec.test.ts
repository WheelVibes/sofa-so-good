import { describe, expect, it } from 'vitest'
import {
  addPart,
  createEmptySpec,
  isBuildable,
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
})
