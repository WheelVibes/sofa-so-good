/**
 * Designer → configurable-product export (Asset Studio Stage 3d).
 *
 * Turns a GLB-designer `AssetEditSpec` into a slot-based {@link ConfigurableProduct}
 * so a built piece becomes a **customizable product family**: the user marks one
 * or more `PartGroup`s as *variant slots*; groups sharing a slot key become the
 * alternative options for that slot; everything else (ungrouped parts + groups
 * left on "Base") bakes into the fixed base.
 *
 * ## Option representation — the decision (report in the plan)
 * A configurator `SlotOption` holds EITHER procedural box `parts` OR a GLB
 * sub-asset (`gltfUrl`) — its `ConfiguredPart` is a box only, so it cannot carry
 * arbitrary designer `ShapePart`s (lathe legs, CSG results, sweeps, bevels,
 * gradients). Rather than lossily restrict configurable groups to box shapes — or
 * fork the configurator's model/compose/build to understand designer parts — each
 * option (and the base) is **baked to its own small GLB embedded as a
 * self-contained `data:` URL** and carried on the existing `gltfUrl` field. The
 * configurator's `compose`/`buildObject`/`saveConfigured` stay 100% unchanged
 * (they already load, fit, namespace, and re-skin `gltfUrl` options), and full
 * shape fidelity is preserved. `data:` URLs are SEC-1-allowed by the shared secure
 * loader, so a baked product needs no network and survives serialization whole.
 *
 * ## Anchoring — sidesteps the quarter-turn limit
 * Each option/base GLB is baked in **product-world space** (the group transform is
 * flattened into every member before baking), and the slot anchor is the identity.
 * So the v1 `SlotAnchor` quarter-turn restriction never bites: an option with an
 * arbitrary group rotation is already correctly posed inside its own GLB.
 *
 * The planning half ({@link planConfigurableExport}) is PURE + unit-tested; the
 * baking half ({@link buildConfigurableProduct}) is async/browser (needs
 * `exportGlb`) and covered by the scenario harness.
 */

import { exportGlb } from '../convert/toGlb'
import { partWorldExtent } from '../glbEdit/arrange'
import { buildEditedObject } from '../glbEdit/buildObject'
import { evaluateAllGroups } from '../glbEdit/csgEval'
import {
  type AssetEditSpec,
  type CombineGroup,
  createEmptySpec,
  type PartGroup,
  partGroupMemberIds,
  partGroups,
  type ShapePart,
} from '../glbEdit/editSpec'
import { flattenMember } from '../glbEdit/groupTransform'
import type { FurnitureCategory } from '../types'
import type { ConfigurableProduct, ProductSlot, SlotOption } from './model'

/** Per-group export assignment collected from the "Make configurable" UI. */
export interface GroupAssignment {
  /** Slot key this group is an option of, or null → bake into the fixed base.
   *  Groups sharing a non-null key become the alternative options of one slot. */
  slot: string | null
  /** Option label (defaults to the group name). */
  label: string
  /** Option price in SGD — defaults to 0, editable per option. */
  price: number
}

/** A planned option before baking — its flattened world-space parts + footprint.
 *  `combineGroups` are the CSG groups fully contained in this option (evaluated
 *  at bake time so the option GLB carries carved/fused geometry, finding 2). */
interface PlannedOption {
  id: string
  label: string
  price: number
  parts: ShapePart[]
  combineGroups: CombineGroup[]
  footprint: { w: number; d: number; h: number }
}

interface PlannedSlot {
  id: string
  label: string
  defaultOptionId: string
  options: PlannedOption[]
}

export interface ExportPlan {
  /** Parts baked into the fixed base (ungrouped parts + "Base"-assigned groups),
   *  already in product-world space. */
  baseParts: ShapePart[]
  /** CSG groups fully contained in the base (evaluated at bake time). */
  baseCombineGroups: CombineGroup[]
  baseFootprint: { w: number; d: number; h: number }
  slots: PlannedSlot[]
}

/** Which export bucket each part lands in: `'base'` (ungrouped part or a group
 *  kept on Base) or an option group's id. Every part maps to exactly one bucket.
 *  Pure. */
function partBuckets(
  spec: AssetEditSpec,
  assignments: Record<string, GroupAssignment>,
): Map<string, string> {
  const map = new Map<string, string>()
  const grouped = partGroupMemberIds(spec)
  for (const p of spec.parts) if (!grouped.has(p.id)) map.set(p.id, 'base')
  for (const g of partGroups(spec)) {
    const a = assignments[g.id]
    const bucket = !a || a.slot == null ? 'base' : g.id
    for (const id of g.partIds) map.set(id, bucket)
  }
  return map
}

