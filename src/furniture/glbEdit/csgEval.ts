/**
 * CSG v2 — non-destructive boolean evaluation for the GLB Asset Designer
 * (Stage 1b). Unlike v1 (`csgCombine.ts`, which BAKES two parts into one frozen
 * `mesh` and drops the operands), v2 keeps every operand editable in the spec
 * and evaluates a `CombineGroup`'s boolean LAZILY from the live member parts —
 * so moving/resizing an operand re-evaluates and the result updates.
 *
 * Layers:
 *  - `foldCsg` — the pure three-bvh-csg core: N operand BufferGeometries + an op
 *    → one result geometry with per-source draw groups. Multi-operand: union /
 *    intersect fold across all operands; subtract carves the `hole`-role operands
 *    (or, with none marked, operands[1..]) out of the solids. Dynamic-imports the
 *    CSG engine so it stays out of the boot bundle. Shared by BOTH the worker
 *    (`csg.worker.ts`) and the main-thread fallback here.
 *  - `combineGroupToMeshPart` — orchestration: bakes each member's transform into
 *    its geometry, evaluates (worker pool first, main thread on fallback), and
 *    wraps the result as a `mesh` `ShapePart` (via `meshPartFromGeometry`, so the
 *    per-group material round-trip is identical to v1). The returned part is
 *    TRANSIENT for the preview (id `result:<groupId>`); the bake escape hatch
 *    re-ids it for persistence.
 *
 * Coplanar-face guidance (three-bvh-csg limitation): two operands sharing an
 * EXACT coplanar face can produce z-fighting/artefacts. Offset operands by a
 * hair (or overlap them) rather than aligning faces exactly — surfaced in the
 * combine panel copy + docs.
 */

import type { BufferGeometry, Material, MeshStandardMaterial } from 'three'
import { bakedPartGeometry, meshPartFromGeometry, partAsGroupMaterial } from './csgCombine'
import { runCombineOnPool } from './csgWorkerPool'
import {
  type AssetEditSpec,
  type CombineGroup,
  type CombineOp,
  type GroupMaterialData,
  newPartId,
  type PartRole,
  type ShapePart,
} from './editSpec'

/** One operand geometry entering the boolean, tagged with the material index it
 *  contributes (for per-group preservation) and its solid/hole role. */
export interface CsgOperand {
  geometry: BufferGeometry
  /** Index into the caller's `GroupMaterialData[]` this operand's faces carry. */
  materialIndex: number
  role: PartRole
}

/** A draw-group range in the result geometry, carrying the ORIGINAL caller
 *  material index (already remapped out of three-bvh-csg's internal ordering). */
export interface CsgGroupRange {
  start: number
  count: number
  materialIndex: number
}

/**
 * Fold N operands into one result geometry via three-bvh-csg. Async: the engine
 * is dynamic-imported on first use. Returns the result geometry (caller owns
 * disposal) plus its draw groups keyed by the ORIGINAL operand material index.
 * Throws on an empty/degenerate result (e.g. intersecting disjoint shapes).
 *
 *  - `union`     — operand[0] ∪ operand[1] ∪ … (ADDITION fold).
 *  - `intersect` — operand[0] ∩ operand[1] ∩ … (INTERSECTION fold).
 *  - `subtract`  — solids (role ≠ 'hole') unioned, minus holes (role = 'hole')
 *    unioned. With NO operand marked as a hole: operand[0] minus the union of
 *    operand[1..] (first-selected is the base). Needs ≥1 solid.
 */
export async function foldCsg(
  operands: CsgOperand[],
  op: CombineOp,
): Promise<{ geometry: BufferGeometry; groups: CsgGroupRange[] }> {
  if (operands.length < 2) throw new Error('CSG fold needs ≥2 operands')
  const { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } = await import('three-bvh-csg')
  const { MeshStandardMaterial } = await import('three')

  const evaluator = new Evaluator()
  evaluator.attributes = ['position', 'normal', 'uv']
  evaluator.useGroups = true

  // One proxy material per distinct operand material index — operands sharing an
  // index share the instance, so the Evaluator's group-dedup merges their faces.
  const matByIndex = new Map<number, MeshStandardMaterial>()
  const indexByMat = new Map<Material, number>()
  const proxyFor = (materialIndex: number): MeshStandardMaterial => {
    let m = matByIndex.get(materialIndex)
    if (!m) {
      m = new MeshStandardMaterial()
      matByIndex.set(materialIndex, m)
      indexByMat.set(m, materialIndex)
    }
    return m
  }
  const brushFor = (o: CsgOperand) => {
    const b = new Brush(o.geometry, proxyFor(o.materialIndex))
    b.updateMatrixWorld()
    return b
  }
  type BrushT = InstanceType<typeof Brush>
  const unionAll = (list: BrushT[]): BrushT => {
    let acc = list[0]
    for (let i = 1; i < list.length; i++) acc = evaluator.evaluate(acc, list[i], ADDITION)
    return acc
  }

  let result: BrushT
  if (op === 'union') {
    result = unionAll(operands.map(brushFor))
  } else if (op === 'intersect') {
    let acc = brushFor(operands[0])
    for (let i = 1; i < operands.length; i++) {
      acc = evaluator.evaluate(acc, brushFor(operands[i]), INTERSECTION)
    }
    result = acc
  } else {
    const solids = operands.filter((o) => o.role !== 'hole')
    const holes = operands.filter((o) => o.role === 'hole')
    if (holes.length > 0) {
      if (solids.length === 0) throw new Error('Subtract needs at least one solid part')
      const base = unionAll(solids.map(brushFor))
      const carve = unionAll(holes.map(brushFor))
      result = evaluator.evaluate(base, carve, SUBTRACTION)
    } else {
      // No explicit holes: first-selected is the base, the rest are carved out.
      const base = brushFor(operands[0])
      const carve = unionAll(operands.slice(1).map(brushFor))
      result = evaluator.evaluate(base, carve, SUBTRACTION)
    }
  }

  // Remap the result's material indices (which point into result.material's
  // deduplicated array) back to the ORIGINAL operand material indices.
  const resultMats: MeshStandardMaterial[] = Array.isArray(result.material)
    ? (result.material as MeshStandardMaterial[])
    : [result.material as MeshStandardMaterial]
  const geometry = result.geometry
  const rawGroups =
    geometry.groups.length > 0
      ? geometry.groups
      : [{ start: 0, count: geometry.getAttribute('position')?.count ?? 0, materialIndex: 0 }]
  const groups: CsgGroupRange[] = rawGroups.map((g) => ({
    start: g.start,
    count: g.count,
    materialIndex: indexByMat.get(resultMats[g.materialIndex ?? 0]) ?? 0,
  }))
  for (const m of matByIndex.values()) m.dispose()
  return { geometry, groups }
}

