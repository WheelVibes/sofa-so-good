/**
 * GLB Asset Designer — the transform maths for named part groups (Stage 3a).
 * `editSpec.ts` owns the pure, three-free `PartGroup` spec ops (add / rename /
 * duplicate / mirror / prune); this module owns the bits that genuinely need
 * matrix composition:
 *
 *  - `groupedPartWorldPosition` — where a grouped part actually ends up (the
 *    build + gizmo invariant: world = group transform ∘ part transform).
 *  - `ungroupPartGroup` — release a group's members with their transforms
 *    FLATTENED (group transform baked into each member) so nothing jumps.
 *
 * Kept out of `editSpec.ts` so that module stays three-free (its consumers — the
 * persistence layer, the CSG worker — don't pull three's math in). Pure + unit
 * -testable (three's math classes need no GPU).
 */

import { Euler, type Matrix4, Quaternion, Vector3 } from 'three'
import {
  type AssetEditSpec,
  type PartGroup,
  partGroups,
  removePartGroupRaw,
  type ShapePart,
  updatePart,
} from './editSpec'
import { clean, DEG, trsMatrix } from './transformMath'

/** The group's parent-frame matrix (translation ∘ rotation), metres / degrees. */
function groupMatrix(group: PartGroup): Matrix4 {
  return trsMatrix(group.position ?? [0, 0, 0], group.rotation)
}

/**
 * A world position pulled INTO the group's local frame — the exact inverse of
 * `groupedPartWorldPosition` (world = group ∘ local ⇒ local = group⁻¹ ∘ world).
 *
 * The face-snap drag of a grouped MEMBER runs entirely in the member's group-local
 * frame (the member's `position` field IS group-local), so every snap TARGET — a
 * same-group sibling or an ungrouped part outside the group — has its world centre
 * pulled into that one consistent space with this before `snapFaces` sees it
 * (finding 1). A same-group sibling round-trips exactly back to its own local
 * position; an outside part lands at its localised centre. Pure.
 */
export function worldToGroupLocalPosition(
  group: PartGroup,
  world: readonly [number, number, number],
): [number, number, number] {
  const v = new Vector3(world[0], world[1], world[2]).applyMatrix4(groupMatrix(group).invert())
  return [clean(v.x), clean(v.y), clean(v.z)]
}

/**
 * World position of a grouped part = group transform ∘ part local position.
 * The invariant the live preview + the export + the gizmo write-back all rely
 * on. Pure.
 */
export function groupedPartWorldPosition(
  group: PartGroup,
  part: ShapePart,
): [number, number, number] {
  const v = new Vector3(part.position[0], part.position[1], part.position[2]).applyMatrix4(
    groupMatrix(group),
  )
  return [clean(v.x), clean(v.y), clean(v.z)]
}

/**
 * Flatten the group transform INTO a member's own transform: compose
 * group ∘ member into one local translation + rotation so the member keeps its
 * exact world pose once the group is gone. An all-zero rotation clears the field
 * (absent = no rotation, matching the spec convention). Pure.
 */
export function flattenMember(
  group: PartGroup,
  part: ShapePart,
): { position: [number, number, number]; rotation?: [number, number, number] } {
  const world = groupMatrix(group).multiply(trsMatrix(part.position, part.rotation))
  const pos = new Vector3()
  const quat = new Quaternion()
  const scl = new Vector3()
  world.decompose(pos, quat, scl)
  const e = new Euler().setFromQuaternion(quat, 'XYZ')
  const deg = [clean(e.x / DEG), clean(e.y / DEG), clean(e.z / DEG)] as [number, number, number]
  const position: [number, number, number] = [clean(pos.x), clean(pos.y), clean(pos.z)]
  return { position, rotation: deg.every((v) => v === 0) ? undefined : deg }
}

/**
 * Ungroup a transform group: release its members with the group transform baked
 * into each one (so a group with a non-identity transform doesn't make its parts
 * jump), then drop the group entity. A no-op for an unknown id. One pure spec
 * transition → one history entry, so undo restores the group intact.
 */
export function ungroupPartGroup(spec: AssetEditSpec, groupId: string): AssetEditSpec {
  const group = partGroups(spec).find((g) => g.id === groupId)
  if (!group) return spec
  let next = spec
  for (const id of group.partIds) {
    const part = next.parts.find((p) => p.id === id)
    if (!part) continue
    const flat = flattenMember(group, part)
    next = updatePart(next, id, { position: flat.position, rotation: flat.rotation })
  }
  return removePartGroupRaw(next, groupId)
}
