/**
 * GLB Asset Designer — lazy resolution cache for GLB-decompose REFERENCE parts
 * (Asset Studio Stage 9a). A `mesh` `ShapePart` decomposed from a GLB def carries
 * a `srcRef` (defId + mesh index) instead of inlined triangles; this module turns
 * that ref back into real geometry on demand.
 *
 * Resolution loads the def's GLB ONCE through the SEC-1 loader (so an embedded
 * foreign `uri` can't beacon out), walks its decomposable meshes in the SAME order
 * `decompose.ts` did (`forEachDecomposableMesh`), and bakes+re-centres each mesh's
 * geometry EXACTLY as the decompose pass produced it — so a resolved part is
 * pixel-identical to the source mesh and lands at the stored `position`. Resolved
 * geometries live in a module cache keyed by `defId::meshIndex`; `buildObject`
 * reads the cache synchronously (a placeholder box shows until it resolves), and an
 * epoch bump lets the live preview re-render the moment a def finishes loading.
 *
 * The cache is unbounded but keyed by def — a designer session references a handful
 * of source defs, each loaded once; nothing per-frame or per-part is minted.
 */

import { type BufferGeometry, Matrix4, type Object3D, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { getSecureGltfManager } from '../gltf/loaderSecurity'
import { forEachDecomposableMesh } from './decompose'
import type { SrcRef } from './editSpec'

/** defId::meshIndex → centred, root-local-baked geometry (the decompose output). */
const cache = new Map<string, BufferGeometry>()
/** defIds whose whole GLB has been resolved into the cache. */
const loadedDefs = new Set<string>()
/** In-flight loads, so concurrent `ensureDefSrcRefs` for one def share the fetch. */
const inflight = new Map<string, Promise<void>>()

let epoch = 0
const listeners = new Set<() => void>()

function keyOf(ref: SrcRef): string {
  return `${ref.defId}::${ref.meshPath}`
}

/** The resolved geometry for a ref, or null while it hasn't loaded yet. Synchronous
 *  — `buildObject`/`partGeometry` read this and fall back to a placeholder box. */
export function getCachedSrcRefGeometry(ref: SrcRef): BufferGeometry | null {
  return cache.get(keyOf(ref)) ?? null
}

/** Subscribe to resolution events (a def finished loading) — the preview re-renders
 *  ref parts. Returns an unsubscribe. */
export function subscribeSrcRef(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** The current resolution epoch (bumped when a def resolves) — a `useSyncExternalStore`
 *  snapshot for the preview. */
export function getSrcRefEpoch(): number {
  return epoch
}

function bump(): void {
  epoch += 1
  for (const l of listeners) l()
}

/**
 * Populate the cache from an already-loaded scene (Stage 9a) — used by the decompose
 * loader, which loads a GLB once and both decomposes it AND seeds the cache from the
 * same scene, so the preview resolves immediately without a second fetch. Idempotent.
 */
export function populateSrcRefCacheFromScene(defId: string, root: Object3D): void {
  if (loadedDefs.has(defId)) return
  root.updateWorldMatrix(true, true)
  const invRoot = new Matrix4().copy(root.matrixWorld).invert()
  forEachDecomposableMesh(root, (mesh, i) => {
    const geo = mesh.geometry.clone()
    geo.applyMatrix4(new Matrix4().copy(invRoot).multiply(mesh.matrixWorld))
    geo.computeBoundingBox()
    const c = geo.boundingBox?.getCenter(new Vector3()) ?? new Vector3()
    geo.translate(-c.x, -c.y, -c.z)
    if (!geo.getAttribute('normal')) geo.computeVertexNormals()
    cache.set(`${defId}::${i}`, geo)
  })
  loadedDefs.add(defId)
  bump()
}

/** Load a def's GLB scene through the SEC-1 loader (a fresh loader per call, so the
 *  shared manager's foreign-URL policy applies). */
export async function loadGlbScene(url: string): Promise<Object3D> {
  const loader = new GLTFLoader(getSecureGltfManager())
  const gltf = await loader.loadAsync(url)
  return gltf.scene
}

/**
 * Resolve every mesh of a def's GLB into the cache (idempotent; concurrent calls
 * share one fetch). No-op once the def is loaded. The def's `runtimeUrl` (a blob:
 * URL) is the source.
 */
async function ensureDefSrcRefs(defId: string, url: string): Promise<void> {
  if (loadedDefs.has(defId)) return
  let p = inflight.get(defId)
  if (!p) {
    p = (async () => {
      const scene = await loadGlbScene(url)
      populateSrcRefCacheFromScene(defId, scene)
    })().finally(() => inflight.delete(defId))
    inflight.set(defId, p)
  }
  return p
}

/**
 * Resolve all `srcRef` parts a spec references, given a `resolveUrl` that maps a
 * defId → its runtime URL (or null when the def is gone). Awaited before an export
 * so `buildObject` bakes real geometry into the GLB. A defId that resolves to no
 * URL is skipped (its parts stay placeholders / are dropped by the restore guard).
 */
export async function ensureSpecSrcRefs(
  defIds: Iterable<string>,
  resolveUrl: (defId: string) => string | null,
): Promise<void> {
  await Promise.all(
    [...new Set(defIds)].map((id) => {
      const url = resolveUrl(id)
      return url ? ensureDefSrcRefs(id, url) : Promise.resolve()
    }),
  )
}

/** Test-only: clear the module cache so cases don't leak resolved geometry. */
export function __resetSrcRefCacheForTest(): void {
  for (const g of cache.values()) g.dispose()
  cache.clear()
  loadedDefs.clear()
  inflight.clear()
  epoch = 0
  listeners.clear()
}
