import type { Intersection, Object3D } from 'three'

/**
 * Raycast → measurable-surface-point filter for walk-mode point-to-point
 * measure (WALK-MEASURE). Pure (only type-only three imports, no runtime
 * three dependency) so it unit-tests with faked `Object3D`/`Intersection`
 * shapes, matching `collision/aimRay.ts`'s style.
 */

/** True when the object and every ancestor is visible. Three's `Raycaster`
 *  does not skip invisible meshes (mirrors `scene/finishDropTarget.ts`'s
 *  identical, non-exported helper — duplicated here rather than imported
 *  since that module is a UI-adjacent classifier, not collision math). A
 *  camera-facing wall reveal hides a wall by toggling `visible`, so a
 *  measurement must not land on one the player can't currently see. */
function effectivelyVisible(obj: Object3D): boolean {
  for (let cur: Object3D | null = obj; cur; cur = cur.parent) {
    if (cur.visible === false) return false
  }
  return true
}

/** True when the object or an ancestor carries the app's `noExport`
 *  `userData` tag — the existing convention for auxiliary overlay geometry
 *  (selection/rotate gizmos, the orbit-mode tape measure, dimension
 *  overlays, placement ghosts, and this very measure tool's own markers/line)
 *  that must never be treated as a real surface to measure to. */
function isAuxiliaryOverlay(obj: Object3D): boolean {
  for (let cur: Object3D | null = obj; cur; cur = cur.parent) {
    if ((cur.userData as { noExport?: boolean } | undefined)?.noExport) return true
  }
  return false
}

/**
 * Nearest real, visible, non-auxiliary surface point from a raycast hit list
 * (already sorted near→far, as `Raycaster.intersectObjects` returns them).
 * Returns `null` on an all-miss (aiming through an open door/window into
 * empty sky) or when every hit is invisible/auxiliary overlay geometry.
 */
export function nearestMeasurableHit(
  hits: readonly Pick<Intersection, 'object' | 'point'>[],
): [number, number, number] | null {
  for (const hit of hits) {
    if (!hit.object || !effectivelyVisible(hit.object) || isAuxiliaryOverlay(hit.object)) continue
    return [hit.point.x, hit.point.y, hit.point.z]
  }
  return null
}
