/**
 * GLB Asset Designer — Stage 3b snap-to-surface placement math (the SWOOD
 * pattern: click a face, the component lands oriented). Pure of React/store —
 * three's math classes need no GPU, so this is unit-testable.
 *
 * A clicked face gives a world POINT + world NORMAL. A component declares a local
 * mount axis (`components.ts`: `floor` → `(0,−1,0)`, `wall` → `(0,0,1)`). We build
 * the minimal rotation that maps that axis onto the face normal, snap the hit
 * point to 5 mm, and hand both to `addPlacedComponent` as a named `PartGroup`
 * transform. For the canonical cases the result reads right:
 *   - a leg on a table UNDERSIDE (normal `(0,−1,0)`) → identity → hangs straight
 *     down, its top flush on the underside plane;
 *   - a bar pull on a vertical face (normal `(0,0,1)`/`(±1,0,0)`) → the rotation
 *     is about the vertical axis, so the bar stays horizontal against the face.
 */

import { Euler, Quaternion, Vector3 } from 'three'
import { buildComponentParts, type ComponentDef, type ComponentMount } from './components'
import { type AssetEditSpec, addPlacedComponent } from './editSpec'
import { normalizeDeg, snapValue } from './gizmoWriteBack'

/** Position snap for a placed component (5 mm — matches the gizmo). */
const POSITION_SNAP_M = 0.005

/** A clicked face: the world-space hit point + the world-space surface normal. */
export interface FaceHit {
  point: [number, number, number]
  normal: [number, number, number]
}

/** The local axis a mount aligns to the face normal (see `components.ts`). */
export function mountAxis(mount: ComponentMount): [number, number, number] {
  return mount === 'floor' ? [0, -1, 0] : [0, 0, 1]
}

/**
 * The `PartGroup` transform for landing a `mount` component on `hit`: the minimal
 * rotation mapping the local mount axis onto the (normalised) face normal, and
 * the 5 mm-snapped hit point. An all-zero rotation is returned as `undefined`
 * (identity → absent field, matching the spec convention). Pure.
 */
export function componentTransform(
  mount: ComponentMount,
  hit: FaceHit,
): { position: [number, number, number]; rotation?: [number, number, number] } {
  const n = new Vector3(hit.normal[0], hit.normal[1], hit.normal[2])
  if (n.lengthSq() < 1e-9) n.set(0, 1, 0)
  n.normalize()
  const axis = new Vector3(...mountAxis(mount))
  const q = new Quaternion().setFromUnitVectors(axis, n)
  const e = new Euler().setFromQuaternion(q, 'XYZ')
  const deg = [e.x, e.y, e.z].map((rad) => normalizeDeg(snapValue((rad * 180) / Math.PI, 1))) as [
    number,
    number,
    number,
  ]
  const position = hit.point.map((v) => snapValue(v, POSITION_SNAP_M)) as [number, number, number]
  return { position, rotation: deg.every((v) => v === 0) ? undefined : deg }
}

/**
 * Place a component onto a clicked face: build its parts, orient them to the
 * face normal, snap, and land them as a named `PartGroup` (via
 * `addPlacedComponent`). Returns `{ spec, groupId }` (groupId null if the builder
 * emits nothing). Pure — the caller commits the spec + selects the group.
 */
export function placeComponentOnFace(
  spec: AssetEditSpec,
  def: ComponentDef,
  overrides: Record<string, number>,
  hit: FaceHit,
): { spec: AssetEditSpec; groupId: string | null } {
  const parts = buildComponentParts(def, overrides)
  const { position, rotation } = componentTransform(def.mount, hit)
  return addPlacedComponent(spec, parts, def.name, position, rotation)
}
