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
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { withBase } from '../../utils/assetUrl'
import type { FinishTarget } from '../gltf/finishTargets'
import { getSecureGltfManager } from '../gltf/loaderSecurity'

/** Separator between a slot namespace and the GLB's own material/mesh name. A
 *  double colon distinguishes namespaced GLB targets from procedural single-colon
 *  keys (`base:frame`) and survives `finishLabel`'s `[:_-]+ → space` humanisation. */
const SEP = '::'

/** Namespace a discovered finish-target key under a slot prefix (e.g.
 *  `('lamp', 'shade') → 'lamp::shade'`). Pure. */
export function namespaceFinishKey(prefix: string, key: string): string {
  return `${prefix}${SEP}${key}`
}

/** Humanise a namespaced key for display (`lamp::desk_lamp_arm → "Lamp desk lamp arm"`). */
function humanize(key: string): string {
  const words = key.replace(/[:_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
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
  draco.setDecoderPath(withBase('/draco/'))
  loader.setDRACOLoader(draco)
  loader.setMeshoptDecoder(MeshoptDecoder)
  cachedLoader = loader
  return loader
}

/** Load a bundled slot GLB into its scene `Group`. The `gltfUrl` is stored
 *  root-relative (`/assets/…`); `withBase` makes it correct under the prod
 *  sub-path base. Each call re-parses (no scene cache), so the caller owns —
 *  and disposes — the returned geometry/materials/textures. */
export async function loadSlotGltfScene(url: string): Promise<Group> {
  const gltf = await getLoader().loadAsync(withBase(url))
  return gltf.scene
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
      const base = m.name && m.name.length ? m.name : mesh.name || 'part'
      const key = namespaceFinishKey(prefix, base)
      m.name = key
      if (!seenKey.has(key)) {
        seenKey.add(key)
        targets.push({ key, label: humanize(key) })
      }
    }
  })
  return targets
}
