import type { Material, Mesh, Object3D } from 'three'

/**
 * A finish target is a named group of meshes in an imported GLB that share a
 * material — the unit a user can re-skin (e.g. "Wood" frame vs "Fabric"
 * cushion). We key by material name when present (most authored GLBs name
 * their materials), else by mesh name.
 */
export interface FinishTarget {
  key: string
  label: string
}

function materialName(m: Material | Material[] | undefined): string {
  if (!m) return ''
  const first = Array.isArray(m) ? m[0] : m
  return first?.name ?? ''
}

export function listFinishTargets(root: Object3D): FinishTarget[] {
  const keys = new Set<string>()
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    const key = materialName(mesh.material) || mesh.name
    if (key) keys.add(key)
  })
  return [...keys].map((key) => ({ key, label: key }))
}

/** True if a mesh belongs to the given finish-target key. */
export function meshMatchesTarget(mesh: Mesh, key: string): boolean {
  return (materialName(mesh.material) || mesh.name) === key
}
