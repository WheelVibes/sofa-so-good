import type { Intersection, Object3D } from 'three'
import type { FinishDropTarget } from '../materials/finishDrop'

/**
 * Raycast → finish-drop-target classification (Q31 part 2). Scene meshes carry
 * small `userData` tags — `{ itemId }` on a furniture item's root group,
 * `{ finishTarget: { kind: 'floor' | 'wall', roomId } }` on room floor meshes
 * and interior wall-finish faces — and this module maps a raycast hit list to
 * the `FinishDropTarget` that `materials/finishDrop.ts` routes. Pure (plain
 * object walks, no three imports at runtime) so it unit-tests with faked
 * Object3D hierarchies.
 */

/** `userData` tag for a room surface that can receive a dragged finish. */
export interface FinishSurfaceTag {
  kind: 'floor' | 'wall'
  roomId: string
}

/** Build the `userData` payload for a floor/wall surface mesh (typed helper so
 *  taggers and the classifier can't drift apart on the key/shape). */
export function finishSurfaceUserData(
  kind: FinishSurfaceTag['kind'],
  roomId: string,
): { finishTarget: FinishSurfaceTag } {
  return { finishTarget: { kind, roomId } }
}

function readSurfaceTag(v: unknown): FinishSurfaceTag | null {
  if (!v || typeof v !== 'object') return null
  const t = v as Partial<FinishSurfaceTag>
  if ((t.kind === 'floor' || t.kind === 'wall') && typeof t.roomId === 'string' && t.roomId) {
    return { kind: t.kind, roomId: t.roomId }
  }
  return null
}

/**
 * Classify one scene object by walking it and its ancestors for a finish tag.
 * An `itemId` tag (furniture root group) wins at the nearest tagged ancestor;
 * floor/wall tags come from `finishTarget`. Untagged hierarchies → null.
 */
export function classifyFinishDropObject(
  obj: Object3D | null | undefined,
): FinishDropTarget | null {
  for (let cur: Object3D | null | undefined = obj; cur; cur = cur.parent) {
    const ud = cur.userData as { itemId?: unknown; finishTarget?: unknown } | undefined
    if (!ud) continue
    if (typeof ud.itemId === 'string' && ud.itemId) return { kind: 'item', itemId: ud.itemId }
    const tag = readSurfaceTag(ud.finishTarget)
    if (tag) return { kind: tag.kind, roomId: tag.roomId }
  }
  return null
}

/** True when the object and every ancestor are visible. Three's Raycaster does
 *  not skip invisible meshes, and the camera-facing wall reveal hides walls by
 *  toggling `visible` — a drop must not land on a wall the user can't see. */
function effectivelyVisible(obj: Object3D): boolean {
  for (let cur: Object3D | null = obj; cur; cur = cur.parent) {
    if (cur.visible === false) return false
  }
  return true
}

/**
 * Pick the drop target from a raycaster hit list (already sorted near→far).
 * Invisible hits (revealed walls) and untagged hits (grid, gizmos, backdrop,
 * ground, sky) are skipped, so a drop lands on the nearest *finishable* thing
 * under the cursor; an all-miss (empty sky) returns null for a safe no-op.
 */
export function findFinishDropTarget(
  hits: readonly Pick<Intersection, 'object'>[],
): FinishDropTarget | null {
  for (const hit of hits) {
    if (!hit.object || !effectivelyVisible(hit.object)) continue
    const target = classifyFinishDropObject(hit.object)
    if (target) return target
  }
  return null
}
