/**
 * Slot configurator — GLB sub-asset options (SLOT-203).
 *
 * A slot option may be backed by a bundled CC0 GLB (`SlotOption.gltfUrl`) instead
 * of procedural box parts. This module owns everything that path needs beyond the
 * pure composition in `compose.ts`:
 *
 * - **pure helpers** (`namespaceFinishKey`, `fitScaleToFootprint`) — unit-testable
 *   without three.js;
 * - **the load path** (`loadSlotGltfScene`) — a raw `GLTFLoader` (Draco + meshopt
 *   + `EXT_texture_webp`) routed through the shared SEC-1 secure `LoadingManager`,
 *   so a bundled `/assets/…` URL is allowed but an embedded foreign `uri` is not;
 * - **per-slot finish-target namespacing** (`namespaceGltfFinishTargets`) — renames
 *   the loaded GLB's material groups to `<slot>::<name>` so `listFinishTargets`
 *   returns them without colliding when two slots load the same GLB.
 *
 * The renamed materials ride into the exported GLB (`saveConfigured.ts` →
 * `exportGlb`), so a placed configured product exposes the same namespaced
 * re-skin groups through the existing finish-override channel — no new schema.
 */

import type { Group, Material, Mesh, Object3D } from 'three'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { withBase } from '../../utils/assetUrl'
import { DRACO_DECODER_PATH } from '../gltf/decoders'
import type { FinishTarget } from '../gltf/finishTargets'
import { getSecureGltfManager } from '../gltf/loaderSecurity'
import { finishLabel } from './compose'

/** Separator between a slot namespace and the GLB's own material/mesh name. A
 *  double colon distinguishes namespaced GLB targets from procedural single-colon
 *  keys (`base:frame`) and survives `finishLabel`'s `[:_-]+ → space` humanisation. */
const SEP = '::'

/** Namespace a discovered finish-target key under a slot prefix (e.g.
 *  `('lamp', 'shade') → 'lamp::shade'`). Pure. */
export function namespaceFinishKey(prefix: string, key: string): string {
  return `${prefix}${SEP}${key}`
}

/**
 * Uniform scale that fits a loaded GLB (its measured bbox size, metres) to a
 * slot option's expected footprint height, preserving aspect. Bundled props are
 * already authored at real-metre scale (so this returns ~1), but computing it
 * from the loaded bounds keeps a slightly-off asset honest to its declared size.
 * Pure; degenerate/zero inputs fall back to 1 (never distort to 0/∞).
 */
export function fitScaleToFootprint(
  loadedSize: readonly [number, number, number],
  footprint: { w: number; d: number; h: number },
): number {
  const h = loadedSize[1]
  if (!(h > 1e-4) || !(footprint.h > 1e-4)) return 1
  const s = footprint.h / h
  return Number.isFinite(s) && s > 0 ? s : 1
}

let cachedLoader: GLTFLoader | null = null

/** The one `GLTFLoader` this module reuses — secure manager (SEC-1) + Draco +
 *  meshopt, matching how the bundled props are packed (`EXT_texture_webp` decodes
 *  natively in the browser). */
function getLoader(): GLTFLoader {
  if (cachedLoader) return cachedLoader
  const manager = getSecureGltfManager()
  const loader = new GLTFLoader(manager)
  const draco = new DRACOLoader(manager)
  // Reuse the single self-hosted/base-aware Draco path (`gltf/decoders.ts`) so
  // this loader can't drift from the shared drei one (SLOT-203 fix).
  draco.setDecoderPath(DRACO_DECODER_PATH)
  loader.setDRACOLoader(draco)
  loader.setMeshoptDecoder(MeshoptDecoder)
  cachedLoader = loader
  return loader
}

/** Parsed-scene cache: `url` → its parse Promise, so repeated attaches of the
 *  same slot GLB (a selection change, two slots sharing one asset) decode it
 *  ONCE instead of re-fetching + re-parsing per click. Keyed ONLY by BUNDLED
 *  urls (`/assets/…`) — a `data:`/`blob:` option GLB (a designer-exported user
 *  product, potentially large + re-minted on every re-export) is NEVER cached,
 *  so the map can't grow unbounded across a session (finding 6). */
const sceneCache = new Map<string, Promise<GLTF>>()

/** True for a non-bundled inline/object url — a designer-exported product's
 *  self-contained GLB. These are deliberately kept out of `sceneCache`. */
function isInlineUrl(url: string): boolean {
  return url.startsWith('data:') || url.startsWith('blob:')
}

/** Drop a single cached slot-scene parse (call when its user product is
 *  removed/replaced so a stale template can't be re-attached). No-op for an
 *  uncached url. `data:`/`blob:` urls are never cached, so this only matters for
 *  bundled urls. */
export function evictSlotScene(url: string): void {
  sceneCache.delete(url)
}

/** Load a bundled slot GLB into a scene `Group`. The `gltfUrl` is stored
 *  root-relative (`/assets/…`); `withBase` makes it correct under the prod
 *  sub-path base. A BUNDLED parse is cached per url (above), then each call
 *  returns an independent `scene.clone(true)` whose MATERIALS are cloned
 *  per-attach — so `namespaceGltfFinishTargets`'s in-place renaming (and any
 *  later per-slot tint) can't leak between two instances, or back onto the
 *  cached template. A `data:`/`blob:` url (user product) is parsed fresh each
 *  attach (never cached). Geometry and textures stay shared with the template
 *  (cheap to re-upload; never renamed); the caller still disposes the returned
 *  subtree's materials/textures (`disposeConfiguredObject`). */
export async function loadSlotGltfScene(url: string): Promise<Group> {
  let parse = sceneCache.get(url)
  if (!parse) {
    parse = getLoader().loadAsync(withBase(url))
    // Only bundled urls are cached; inline (data:/blob:) urls are one-shot.
    if (!isInlineUrl(url)) sceneCache.set(url, parse)
  }
  const gltf = await parse
  const scene = gltf.scene.clone(true)
  scene.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => m.clone())
      : mesh.material.clone()
  })
  return scene
}

/**
 * Rename every material group in a freshly-loaded GLB piece to `<prefix>::<name>`
 * (falling back to the mesh name, then `part`) and return the resulting finish
 * targets. Mutates the loaded materials in place — safe because the scene is
 * freshly parsed and owned by this build. A material object shared across meshes
 * is renamed once (guarded), so it can't be double-namespaced.
 */
export function namespaceGltfFinishTargets(root: Object3D, prefix: string): FinishTarget[] {
  const targets: FinishTarget[] = []
  const seenKey = new Set<string>()
  const done = new Set<Material>()
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const m of mats) {
      if (!m || done.has(m)) continue
      done.add(m)
      const base = m.name?.length ? m.name : mesh.name || 'part'
      const key = namespaceFinishKey(prefix, base)
      m.name = key
      if (!seenKey.has(key)) {
        seenKey.add(key)
        targets.push({ key, label: finishLabel(key) })
      }
    }
  })
  return targets
}
