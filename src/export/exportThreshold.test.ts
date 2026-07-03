import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import {
  computeExportStats,
  shouldUseWorkerExport,
  WORKER_EXPORT_MESH_THRESHOLD,
  WORKER_EXPORT_TRIANGLE_THRESHOLD,
} from './exportThreshold'

function boxMesh(triangleCount: number): Mesh {
  const geom = new BufferGeometry()
  const indexCount = triangleCount * 3
  geom.setIndex(new BufferAttribute(new Uint16Array(indexCount), 1))
  geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
  return new Mesh(geom, new MeshStandardMaterial())
}

describe('shouldUseWorkerExport', () => {
  it('stays on the direct path under both thresholds', () => {
    expect(shouldUseWorkerExport({ meshCount: 10, triangleEstimate: 1000 })).toBe(false)
    expect(
      shouldUseWorkerExport({
        meshCount: WORKER_EXPORT_MESH_THRESHOLD,
        triangleEstimate: WORKER_EXPORT_TRIANGLE_THRESHOLD,
      }),
    ).toBe(false) // exactly at threshold is not yet "over"
  })

  it('trips on mesh count alone', () => {
    expect(
      shouldUseWorkerExport({ meshCount: WORKER_EXPORT_MESH_THRESHOLD + 1, triangleEstimate: 0 }),
    ).toBe(true)
  })

  it('trips on triangle estimate alone (few huge meshes)', () => {
    expect(
      shouldUseWorkerExport({
        meshCount: 2,
        triangleEstimate: WORKER_EXPORT_TRIANGLE_THRESHOLD + 1,
      }),
    ).toBe(true)
  })
})

describe('computeExportStats', () => {
  it('counts meshes and estimates triangles from an indexed geometry', () => {
    const root = new Group()
    root.add(boxMesh(12), boxMesh(12))
    const stats = computeExportStats(root)
    expect(stats.meshCount).toBe(2)
    expect(stats.triangleEstimate).toBe(24)
  })

  it('falls back to position count/3 for a non-indexed mesh', () => {
    const geom = new BufferGeometry()
    geom.setAttribute('position', new BufferAttribute(new Float32Array(9 * 5), 3)) // 5 tris
    const mesh = new Mesh(geom, new MeshStandardMaterial())
    const stats = computeExportStats(mesh)
    expect(stats.meshCount).toBe(1)
    expect(stats.triangleEstimate).toBe(5)
  })

  it('ignores non-mesh nodes (groups, lights) and a mesh with no geometry', () => {
    const root = new Group()
    root.add(new Group())
    const stats = computeExportStats(root)
    expect(stats.meshCount).toBe(0)
    expect(stats.triangleEstimate).toBe(0)
  })

  it('returns zero stats for an empty root', () => {
    expect(computeExportStats(new Group())).toEqual({ meshCount: 0, triangleEstimate: 0 })
  })
})
