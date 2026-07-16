/**
 * GLB Asset Designer — USER COMPONENT fragments (Asset Studio Stage 9b). A user
 * can save any transform `PartGroup` as a reusable **component**: the group's
 * member parts are captured as a small, serialisable fragment (srcRefs preserved
 * verbatim, so a GLB-decompose leg carries no geometry — it stays a `{ defId,
 * meshPath }` pointer) that later re-inserts as a fresh group at a clicked point.
 *
 * The fragment rides the SHARED versioned envelope (`furniture/specEnvelope.ts`,
 * kind `'component'`, v2) — the same parse/serialize/migrate/guard path the
 * designer's `'asset'` spec + the configurator's `'configured'` spec use, rather
 * than a fourth ad-hoc blob. Persisted (localStorage metadata) by
 * `state/slices/userComponentsSlice.ts`.
 *
 * A fragment carries the group's member parts PLUS the `decals` projected onto
 * them (Stage 9b review — v1 dropped decals, so a tufted group lost its buttons):
 * a component is a cluster of shapes + their surface detail, re-wrapped in ONE
 * fresh `PartGroup` on insert (`addPlacedComponent`) with its decals re-id'd onto
 * the freshly-cloned parts so the tuft-part ↔ button pairing survives. A group
 * whose serialized fragment exceeds
 * {@link COMPONENT_FRAGMENT_MAX_BYTES} is refused at save time — that only happens
 * when a member is a BAKED `mesh` part (its triangles inline into the fragment);
 * srcRef / primitive parts stay tiny. Pure + dependency-light → unit-testable.
 */

import { type EnvelopeCodec, parseEnvelope, serializeEnvelope } from '../specEnvelope'
import { componentTransform, type FaceHit } from './componentPlace'
import { dropUnresolvableSrcRefParts } from './decomposeLoader'
import {
  type AssetEditSpec,
  addPlacedComponent,
  appendRemappedDecals,
  clonePartAtPose,
  createEmptySpec,
  DECAL_KINDS,
  type Decal,
  decals,
  partGroups,
  type ShapePart,
} from './editSpec'

/** Current component-fragment envelope version. Bump + branch in `migrate` on a
 *  breaking shape change.
 *   - v1: parts-only.
 *   - v2 (Stage 9b review): adds optional `decals[]` (the group parts' surface
 *     detail — tuft buttons/stitches). Additive superset → a v1 fragment (no
 *     decals) is a valid v2 fragment; migration stays the identity. */
const COMPONENT_FRAGMENT_VERSION = 2

/** Reject a saved component whose serialized fragment exceeds this (256 KB). A
 *  srcRef / primitive cluster is well under a kilobyte; only a BAKED `mesh` part
 *  (inlined triangles) can blow it — the save-time hint says as much. */
export const COMPONENT_FRAGMENT_MAX_BYTES = 256 * 1024

/** A reusable component captured from a `PartGroup` (Stage 9b). The group's
 *  members, verbatim (ids + srcRefs preserved), plus the `decals` projected onto
 *  them (v2) so tufting/stitching survives a save + place. */
export interface ComponentFragment {
  parts: ShapePart[]
  /** Surface-detail decals whose `partId` targets one of `parts` (Stage 9b
   *  review). Absent / empty → no detail (a v1 fragment). */
  decals?: Decal[]
}

