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

  it('the current envelope is v9', () => {
    expect(ASSET_SPEC_VERSION).toBe(9)
  })

  it('round-trips the exportedProductId (v5, stable make-configurable id)', () => {
    const s = { ...createEmptySpec(), exportedProductId: 'user-cfg-abc' }
    const restored = parseAssetSpec(serializeAssetSpec(s))
    expect(restored?.exportedProductId).toBe('user-cfg-abc')
  })

  it('round-trips a part name (v6) and migrates a v5 blob identically', () => {
    let s = createEmptySpec()
    s = addPart(s, 'box')
    s = { ...s, parts: s.parts.map((p) => ({ ...p, name: 'Front leg' })) }
    const restored = parseAssetSpec(serializeAssetSpec(s))
    expect(restored?.parts[0].name).toBe('Front leg')
    // A v5-tagged blob (no name field) still parses (additive identity migration).
    const legacyV5 = JSON.stringify({ kind: 'asset', v: 5, payload: createEmptySpec() })
    expect(parseAssetSpec(legacyV5)).toEqual(createEmptySpec())
  })

  it('round-trips Stage-5 plump + sweepPoints and migrates a v6 blob identically', () => {
    let s = addPart(createEmptySpec(), 'box')
    s = {
      ...s,
      parts: s.parts.map((p) => ({
        ...p,
        plump: 0.5,
        sweepPoints: [
          [0.1, 0.1, 0.1],
          [-0.1, 0.1, 0.1],
        ] as [number, number, number][],
      })),
    }
    const restored = parseAssetSpec(serializeAssetSpec(s))
    expect(restored?.parts[0].plump).toBe(0.5)
    expect(restored?.parts[0].sweepPoints).toHaveLength(2)
    // A v6-tagged blob (no decals/plump) still parses (additive identity migration).
    const legacyV6 = JSON.stringify({ kind: 'asset', v: 6, payload: createEmptySpec() })
    expect(parseAssetSpec(legacyV6)).toEqual(createEmptySpec())
  })

  it('rejects a non-string part name', () => {
    const bad = JSON.stringify({
      kind: 'asset',
      v: ASSET_SPEC_VERSION,
      payload: {
        ...createEmptySpec(),
        parts: [
          { id: 'a', kind: 'box', position: [0, 0, 0], size: [1, 1, 1], color: '#fff', name: 5 },
        ],
      },
    })
    expect(parseAssetSpec(bad)).toBeNull()
  })

  it('serialises to the shared `{ kind: "asset", v, payload }` envelope', () => {
    const json = serializeAssetSpec(createEmptySpec())
    expect(JSON.parse(json)).toMatchObject({ kind: 'asset', v: ASSET_SPEC_VERSION })
    expect(JSON.parse(json).payload).toBeTruthy()
  })

  it('round-trips Stage-3a transform groups (partGroups) with a transform', () => {
    let s = addPart(addPart(createEmptySpec(), 'box'), 'cylinder')
    const ids = s.parts.map((p) => p.id)
    s = {
      ...s,
      partGroups: [{ id: 'pg1', name: 'Group 1', partIds: ids, position: [0.5, 0, 0.2] }],
    }
    const restored = parseAssetSpec(serializeAssetSpec(s))
    expect(restored).toEqual(s)
    expect(restored!.partGroups).toHaveLength(1)
    expect(restored!.partGroups![0]).toMatchObject({ name: 'Group 1', position: [0.5, 0, 0.2] })
  })

  it('rejects a malformed partGroups blob (bad transform / missing name)', () => {
    const wrap = (spec: unknown) => parseAssetSpec(JSON.stringify({ v: ASSET_SPEC_VERSION, spec }))
    const base = createEmptySpec()
    // position not a vec3
    expect(
      wrap({ ...base, partGroups: [{ id: 'g', name: 'G', partIds: ['a'], position: [1, 2] }] }),
    ).toBeNull()
    // missing name
    expect(wrap({ ...base, partGroups: [{ id: 'g', partIds: ['a'] }] })).toBeNull()
    // not an array
    expect(wrap({ ...base, partGroups: 'nope' })).toBeNull()
  })

  it('parses a legacy `{ v, spec }` blob (pre-envelope) — never breaks old saves', () => {
    const s = addPart(createEmptySpec(), 'box')
    const legacy = JSON.stringify({ v: 3, spec: s })
    expect(parseAssetSpec(legacy)).toEqual(s)
  })

  it('rejects a wrong-kind envelope (a configured blob is not an asset)', () => {
    const configured = JSON.stringify({ kind: 'configured', v: 1, payload: createEmptySpec() })
    expect(parseAssetSpec(configured)).toBeNull()
  })

  it('migrates a v1 blob (no roles/groups) unchanged — reads editable', () => {
    // A v1 envelope: a plain parts spec with NO combineGroups/role fields.
    const v1spec = updatePart(addPart(createEmptySpec(), 'box'), '', {})
    const v1json = JSON.stringify({ v: 1, spec: v1spec })
    const restored = parseAssetSpec(v1json)
    expect(restored).toEqual(v1spec)
    expect(restored!.combineGroups).toBeUndefined()
  })

  it('migrateAssetSpec: every known version v1…v9 is the identity, unknown version → null', () => {
    const spec = createEmptySpec()
    // Every bump so far is an additive superset, so migration is the identity for
    // each recognised version through the current envelope (v9).
    for (let v = 1; v <= ASSET_SPEC_VERSION; v++) {
      expect(migrateAssetSpec(spec, v)).toBe(spec)
    }
    expect(migrateAssetSpec(spec, 0)).toBeNull()
    expect(migrateAssetSpec(spec, ASSET_SPEC_VERSION + 1)).toBeNull()
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

  it('round-trips Stage-6b fields (shell + loft cross-sections + custom sweep path)', () => {
    let s = createEmptySpec()
    s = addPart(s, 'box')
    s = addPart(s, 'extrude')
    s = addPart(s, 'loft')
    s = addPart(s, 'sweep')
    s = updatePart(s, s.parts[0].id, { shell: 0.03 })
    s = updatePart(s, s.parts[1].id, { shell: 0.02 })
    s = updatePart(s, s.parts[3].id, {
      sweepPath: 'custom',
      sweepPathPoints: [
        [-0.5, -0.4],
        [0, 0],
        [0.5, 0.4],
      ],
    })
    const restored = parseAssetSpec(serializeAssetSpec(s))
    expect(restored).toEqual(s)
    expect(restored!.parts[0].shell).toBe(0.03)
    // Loft seeds bottom + top cross-sections by default.
    expect(restored!.parts[2].loftBottom).toEqual(s.parts[2].loftBottom)
    expect(restored!.parts[2].loftTop).toEqual(s.parts[2].loftTop)
    expect(restored!.parts[3].sweepPathPoints).toEqual(s.parts[3].sweepPathPoints)
  })

  it('migrates a v7 blob (no shell/loft/path) forward as the identity', () => {
    // A pre-6b spec is a structural subset of v8 → loads unchanged, re-tagged v8.
    const s = addPart(createEmptySpec(), 'box')
    const v7 = JSON.stringify({ kind: 'asset', v: 7, payload: s })
    expect(parseAssetSpec(v7)).toEqual(s)
  })

  it('rejects a malformed shell (non-number) / loft outline (non-vec2)', () => {
    const spec = addPart(createEmptySpec(), 'box')
    const badShell = JSON.stringify({
      v: 8,
      spec: { ...spec, parts: [{ ...spec.parts[0], shell: 'thick' }] },
    })
    expect(parseAssetSpec(badShell)).toBeNull()
    const badLoft = JSON.stringify({
      v: 8,
      spec: { ...spec, parts: [{ ...spec.parts[0], loftBottom: [[0, 0, 0]] }] },
    })
    expect(parseAssetSpec(badLoft)).toBeNull()
  })
})
