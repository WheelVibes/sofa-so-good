/**
 * GLB Asset Designer — (de)serialise an `AssetEditSpec` for persistence in a
 * saved user def, so a designer-built asset re-opens editable (its full part
 * list restored) instead of only as a frozen source mesh.
 *
 * The spec is embedded as a JSON string on the saved def (`UserGltfDef.assetSpec`)
 * and travels the IDB-meta + save-schema path. Since Stage 3a it rides the
 * SHARED versioned envelope (`furniture/specEnvelope.ts`, kind `'asset'`) — the
 * single parse/serialize/migrate/guard path also used by the configurator's
 * `slotSpec` — instead of a bespoke `{ v, spec }` blob. A `parseLegacy`
 * recogniser keeps reading the pre-envelope `{ v, spec }` shape (existing saves
 * never break); the next write re-saves it in the envelope. An absent /
 * unrecognised / future-version blob yields `null` (today's behaviour: the def
 * re-opens as a source mesh). Pure + dependency-free → unit-testable.
 */

import { type EnvelopeCodec, parseEnvelope, serializeEnvelope } from '../specEnvelope'
import type { AssetEditSpec } from './editSpec'

/** Current envelope version. Bump + branch in `migrateAssetSpec` on a breaking
 *  spec-shape change.
 *
 *  - v1 (Asset Studio S0…S1a): parts + meshOverrides + sourceScale.
 *  - v2 (CSG v2, Stage 1b): adds optional `parts[].role` + `combineGroups[]`.
 *  - v3 (Materials, Stage 2): adds optional `PhysicalSurfaceFields` + `gradient`.
 *  - v4 (Groups, Stage 3a): adds optional `partGroups[]` (named transform
 *    groups). Every added field is optional, so each older version is a
 *    STRUCTURAL SUBSET of the next — migration stays the identity (an older blob
 *    loads unchanged, just re-tagged on next save).
 *  - v5 (Make-configurable stable id, Stage 3d finding 5): adds optional
 *    `exportedProductId` so a re-export replaces its prior product. Additive
 *    superset → migration stays the identity.
 *  - v6 (Precision & pro UX, Stage 4b): adds optional `parts[].name` (user part
 *    rename). Additive superset → migration stays the identity.
 *  - v7 (Realism detail layer, Stage 5): adds optional `decals[]` + optional
 *    `parts[].plump` (cushion bulge) + optional `parts[].sweepPoints` (piping
 *    path). Additive superset → migration stays the identity.
 *  - v8 (Geometry ops II, Stage 6b): adds the `'loft'` shape kind + optional
 *    `parts[].shell` (hollow wall thickness), `parts[].loftBottom`/`loftTop`
 *    (loft cross-sections) + `parts[].sweepPathPoints` (free sweep path).
 *    Additive superset → migration stays the identity.
 *  - v9 (Materials II, Stage 6c): adds optional `parts[].faceFinishes` (per-face
 *    box finishes / edge banding) + `parts[].finishScale` (texture tile size) +
 *    `parts[].finishRotation` (grain direction). Additive superset → migration
 *    stays the identity.
 *  - v10 (Realism II, Stage 6e): adds optional `parts[].wrinkles` (fabric wrinkle
 *    normal-map intensity on a plumped cushion). Material-only, additive superset
 *    → migration stays the identity. (An older v9 plumped cushion has no
 *    `wrinkles` field, so it renders with the subtle default-on wrinkles — the
 *    stored spec data is unchanged; only the surface look gains the realism
 *    default.)
 *  - v11 (Realism III, Stage 7c): adds optional `parts[].tuft` (`{rows, cols,
 *    depth}` tufting grid on a plumped box) + optional `decals[].tuft` (a boolean
 *    tag marking the tuft-generated buttons). Additive superset -> migration stays
 *    the identity. (A v10 spec has no tuft fields — it loads unchanged.)
 */
export const ASSET_SPEC_VERSION = 11