/** A finite-number `[x, y, z]` tuple. */
function isVec3(x: unknown): boolean {
  return (
    Array.isArray(x) &&
    x.length === 3 &&
    x.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

/** Minimal per-part guard — enough to reject garbage without re-validating the
 *  whole geometry (the designer tolerates partial parts via its own defaults). */
function isPart(x: unknown): x is ShapePart {
  if (!x || typeof x !== 'object') return false
  const p = x as Record<string, unknown>
  if (p.srcRef !== undefined) {
    if (!p.srcRef || typeof p.srcRef !== 'object') return false
    const sr = p.srcRef as Record<string, unknown>
    if (typeof sr.defId !== 'string' || typeof sr.meshPath !== 'string') return false
  }
  return (
    typeof p.id === 'string' &&
    typeof p.kind === 'string' &&
    isVec3(p.position) &&
    isVec3(p.size) &&
    typeof p.color === 'string'
  )
}

/** The valid decal kinds (mirrors `editSpec.DecalKind`). */
const VALID_DECAL_KINDS = new Set<string>(DECAL_KINDS)

/** Guard the optional `decals` field (Stage 9b review): absent is fine; otherwise
 *  every entry is `{ id, partId: string, position: vec3, normal: vec3, size:
 *  finite number, kind ∈ decal kinds }` with an optional string `color`, finite
 *  `rotation`, and boolean `tuft`. Strict — a malformed decal makes the whole
 *  fragment un-restorable (matching the asset spec's decal guard). */
function isFragmentDecals(x: unknown): boolean {
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

/** Strict structural guard for a fragment payload — a non-empty `parts` array of
 *  valid parts + (optional) valid `decals`. Empty / malformed → not restorable. */
function isFragment(x: unknown): x is ComponentFragment {
  if (!x || typeof x !== 'object') return false
  const f = x as Record<string, unknown>
  return (
    Array.isArray(f.parts) &&
    f.parts.length > 0 &&
    f.parts.every(isPart) &&
    isFragmentDecals(f.decals)
  )
}

/** The shared-envelope codec for a user component fragment. */
const COMPONENT_CODEC: EnvelopeCodec<ComponentFragment> = {
  kind: 'component',
  version: COMPONENT_FRAGMENT_VERSION,
  isValid: isFragment,
  // v1 (parts-only) is a structural subset of v2 (adds optional decals) → a v1
  // fragment loads unchanged (no decals). An unknown / future version → null.
  migrate: (payload, from) => (from === 1 || from === COMPONENT_FRAGMENT_VERSION ? payload : null),
  // No legacy pre-envelope shape ever existed for components.
  parseLegacy: () => null,
}

/** Serialise a fragment to the versioned envelope JSON string. */
export function serializeComponentFragment(fragment: ComponentFragment): string {
  return serializeEnvelope(COMPONENT_CODEC, fragment)
}

/** Parse a stored component fragment envelope back to a `ComponentFragment`, or
 *  `null` when absent / malformed / an unknown version. Never throws. */
export function parseComponentFragment(json: string | undefined | null): ComponentFragment | null {
  return parseEnvelope(COMPONENT_CODEC, json)
}

/** Byte size of a fragment's serialized envelope — the value the save-time gate
 *  compares against {@link COMPONENT_FRAGMENT_MAX_BYTES}. */
export function componentFragmentBytes(fragment: ComponentFragment): number {
  return serializeComponentFragment(fragment).length
}

/** True when a fragment is small enough to save (under the byte cap). A `false`
 *  means it carries a heavy baked-mesh member — the caller blocks with a hint. */
export function componentFragmentFits(fragment: ComponentFragment): boolean {
  return componentFragmentBytes(fragment) <= COMPONENT_FRAGMENT_MAX_BYTES
}

/**
 * Capture a transform group's member parts as a component fragment (Stage 9b).
 * Copies each member VERBATIM (ids + srcRefs kept — the srcRef is a small
 * immutable pointer, so a GLB-decompose part stays geometry-free); the group's
 * own transform is NOT captured (a component is placed at a fresh point). Also
 * captures the `decals` projected onto those members (Stage 9b review — so a
 * tufted group keeps its buttons); a decal whose `partId` isn't in the group is
 * excluded. Returns `null` for an unknown group id or a group whose members all
 * vanished. Pure. */
export function captureGroupFragment(
  spec: AssetEditSpec,
  groupId: string,
): ComponentFragment | null {
  const group = partGroups(spec).find((g) => g.id === groupId)
  if (!group) return null
  const parts = group.partIds
    .map((id) => spec.parts.find((p) => p.id === id))
    .filter((p): p is ShapePart => !!p)
    .map((p) => ({
      ...p,
      position: [...p.position] as [number, number, number],
      size: [...p.size] as [number, number, number],
      rotation: p.rotation ? ([...p.rotation] as [number, number, number]) : undefined,
      srcRef: p.srcRef ? { ...p.srcRef } : undefined,
    }))
  if (parts.length === 0) return null
  const memberIds = new Set(parts.map((p) => p.id))
  const groupDecals = decals(spec)
    .filter((d) => memberIds.has(d.partId))
    .map((d) => ({
      ...d,
      position: [...d.position] as [number, number, number],
      normal: [...d.normal] as [number, number, number],
    }))
  return groupDecals.length > 0 ? { parts, decals: groupDecals } : { parts }
}

/**
 * Drop a fragment's `srcRef` parts whose source def is gone (honest degradation
 * when a saved component references a catalog item that no longer exists, Stage
 * 9b). Reuses the 9a spec-level helper. Returns the pruned fragment + how many
 * parts dropped; `null` when EVERY part dropped (the component is unusable). Pure.
 */
export function dropUnresolvableComponentParts(
  fragment: ComponentFragment,
  isResolvable: (defId: string) => boolean,
): { fragment: ComponentFragment; dropped: number } | null {
  const asSpec: AssetEditSpec = { ...createEmptySpec(), parts: fragment.parts }
  const { spec, dropped } = dropUnresolvableSrcRefParts(asSpec, (ref) => isResolvable(ref.defId))
  if (spec.parts.length === 0) return null
  // Keep only decals whose target part survived (a dropped part's detail goes too).
  const surviving = new Set(spec.parts.map((p) => p.id))
  const keptDecals = (fragment.decals ?? []).filter((d) => surviving.has(d.partId))
  return {
    fragment:
      keptDecals.length > 0 ? { parts: spec.parts, decals: keptDecals } : { parts: spec.parts },
    dropped,
  }
}

/**
 * Insert a fragment's parts as a FRESH transform group at an optional mount
 * transform (Stage 9b). Each part is deep-cloned with a NEW id (duplicate-id
 * safety — the fragment's stored ids are never reused into the live spec) while
 * its srcRef / geometry / material ride along verbatim, then wrapped in one named
 * `PartGroup` via `addPlacedComponent`. The fragment's `decals` are re-id'd onto
 * the freshly-cloned parts (Stage 9b review — so a tufted component's buttons
 * re-attach); a decal whose target part isn't placed is skipped. Returns
 * `{ spec, groupId }` (groupId null for an empty fragment). Pure.
 */
export function insertComponentFragment(
  spec: AssetEditSpec,
  fragment: ComponentFragment,
  name: string,
  position?: [number, number, number],
  rotation?: [number, number, number],
): { spec: AssetEditSpec; groupId: string | null } {
  const idMap = new Map<string, string>()
  const parts = fragment.parts.map((p) => {
    const clone = clonePartAtPose(p, [...p.position], p.rotation ? [...p.rotation] : undefined)
    idMap.set(p.id, clone.id)
    return clone
  })
  const placed = addPlacedComponent(spec, parts, name, position, rotation)
  if (!placed.groupId || !fragment.decals || fragment.decals.length === 0) return placed
  return {
    spec: appendRemappedDecals(placed.spec, fragment.decals, idMap),
    groupId: placed.groupId,
  }
}

/**
 * Place a user component onto a clicked face (Stage 9b) — the Components-panel
 * click-to-place flow. Uses the shared `componentPlace` math with a `'floor'`
 * mount default (a component hangs from / stands on the clicked surface, like a
 * built-in leg), then lands the fragment as a fresh named group. Returns
 * `{ spec, groupId }`. Pure — the caller commits + selects the group.
 */
export function placeComponentFragmentOnFace(
  spec: AssetEditSpec,
  fragment: ComponentFragment,
  name: string,
  hit: FaceHit,
): { spec: AssetEditSpec; groupId: string | null } {
  const { position, rotation } = componentTransform('floor', hit)
  return insertComponentFragment(spec, fragment, name, position, rotation)
}

/** The distinct source-def ids a fragment's `srcRef` parts reference (so the
 *  caller can pre-resolve their geometry before placing / degrade when gone). */
export function fragmentSrcRefDefIds(fragment: ComponentFragment): string[] {
  const set = new Set<string>()
  for (const p of fragment.parts) if (p.srcRef) set.add(p.srcRef.defId)
  return [...set]
}