/** The name of the first combine group whose members straddle a bucket boundary
 *  (some inside a slot group, some outside), or null when every combine is
 *  self-contained. A straddling combine can't be baked into one option's GLB, so
 *  "Make configurable" must block with a hint (finding 2). Pure. */
export function crossBucketCombineName(
  spec: AssetEditSpec,
  assignments: Record<string, GroupAssignment>,
): string | null {
  const bucket = partBuckets(spec, assignments)
  for (const cg of spec.combineGroups ?? []) {
    const seen = new Set(cg.partIds.map((id) => bucket.get(id)).filter((b): b is string => !!b))
    if (seen.size > 1) return cg.name
  }
  return null
}

/** The combine groups whose EVERY member sits in `bucketKey`. */
function combinesInBucket(
  spec: AssetEditSpec,
  bucket: Map<string, string>,
  bucketKey: string,
): CombineGroup[] {
  return (spec.combineGroups ?? [])
    .filter((cg) => cg.partIds.every((id) => bucket.get(id) === bucketKey))
    .map((cg) => ({ ...cg, partIds: [...cg.partIds] }))
}

/** Deep-clone a part at a new pose (from `flattenMember`), preserving every
 *  material/geometry field. */
function reposedPart(
  src: ShapePart,
  pose: { position: [number, number, number]; rotation?: [number, number, number] },
): ShapePart {
  return {
    ...src,
    position: pose.position,
    rotation: pose.rotation ? [...pose.rotation] : undefined,
    size: [...src.size],
    profile: src.profile ? src.profile.map((p) => [...p]) : undefined,
    outline: src.outline ? src.outline.map((p) => [...p]) : undefined,
    gradient: src.gradient ? { ...src.gradient } : undefined,
  }
}

/** A group's members flattened into product-world space (group transform baked
 *  into each). */
function groupWorldParts(spec: AssetEditSpec, group: PartGroup): ShapePart[] {
  const byId = new Map(spec.parts.map((p) => [p.id, p]))
  const out: ShapePart[] = []
  for (const id of group.partIds) {
    const src = byId.get(id)
    if (src) out.push(reposedPart(src, flattenMember(group, src)))
  }
  return out
}

/** Footprint for a piece whose baked GLB sits at the identity slot anchor.
 *  `w`/`d` are **symmetric** spans about the product origin (2·max|extent|) so
 *  `compose.ts`'s origin-centred footprint AABB provably covers the geometry on
 *  the floor plane. `h` is the geometry's actual vertical **extent** (maxY−minY),
 *  NOT the distance to the floor — because the object builder's
 *  `fitScaleToFootprint` scales the loaded GLB's own bbox HEIGHT to `h`, and the
 *  GLB is baked at real-metre scale, so `h` = its true height keeps the fit at
 *  ≈1 (using the floor-to-top distance instead would blow an off-floor piece — a
 *  thin tabletop at 0.74 m — up by its height ratio). Compose derives the product
 *  height from the tallest piece's `anchor.y + h`; a piece that reaches the floor
 *  (legs) reports the full height, so a normal furniture piece stays correct. */
function symmetricFootprint(parts: ShapePart[]): { w: number; d: number; h: number } {
  let ax = 0
  let az = 0
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const p of parts) {
    // Rotation- + kind-aware world extent (a rotated lathe leg / torus / mesh
    // spans more than its raw `size` tuple) so the footprint provably covers the
    // baked geometry — reuses the designer's own `partWorldExtent`.
    const [ex, ey, ez] = partWorldExtent(p)
    ax = Math.max(ax, Math.abs(p.position[0]) + ex / 2)
    az = Math.max(az, Math.abs(p.position[2]) + ez / 2)
    minY = Math.min(minY, p.position[1] - ey / 2)
    maxY = Math.max(maxY, p.position[1] + ey / 2)
  }
  const h = Number.isFinite(minY) ? maxY - minY : 0
  return { w: Math.max(0.05, ax * 2), d: Math.max(0.05, az * 2), h: Math.max(0.05, h) }
}

/**
 * PURE planning pass: partition a spec + per-group assignments into a fixed base
 * plus a set of variant slots. Groups sharing a non-null `slot` key become the
 * options of that slot (in spec-group order; the first is the default). Ungrouped
 * parts and any group assigned `slot: null` are folded into the base. An option's
 * id is its group id; footprints are symmetric world spans. Deterministic +
 * three-free of the STORE.
 */
