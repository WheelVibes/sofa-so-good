import { describe, expect, it } from 'vitest'
import {
  type AssetEditSpec,
  addPart,
  addPartGroup,
  createEmptySpec,
  defaultPart,
  duplicatePart,
  duplicatePartGroup,
  isBuildable,
  mirrorPart,
  mirrorPartGroup,
  partGroupForPart,
  partGroupMemberIds,
  partGroups,
  removePart,
  removePartGroupRaw,
  renamePartGroup,
  setMeshOverride,
  updatePart,
  updatePartGroupTransform,
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

  it('Stage 1a kinds seed their parametric defaults (profile/outline/preset/bevel)', () => {
    const lathe = defaultPart('lathe')
    expect(lathe.kind).toBe('lathe')
    expect(Array.isArray(lathe.profile)).toBe(true)
    expect(lathe.profile!.length).toBeGreaterThan(1)
    expect(lathe.segments).toBe(32)

    const extrude = defaultPart('extrude')
    expect(Array.isArray(extrude.outline)).toBe(true)
    // Bevel ON by default for extrudes.
    expect(extrude.bevel).toBeGreaterThan(0)

    const sweep = defaultPart('sweep')
    expect(sweep.sweepProfile).toBe('circle')
    expect(sweep.sweepPath).toBe('ring')

    // Box/wedge default sharp (bevel absent → byte-identical geometry).
    expect(defaultPart('box').bevel).toBeUndefined()
    expect(defaultPart('wedge').bevel).toBeUndefined()
  })

  it('duplicate/mirror deep-copy a lathe profile (no shared tuple array)', () => {
    let s = addPart(createEmptySpec(), 'lathe')
    const id = s.parts[0]!.id
    s = duplicatePart(s, id)
    const src = s.parts[0]!
    const copy = s.parts[1]!
    expect(copy.profile).toEqual(src.profile)
    expect(copy.profile).not.toBe(src.profile) // distinct array
    expect(copy.profile![0]).not.toBe(src.profile![0]) // distinct points
    // Mutating the copy's profile never leaks into the source.
    copy.profile![0][0] = 999
    expect(src.profile![0][0]).not.toBe(999)
  })

  it('an extrude outline survives a JSON round trip', () => {
    const s = addPart(createEmptySpec(), 'extrude')
    const revived = JSON.parse(JSON.stringify(s)) as AssetEditSpec
    expect(revived.parts[0]!.outline).toEqual(s.parts[0]!.outline)
    expect(revived.parts[0]!.bevel).toBe(s.parts[0]!.bevel)
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

describe('transform groups (Stage 3a)', () => {
  function twoBoxes() {
    const s = addPart(addPart(createEmptySpec(), 'box'), 'box')
    return { s, ids: s.parts.map((p) => p.id) }
  }

  it('addPartGroup records a named group over ≥1 distinct existing parts', () => {
    const { s, ids } = twoBoxes()
    const { spec, groupId } = addPartGroup(s, ids)
    expect(groupId).toBeTruthy()
    expect(partGroups(spec)).toHaveLength(1)
    expect(partGroups(spec)[0]).toMatchObject({ name: 'Group 1', partIds: ids })
    expect(partGroupForPart(spec, ids[0])?.id).toBe(groupId)
    expect([...partGroupMemberIds(spec)]).toEqual(ids)
  })

  it('addPartGroup rejects a part already in another transform group', () => {
    const { s, ids } = twoBoxes()
    const first = addPartGroup(s, [ids[0]]).spec
    // ids[0] is already grouped — a new group over it is rejected.
    const { groupId } = addPartGroup(first, ids)
    expect(groupId).toBeNull()
  })

  it('rename / transform update are immutable + clear identity transforms', () => {
    const { s, ids } = twoBoxes()
    const { spec, groupId } = addPartGroup(s, ids)
    const named = renamePartGroup(spec, groupId!, 'Legs')
    expect(partGroups(named)[0].name).toBe('Legs')
    const moved = updatePartGroupTransform(named, groupId!, { position: [0.5, 0, 0] })
    expect(partGroups(moved)[0].position).toEqual([0.5, 0, 0])
    // Setting the transform back to zero clears the field (identity → absent).
    const cleared = updatePartGroupTransform(moved, groupId!, { position: [0, 0, 0] })
    expect(partGroups(cleared)[0].position).toBeUndefined()
  })

  it('duplicatePartGroup deep-copies members into a new offset group', () => {
    const { s, ids } = twoBoxes()
    const { spec, groupId } = addPartGroup(s, ids)
    const withXf = updatePartGroupTransform(spec, groupId!, { position: [1, 0, 0] })
    const { spec: dup, groupId: newId } = duplicatePartGroup(withXf, groupId!)
    expect(newId).toBeTruthy()
    expect(newId).not.toBe(groupId)
    expect(dup.parts).toHaveLength(4) // members deep-copied
    expect(partGroups(dup)).toHaveLength(2)
    const copy = partGroups(dup).find((g) => g.id === newId)!
    // Copy is offset in +X from the original transform and shares NO part ids.
    expect(copy.position![0]).toBeGreaterThan(1)
    expect(copy.partIds.some((id) => ids.includes(id))).toBe(false)
  })

  it('mirrorPartGroup mirrors the group transform + its members across X=0', () => {
    const { s, ids } = twoBoxes()
    const positioned = updatePart(s, ids[0], { position: [0.5, 0.2, 0] })
    const { spec, groupId } = addPartGroup(positioned, ids)
    const withXf = updatePartGroupTransform(spec, groupId!, { position: [1, 0, 0] })
    const { spec: mir, groupId: newId } = mirrorPartGroup(withXf, groupId!)
    const mgroup = partGroups(mir).find((g) => g.id === newId)!
    expect(mgroup.position![0]).toBe(-1)
    const mMember = mir.parts.find((p) => p.id === mgroup.partIds[0])!
    expect(mMember.position[0]).toBe(-0.5)
  })

  it('removePart prunes a member from its transform group (empty group dropped)', () => {
    const { s, ids } = twoBoxes()
    const { spec } = addPartGroup(s, [ids[0]])
    const after = removePart(spec, ids[0])
    expect(partGroups(after)).toHaveLength(0)
    expect(after.partGroups).toBeUndefined()
  })

  it('removePartGroupRaw drops the group without touching member transforms', () => {
    const { s, ids } = twoBoxes()
    const { spec, groupId } = addPartGroup(s, ids)
    const after = removePartGroupRaw(spec, groupId!)
    expect(partGroups(after)).toHaveLength(0)
    expect(after.parts).toEqual(spec.parts) // members untouched
  })
})
