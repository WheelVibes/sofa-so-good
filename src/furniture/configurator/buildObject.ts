/**
 * Slot configurator — composed model → three.js object (SLOT-102 / SLOT-203).
 *
 * Maps `composeProduct`'s procedural parts to a `Group` of box meshes, reusing
 * `furnitureMaterials.ts` so the preview can't drift from the baked GLB. To make
 * the baked product re-skinnable through the existing finish-override channel,
 * every part sharing a `finishKey` gets ONE cloned material named after that key
 * — so `listFinishTargets` discovers the same keys `composeProduct` returns.
 *
 * GLB-sub-asset options (SLOT-203) load here: each composed `gltfPiece` is
 * fetched (`loadSlotGltfScene`), fitted to its slot footprint, reparented under a
 * holder at the slot anchor (position + quarter-turn), and its material groups
 * namespaced per-slot (`namespaceGltfFinishTargets`) so they join the returned
 * finish targets without colliding. A GLB that fails to load is skipped
 * (fail-soft) rather than failing the whole build. Browser-only (canvas textures
 * + real GLB decode).
 */

import { Box3, BoxGeometry, Group, type Material, Mesh, type Texture, Vector3 } from 'three'
import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import { type ComposedModel, composeProduct } from './compose'
import { fitScaleToFootprint, loadSlotGltfScene, namespaceGltfFinishTargets } from './gltfSlot'
import type { ConfigurableProduct, ConfiguredSpec } from './model'

export interface BuiltConfigured {
  object: Group
  model: ComposedModel
  /** Re-skin targets present in the baked GLB — procedural part groups PLUS the
   *  per-slot-namespaced groups discovered from any GLB sub-asset options. */
  finishTargets: { key: string; label: string }[]
}

/** Marks a holder group whose subtree is a freshly-loaded GLB piece, so disposal
 *  frees its owned materials + textures (procedural clones share cached textures
 *  and must not). */
const GLTF_HOLDER = '__configuratorGltf'

/** Build the procedural box meshes (sync — no network) into a fresh Group. One
 *  cloned, finishKey-named material per part group → distinct material names in
 *  the exported GLB so the finish-override channel can target each group. Cloning
 *  shares the cached base's textures (no per-instance allocation); the clones are
 *  disposed with the group. */
function buildProceduralGroup(model: ComposedModel): Group {
  const group = new Group()
  const matByKey = new Map<string, Material>()
  for (const part of model.parts) {
    const key = part.finishKey ?? part.role
    let mat = matByKey.get(key)
    if (!mat) {
      const base = getSurfaceMaterial(part.material ?? 'painted', part.color ?? '#cccccc', 1)
      mat = base.clone()
      mat.name = key
      matByKey.set(key, mat)
    }
    const mesh = new Mesh(new BoxGeometry(...part.size), mat)
    mesh.position.set(...part.position)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.name = key
    group.add(mesh)
  }
  return group
}

/**
 * Load ONE GLB piece and reparent it into `group` at its slot anchor (SLOT-203):
 * load → fit to the option footprint → reparent under a holder (scale/rotation
 * about the anchor origin, so the GLB's floor-centred base stays seated at
 * anchor.y) → namespace its material groups per-slot. Returns the piece's
 * namespaced finish targets. Fail-soft: a GLB that can't load resolves to `[]`
 * (the piece is simply absent) so one bad/slow asset never breaks the rest.
 */
async function attachGltfPiece(
  group: Group,
  piece: ComposedModel['gltfPieces'][number],
): Promise<{ key: string; label: string }[]> {
  let scene: Group
  try {
    scene = await loadSlotGltfScene(piece.url)
  } catch {
    return []
  }
  const size = new Vector3()
  new Box3().setFromObject(scene).getSize(size)
  const scale = fitScaleToFootprint([size.x, size.y, size.z], piece.footprint)

  const targets = namespaceGltfFinishTargets(scene, piece.finishPrefix)
  scene.traverse((o) => {
    const mesh = o as Mesh
    if (mesh.isMesh) {
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
  })

  const holder = new Group()
  holder.userData[GLTF_HOLDER] = true
  holder.add(scene)
  holder.scale.setScalar(scale)
  holder.position.set(...piece.anchor.position)
  holder.rotation.y = piece.anchor.rotationY ?? 0
  group.add(holder)
  return targets
}

/**
 * Build the assembled product as a Group (floor-anchored, centred, +Z forward):
 * box meshes for procedural parts + reparented GLB pieces for GLB options.
 * **Awaits every GLB piece** — this is the BAKE path (`saveConfigured.ts`), which
 * needs the fully-assembled object before export. The live PREVIEW instead uses
 * {@link buildConfiguredPreview} so a slow GLB doesn't blank the procedural body.
 * Caller disposes via {@link disposeConfiguredObject}.
 */
export async function buildConfiguredObject(
  product: ConfigurableProduct,
  spec: Partial<ConfiguredSpec> | null | undefined,
): Promise<BuiltConfigured> {
  const model = composeProduct(product, spec)
  const group = buildProceduralGroup(model)
  const finishTargets = [...model.finishTargets]
  for (const piece of model.gltfPieces) {
    for (const t of await attachGltfPiece(group, piece)) {
      if (!finishTargets.some((f) => f.key === t.key)) finishTargets.push(t)
    }
  }
  return { object: group, model, finishTargets }
}

/**
 * Preview build (SLOT-203): return the procedural Group **synchronously** so the
 * body renders immediately, and attach any GLB pieces asynchronously as they
 * load (the R3F preview renders the live object graph, so a piece pops in when
 * ready). A slow / failed GLB never blanks the whole product. `ready` resolves
 * once every piece has been attached-or-skipped, so the caller can defer disposal
 * until no load is still in flight. Caller disposes via
 * {@link disposeConfiguredObject}.
 */
export function buildConfiguredPreview(
  product: ConfigurableProduct,
  spec: Partial<ConfiguredSpec> | null | undefined,
): { object: Group; ready: Promise<void> } {
  const model = composeProduct(product, spec)
  const group = buildProceduralGroup(model)
  const ready = (async () => {
    for (const piece of model.gltfPieces) await attachGltfPiece(group, piece)
  })()
  return { object: group, ready }
}

/** True if a node has a GLTF-holder ancestor (its materials/textures are owned,
 *  not shared from the furnitureMaterials cache). */
function underGltfHolder(node: Mesh): boolean {
  let cur = node.parent
  while (cur) {
    if (cur.userData[GLTF_HOLDER]) return true
    cur = cur.parent
  }
  return false
}

const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
] as const

function disposeMaterialTextures(mat: Material): void {
  const rec = mat as unknown as Record<string, unknown>
  for (const slot of TEXTURE_SLOTS) {
    const tex = rec[slot] as Texture | null | undefined
    tex?.dispose?.()
  }
}

/**
 * Dispose a built group. Procedural box geometries + their per-key cloned
 * materials are disposed (their textures are SHARED via the furnitureMaterials
 * cache — never disposed here). GLB-piece subtrees, being freshly loaded and
 * owned, additionally have their textures disposed.
 */
export function disposeConfiguredObject(group: Group): void {
  const proceduralMats = new Set<Material>()
  group.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose?.()
    const owned = underGltfHolder(mesh)
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const m of mats) {
      if (!m) continue
      if (owned) {
        disposeMaterialTextures(m)
        m.dispose()
      } else {
        proceduralMats.add(m)
      }
    }
  })
  for (const m of proceduralMats) m.dispose()
}