/** Migrate a parsed spec at envelope version `from` up to the current version.
 *  Every version bump so far has been an additive superset, so migration is the
 *  identity; an unknown/newer version returns null (can't safely read). Pure +
 *  exported for tests. */
export function migrateAssetSpec(spec: AssetEditSpec, from: number): AssetEditSpec | null {
  switch (from) {
    case 1: // no role/combineGroups — already a valid v2 spec.
    case 2: // no physical fields/gradient — already a valid v3 spec.
    case 3: // no partGroups — already a valid v4 spec.
    case 4: // no exportedProductId — already a valid v5 spec.
    case 5: // no parts[].name — already a valid v6 spec.
    case 6: // no decals/plump/sweepPoints — already a valid v7 spec.
    case 7: // no shell/loft/sweepPathPoints — already a valid v8 spec.
    case 8: // no faceFinishes/finishScale/finishRotation — already a valid v9 spec.
    case 9: // no wrinkles — already a valid v10 spec.
    case 10: // no tuft grid / tuft decal tag — already a valid v11 spec.
    case 11:
      return spec
    default:
      return null
  }
}

/** Valid CSG combine operators (mirrors `editSpec.CombineOp`; inlined so this
 *  module stays pure + three-free — importing `csgCombine.CSG_OPS` would pull the
 *  CSG engine's `three` imports into the persistence layer). */
const VALID_OPS = new Set<string>(['union', 'subtract', 'intersect'])
/** Valid part roles (mirrors `editSpec.PartRole`). */
const VALID_ROLES = new Set<string>(['solid', 'hole'])