export function planConfigurableExport(
  spec: AssetEditSpec,
  assignments: Record<string, GroupAssignment>,
): ExportPlan {
  const groups = partGroups(spec)
  const grouped = partGroupMemberIds(spec)
  const bucket = partBuckets(spec, assignments)

  // Base = every ungrouped part + every group explicitly kept on "Base".
  const baseParts: ShapePart[] = spec.parts.filter((p) => !grouped.has(p.id)).map((p) => ({ ...p }))
  for (const g of groups) {
    const a = assignments[g.id]
    if (!a || a.slot == null) baseParts.push(...groupWorldParts(spec, g))
  }

  // Slots, in first-appearance order of their group's slot key.
  const slotOrder: string[] = []
  const bySlot = new Map<string, PartGroup[]>()
  for (const g of groups) {
    const a = assignments[g.id]
    if (!a || a.slot == null) continue
    if (!bySlot.has(a.slot)) {
      bySlot.set(a.slot, [])
      slotOrder.push(a.slot)
    }
    bySlot.get(a.slot)?.push(g)
  }

  const slots: PlannedSlot[] = slotOrder.map((slotKey) => {
    const optionGroups = bySlot.get(slotKey) ?? []
    const options: PlannedOption[] = optionGroups.map((g) => {
      const a = assignments[g.id] as GroupAssignment
      const parts = groupWorldParts(spec, g)
      return {
        id: g.id,
        label: a.label.trim() || g.name,
        price: Number.isFinite(a.price) && a.price > 0 ? a.price : 0,
        parts,
        combineGroups: combinesInBucket(spec, bucket, g.id),
        footprint: symmetricFootprint(parts),
      }
    })
    return {
      id: slotKey,
      label: slotKey,
      defaultOptionId: options[0]?.id ?? '',
      options,
    }
  })

  return {
    baseParts,
    baseCombineGroups: combinesInBucket(spec, bucket, 'base'),
    baseFootprint: symmetricFootprint(baseParts),
    slots,
  }
}

/** True when a plan yields a usable product (≥1 slot with ≥1 option). */
export function isPlanExportable(plan: ExportPlan): boolean {
  return plan.slots.length > 0 && plan.slots.every((s) => s.options.length > 0)
}

/** Bake a flat list of world-space parts (+ any self-contained CSG combine
 *  groups) to a binary GLB, base64-encode it, and return a self-contained
 *  `data:` URL. No source GLB — the designer parts are already flattened. When
 *  `combineGroups` are present they are EVALUATED so the baked GLB carries the
 *  carved/fused result geometry, not the raw operands (finding 2). */
async function bakePartsToDataUrl(
  parts: ShapePart[],
  combineGroups?: CombineGroup[],
): Promise<string> {
  const hasCsg = !!combineGroups && combineGroups.length > 0
  const spec: AssetEditSpec = {
    ...createEmptySpec(),
    parts,
    ...(hasCsg ? { combineGroups } : {}),
  }
  const results = hasCsg ? await evaluateAllGroups(spec) : undefined
  const object = buildEditedObject(null, spec, results)
  const buffer = await exportGlb(object)
  return `data:model/gltf-binary;base64,${base64FromArrayBuffer(buffer)}`
}

/** Base64-encode an ArrayBuffer (chunked so a large buffer doesn't blow the
 *  argument limit of `String.fromCharCode(...spread)`). */
function base64FromArrayBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** Metadata for the exported product (from the authoring UI). */
export interface ExportMeta {
  id: string
  label: string
  category: FurnitureCategory
}

/**
 * Async BAKE pass: turn a plan into a persistable {@link ConfigurableProduct}
 * whose base + every option carry a self-contained `data:`-URL GLB. The result
 * opens in the existing `ConfiguratorDialog`, swaps options live, and bakes to the
 * catalog through the unchanged `saveConfiguredAsset` path. Browser-only.
 */
export async function buildConfigurableProduct(
  plan: ExportPlan,
  meta: ExportMeta,
): Promise<ConfigurableProduct> {
  const baseGltf =
    plan.baseParts.length > 0
      ? await bakePartsToDataUrl(plan.baseParts, plan.baseCombineGroups)
      : undefined
  const slots: ProductSlot[] = []
  for (const s of plan.slots) {
    // Bake every option of a slot in parallel (finding 12 — independent GLB
    // bakes, no shared cache to serialise on).
    const options: SlotOption[] = await Promise.all(
      s.options.map(async (o) => ({
        id: o.id,
        label: o.label,
        price: o.price,
        footprint: o.footprint,
        gltfUrl: await bakePartsToDataUrl(o.parts, o.combineGroups),
      })),
    )
    slots.push({
      id: s.id,
      label: s.label,
      anchor: { position: [0, 0, 0] },
      defaultOptionId: s.defaultOptionId,
      options,
    })
  }
  return {
    id: meta.id,
    label: meta.label,
    category: meta.category,
    base: {
      footprint: plan.baseFootprint,
      price: 0,
      ...(baseGltf ? { gltfUrl: baseGltf } : {}),
    },
    slots,
  }
}
