/**
 * Decide whether a whole-scene 3D export (Q-3DEXPORT tail) is big enough that
 * running `GLTFExporter`/`OBJExporter`/`STLExporter`/`USDZExporter` synchronously
 * on the main thread would visibly stall the UI. `GLTFExporter.parse()` (and
 * friends) is a single, un-yielding synchronous call over the whole scene graph
 * — for a small furnished room it finishes in a blink; for a very large scene
 * (a whole multi-room home, or an import-heavy design) it can run long enough to
 * freeze scrolling/input.
 *
 * Pure + side-effect-free so the decision is unit-testable without a live
 * three.js scene or a browser (`shouldUseWorkerExport`); `computeExportStats`
 * takes a real (already-pruned, see `buildExportRoot`) `Object3D` and does a
 * single cheap traversal (no attribute-array reads beyond `.count`).
 */

import type { Object3D } from 'three'

export interface ExportStats {
  /** Number of exportable mesh/line/points nodes in the (pruned) export root. */
  meshCount: number
  /** Sum of per-mesh triangle-ish primitive counts (index/3 or position/3) —
   *  an estimate, not an exact glTF primitive count (multi-material groups,
   *  lines/points are counted as whole meshes). Good enough to gate a
   *  perf-only decision. */
  triangleEstimate: number
}

/** Above this mesh count, a scene is "very large" regardless of triangle
 *  density — many small items (hundreds of furniture instances) cost the
 *  exporter mostly in per-node/per-material JSON bookkeeping, not vertices. */
export const WORKER_EXPORT_MESH_THRESHOLD = 400

/** Above this triangle estimate, a scene is "very large" regardless of node
 *  count — a handful of dense imported GLBs (statues, architectural detail)
 *  can dominate export time even with few nodes. */
export const WORKER_EXPORT_TRIANGLE_THRESHOLD = 250_000

/** True when the export should run on the worker/streamed path instead of the
 *  synchronous main-thread call. Either signal alone is enough to trip it —
 *  a scene can be slow because it's wide (many nodes) or deep (few huge ones). */
export function shouldUseWorkerExport(stats: ExportStats): boolean {
  return (
    stats.meshCount > WORKER_EXPORT_MESH_THRESHOLD ||
    stats.triangleEstimate > WORKER_EXPORT_TRIANGLE_THRESHOLD
  )
}

/** Minimal shape this walk needs from a mesh-like node — matches three's
 *  `Mesh`/`Line`/`Points` well enough without importing their concrete
 *  classes (keeps this module cheap to unit-test with faked geometry). */
interface GeometryLike {
  index?: { count: number } | null
  attributes?: { position?: { count: number } }
}
interface MeshLike {
  isMesh?: boolean
  isLine?: boolean
  isPoints?: boolean
  geometry?: GeometryLike
}

function estimateTriangles(geometry: GeometryLike | undefined): number {
  if (!geometry) return 0
  const count = geometry.index ? geometry.index.count : (geometry.attributes?.position?.count ?? 0)
  return Math.floor(count / 3)
}

/** Walk an already-pruned export root and tally mesh/line/points nodes +
 *  an estimated triangle count. Cheap: only reads `.count` fields, never
 *  touches attribute array contents. */
export function computeExportStats(root: Object3D): ExportStats {
  let meshCount = 0
  let triangleEstimate = 0
  root.traverse((obj) => {
    const node = obj as unknown as MeshLike
    if (!node.isMesh && !node.isLine && !node.isPoints) return
    meshCount++
    triangleEstimate += estimateTriangles(node.geometry)
  })
  return { meshCount, triangleEstimate }
}
