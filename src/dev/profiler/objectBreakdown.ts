import type { BufferGeometry, Material, Mesh, Object3D } from 'three'
import type { ObjectCost } from './profilerTypes'

/** Triangle count of a geometry (indexed or not). 0 if unknown. */
function triCount(geom: BufferGeometry | undefined): number {
  if (!geom) return 0
  const index = geom.index
  if (index) return Math.floor(index.count / 3)
  const pos = geom.attributes.position
  return pos ? Math.floor(pos.count / 3) : 0
}

/** Walk up from `obj` to the nearest ancestor carrying `userData.itemId`. */
function itemIdOf(obj: Object3D): string | null {
  let cur: Object3D | null = obj
  while (cur) {
    const id = cur.userData?.itemId
    if (typeof id === 'string') return id
    cur = cur.parent
  }
  return null
}

interface Acc {
  triangles: number
  meshes: number
  materials: Set<Material>
}

/**
 * Rank placed furniture items by GPU cost. Traverses `root`, attributes each
 * mesh to the nearest ancestor with `userData.itemId` (set on furniture roots
 * in `furniture/Furniture.tsx`), and sums triangles, mesh count (≈ draw calls),
 * and distinct materials. Pure — no side effects, deterministic ordering.
 */
export function buildObjectBreakdown(
  root: Object3D,
  nameFor: (itemId: string) => string,
): ObjectCost[] {
  const byItem = new Map<string, Acc>()
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return
    const itemId = itemIdOf(obj)
    if (!itemId) return
    let acc = byItem.get(itemId)
    if (!acc) {
      acc = { triangles: 0, meshes: 0, materials: new Set() }
      byItem.set(itemId, acc)
    }
    acc.triangles += triCount(mesh.geometry as BufferGeometry)
    acc.meshes += 1
    const mat = mesh.material
    if (Array.isArray(mat)) for (const m of mat) acc.materials.add(m)
    else if (mat) acc.materials.add(mat)
  })
  const out: ObjectCost[] = []
  for (const [itemId, acc] of byItem) {
    out.push({
      itemId,
      name: nameFor(itemId),
      triangles: acc.triangles,
      meshes: acc.meshes,
      materials: acc.materials.size,
    })
  }
  return out.sort((a, b) => b.triangles - a.triangles)
}
