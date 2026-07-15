import { describe, expect, it } from 'vitest'
import {
  type AssetEditSpec,
  addPart,
  createEmptySpec,
  setMeshOverride,
  updatePart,
} from './editSpec'
import { ASSET_SPEC_VERSION, parseAssetSpec, serializeAssetSpec } from './specPersist'

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
})
