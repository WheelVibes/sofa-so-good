import { describe, expect, it } from 'vitest'
import {
  COMPONENT_FRAGMENT_MAX_BYTES,
  type ComponentFragment,
  captureGroupFragment,
  componentFragmentBytes,
  componentFragmentFits,
  dropUnresolvableComponentParts,
  fragmentSrcRefDefIds,
  insertComponentFragment,
  parseComponentFragment,
  placeComponentFragmentOnFace,
  serializeComponentFragment,
} from './componentFragment'
import {
  type AssetEditSpec,
  createEmptySpec,
  type PartGroup,
  partGroupForPart,
  type ShapePart,
} from './editSpec'

/** A leg-like box part. */
function leg(id: string, x: number): ShapePart {
  return {
    id,
    kind: 'box',
    name: `Leg ${id}`,
    position: [x, 0.2, 0],
    size: [0.05, 0.4, 0.05],
    color: '#5a4632',
  }
}

/** A GLB-decompose reference mesh part (no geometry, carries a srcRef). */
function refPart(id: string, defId: string, meshPath: string): ShapePart {
  return {
    id,
    kind: 'mesh',
    position: [0, 0.2, 0],
    size: [0.1, 0.4, 0.1],
    color: '#888888',
    srcRef: { defId, meshPath },
  }
}

/** A spec with one transform group over the given parts. */
function specWith(parts: ShapePart[], group: PartGroup): AssetEditSpec {
  return { ...createEmptySpec(), parts, partGroups: [group] }
}

