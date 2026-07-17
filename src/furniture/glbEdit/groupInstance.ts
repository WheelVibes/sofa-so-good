import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import {
  type AssetEditSpec,
  boxFaceFinishesActive,
  combinedPartIds,
  decalsForPart,
  type PartGroup,
  type ShapePart,
} from './editSpec'

/**
 * Asset Studio Iteration 2 · Stage 6f — instanced preview for array groups.
 *
 * A transform group whose members are GEOMETRY- AND MATERIAL-identical (they
 * differ only in transform — exactly what `linearArray`/`radialArray` produce)
 * can render as ONE `InstancedMesh` in the live preview instead of N separate
 * meshes, collapsing N draw calls to 1. Pure detector — no three scene objects,
 * just the shared geometry key + the per-instance matrices — so it's unit-tested
 * in isolation and the renderer (`PartsPreview`) stays a thin consumer.
 */

/** Minimum member count for a group to be worth instancing. Below this the draw
 *  call saving doesn't pay for the InstancedMesh machinery, and small groups
 *  (a 2-piece mirror, a placed component) read fine as individual meshes. */
export const MIN_INSTANCE_MEMBERS = 4

/** A stable key over every field that decides a part's shared geometry AND
 *  material — i.e. everything EXCEPT its id / name / transform. Two parts with
 *  the same key build byte-identical geometry + material, so they can share one
 *  InstancedMesh (only their per-instance matrix differs). */
function instanceKey(p: ShapePart): string {
  const { id: _id, name: _name, position: _pos, rotation: _rot, ...rest } = p
  return JSON.stringify(rest)
}

/** A part's local transform as a Matrix4 (position + Euler-XYZ-degrees rotation,
 *  unit scale) — group-local, matching how `PartMesh` places a grouped member. */
function partMatrix(p: ShapePart): Matrix4 {
  const r = p.rotation ?? [0, 0, 0]
  const q = new Quaternion().setFromEuler(
    new Euler((r[0] * Math.PI) / 180, (r[1] * Math.PI) / 180, (r[2] * Math.PI) / 180),
  )
  return new Matrix4().compose(
    new Vector3(p.position[0], p.position[1], p.position[2]),
    q,
    new Vector3(1, 1, 1),
  )
}

export interface GroupInstancing {
  /** The representative member whose geometry + material every instance shares
   *  (the renderer builds one `partGeometry`/`partMaterials` from it). */
  part: ShapePart
  /** Per-instance LOCAL matrices, index-aligned with `memberIds`. */
  matrices: Matrix4[]
  /** Member part ids in matrix order (for keys / selection). */
  memberIds: string[]
}

/**
 * Detect whether a `PartGroup` can render as a single InstancedMesh: it must have
 * ≥ {@link MIN_INSTANCE_MEMBERS} members that are geometry- AND material-identical
 * (differ only in transform), each a SINGLE-material primitive (not a combined
 * `mesh`, not a per-face box), none consumed by a combine group, none carrying a
 * decal (decals are per-part child overlays an InstancedMesh can't fan out).
 * Pure. Returns null when the group isn't instanceable (the caller then renders
 * its members individually, exactly as before).
 */
export function groupInstanceable(spec: AssetEditSpec, group: PartGroup): GroupInstancing | null {
  if (group.partIds.length < MIN_INSTANCE_MEMBERS) return null
  const consumed = combinedPartIds(spec)
  const members: ShapePart[] = []
  for (const id of group.partIds) {
    const p = spec.parts.find((pp) => pp.id === id)
    if (!p) return null
    if (p.kind === 'mesh') return null // baked CSG triangles — not a shared primitive
    if (consumed.has(p.id)) return null // folded into a combine — rendered elsewhere
    if (boxFaceFinishesActive(p)) return null // multi-material board — not one shared material
    if (decalsForPart(spec, p.id).length > 0) return null // per-part decal overlay
    members.push(p)
  }
  const key0 = instanceKey(members[0])
  if (!members.every((m) => instanceKey(m) === key0)) return null
  return {
    part: members[0],
    matrices: members.map(partMatrix),
    memberIds: members.map((m) => m.id),
  }
}
