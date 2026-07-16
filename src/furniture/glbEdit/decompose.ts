/**
 * GLB Asset Designer — decompose ANY built three object into editable designer
 * parts (Asset Studio Stage 9a: "any furniture as an editable template").
 *
 * `decomposeObject` is the PURE core (three math only, no React / no GPU / no
 * loader): given an already-built `Object3D` — a procedural primitive's rendered
 * group, or a loaded GLB scene — it produces `{ parts, groups }` where every
 * `Mesh` becomes a frozen `mesh` `ShapePart` (the CSG-bake representation), and
 * meshes sharing a top-level named child are wrapped in one `PartGroup` mirroring
 * the source hierarchy. Each mesh's world transform (relative to the decompose
 * root, so the pass is invariant to where the root itself sits) is baked into the
 * part's geometry, which is then re-centred on its bounding box — position/rotation
 * behave like any primitive afterwards (position = the bbox centre, no rotation).
 *
 * Two output flavours, chosen by `opts.ref`:
 *  - **bake** (`ref` absent — procedural defs): the mesh's triangles are inlined
 *    as `geometry` arrays (procedural geometry is small).
 *  - **reference** (`ref: { defId }` — GLB defs): the part carries a `srcRef`
 *    (defId + mesh index) INSTEAD of arrays, re-resolved lazily by `srcRefCache.ts`
 *    so a heavy source (a 150k-tri sofa) never inlines its triangles into the spec.
 *    An `InstancedMesh` can't be addressed by a single ref, so it always BAKES
 *    (de-instanced / merged), even in reference mode (documented).
 *
 * `InstancedMesh` (procedural `InstancedBoxes`/`InstancedCylinders`) de-instances
 * to individual mesh parts up to `instanceCap` (default 64); beyond the cap all
 * instances MERGE into one baked part so a 200-slat blind doesn't explode into 200
 * parts. A triangle-budget flag (`overBudget`) is reported (never enforced — the
 * decompose always completes, the UI shows a size hint) so a huge def can't hang.
 *
 * Pure of the store + React → unit-testable on a synthetic `Object3D`.
 */

import {
  type BufferGeometry,
  Color,
  type InstancedMesh,
  Matrix4,
  type Mesh,
  type Object3D,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  DEFAULT_PART_METALNESS,
  DEFAULT_PART_ROUGHNESS,
  newPartGroupId,
  newPartId,
  type PartGroup,
  type ShapePart,
} from './editSpec'

/** Instances above this de-instance one-to-one; beyond it they merge into a single
 *  baked part (so a many-slat blind doesn't mint hundreds of parts). */
const DECOMPOSE_INSTANCE_CAP = 64

/** Triangle count above which decompose still completes but flags `overBudget`
 *  (the UI shows a size hint) — the guard that keeps a huge def from ever hanging. */
const DECOMPOSE_TRI_BUDGET = 150_000

export interface DecomposeOptions {
  /** When set, emit REFERENCE parts (`srcRef` → this `defId`) for regular meshes
   *  instead of inlining geometry. Instanced meshes still bake. Absent → bake all. */
  ref?: { defId: string } | null
  /** De-instance cap (default {@link DECOMPOSE_INSTANCE_CAP}). */
  instanceCap?: number
  /** Triangle budget for the `overBudget` flag (default {@link DECOMPOSE_TRI_BUDGET}). */
  triBudget?: number
}

export interface DecomposeResult {
  parts: ShapePart[]
  groups: PartGroup[]
  /** Total triangle count across all emitted parts. */
  triangles: number
  /** True when `triangles` exceeded the budget (informational — never blocks). */
  overBudget: boolean
  /** True when at least one instanced mesh exceeded the cap and was merged. */
  capped: boolean
}

/** A regular (non-instanced) `Mesh`. */
function isRegularMesh(o: Object3D): o is Mesh {
  return (o as Mesh).isMesh === true && (o as InstancedMesh).isInstancedMesh !== true
}

function isInstanced(o: Object3D): o is InstancedMesh {
  return (o as InstancedMesh).isInstancedMesh === true
}

/**
 * Visit every DECOMPOSABLE regular mesh under `root` in stable traversal order,
 * calling `cb(mesh, index)`. Shared by the decompose pass (reference-mode mesh
 * paths) AND `srcRefCache.ts` (ref resolution) so the mesh INDEX both assign is
 * guaranteed identical for the same source object. Instanced meshes are NOT
 * visited here (they never become a `srcRef`). Pure.
 */