describe('captureGroupFragment (Stage 9b)', () => {
  it('captures a group’s member parts verbatim (ids + srcRefs preserved)', () => {
    const parts = [leg('a', -0.4), refPart('b', 'sofa-def', '3'), leg('c', 0.4)]
    const group: PartGroup = { id: 'g1', name: 'Legs', partIds: ['a', 'b', 'c'] }
    const frag = captureGroupFragment(specWith(parts, group), 'g1')
    expect(frag).not.toBeNull()
    expect(frag?.parts.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    // srcRef kept verbatim.
    expect(frag?.parts[1].srcRef).toEqual({ defId: 'sofa-def', meshPath: '3' })
    // A deep copy — mutating the fragment must not touch the source spec.
    frag!.parts[0].position[0] = 99
    expect(parts[0].position[0]).toBe(-0.4)
  })

  it('returns null for an unknown group id', () => {
    const parts = [leg('a', 0)]
    const group: PartGroup = { id: 'g1', name: 'Legs', partIds: ['a'] }
    expect(captureGroupFragment(specWith(parts, group), 'nope')).toBeNull()
  })
})

describe('component fragment envelope round-trip (kind "component", v1)', () => {
  it('serialises to the shared envelope and parses back equal', () => {
    const frag: ComponentFragment = { parts: [leg('a', -0.4), refPart('b', 'd', '2')] }
    const json = serializeComponentFragment(frag)
    // Envelope shape { kind, v, payload }.
    const raw = JSON.parse(json)
    expect(raw.kind).toBe('component')
    expect(raw.v).toBe(1)
    const back = parseComponentFragment(json)
    expect(back).toEqual(frag)
  })

  it('rejects a wrong-kind / malformed / empty blob (null)', () => {
    expect(parseComponentFragment(null)).toBeNull()
    expect(parseComponentFragment('not json')).toBeNull()
    expect(parseComponentFragment(JSON.stringify({ kind: 'asset', v: 1, payload: {} }))).toBeNull()
    // Empty parts array is not a usable component.
    expect(
      parseComponentFragment(JSON.stringify({ kind: 'component', v: 1, payload: { parts: [] } })),
    ).toBeNull()
    // Unknown/future version.
    expect(
      parseComponentFragment(
        JSON.stringify({ kind: 'component', v: 99, payload: { parts: [leg('a', 0)] } }),
      ),
    ).toBeNull()
  })

  it('fragmentSrcRefDefIds lists the distinct referenced defs', () => {
    const frag: ComponentFragment = {
      parts: [refPart('a', 'sofa', '0'), refPart('b', 'sofa', '1'), refPart('c', 'chair', '0')],
    }
    expect(fragmentSrcRefDefIds(frag).sort()).toEqual(['chair', 'sofa'])
  })
})

describe('component fragment size gate (256 KB)', () => {
  it('a srcRef / primitive cluster fits', () => {
    const frag: ComponentFragment = { parts: [leg('a', 0), refPart('b', 'd', '0')] }
    expect(componentFragmentBytes(frag)).toBeLessThan(COMPONENT_FRAGMENT_MAX_BYTES)
    expect(componentFragmentFits(frag)).toBe(true)
  })

  it('a heavy baked-mesh member (inlined triangles) blows the cap', () => {
    const bigGeo = Array.from({ length: 70_000 }, (_, i) => i * 0.0001)
    const heavy: ShapePart = {
      id: 'm',
      kind: 'mesh',
      position: [0, 0, 0],
      size: [1, 1, 1],
      color: '#777777',
      geometry: { positions: bigGeo, normals: bigGeo },
    }
    const frag: ComponentFragment = { parts: [heavy] }
    expect(componentFragmentBytes(frag)).toBeGreaterThan(COMPONENT_FRAGMENT_MAX_BYTES)
    expect(componentFragmentFits(frag)).toBe(false)
  })
})

describe('insertComponentFragment (fresh ids, duplicate-id safety)', () => {
  it('inserts as a fresh group with NEW part ids and srcRefs kept', () => {
    const frag: ComponentFragment = { parts: [leg('a', -0.4), refPart('b', 'sofa', '3')] }
    const { spec, groupId } = insertComponentFragment(createEmptySpec(), frag, 'My legs')
    expect(groupId).not.toBeNull()
    expect(spec.parts).toHaveLength(2)
    // Fresh ids — none of the fragment's stored ids leaked into the live spec.
    for (const p of spec.parts) expect(['a', 'b']).not.toContain(p.id)
    // srcRef rode along verbatim.
    const refClone = spec.parts.find((p) => p.srcRef)
    expect(refClone?.srcRef).toEqual({ defId: 'sofa', meshPath: '3' })
    // Wrapped in one named group over exactly the new part ids.
    const g = spec.partGroups?.find((gr) => gr.id === groupId)
    expect(g?.name).toBe('My legs')
    expect(g?.partIds).toEqual(spec.parts.map((p) => p.id))
  })

  it('inserting the SAME fragment twice yields disjoint ids (no collision)', () => {
    const frag: ComponentFragment = { parts: [leg('a', 0)] }
    const first = insertComponentFragment(createEmptySpec(), frag, 'c')
    const second = insertComponentFragment(first.spec, frag, 'c')
    const ids = second.spec.parts.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(second.spec.parts).toHaveLength(2)
  })

  it('placeComponentFragmentOnFace lands the group at the snapped hit (floor mount)', () => {
    const frag: ComponentFragment = { parts: [leg('a', 0)] }
    const { spec, groupId } = placeComponentFragmentOnFace(createEmptySpec(), frag, 'Leg', {
      point: [0.2, 0.75, -0.1],
      normal: [0, -1, 0],
    })
    const g = spec.partGroups?.find((gr) => gr.id === groupId)
    // Floor mount onto a downward normal → identity rotation, group at the hit.
    expect(g?.position).toEqual([0.2, 0.75, -0.1])
    expect(g?.rotation).toBeUndefined()
    // The placed part is a fresh clone, still in the group.
    expect(partGroupForPart(spec, g!.partIds[0])?.id).toBe(groupId)
  })
})

describe('dropUnresolvableComponentParts (missing-def degradation)', () => {
  it('drops srcRef parts whose def is gone, keeps the rest', () => {
    const frag: ComponentFragment = {
      parts: [leg('a', 0), refPart('b', 'gone', '0'), refPart('c', 'live', '1')],
    }
    const res = dropUnresolvableComponentParts(frag, (defId) => defId === 'live')
    expect(res).not.toBeNull()
    expect(res?.dropped).toBe(1)
    expect(res?.fragment.parts.map((p) => p.id)).toEqual(['a', 'c'])
  })

  it('returns null when every part is unresolvable (unusable component)', () => {
    const frag: ComponentFragment = { parts: [refPart('a', 'gone', '0')] }
    expect(dropUnresolvableComponentParts(frag, () => false)).toBeNull()
  })

  it('keeps a fragment with no refs unchanged (dropped 0)', () => {
    const frag: ComponentFragment = { parts: [leg('a', 0), leg('b', 0.4)] }
    const res = dropUnresolvableComponentParts(frag, () => false)
    expect(res?.dropped).toBe(0)
    expect(res?.fragment.parts).toHaveLength(2)
  })
})
