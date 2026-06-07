import type { Intersection, Mesh, Ray, Raycaster } from 'three'

/**
 * Ref callback that patches a mesh's `raycast` so any hit it produces sorts
 * first (distance ≈ 0). Floor-level interaction planes/handles draw always-on-top
 * (depthTest:false) but the R3F event system picks the geometrically-closest
 * mesh — without this, taller furniture/walls over the plane would steal the
 * pointer. Makes the visible handle (or capture plane) the click target wherever
 * it's drawn. Idempotent. Shared by the rotate gizmo + the tape-measure plane.
 */
export function priorityRaycast(mesh: Mesh | null) {
  if (!mesh || (mesh as { __priorityPatched?: boolean }).__priorityPatched) return
  const original = mesh.raycast.bind(mesh)
  mesh.raycast = (raycaster: Raycaster, intersects: Intersection[]) => {
    const before = intersects.length
    original(raycaster as Raycaster & { ray: Ray }, intersects)
    for (let i = before; i < intersects.length; i++) intersects[i].distance = 1e-4
  }
  ;(mesh as { __priorityPatched?: boolean }).__priorityPatched = true
}
