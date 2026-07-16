/**
 * GLB Asset Designer — Stage 3d "sets" (save a multi-piece design as a set).
 *
 * A designer spec can hold several independent top-level `PartGroup`s (e.g. a
 * table + a bookshelf, each inserted from a template). "Save groups as separate
 * assets" splits such a design so **every top-level group becomes its OWN catalog
 * asset** (named after the group) in addition to the whole thing saving as one
 * combined asset — a placed set is then just the individual assets, so there is
 * NO new runtime concept (SETS-1). Ungrouped parts stay only in the combined
 * asset (a loose shape isn't a "piece").
 *
 * Pure + three-free of the STORE (it borrows `groupTransform.ts`'s matrix maths to
 * flatten each group's transform into its members so a standalone asset keeps the
 * exact pose it had in the design) → unit-testable on the CPU.
 */

import {
  type AssetEditSpec,
  type CombineGroup,
  createEmptySpec,
  partGroups,
  type ShapePart,
} from './editSpec'
import { flattenMember } from './groupTransform'

/** One split-out asset: a group's members as a standalone, floor-anchored spec. */
export interface GroupAsset {
  /** The source group's name — the standalone asset's catalog name. */
  name: string
  /** A fresh spec containing ONLY this group's (flattened) parts. */
  spec: AssetEditSpec
}

/** Deep-clone a part with new position/rotation (from `flattenMember`), keeping
 *  every material / geometry field. Ids are preserved so any combine-group
 *  member references inside the split spec still resolve. */
function reposedPart(
  src: ShapePart,
  pose: { position: [number, number, number]; rotation?: [number, number, number] },
): ShapePart {
  return {
    ...src,
    position: pose.position,
    rotation: pose.rotation ? [...pose.rotation] : undefined,
    size: [...src.size],
    profile: src.profile ? src.profile.map((p) => [...p]) : undefined,
    outline: src.outline ? src.outline.map((p) => [...p]) : undefined,
    gradient: src.gradient ? { ...src.gradient } : undefined,
  }
}

/**
 * Split a spec into one standalone `GroupAsset` per top-level `PartGroup`. Each
 * sub-spec carries the group's member parts with the group transform FLATTENED
 * into each member (so the piece keeps its pose without needing the wrapping
 * group), plus any `CombineGroup` whose members are entirely inside the group
 * (a combine spanning the group boundary is dropped — its operands render as
 * plain solids in the standalone piece, the least-surprising fallback). Ungrouped
 * parts are intentionally NOT emitted as their own assets. Pure.
 */
export function splitSpecByGroups(spec: AssetEditSpec): GroupAsset[] {
  const groups = partGroups(spec)
  const byId = new Map(spec.parts.map((p) => [p.id, p]))
  const combines = spec.combineGroups ?? []
  return groups.map((group) => {
    const memberIds = new Set(group.partIds)
    const parts: ShapePart[] = []
    for (const id of group.partIds) {
      const src = byId.get(id)
      if (!src) continue
      parts.push(reposedPart(src, flattenMember(group, src)))
    }
    const contained: CombineGroup[] = combines.filter((cg) =>
      cg.partIds.every((id) => memberIds.has(id)),
    )
    const sub: AssetEditSpec = { ...createEmptySpec(), parts }
    if (contained.length > 0) sub.combineGroups = contained.map((cg) => ({ ...cg }))
    return { name: group.name, spec: sub }
  })
}

/** Axis-aligned footprint (metres) of a spec's parts, ignoring rotation — a
 *  quick pure bbox used to sanity-check a split piece's size (the authoritative
 *  footprint is still measured off the built object at save time). Returns null
 *  for an empty spec. */
export function specAabbFootprint(spec: AssetEditSpec): { w: number; d: number; h: number } | null {
  if (spec.parts.length === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  let maxY = 0
  for (const p of spec.parts) {
    minX = Math.min(minX, p.position[0] - p.size[0] / 2)
    maxX = Math.max(maxX, p.position[0] + p.size[0] / 2)
    minZ = Math.min(minZ, p.position[2] - p.size[2] / 2)
    maxZ = Math.max(maxZ, p.position[2] + p.size[2] / 2)
    maxY = Math.max(maxY, p.position[1] + p.size[1] / 2)
  }
  return { w: Math.max(0.05, maxX - minX), d: Math.max(0.05, maxZ - minZ), h: Math.max(0.05, maxY) }
}

/** True when a spec has ≥1 top-level group (so the "save groups as separate
 *  assets" option is meaningful). */
export function hasSplittableGroups(spec: AssetEditSpec): boolean {
  return partGroups(spec).length >= 1
}