export function forEachDecomposableMesh(
  root: Object3D,
  cb: (mesh: Mesh, index: number) => void,
): void {
  let i = 0
  root.traverse((o) => {
    if (isRegularMesh(o)) {
      cb(o, i)
      i += 1
    }
  })
}

/** Extract a geometry's position/normal/index as plain arrays (mesh-part storage).
 *  Normals are computed when absent so a baked part always shades correctly. */
function geometryToArrays(geo: BufferGeometry): {
  positions: number[]
  normals: number[]
  index?: number[]
} {
  if (!geo.getAttribute('normal')) geo.computeVertexNormals()
  const pos = geo.getAttribute('position')
  const nor = geo.getAttribute('normal')
  const idx = geo.getIndex()
  return {
    positions: Array.from(pos.array as ArrayLike<number>),
    normals: Array.from(nor.array as ArrayLike<number>),
    index: idx ? Array.from(idx.array as ArrayLike<number>) : undefined,
  }
}

/** Triangle count of a geometry (indexed or not). */
function triCount(geo: BufferGeometry): number {
  const idx = geo.getIndex()
  if (idx) return idx.count / 3
  const pos = geo.getAttribute('position')
  return pos ? pos.count / 3 : 0
}

/** Capture a mesh's primary material colour/roughness/metalness into the flat
 *  `ShapePart` surface fields (a decomposed mesh is single-material in the vast
 *  majority of cases; the first material is representative). */
function captureMaterial(mesh: Mesh): {
  color: string
  roughness?: number
  metalness?: number
} {
  const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
    | (import('three').Material & {
        color?: Color
        roughness?: number
        metalness?: number
      })
    | undefined
  const color = mat?.color instanceof Color ? `#${mat.color.getHexString()}` : '#b08d57'
  const roughness = typeof mat?.roughness === 'number' ? mat.roughness : DEFAULT_PART_ROUGHNESS
  const metalness = typeof mat?.metalness === 'number' ? mat.metalness : DEFAULT_PART_METALNESS
  return { color, roughness, metalness }
}

/** A stable default part name from the mesh/parent hierarchy (Stage 9a). */
function partName(mesh: Mesh, fallbackIndex: number): string {
  return mesh.name || mesh.parent?.name || `part ${fallbackIndex + 1}`
}

/**
 * Build ONE `mesh` `ShapePart` from a geometry already baked into root-local space:
 * re-centre it on its bbox, so `position` = the centre and the geometry is centred
 * (identity rotation) — matching the CSG-bake convention (`meshPartFromGeometry`).
 * `ref` set ⇒ store a `srcRef` instead of the arrays.
 */
function meshPartFromLocalGeometry(
  localGeo: BufferGeometry,
  name: string,
  material: { color: string; roughness?: number; metalness?: number },
  ref: { defId: string; meshPath: string } | null,
): { part: ShapePart; triangles: number } {
  localGeo.computeBoundingBox()
  const box = localGeo.boundingBox
  const centre = box ? box.getCenter(new Vector3()) : new Vector3()
  const size = box ? box.getSize(new Vector3()) : new Vector3(0.1, 0.1, 0.1)
  localGeo.translate(-centre.x, -centre.y, -centre.z)
  const triangles = triCount(localGeo)
  const part: ShapePart = {
    id: newPartId(),
    kind: 'mesh',
    name,
    position: [centre.x, centre.y, centre.z],
    size: [Math.max(size.x, 1e-4), Math.max(size.y, 1e-4), Math.max(size.z, 1e-4)],
    color: material.color,
    roughness: material.roughness,
    metalness: material.metalness,
  }
  if (ref) part.srcRef = { defId: ref.defId, meshPath: ref.meshPath }
  else part.geometry = geometryToArrays(localGeo)
  return { part, triangles }
}

/** Bake a mesh's world transform (relative to `invRoot`) into a clone of its
 *  geometry, returning it in root-local space. */
function bakeToRootLocal(mesh: Mesh, invRoot: Matrix4): BufferGeometry {
  const geo = mesh.geometry.clone()
  const rel = new Matrix4().copy(invRoot).multiply(mesh.matrixWorld)
  geo.applyMatrix4(rel)
  return geo
}

