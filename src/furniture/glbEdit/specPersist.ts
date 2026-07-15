/**
 * GLB Asset Designer — (de)serialise an `AssetEditSpec` for persistence in a
 * saved user def, so a designer-built asset re-opens editable (its full part
 * list restored) instead of only as a frozen source mesh.
 *
 * The spec is embedded as a JSON string on the saved def (`UserGltfDef.assetSpec`,
 * mirroring the configurator's `slotSpec` round-trip / SLOT-204) and travels the
 * same IDB-meta + save-schema path as `slotSpec`. It is versioned (`{ v: 1, spec }`)
 * so a future spec-shape change can migrate on read; an absent or unrecognised
 * blob simply yields `null` (today's behaviour: the def re-opens as a source mesh,
 * not an editable part list). Pure + dependency-free → unit-testable.
 */

import type { AssetEditSpec } from './editSpec'

/** Current envelope version. Bump + branch in `parseAssetSpec` on a breaking
 *  spec-shape change.
 *
 *  - v1 (Asset Studio S0…S1a): parts + meshOverrides + sourceScale.
 *  - v2 (CSG v2, Stage 1b): adds optional `parts[].role` + `combineGroups[]`.
 *    A v1 spec is a STRUCTURAL SUBSET of v2 (no roles, no groups), so migration
 *    is the identity — a v1 blob loads unchanged, just re-tagged v2 on next save. */
export const ASSET_SPEC_VERSION = 2

interface AssetSpecEnvelope {
  v: number
  spec: AssetEditSpec
}

/** Migrate a parsed spec at envelope version `from` up to the current version.
 *  v1→v2 is the identity (v1 is a subset of v2); returns null for an
 *  unknown/newer version we can't safely read. Pure + exported for tests. */
export function migrateAssetSpec(spec: AssetEditSpec, from: number): AssetEditSpec | null {
  switch (from) {
    case 1:
    // A v1 spec has no `role`/`combineGroups` — already a valid v2 spec.
    // fall through
    case 2:
      return spec
    default:
      return null
  }
}

/** Serialise a spec to the versioned JSON string stored on the def. */
export function serializeAssetSpec(spec: AssetEditSpec): string {
  const env: AssetSpecEnvelope = { v: ASSET_SPEC_VERSION, spec }
  return JSON.stringify(env)
}

/** Valid CSG combine operators (mirrors `editSpec.CombineOp`; inlined so this
 *  module stays pure + three-free — importing `csgCombine.CSG_OPS` would pull the
 *  CSG engine's `three` imports into the persistence layer). */
const VALID_OPS = new Set<string>(['union', 'subtract', 'intersect'])
/** Valid part roles (mirrors `editSpec.PartRole`). */
const VALID_ROLES = new Set<string>(['solid', 'hole'])

/** Guard the optional `combineGroups` field: absent is fine; otherwise every
 *  entry must be `{ id: string, partIds: string[], op ∈ CSG ops }`. A malformed
 *  blob (bad op, non-string ids) makes the whole spec un-restorable so it can't
 *  silently drop or corrupt a group on reload. */
function isCombineGroups(x: unknown): boolean {
  if (x === undefined) return true
  if (!Array.isArray(x)) return false
  return x.every((g) => {
    if (!g || typeof g !== 'object') return false
    const grp = g as Record<string, unknown>
    return (
      typeof grp.id === 'string' &&
      Array.isArray(grp.partIds) &&
      grp.partIds.every((id) => typeof id === 'string') &&
      typeof grp.op === 'string' &&
      VALID_OPS.has(grp.op)
    )
  })
}

/** Every part must be an object with a valid `role` (or none). */
function partsValid(parts: unknown[]): boolean {
  return parts.every((p) => {
    if (!p || typeof p !== 'object') return false
    const role = (p as Record<string, unknown>).role
    return role === undefined || (typeof role === 'string' && VALID_ROLES.has(role))
  })
}

/** Minimal structural guard — enough to reject garbage without re-validating the
 *  whole geometry (the designer tolerates partial specs via its own defaults).
 *  Also validates `combineGroups` + part `role` values so a malformed blob is
 *  NOT restorable (parse returns null per its contract). */
function isSpec(x: unknown): x is AssetEditSpec {
  if (!x || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  return (
    Array.isArray(s.parts) &&
    partsValid(s.parts) &&
    typeof s.sourceScale === 'number' &&
    !!s.meshOverrides &&
    typeof s.meshOverrides === 'object' &&
    isCombineGroups(s.combineGroups)
  )
}

/**
 * Parse a stored `assetSpec` string back to an `AssetEditSpec`, or `null` when
 * absent / malformed / an unknown version. Never throws — a bad blob just means
 * "not restorable", falling back to the frozen-source path.
 */
export function parseAssetSpec(json: string | undefined | null): AssetEditSpec | null {
  if (!json) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const env = parsed as Partial<AssetSpecEnvelope>
  if (typeof env.v !== 'number' || !isSpec(env.spec)) return null
  // Migrate older envelopes up to the current shape (v1→v2 is the identity).
  return migrateAssetSpec(env.spec, env.v)
}