/** Distinct-material key for an operand's surface look. */
function materialKey(g: GroupMaterialData): string {
  return [
    g.color,
    g.finish ?? '',
    g.roughness ?? '',
    g.metalness ?? '',
    g.emissiveIntensity ?? '',
    g.opacity ?? '',
    // Stage 2 physical fields — distinct finishes must not merge into one group.
    g.sheen ?? '',
    g.sheenColor ?? '',
    g.sheenRoughness ?? '',
    g.clearcoat ?? '',
    g.clearcoatRoughness ?? '',
    g.transmission ?? '',
    g.ior ?? '',
    g.thickness ?? '',
    g.anisotropy ?? '',
    g.anisotropyRotation ?? '',
  ].join('|')
}

/** Gather a group's live member parts in selection order (missing ids skipped). */
export function groupMembers(spec: AssetEditSpec, group: CombineGroup): ShapePart[] {
  return group.partIds
    .map((id) => spec.parts.find((p) => p.id === id))
    .filter((p): p is ShapePart => !!p)
}

/**
 * Evaluate one combine group into a `mesh` `ShapePart`. Bakes each member's
 * transform into its geometry, runs the boolean on the shared worker pool (with
 * a main-thread `foldCsg` fallback when no Worker is available or one crashes),
 * and wraps the result via `meshPartFromGeometry` so the per-group material
 * data round-trips exactly like v1. Throws on <2 members or a degenerate result.
 *
 * `idPrefix` controls the produced part's id: `'result'` (default) for the
 * transient preview part (`result:<groupId>`), or a fresh id for a bake.
 */
export async function combineGroupToMeshPart(
  spec: AssetEditSpec,
  group: CombineGroup,
  opts: { bake?: boolean } = {},
): Promise<ShapePart> {
  const members = groupMembers(spec, group)
  if (members.length < 2) throw new Error('combine group needs ≥2 live members')

  // Distinct materials → index map (shared with the fold's group preservation).
  const materials: GroupMaterialData[] = []
  const keyToIndex = new Map<string, number>()
  const meta = members.map((part) => {
    const gm = partAsGroupMaterial(part)
    const key = materialKey(gm)
    let idx = keyToIndex.get(key)
    if (idx === undefined) {
      idx = materials.length
      materials.push(gm)
      keyToIndex.set(key, idx)
    }
    return { part, materialIndex: idx, role: (part.role ?? 'solid') as PartRole }
  })

  const baked = meta.map((m) => ({
    geometry: bakedPartGeometry(m.part),
    materialIndex: m.materialIndex,
    role: m.role,
  }))

  try {
    // Worker pool first (transfers geometry attributes); falls back to a direct
    // main-thread fold when no Worker is available or one fails for this call.
    const pooled = await runCombineOnPool(baked, group.op)
    let geometry: BufferGeometry
    let groups: CsgGroupRange[]
    if (pooled) {
      geometry = pooled.geometry
      groups = pooled.groups
    } else {
      const folded = await foldCsg(baked, group.op)
      geometry = folded.geometry
      groups = folded.groups
    }
    // Re-apply the remapped groups so `meshPartFromGeometry` reads them.
    geometry.clearGroups()
    for (const g of groups) geometry.addGroup(g.start, g.count, g.materialIndex)
    const part = meshPartFromGeometry(geometry, members[0], materials)
    geometry.dispose()
    part.id = opts.bake ? newPartId() : `result:${group.id}`
    return part
  } finally {
    for (const b of baked) b.geometry.dispose()
  }
}

/**
 * Evaluate EVERY combine group in a spec into transient `mesh` parts, keyed by
 * group id. Used at export/save time so the built GLB bakes each result, and as
 * a fallback path when a live preview result isn't ready yet. A group that
 * throws (degenerate) is omitted from the map (its faces just don't render).
 */
export async function evaluateAllGroups(spec: AssetEditSpec): Promise<Map<string, ShapePart>> {
  const out = new Map<string, ShapePart>()
  const groups = spec.combineGroups ?? []
  await Promise.all(
    groups.map(async (g) => {
      try {
        out.set(g.id, await combineGroupToMeshPart(spec, g))
      } catch {
        // Degenerate result — leave it out; the UI surfaces the error separately.
      }
    }),
  )
  return out
}