/**
 * Decompose a built `Object3D` into designer parts + groups (Stage 9a). See the
 * module header. Pure — `root` is any three object whose world matrices are set
 * (this function calls `updateWorldMatrix` defensively).
 */
export function decomposeObject(root: Object3D, opts: DecomposeOptions = {}): DecomposeResult {
  const cap = opts.instanceCap ?? DECOMPOSE_INSTANCE_CAP
  const triBudget = opts.triBudget ?? DECOMPOSE_TRI_BUDGET
  const refDefId = opts.ref?.defId ?? null
  root.updateWorldMatrix(true, true)
  const invRoot = new Matrix4().copy(root.matrixWorld).invert()

  const parts: ShapePart[] = []
  const groups: PartGroup[] = []
  let triangles = 0
  let capped = false

  // Regular-mesh index is assigned in the SAME order `srcRefCache.forEachDecomposableMesh`
  // walks, so a reference-mode part's `meshPath` re-resolves to the same mesh.
  const meshIndex = new Map<Mesh, number>()
  forEachDecomposableMesh(root, (m, i) => meshIndex.set(m, i))

  // Emit parts for one subtree, returning the ids produced (so the caller can wrap
  // them in a group). Handles both regular + instanced meshes.
  const emitSubtree = (node: Object3D): string[] => {
    const ids: string[] = []
    node.traverse((o) => {
      if (isRegularMesh(o)) {
        const localGeo = bakeToRootLocal(o, invRoot)
        const idx = meshIndex.get(o) ?? 0
        const ref = refDefId ? { defId: refDefId, meshPath: String(idx) } : null
        const { part, triangles: t } = meshPartFromLocalGeometry(
          localGeo,
          partName(o, idx),
          captureMaterial(o),
          ref,
        )
        parts.push(part)
        ids.push(part.id)
        triangles += t
      } else if (isInstanced(o)) {
        const emitted = emitInstanced(o, invRoot, cap)
        if (emitted.merged) capped = true
        for (const { part, triangles: t } of emitted.items) {
          parts.push(part)
          ids.push(part.id)
          triangles += t
        }
      }
    })
    return ids
  }

  // Group by TOP-LEVEL child: a subtree yielding ≥2 parts becomes one PartGroup
  // (named after the child); a subtree yielding exactly 1 part stays a loose part.
  const topLevel = isRegularMesh(root) || isInstanced(root) ? [root] : [...root.children]
  for (const child of topLevel) {
    const ids = emitSubtree(child)
    if (ids.length >= 2) {
      groups.push({
        id: newPartGroupId(),
        name: child.name || `part ${groups.length + 1}`,
        partIds: ids,
      })
    }
  }

  return { parts, groups, triangles, overBudget: triangles > triBudget, capped }
}

/** De-instance an `InstancedMesh` to individual baked parts up to `cap`; beyond it,
 *  merge every instance into ONE baked part. Instanced meshes always bake (a single
 *  `srcRef` can't address per-instance transforms). */
function emitInstanced(
  im: InstancedMesh,
  invRoot: Matrix4,
  cap: number,
): { items: { part: ShapePart; triangles: number }[]; merged: boolean } {
  const material = captureMaterial(im)
  const baseRel = new Matrix4().copy(invRoot).multiply(im.matrixWorld)
  const tmp = new Matrix4()
  const perInstance = (i: number): BufferGeometry => {
    im.getMatrixAt(i, tmp)
    const geo = im.geometry.clone()
    geo.applyMatrix4(new Matrix4().copy(baseRel).multiply(tmp))
    return geo
  }
  if (im.count <= cap) {
    const items = []
    for (let i = 0; i < im.count; i++) {
      const geo = perInstance(i)
      items.push(
        meshPartFromLocalGeometry(geo, `${im.name || 'instance'} ${i + 1}`, material, null),
      )
    }
    return { items, merged: false }
  }
  // Over the cap — merge every instance into one geometry (one baked part).
  const geos: BufferGeometry[] = []
  for (let i = 0; i < im.count; i++) geos.push(perInstance(i))
  const merged = mergeGeometries(geos, false) ?? geos[0]
  for (const g of geos) if (g !== merged) g.dispose()
  return {
    items: [meshPartFromLocalGeometry(merged, im.name || 'instances', material, null)],
    merged: true,
  }
}
