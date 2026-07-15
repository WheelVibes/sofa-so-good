import { describe, expect, it } from 'vitest'
import {
  type AssetEditSpec,
  addCombineGroup,
  addPart,
  createEmptySpec,
  setMeshOverride,
  setPartRole,
  updatePart,
} from './editSpec'
import {
  ASSET_SPEC_VERSION,
  migrateAssetSpec,
  parseAssetSpec,
  serializeAssetSpec,
} from './specPersist'

/** A representative non-trivial spec (parts, transforms, finishes, overrides). */
function sampleSpec(): AssetEditSpec {
  let s = createEmptySpec()
  s = addPart(s, 'box')
  s = addPart(s, 'cylinder')
  const boxId = s.parts[0].id
  s = updatePart(s, boxId, { size: [1, 0.4, 0.5], position: [0, 0.8, 0], finish: 'mat:oak' })
  s = { ...s, sourceAssetId: 'user-abc', sourceScale: 1.5 }
  s = setMeshOverride(s, 'Frame', { color: '#334455' })
  return s
}

describe('specPersist', () => {
  it('round-trips a spec: serialize → parse yields an identical spec', () => {
    const spec = sampleSpec()
    const json = serializeAssetSpec(spec)
    // Mirrors the def-props path: the JSON travels IDB meta / the save schema.
    const restored = parseAssetSpec(json)
    expect(restored).toEqual(spec)
  })

  it('round-trips Stage 1a parametric fields (profile/outline/segments/bevel/sweep)', () => {
    let s = createEmptySpec()
    s = addPart(s, 'lathe')
    s = addPart(s, 'extrude')
    s = addPart(s, 'sweep')
    s = updatePart(s, s.parts[0].id, { bevel: 0.05, segments: 48 })
    const restored = parseAssetSpec(serializeAssetSpec(s))
    expect(restored).toEqual(s)
    expect(restored!.parts[0].profile).toEqual(s.parts[0].profile)
    expect(restored!.parts[0].segments).toBe(48)
    expect(restored!.parts[1].outline).toEqual(s.parts[1].outline)
    expect(restored!.parts[2].sweepProfile).toBe('circle')
    expect(restored!.parts[2].sweepPath).toBe('ring')
  })

  it('wraps the spec in a versioned envelope', () => {
    const json = serializeAssetSpec(createEmptySpec())
    expect(JSON.parse(json)).toMatchObject({ v: ASSET_SPEC_VERSION })
  })

  it('returns null for absent / empty input (→ frozen-source fallback)', () => {
    expect(parseAssetSpec(undefined)).toBeNull()
    expect(parseAssetSpec(null)).toBeNull()
    expect(parseAssetSpec('')).toBeNull()
  })

  it('returns null for malformed JSON, not a throw', () => {
    expect(parseAssetSpec('{not json')).toBeNull()
  })

  it('rejects an unknown envelope version (migration guard)', () => {
    const future = JSON.stringify({ v: ASSET_SPEC_VERSION + 1, spec: createEmptySpec() })
    expect(parseAssetSpec(future)).toBeNull()
  })

  it('rejects a structurally-invalid spec payload', () => {
    expect(
      parseAssetSpec(JSON.stringify({ v: ASSET_SPEC_VERSION, spec: { parts: 'nope' } })),
    ).toBeNull()
    expect(parseAssetSpec(JSON.stringify({ v: ASSET_SPEC_VERSION }))).toBeNull()
  })

  it('rejects malformed combineGroups / bad part roles (not restorable)', () => {
    const wrap = (spec: unknown) => parseAssetSpec(JSON.stringify({ v: ASSET_SPEC_VERSION, spec }))
    const base = createEmptySpec()
    // combineGroups not an array
    expect(wrap({ ...base, combineGroups: 'nope' })).toBeNull()
    // bad op
    expect(
      wrap({ ...base, combineGroups: [{ id: 'g1', partIds: ['a', 'b'], op: 'frobnicate' }] }),
    ).toBeNull()
    // non-string member ids
    expect(
      wrap({ ...base, combineGroups: [{ id: 'g1', partIds: [1, 2], op: 'union' }] }),
    ).toBeNull()
    // missing id
    expect(wrap({ ...base, combineGroups: [{ partIds: ['a', 'b'], op: 'union' }] })).toBeNull()
    // invalid role on a part
    expect(
      wrap({
        ...base,
        parts: [
          {
            id: 'p1',
            kind: 'box',
            position: [0, 0, 0],
            size: [1, 1, 1],
            color: '#fff',
            role: 'ghost',
          },
        ],
      }),
    ).toBeNull()
    // a WELL-FORMED combineGroups + role still parses
    expect(
      wrap({
        ...base,
        parts: [
          {
            id: 'p1',
            kind: 'box',
            position: [0, 0, 0],
            size: [1, 1, 1],
            color: '#fff',
            role: 'hole',
          },
        ],
        combineGroups: [{ id: 'g1', name: 'Combine 1', partIds: ['a', 'b'], op: 'subtract' }],
      }),
    ).not.toBeNull()
  })

  // ---- CSG v2 (Stage 1b) — roles + combine groups + v1→v2 migration --------
  it('round-trips CSG v2 roles + combine groups', () => {
    let s = createEmptySpec()
    s = addPart(s, 'box')
    s = addPart(s, 'cylinder')
    const [boxId, cylId] = s.parts.map((p) => p.id)
    s = setPartRole(s, cylId, 'hole')
    s = addCombineGroup(s, [boxId, cylId], 'subtract').spec
    const restored = parseAssetSpec(serializeAssetSpec(s))
    expect(restored).toEqual(s)
    expect(restored!.combineGroups).toHaveLength(1)
    expect(restored!.combineGroups![0]).toMatchObject({ op: 'subtract', partIds: [boxId, cylId] })
    expect(restored!.parts[1].role).toBe('hole')
  })

  it('the current envelope is v3', () => {
    expect(ASSET_SPEC_VERSION).toBe(3)
  })

  it('migrates a v1 blob (no roles/groups) unchanged — reads editable', () => {
    // A v1 envelope: a plain parts spec with NO combineGroups/role fields.
    const v1spec = updatePart(addPart(createEmptySpec(), 'box'), '', {})
    const v1json = JSON.stringify({ v: 1, spec: v1spec })
    const restored = parseAssetSpec(v1json)
    expect(restored).toEqual(v1spec)
    expect(restored!.combineGroups).toBeUndefined()
  })

  it('migrateAssetSpec: v1/v2→v3 identity, unknown version → null', () => {
    const spec = createEmptySpec()
    expect(migrateAssetSpec(spec, 1)).toBe(spec)
    expect(migrateAssetSpec(spec, 2)).toBe(spec)
    expect(migrateAssetSpec(spec, 3)).toBe(spec)
    expect(migrateAssetSpec(spec, 99)).toBeNull()
  })

  it('round-trips Stage-2 physical fields + gradient', () => {
    const base = addPart(createEmptySpec(), 'box')
    const id = base.parts[0].id
    const s = updatePart(base, id, {
      sheen: 1,
      sheenColor: '#8899ff',
      sheenRoughness: 0.3,
      clearcoat: 0.8,
      clearcoatRoughness: 0.12,
      transmission: 0.9,
      ior: 1.5,
      thickness: 0.3,
      anisotropy: 0.7,
      anisotropyRotation: 0.4,
      gradient: { axis: 'y', from: '#ff0000', to: '#0000ff' },
    })
    const restored = parseAssetSpec(serializeAssetSpec(s))
    expect(restored).toEqual(s)
  })

  it('rejects a malformed physical field (non-number sheen)', () => {
    const spec = addPart(createEmptySpec(), 'box')
    const bad = JSON.stringify({
      v: 3,
      spec: { ...spec, parts: [{ ...spec.parts[0], sheen: 'lots' }] },
    })
    expect(parseAssetSpec(bad)).toBeNull()
  })

  it('rejects a malformed gradient (bad axis)', () => {
    const spec = addPart(createEmptySpec(), 'box')
    const bad = JSON.stringify({
      v: 3,
      spec: {
        ...spec,
        parts: [{ ...spec.parts[0], gradient: { axis: 'w', from: '#fff', to: '#000' } }],
      },
    })
    expect(parseAssetSpec(bad)).toBeNull()
  })
})
