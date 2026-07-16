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
import { forEachDecomposableMesh, meshVertexCount, srcRefFingerprint } from './decompose'
import type { SrcRef } from './editSpec'

/** A resolved cache entry — the centred, root-local-baked geometry plus the drift
 *  fingerprint recomputed from the CURRENT source scene at resolution time. */
interface SrcRefEntry {
  geo: BufferGeometry
  fp: string
}

/** defId::meshIndex → resolved geometry + current fingerprint (the decompose output). */
const cache = new Map<string, SrcRefEntry>()
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
 *  — `buildObject`/`partGeometry` read this and fall back to a placeholder box.
 *  When the ref carries a drift `fp` (Stage 9a review) that DOESN'T match the
 *  currently-resolved source mesh, returns null too — so a def replaced by a
 *  different GLB renders a placeholder box, never the wrong mesh. A legacy ref
 *  (no `fp`) skips the check and resolves as before. */
export function getCachedSrcRefGeometry(ref: SrcRef): BufferGeometry | null {
  const entry = cache.get(keyOf(ref))
  if (!entry) return null
  if (ref.fp !== undefined && ref.fp !== entry.fp) return null
  return entry.geo
}

/** True when a ref's source def IS loaded but the ref no longer resolves to
 *  matching geometry — the mesh at `meshPath` is gone or its fingerprint drifted
 *  (the source GLB was replaced). False while the def hasn't loaded yet (unknown,
 *  not drifted). Used to DROP drifted refs (with the existing toast) once the
 *  source has resolved, rather than leaving them as permanent placeholders. */
export function isSrcRefDrifted(ref: SrcRef): boolean {
  if (!loadedDefs.has(ref.defId)) return false
  return getCachedSrcRefGeometry(ref) === null
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
  // Count first so the fingerprint uses the total mesh count (matches decompose).
  let meshCount = 0
  forEachDecomposableMesh(root, () => {
    meshCount += 1
  })
  forEachDecomposableMesh(root, (mesh, i) => {
    const geo = mesh.geometry.clone()
    geo.applyMatrix4(new Matrix4().copy(invRoot).multiply(mesh.matrixWorld))
    geo.computeBoundingBox()
    const c = geo.boundingBox?.getCenter(new Vector3()) ?? new Vector3()
    geo.translate(-c.x, -c.y, -c.z)
    if (!geo.getAttribute('normal')) geo.computeVertexNormals()
    cache.set(`${defId}::${i}`, {
      geo,
      fp: srcRefFingerprint(mesh.name, meshVertexCount(mesh), meshCount),
    })
  })
  loadedDefs.add(defId)
  bump()
}

/**
 * Evict every resolved entry for a def (Stage 9a review) — call when the def is
 * REPLACED or REMOVED so a subsequent resolution re-loads the new GLB instead of
 * serving stale geometry. Disposes the cached geometries, forgets the def's
 * loaded/in-flight state, and bumps the epoch so the live preview re-renders
 * (its ref parts fall back to a placeholder until the new geometry resolves).
 * Idempotent. */
export function evictDefSrcRefs(defId: string): void {
  const prefix = `${defId}::`
  let removed = false
  for (const [key, entry] of cache) {
    if (key.startsWith(prefix)) {
      entry.geo.dispose()
      cache.delete(key)
      removed = true
    }
  }
  const had = loadedDefs.delete(defId)
  inflight.delete(defId)
  if (removed || had) bump()
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
  for (const { geo } of cache.values()) geo.dispose()
  cache.clear()
  loadedDefs.clear()
  inflight.clear()
  epoch = 0
  listeners.clear()
}