/** A finite-number `[x, y, z]` tuple (group transform fields). */
function isVec3(x: unknown): boolean {
  return (
    Array.isArray(x) &&
    x.length === 3 &&
    x.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

/** A finite-number `[x, y]` tuple (profile / loft / path points). */
function isVec2(x: unknown): boolean {
  return (
    Array.isArray(x) &&
    x.length === 2 &&
    x.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

/** A list of finite `[x, y]` points (loft outline / custom sweep path). */
function isVec2List(x: unknown): boolean {
  return Array.isArray(x) && x.every(isVec2)
}

/** Guard the optional `combineGroups` field: absent is fine; otherwise every
 *  entry must be `{ id: string, partIds: string[], op ∈ CSG ops }`. A malformed
 *  blob makes the whole spec un-restorable so it can't silently drop or corrupt a
 *  group on reload. */
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

/** Guard the optional `partGroups` field (Stage 3a): absent is fine; otherwise
 *  every entry must be `{ id, name: string, partIds: string[] }` with an
 *  optional finite `position`/`rotation` vec3. Strict — a malformed group makes
 *  the whole spec un-restorable (matching `combineGroups`). */
function isPartGroups(x: unknown): boolean {
  if (x === undefined) return true
  if (!Array.isArray(x)) return false
  return x.every((g) => {
    if (!g || typeof g !== 'object') return false
    const grp = g as Record<string, unknown>
    if (grp.position !== undefined && !isVec3(grp.position)) return false
    if (grp.rotation !== undefined && !isVec3(grp.rotation)) return false
    return (
      typeof grp.id === 'string' &&
      typeof grp.name === 'string' &&
      Array.isArray(grp.partIds) &&
      grp.partIds.every((id) => typeof id === 'string')
    )
  })
}

/** The optional `PhysicalSurfaceFields` numeric fields (Stage 2) — each must be
 *  absent or a finite number when present. */
const PHYSICAL_NUM_FIELDS = [
  'sheen',
  'sheenRoughness',
  'clearcoat',
  'clearcoatRoughness',
  'transmission',
  'ior',
  'thickness',
  'anisotropy',
  'anisotropyRotation',
] as const

/** Guard a part's optional Stage-2 material fields: every physical numeric field
 *  is absent or finite, `sheenColor` is absent or a string, and `gradient` (when
 *  present) is `{ axis ∈ x|y|z, from: string, to: string }`. A malformed field
 *  makes the whole spec un-restorable (strict guard, matching `combineGroups`). */
function materialFieldsValid(p: Record<string, unknown>): boolean {
  for (const key of PHYSICAL_NUM_FIELDS) {
    const v = p[key]
    if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) return false
  }
  if (p.sheenColor !== undefined && typeof p.sheenColor !== 'string') return false
  const g = p.gradient
  if (g !== undefined) {
    if (!g || typeof g !== 'object') return false
    const grad = g as Record<string, unknown>
    if (grad.axis !== 'x' && grad.axis !== 'y' && grad.axis !== 'z') return false
    if (typeof grad.from !== 'string' || typeof grad.to !== 'string') return false
  }
  return true
}

/** Guard one per-face finish zone (Stage 6c): absent is fine; otherwise an object
 *  whose optional `color`/`finish` are strings when present. */
function isFaceFinishZone(x: unknown): boolean {
  if (x === undefined) return true
  if (!x || typeof x !== 'object') return false
  const z = x as Record<string, unknown>
  if (z.color !== undefined && typeof z.color !== 'string') return false
  if (z.finish !== undefined && typeof z.finish !== 'string') return false
  return true
}

/** Guard the optional `faceFinishes` field (Stage 6c): absent is fine; otherwise
 *  an object whose `top`/`bottom`/`sides` are each a valid zone. Strict — a
 *  malformed value makes the whole spec un-restorable (matching the collections). */
function isFaceFinishes(x: unknown): boolean {
  if (x === undefined) return true
  if (!x || typeof x !== 'object') return false
  const f = x as Record<string, unknown>
  return isFaceFinishZone(f.top) && isFaceFinishZone(f.bottom) && isFaceFinishZone(f.sides)
}

/** Valid decal kinds (mirrors `editSpec.DecalKind`). */
const VALID_DECAL_KINDS = new Set<string>(['button', 'stitch', 'seam', 'patch', 'wear'])

/** Guard the optional `decals` field (Stage 5): absent is fine; otherwise every
 *  entry must be `{ id, partId: string, position: vec3, normal: vec3,
 *  size: finite number, kind ∈ decal kinds }` with an optional string `color`
 *  and finite `rotation`. Strict — a malformed decal makes the whole spec
 *  un-restorable (matching the other collections). */
function isDecals(x: unknown): boolean {
  if (x === undefined) return true
  if (!Array.isArray(x)) return false
  return x.every((d) => {
    if (!d || typeof d !== 'object') return false
    const dec = d as Record<string, unknown>
    if (dec.color !== undefined && typeof dec.color !== 'string') return false
    if (
      dec.rotation !== undefined &&
      (typeof dec.rotation !== 'number' || !Number.isFinite(dec.rotation))
    )
      return false
    // v11: optional tuft tag (marks a tuft-generated button decal).
    if (dec.tuft !== undefined && typeof dec.tuft !== 'boolean') return false
    return (
      typeof dec.id === 'string' &&
      typeof dec.partId === 'string' &&
      isVec3(dec.position) &&
      isVec3(dec.normal) &&
      typeof dec.size === 'number' &&
      Number.isFinite(dec.size) &&
      typeof dec.kind === 'string' &&
      VALID_DECAL_KINDS.has(dec.kind)
    )
  })
}

/** Guard the optional `tuft` field (Stage 7c): absent is fine; otherwise an
 *  object with finite numeric `rows`/`cols`/`depth`. Strict — a malformed value
 *  makes the whole spec un-restorable (matching the other collections). */
function isTuftGrid(x: unknown): boolean {
  if (x === undefined) return true
  if (!x || typeof x !== 'object') return false
  const t = x as Record<string, unknown>
  return (['rows', 'cols', 'depth'] as const).every(
    (k) => typeof t[k] === 'number' && Number.isFinite(t[k]),
  )
}

/** Every part must be an object with a valid `role` (or none), valid Stage-2
 *  material/gradient fields, and valid Stage-5 `plump`/`sweepPoints`. */
function partsValid(parts: unknown[]): boolean {
  return parts.every((p) => {
    if (!p || typeof p !== 'object') return false
    const rec = p as Record<string, unknown>
    const role = rec.role
    if (role !== undefined && (typeof role !== 'string' || !VALID_ROLES.has(role))) return false
    // v6: optional user part name.
    if (rec.name !== undefined && typeof rec.name !== 'string') return false
    // v7: optional cushion plump + explicit sweep path points.
    if (rec.plump !== undefined && (typeof rec.plump !== 'number' || !Number.isFinite(rec.plump)))
      return false
    // v10: optional fabric wrinkle intensity (material-only).
    if (
      rec.wrinkles !== undefined &&
      (typeof rec.wrinkles !== 'number' || !Number.isFinite(rec.wrinkles))
    )
      return false
    // v11: optional tufting grid { rows, cols, depth } (all finite numbers).
    if (!isTuftGrid(rec.tuft)) return false
    if (rec.sweepPoints !== undefined) {
      if (!Array.isArray(rec.sweepPoints) || !rec.sweepPoints.every(isVec3)) return false
    }
    // v8: optional hollow wall thickness, loft cross-sections, free sweep path.
    if (rec.shell !== undefined && (typeof rec.shell !== 'number' || !Number.isFinite(rec.shell)))
      return false
    if (rec.loftBottom !== undefined && !isVec2List(rec.loftBottom)) return false
    if (rec.loftTop !== undefined && !isVec2List(rec.loftTop)) return false
    if (rec.sweepPathPoints !== undefined && !isVec2List(rec.sweepPathPoints)) return false
    // v9: per-face finishes + texture scale/rotation.
    if (
      rec.finishScale !== undefined &&
      (typeof rec.finishScale !== 'number' || !Number.isFinite(rec.finishScale))
    )
      return false
    if (
      rec.finishRotation !== undefined &&
      (typeof rec.finishRotation !== 'number' || !Number.isFinite(rec.finishRotation))
    )
      return false
    if (!isFaceFinishes(rec.faceFinishes)) return false
    return materialFieldsValid(rec)
  })
}

/** Minimal structural guard — enough to reject garbage without re-validating the
 *  whole geometry (the designer tolerates partial specs via its own defaults).
 *  Also validates `combineGroups` + `partGroups` + part `role` values so a
 *  malformed blob is NOT restorable (parse returns null per its contract). */
function isSpec(x: unknown): x is AssetEditSpec {
  if (!x || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  return (
    Array.isArray(s.parts) &&
    partsValid(s.parts) &&
    typeof s.sourceScale === 'number' &&
    !!s.meshOverrides &&
    typeof s.meshOverrides === 'object' &&
    isCombineGroups(s.combineGroups) &&
    isPartGroups(s.partGroups) &&
    isDecals(s.decals) &&
    (s.exportedProductId === undefined || typeof s.exportedProductId === 'string')
  )
}

/** The shared-envelope codec for the designer's `AssetEditSpec`. */
const ASSET_CODEC: EnvelopeCodec<AssetEditSpec> = {
  kind: 'asset',
  version: ASSET_SPEC_VERSION,
  isValid: isSpec,
  migrate: migrateAssetSpec,
  // Legacy pre-envelope shape: `{ v: number, spec: AssetEditSpec }`.
  parseLegacy: (parsed) => {
    if (!parsed || typeof parsed !== 'object') return null
    const rec = parsed as Record<string, unknown>
    if (typeof rec.v !== 'number' || rec.spec === undefined) return null
    return { v: rec.v, payload: rec.spec }
  },
}

/** Serialise a spec to the versioned envelope JSON string stored on the def. */
export function serializeAssetSpec(spec: AssetEditSpec): string {
  return serializeEnvelope(ASSET_CODEC, spec)
}

/**
 * Parse a stored `assetSpec` string back to an `AssetEditSpec`, or `null` when
 * absent / malformed / an unknown version. Never throws — a bad blob just means
 * "not restorable", falling back to the frozen-source path.
 */
export function parseAssetSpec(json: string | undefined | null): AssetEditSpec | null {
  return parseEnvelope(ASSET_CODEC, json)
}
