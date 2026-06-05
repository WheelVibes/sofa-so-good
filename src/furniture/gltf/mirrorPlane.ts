import { Box3, type Mesh, type Object3D, Vector3 } from 'three'

/** A detected flat reflective surface in a GLB, in the model's local space.
 *  `axis` is the thin (normal) axis; `sx/sy/sz` are the bbox extents. */
export interface MirrorPlane {
  center: [number, number, number]
  axis: 'x' | 'y' | 'z'
  sx: number
  sy: number
  sz: number
}

interface MeshBox {
  center: [number, number, number]
  size: [number, number, number]
}

/** Pure: pick the largest near-flat mesh box to use as the mirror surface.
 *  "Near-flat" = the thinnest extent is well under the other two; score is the
 *  area of that flat face. Returns null when nothing is convincingly flat. */
export function pickMirrorPlane(boxes: MeshBox[]): MirrorPlane | null {
  let best: MirrorPlane | null = null
  let bestArea = 0
  for (const b of boxes) {
    const [sx, sy, sz] = b.size
    if (sx <= 0 || sy <= 0 || sz <= 0) continue
    const min = Math.min(sx, sy, sz)
    const axis: 'x' | 'y' | 'z' = min === sx ? 'x' : min === sy ? 'y' : 'z'
    // The two non-thin extents.
    const others = [sx, sy, sz].filter((_, i) => ['x', 'y', 'z'][i] !== axis)
    const maxOther = Math.max(others[0], others[1])
    // Require a genuinely thin slab (thin axis < 25% of the larger face dim).
    if (min > maxOther * 0.25) continue
    const area = others[0] * others[1]
    if (area > bestArea) {
      bestArea = area
      best = { center: b.center, axis, sx, sy, sz }
    }
  }
  return best
}

/** Detect the mirror plane of a (cloned) GLB root, in its local space. */
export function detectMirrorPlane(root: Object3D): MirrorPlane | null {
  root.updateWorldMatrix(true, true)
  const boxes: MeshBox[] = []
  const meshBox = new Box3()
  const size = new Vector3()
  const center = new Vector3()
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    const gb = mesh.geometry.boundingBox
    if (!gb) return
    meshBox.copy(gb).applyMatrix4(mesh.matrixWorld)
    meshBox.getSize(size)
    meshBox.getCenter(center)
    boxes.push({ center: [center.x, center.y, center.z], size: [size.x, size.y, size.z] })
  })
  return pickMirrorPlane(boxes)
}

/** Hide every mesh whose bbox centre matches the plane's (the original
 *  reflective surface), so the overlaid reflector replaces it. Returns the
 *  meshes hidden so the caller can restore them. */
export function hideMirrorMesh(root: Object3D, plane: MirrorPlane): Mesh[] {
  const hidden: Mesh[] = []
  const meshBox = new Box3()
  const center = new Vector3()
  const [cx, cy, cz] = plane.center
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    const gb = mesh.geometry.boundingBox
    if (!gb) return
    meshBox.copy(gb).applyMatrix4(mesh.matrixWorld)
    meshBox.getCenter(center)
    if (
      Math.abs(center.x - cx) < 1e-3 &&
      Math.abs(center.y - cy) < 1e-3 &&
      Math.abs(center.z - cz) < 1e-3
    ) {
      mesh.visible = false
      hidden.push(mesh)
    }
  })
  return hidden
}
