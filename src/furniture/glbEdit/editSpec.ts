/**
 * GLB Asset Designer — the pure, serialisable spec describing a custom asset the
 * user builds in the designer (`ui/glbEditor/`). An asset is an optional source
 * GLB (uploaded/bundled) plus a uniform scale, plus a list of primitive shapes
 * "kit-bashed" around it. `buildObject.ts` turns a spec (+ the loaded source
 * object) into a three.Object3D; `saveAsset.ts` exports that to a GLB and
 * persists it as a new catalog asset. Keeping the spec pure makes the geometry
 * decisions (bounds, validation, part maths) unit-testable without a GPU.
 */

import {
  EXTRUDE_PRESETS,
  LATHE_PRESETS,
  type SweepPathKind,
  type SweepProfileKind,
} from './shapeProfiles'

export type PrimitiveShapeKind =
  | 'box'
  | 'cylinder'
  | 'sphere'
  | 'cone'
  | 'torus'
  | 'capsule'
  | 'pyramid'
  | 'wedge'
  | 'lathe'
  | 'extrude'
  | 'sweep'

/** Kinds that accept a bevel / corner-radius (`ShapePart.bevel`). Box + wedge
 *  only — extrudes carry their own always-on bevel and the round kinds are
 *  already smooth. Source of truth for the inspector's "Corner radius" control. */
export const BEVELABLE_KINDS: PrimitiveShapeKind[] = ['box', 'wedge']

/** A part is either a parametric primitive or a baked `mesh` — the result of a
 *  CSG combine (`csgCombine.ts`), whose triangles live in `ShapePart.geometry`. */
export type ShapeKind = PrimitiveShapeKind | 'mesh'

/** TinkerCAD-style solid/hole role (CSG v2, Stage 1b). A `hole` part renders as
 *  a translucent ghost in the editor and, inside a Subtract combine group, is
 *  carved out of the group's solids. Absent → `solid` (the default), so every
 *  pre-Stage-1b spec keeps its parts solid. */
export type PartRole = 'solid' | 'hole'

/** A non-destructive boolean-combine operation recorded in the spec (CSG v2).
 *  The member parts (`partIds`, in selection order) STAY editable in
 *  `spec.parts`; the built object evaluates the boolean lazily from their live
 *  transforms/geometry (`glbEdit/csgEval.ts`). A part belongs to at most one
 *  group. Dropping the group (ungroup) leaves the members untouched — the whole
 *  point of "non-destructive". */
export interface CombineGroup {
  id: string
  /** Display name in the layers panel (e.g. "Combine 1"). */
  name: string
  /** Member part ids, in selection order. The first is the subtract base when
   *  no member is marked as a hole. ≥2 members. */
  partIds: string[]
  op: CombineOp
}

/** The boolean operator a combine group applies. Mirrors `csgCombine.CsgOp` but
 *  lives here so the spec type is self-contained (no import cycle). */
export type CombineOp = 'union' | 'subtract' | 'intersect'

/** A named TRANSFORM group (Asset Studio Stage 3a). **Distinct from a
 *  `CombineGroup`** — which fuses parts with a CSG boolean. A `PartGroup` keeps
 *  its members as separate meshes but moves/rotates them together as one unit via
 *  an optional group `position`/`rotation` applied ON TOP of each member's own
 *  transform at build time (grouped part world = group transform ∘ part
 *  transform). Ungrouping FLATTENS the group transform into each member so
 *  nothing jumps. **Flat only** — a PartGroup never nests inside another
 *  (deliberate Stage-3a scope: no `parentGroupId`). A part is in at most ONE
 *  PartGroup, and MAY also be in a CombineGroup independently. UI vocabulary is
 *  "Group" (the boolean feature stays "Combine"). */
export interface PartGroup {
  id: string
  /** Display name in the layers tree (e.g. "Group 1"). */
  name: string
  /** Member part ids, in add order. ≥1 member. */
  partIds: string[]
  /** Group origin offset in metres, applied on top of member positions. Absent →
   *  [0,0,0] (no offset). */
  position?: [number, number, number]
  /** Group rotation in DEGREES (Euler XYZ), applied on top of member rotations.
   *  Absent → no rotation. */
  rotation?: [number, number, number]
}

/** All primitive kinds, in palette order. Source of truth for the designer's
 *  "add shape" controls + the geometry switch in `buildObject.ts`. (`mesh` is
 *  deliberately absent — a mesh part is only ever produced by combining.) */
export const SHAPE_KINDS: PrimitiveShapeKind[] = [
  'box',
  'cylinder',
  'sphere',
  'cone',
  'pyramid',
  'capsule',
  'torus',
  'wedge',
  'lathe',
  'extrude',
  'sweep',
]

export const SHAPE_LABEL: Record<ShapeKind, string> = {
  box: 'Box',
  cylinder: 'Cylinder',
  sphere: 'Sphere',
  cone: 'Cone',
  pyramid: 'Pyramid',
  capsule: 'Capsule',
  torus: 'Torus',
  wedge: 'Wedge',
  lathe: 'Lathe',
  extrude: 'Extrude',
  sweep: 'Sweep',
  mesh: 'Combined',
}

/** Optional `MeshPhysicalMaterial` finishing fields (Stage 2 — materials). Every
 *  field is absent by default, so a part/group with none set is byte-identical to
 *  the pre-Stage-2 plain `MeshStandardMaterial` output. `buildSurfaceMaterial`
 *  upgrades to a `MeshPhysicalMaterial` ONLY when one of the four primary axes
 *  (`sheen`/`clearcoat`/`transmission`/`anisotropy`) is > 0 — the secondary
 *  fields (`sheenColor`/`sheenRoughness`/`ior`/`thickness`/`anisotropyRotation`)
 *  only refine their primary. All numeric axes are 0…1 except `ior` (≈1.0–2.333,
 *  glass ≈1.5), `thickness` (metres, glass volume) and `anisotropyRotation`
 *  (radians). Every field round-trips losslessly through the GLB export (verified
 *  — KHR_materials_sheen / clearcoat / transmission / ior / volume / anisotropy). */
export interface PhysicalSurfaceFields {
  /** Fabric/velvet retroreflective sheen halo (KHR_materials_sheen). */
  sheen?: number
  /** Sheen lobe colour (hex). Absent → white lobe (reads as pile). */
  sheenColor?: string
  /** Sheen lobe roughness 0…1. Absent → three's default (1). */
  sheenRoughness?: number
  /** Lacquer/gloss film over the base (KHR_materials_clearcoat). */
  clearcoat?: number
  /** Clearcoat film roughness 0…1. Absent → three's default. */
  clearcoatRoughness?: number
  /** Refractive glass transmission (KHR_materials_transmission). NOTE: the
   *  transmission render pass needs a real GPU — headless previews read flat. */
  transmission?: number
  /** Index of refraction (KHR_materials_ior). Glass ≈ 1.5. */
  ior?: number
  /** Glass volume thickness in metres (KHR_materials_volume). */
  thickness?: number
  /** Brushed-metal directional highlight (KHR_materials_anisotropy). */
  anisotropy?: number
  /** Anisotropy sweep rotation in radians. Absent → 0 (U axis). */
  anisotropyRotation?: number
}

/** Per-part vertex-colour gradient (Stage 2). Baked into the part geometry as a
 *  `COLOR_0` attribute (lerped `from`→`to` along the chosen local bbox axis) and
 *  rendered with `vertexColors` on; survives GLB export as COLOR_0. Only offered
 *  for solid-colour parts (no textured `finish`) — the multiply of a texture map
 *  by the gradient reads muddy, so the inspector disables it when a finish is
 *  set. */
export interface PartGradient {
  axis: 'x' | 'y' | 'z'
  /** Colour at the axis minimum (hex). */
  from: string
  /** Colour at the axis maximum (hex). */
  to: string
}

/** Per-group material configuration baked at CSG combine time. Mirrors the
 *  surface-look fields of `ShapePart` but without id/kind/transform — pure data
 *  so the spec stays serialisable. Absent fields fall back to the same defaults
 *  as `partMaterial` (roughness 0.6, metalness 0.05, opaque, no glow). Carries
 *  the Stage-2 `PhysicalSurfaceFields` too, so a combine bake preserves each
 *  operand's finish (velvet/glass/etc.). */
export interface GroupMaterialData extends PhysicalSurfaceFields {
  color: string
  finish?: string
  roughness?: number
  metalness?: number
  emissiveIntensity?: number
  opacity?: number
}

/** Baked triangle data for a `mesh` part (a CSG combine result), centred on the
 *  part's origin so `position`/`rotation` keep working like any primitive.
 *  Plain number arrays keep the spec pure/serialisable; treat them as immutable
 *  (duplicate/mirror share them by reference).
 *
 *  When `groups` and `materials` are present (GE3c tail), each group covers a
 *  range of triangles from one of the original source parts, and `materials[g.materialIndex]`
 *  carries that source part's surface look. A spec without these fields (pre-C273)
 *  keeps building unchanged — the single `finish`/`color` on the ShapePart is used. */
interface MeshGeometryData {
  positions: number[]
  normals: number[]
  index?: number[]
  /** Geometry draw groups, present when the CSG combine preserved per-part materials. */
  groups?: Array<{ start: number; count: number; materialIndex: number }>
  /** Per-group source material configs — index-matched to `groups[i].materialIndex`. */
  materials?: GroupMaterialData[]
}

export interface ShapePart extends PhysicalSurfaceFields {
  id: string
  kind: ShapeKind
  /** Centre position in metres (asset-local, floor at y=0, +Z front). */
  position: [number, number, number]
  /** Box: full W/H/D. Cylinder: [diameter, height, diameter]. Sphere: [d,d,d]. */
  size: [number, number, number]
  /** Euler rotation in DEGREES (X,Y,Z), asset-local. Absent → no rotation.
   *  Lets a cone/capsule/torus/pyramid be laid on its side or angled. */
  rotation?: [number, number, number]
  color: string
  /** Optional textured finish applied instead of the flat colour — a furniture
   *  finish id, today always `mat:<materialId>` (a procedural or CC0 DLC catalog
   *  material, the same vocabulary placed furniture uses). Absent → the plain
   *  solid-colour material, so every pre-GE3c spec keeps building unchanged.
   *  While the material isn't built yet (or the id is unknown) the part falls
   *  back to its solid colour — never a crash. */
  finish?: string
  /** PBR surface roughness 0 (mirror-smooth) … 1 (fully matte). Absent → 0.6.
   *  Ignored while `finish` is set (the finish's own maps win). */
  roughness?: number
  /** PBR metalness 0 (dielectric: wood/plastic/fabric) … 1 (metal). Absent → 0.05. */
  metalness?: number
  /** Self-illumination strength (emissive in the part's own colour). 0/absent →
   *  no glow; >0 makes the part read as lit (neon, a lamp shade, a screen). */
  emissiveIntensity?: number
  /** Surface opacity 0…1. <1 makes the part translucent (glass, acrylic).
   *  Absent → 1 (opaque). */
  opacity?: number
  /** Baked triangles — present iff `kind === 'mesh'`. For a mesh part `size` is
   *  the result's bounding box (informational; the geometry is already sized). */
  geometry?: MeshGeometryData
  /** Corner radius / edge bevel in metres (Stage 1a). Box → rounded box; wedge →
   *  bevelled ramp edges; extrude → extrusion-edge bevel (ON by default). 0 /
   *  absent → today's sharp geometry (byte-identical). Clamped to the shape size
   *  by the geometry builder. */
  bevel?: number
  /** Lathe: revolve profile — normalized `[x, y]` points, x ∈ [0,1] fraction of
   *  radius (`size[0]/2`), y ∈ [0,1] fraction of height (`size[1]`). */
  profile?: [number, number][]
  /** Lathe: radial segments (revolution smoothness). Absent → 32. */
  segments?: number
  /** Extrude: outline — normalized `[x, y]` points, both ∈ [-0.5, 0.5] (centred),
   *  scaled to `size[0]×size[1]` and extruded by `size[2]`. */
  outline?: [number, number][]
  /** Sweep: cross-section profile preset (`circle`/`half-round`/`ogee`/`rectangle`). */
  sweepProfile?: SweepProfileKind
  /** Sweep: path preset (`straight`/`l-corner`/`u`/`ring`). */
  sweepPath?: SweepPathKind
  /** TinkerCAD solid/hole role (CSG v2). Absent → `solid`. A `hole` renders as a
   *  translucent ghost and is carved out inside a Subtract combine group. */
  role?: PartRole
  /** Two-tone vertex-colour gradient baked into the geometry (Stage 2). Absent →
   *  no gradient (plain solid colour / finish). */
  gradient?: PartGradient
}

/** Fallback PBR finish for a part that hasn't set its own (keeps old specs +
 *  the export/preview in lock-step). */
export const DEFAULT_PART_ROUGHNESS = 0.6
export const DEFAULT_PART_METALNESS = 0.05

/** Per-named-mesh edit applied to a source GLB's components (recolour / hide). */
export interface MeshOverride {
  /** Hex colour to repaint this mesh (absent = keep its original material). */
  color?: string
  /** Hide this mesh entirely. */
  hidden?: boolean
}

export interface AssetEditSpec {
  /** Optional source GLB asset id (a user/bundled def) to build around; absent =
   *  a fresh asset composed only of primitives. */
  sourceAssetId?: string
  /** Uniform scale applied to the source GLB (1 = unchanged). */
  sourceScale: number
  /** Primitive shapes kit-bashed into the asset. */
  parts: ShapePart[]
  /** Recolour/hide overrides keyed by the source GLB's mesh name. */
  meshOverrides: Record<string, MeshOverride>
  /** Non-destructive boolean-combine groups (CSG v2, Stage 1b). Absent/empty →
   *  no combines (every part renders on its own). Each group references ≥2
   *  member `parts` that stay editable; the built result is evaluated lazily. */
  combineGroups?: CombineGroup[]
  /** Named transform groups (Stage 3a). Absent/empty → no groups (every part
   *  builds at its own transform). A group's members build under a shared
   *  parent transform (`PartGroup.position`/`rotation`). Independent of
   *  `combineGroups` — a part can be in both. */
  partGroups?: PartGroup[]
}

export function createEmptySpec(): AssetEditSpec {
  return { sourceScale: 1, parts: [], meshOverrides: {} }
}

/** Set (or clear) a per-mesh override immutably. An override that becomes empty
 *  (no colour, not hidden) is dropped so the mesh keeps its original look. */
export function setMeshOverride(
  spec: AssetEditSpec,
  meshName: string,
  patch: MeshOverride,
): AssetEditSpec {
  const next = { ...spec.meshOverrides[meshName], ...patch }
  if (next.color === undefined && !next.hidden) {
    const { [meshName]: _drop, ...rest } = spec.meshOverrides
    return { ...spec, meshOverrides: rest }
  }
  return { ...spec, meshOverrides: { ...spec.meshOverrides, [meshName]: next } }
}

let seq = 0
/** Fresh unique part id (also used by `csgCombine.ts` for the combined part). */
export function newPartId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  seq += 1
  return `shape-${Date.now().toString(36)}-${seq}`
}

/** Sensible starting dimensions per shape kind (metres). For `torus`, size is
 *  [outer diameter, tube diameter, _]; `capsule` is [diameter, total height, _]. */
const DEFAULT_SIZE: Record<PrimitiveShapeKind, [number, number, number]> = {
  box: [0.4, 0.4, 0.4],
  cylinder: [0.3, 0.5, 0.3],
  sphere: [0.3, 0.3, 0.3],
  cone: [0.4, 0.5, 0.4],
  pyramid: [0.5, 0.5, 0.5],
  capsule: [0.25, 0.6, 0.25],
  torus: [0.4, 0.12, 0.4],
  wedge: [0.5, 0.4, 0.5],
  lathe: [0.12, 0.5, 0.12], // [diameter, height, _] — a turned leg
  extrude: [0.4, 0.3, 0.12], // [width, height, depth]
  sweep: [0.5, 0.06, 0.5], // [pathExtent, tubeThickness, _] — a piping ring
}

/** Per-kind extra parametric defaults (profiles/presets/bevel) applied by
 *  `defaultPart`. Kept out of `DEFAULT_SIZE` so `size` stays a clean tuple. */
function defaultShapeParams(kind: PrimitiveShapeKind): Partial<ShapePart> {
  switch (kind) {
    case 'lathe':
      return { profile: LATHE_PRESETS['turned-leg'].map((p) => [...p]), segments: 32 }
    case 'extrude':
      // Bevel ON by default for extrudes (Stage 1a realism default).
      return { outline: EXTRUDE_PRESETS['rounded-rect'].map((p) => [...p]), bevel: 0.02 }
    case 'sweep':
      return { sweepProfile: 'circle', sweepPath: 'ring' }
    default:
      return {}
  }
}

/** Sensible starting dimensions/colour + floor-resting Y per shape kind. */
export function defaultPart(kind: PrimitiveShapeKind): ShapePart {
  const size = [...DEFAULT_SIZE[kind]] as [number, number, number]
  // Rest the shape on the floor: a standing torus spans its outer radius in Y
  // (it lies in the XY plane); a sweep ring lies flat (thin in Y); everything
  // else spans half its height.
  const y = kind === 'torus' ? size[0] / 2 : kind === 'sweep' ? size[1] : size[1] / 2
  return {
    id: newPartId(),
    kind,
    position: [0, y, 0],
    size,
    color: '#b08d57',
    ...defaultShapeParams(kind),
  }
}

export function addPart(spec: AssetEditSpec, kind: PrimitiveShapeKind): AssetEditSpec {
  const part = defaultPart(kind)
  // Stagger each new shape to the right of the previous ones so they don't pile
  // up invisibly at the origin (the user then drags/positions from there).
  part.position = [spec.parts.length * 0.5, part.position[1], part.position[2]]
  return { ...spec, parts: [...spec.parts, part] }
}

export function removePart(spec: AssetEditSpec, id: string): AssetEditSpec {
  const parts = spec.parts.filter((p) => p.id !== id)
  // A part removed from under a combine group is pruned from its member list; a
  // group left with <2 members is dissolved (its survivor becomes a free part).
  // Transform groups are pruned too (an empty group is dropped).
  return prunePartGroups(pruneCombineGroups({ ...spec, parts }))
}

let groupSeq = 0
/** Fresh unique combine-group id (internal — groups are only minted by
 *  `addCombineGroup`). */
function newGroupId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `grp-${crypto.randomUUID()}`
  }
  groupSeq += 1
  return `grp-${Date.now().toString(36)}-${groupSeq}`
}

/** The combine groups on a spec (never undefined). */
export function combineGroups(spec: AssetEditSpec): CombineGroup[] {
  return spec.combineGroups ?? []
}

/** The combine group that owns `partId`, or null when the part is free. */
export function groupForPart(spec: AssetEditSpec, partId: string): CombineGroup | null {
  return combineGroups(spec).find((g) => g.partIds.includes(partId)) ?? null
}

/** Ids of every part consumed by a combine group (rendered via the group result,
 *  not on their own). */
export function combinedPartIds(spec: AssetEditSpec): Set<string> {
  const set = new Set<string>()
  for (const g of combineGroups(spec)) for (const id of g.partIds) set.add(id)
  return set
}

/** Drop any member id that no longer names an existing part, and remove groups
 *  that fall below 2 members (a boolean needs ≥2 operands). Keeps the spec's
 *  `combineGroups` field absent when there are none, so old specs stay identical. */
export function pruneCombineGroups(spec: AssetEditSpec): AssetEditSpec {
  const groups = combineGroups(spec)
  if (groups.length === 0) return spec
  const live = new Set(spec.parts.map((p) => p.id))
  const next = groups
    .map((g) => ({ ...g, partIds: g.partIds.filter((id) => live.has(id)) }))
    .filter((g) => g.partIds.length >= 2)
  if (
    next.length === groups.length &&
    next.every((g, i) => g.partIds.length === groups[i].partIds.length)
  ) {
    return spec
  }
  return next.length > 0 ? { ...spec, combineGroups: next } : stripCombineGroups(spec)
}

/** Return a spec with no `combineGroups` field (keeps round-trips byte-identical
 *  to a fresh spec once the last group is gone). */
function stripCombineGroups(spec: AssetEditSpec): AssetEditSpec {
  if (spec.combineGroups === undefined) return spec
  const { combineGroups: _drop, ...rest } = spec
  return rest
}

/** Set (or clear) a part's solid/hole role immutably. `solid` (the default)
 *  clears the field so specs stay clean. No-op for an unknown id. */
export function setPartRole(spec: AssetEditSpec, id: string, role: PartRole): AssetEditSpec {
  return {
    ...spec,
    parts: spec.parts.map((p) =>
      p.id === id ? { ...p, role: role === 'solid' ? undefined : role } : p,
    ),
  }
}

/**
 * Record a new combine group over `partIds` (selection order) with `op`.
 * Non-destructive: the members stay in `spec.parts`. Guards: ≥2 distinct
 * existing parts, none already consumed by another group (bake first to
 * re-combine a result). Returns the spec unchanged (+ `groupId: null`) if the
 * inputs are invalid.
 */
export function addCombineGroup(
  spec: AssetEditSpec,
  partIds: string[],
  op: CombineOp,
): { spec: AssetEditSpec; groupId: string | null } {
  const distinct = [...new Set(partIds)]
  const live = new Set(spec.parts.map((p) => p.id))
  const alreadyGrouped = combinedPartIds(spec)
  if (distinct.length < 2 || distinct.some((id) => !live.has(id) || alreadyGrouped.has(id))) {
    return { spec, groupId: null }
  }
  const groups = combineGroups(spec)
  const id = newGroupId()
  const group: CombineGroup = { id, name: `Combine ${groups.length + 1}`, partIds: distinct, op }
  return { spec: { ...spec, combineGroups: [...groups, group] }, groupId: id }
}

/** Dissolve a combine group (ungroup) — its member parts become free again;
 *  nothing about the parts changes. No-op for an unknown group id. */
export function removeCombineGroup(spec: AssetEditSpec, groupId: string): AssetEditSpec {
  const groups = combineGroups(spec)
  const next = groups.filter((g) => g.id !== groupId)
  if (next.length === groups.length) return spec
  return next.length > 0 ? { ...spec, combineGroups: next } : stripCombineGroups(spec)
}

/**
 * "Bake to mesh": replace a combine group + its member parts with a single
 * frozen `mesh` part (the evaluated result, produced by the caller). The mesh
 * lands at the position of the group's first member so list order stays stable;
 * the group and its members are dropped. Pure — the caller owns the async
 * evaluation. No-op for an unknown group id.
 */
export function bakeCombineGroup(
  spec: AssetEditSpec,
  groupId: string,
  meshPart: ShapePart,
): AssetEditSpec {
  const group = combineGroups(spec).find((g) => g.id === groupId)
  if (!group) return spec
  const memberSet = new Set(group.partIds)
  // Emit the baked mesh in place of the FIRST member; drop the rest. Keeps the
  // surrounding (free) parts in their original order.
  const parts: ShapePart[] = []
  let emitted = false
  for (const p of spec.parts) {
    if (memberSet.has(p.id)) {
      if (!emitted) {
        parts.push(meshPart)
        emitted = true
      }
      continue
    }
    parts.push(p)
  }
  if (!emitted) parts.push(meshPart)
  return removeCombineGroup({ ...spec, parts }, groupId)
}

// ---- Transform groups (Stage 3a) -----------------------------------------

let partGroupSeq = 0
/** Fresh unique transform-group id (internal — minted only by `addPartGroup`). */
function newPartGroupId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `pg-${crypto.randomUUID()}`
  }
  partGroupSeq += 1
  return `pg-${Date.now().toString(36)}-${partGroupSeq}`
}

/** The transform groups on a spec (never undefined). */
export function partGroups(spec: AssetEditSpec): PartGroup[] {
  return spec.partGroups ?? []
}

/** The transform group that owns `partId`, or null when the part is ungrouped. */
export function partGroupForPart(spec: AssetEditSpec, partId: string): PartGroup | null {
  return partGroups(spec).find((g) => g.partIds.includes(partId)) ?? null
}

/** Ids of every part that belongs to some transform group. */
export function partGroupMemberIds(spec: AssetEditSpec): Set<string> {
  const set = new Set<string>()
  for (const g of partGroups(spec)) for (const id of g.partIds) set.add(id)
  return set
}

/** Return a spec with no `partGroups` field (keeps round-trips byte-identical to
 *  a fresh spec once the last group is gone). */
function stripPartGroups(spec: AssetEditSpec): AssetEditSpec {
  if (spec.partGroups === undefined) return spec
  const { partGroups: _drop, ...rest } = spec
  return rest
}

/** Drop any member id that no longer names an existing part, and remove groups
 *  left with no members. Keeps the field absent when there are none. */
function prunePartGroups(spec: AssetEditSpec): AssetEditSpec {
  const groups = partGroups(spec)
  if (groups.length === 0) return spec
  const live = new Set(spec.parts.map((p) => p.id))
  const next = groups
    .map((g) => ({ ...g, partIds: g.partIds.filter((id) => live.has(id)) }))
    .filter((g) => g.partIds.length >= 1)
  if (
    next.length === groups.length &&
    next.every((g, i) => g.partIds.length === groups[i].partIds.length)
  ) {
    return spec
  }
  return next.length > 0 ? { ...spec, partGroups: next } : stripPartGroups(spec)
}

/**
 * Record a new transform group over `partIds` (add order). Guards: ≥1 distinct
 * existing part, none already in another transform group (a part is in at most
 * one PartGroup). The members keep their own transforms — the group starts with
 * an identity transform. Returns the spec unchanged (+ `groupId: null`) if the
 * inputs are invalid.
 */
export function addPartGroup(
  spec: AssetEditSpec,
  partIds: string[],
): { spec: AssetEditSpec; groupId: string | null } {
  const distinct = [...new Set(partIds)]
  const live = new Set(spec.parts.map((p) => p.id))
  const alreadyGrouped = partGroupMemberIds(spec)
  if (distinct.length < 1 || distinct.some((id) => !live.has(id) || alreadyGrouped.has(id))) {
    return { spec, groupId: null }
  }
  const groups = partGroups(spec)
  const id = newPartGroupId()
  const group: PartGroup = { id, name: `Group ${groups.length + 1}`, partIds: distinct }
  return { spec: { ...spec, partGroups: [...groups, group] }, groupId: id }
}

/** Rename a transform group immutably. No-op for an unknown id or a blank name. */
export function renamePartGroup(spec: AssetEditSpec, groupId: string, name: string): AssetEditSpec {
  const trimmed = name.trim()
  if (!trimmed) return spec
  const groups = partGroups(spec)
  if (!groups.some((g) => g.id === groupId)) return spec
  return {
    ...spec,
    partGroups: groups.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g)),
  }
}

/** Set the group's transform immutably. An all-zero position/rotation clears the
 *  field so the spec stays clean (identity → absent). No-op for an unknown id. */
export function updatePartGroupTransform(
  spec: AssetEditSpec,
  groupId: string,
  patch: { position?: [number, number, number]; rotation?: [number, number, number] },
): AssetEditSpec {
  const groups = partGroups(spec)
  if (!groups.some((g) => g.id === groupId)) return spec
  const isZero = (t?: [number, number, number]) => !t || t.every((v) => v === 0)
  return {
    ...spec,
    partGroups: groups.map((g) => {
      if (g.id !== groupId) return g
      const next: PartGroup = { ...g }
      if (patch.position !== undefined) {
        if (isZero(patch.position)) delete next.position
        else next.position = patch.position
      }
      if (patch.rotation !== undefined) {
        if (isZero(patch.rotation)) delete next.rotation
        else next.rotation = patch.rotation
      }
      return next
    }),
  }
}

/** Remove a transform group's entity WITHOUT touching its members' transforms.
 *  Only correct on its own when the group transform is identity — the flattening
 *  ungroup (`groupTransform.ts:ungroupPartGroup`) uses this after baking the
 *  group transform into each member so nothing jumps. No-op for an unknown id. */
export function removePartGroupRaw(spec: AssetEditSpec, groupId: string): AssetEditSpec {
  const groups = partGroups(spec)
  const next = groups.filter((g) => g.id !== groupId)
  if (next.length === groups.length) return spec
  return next.length > 0 ? { ...spec, partGroups: next } : stripPartGroups(spec)
}

/** Deep-copy one part with a fresh id (shared by duplicate/mirror of parts +
 *  groups). `xform` remaps position/rotation for a mirror; identity for a plain
 *  copy. Arrays are deep-copied so the clone never shares a mutable tuple. */
function clonePart(
  src: ShapePart,
  xform: (p: ShapePart) => Pick<ShapePart, 'position' | 'rotation'>,
): ShapePart {
  const { position, rotation } = xform(src)
  return {
    ...src,
    id: newPartId(),
    position,
    size: [...src.size],
    rotation: rotation ? [...rotation] : undefined,
    profile: src.profile ? src.profile.map((p) => [...p]) : undefined,
    outline: src.outline ? src.outline.map((p) => [...p]) : undefined,
    gradient: src.gradient ? { ...src.gradient } : undefined,
  }
}

/**
 * Duplicate a whole transform group: DEEP-COPY every member (fresh ids), append
 * the copies, and add a new group over them offset slightly (+X) from the
 * original's transform so it's visible. Returns `{ spec, groupId }` with the new
 * group id (or the spec unchanged + null for an unknown id).
 */
export function duplicatePartGroup(
  spec: AssetEditSpec,
  groupId: string,
): { spec: AssetEditSpec; groupId: string | null } {
  const group = partGroups(spec).find((g) => g.id === groupId)
  if (!group) return { spec, groupId: null }
  const copies: ShapePart[] = []
  for (const id of group.partIds) {
    const src = spec.parts.find((p) => p.id === id)
    if (!src) continue
    copies.push(clonePart(src, (p) => ({ position: [...p.position], rotation: p.rotation })))
  }
  if (copies.length === 0) return { spec, groupId: null }
  const gp = group.position ?? [0, 0, 0]
  const groups = partGroups(spec)
  const newId = newPartGroupId()
  const copyGroup: PartGroup = {
    id: newId,
    name: `Group ${groups.length + 1}`,
    partIds: copies.map((p) => p.id),
    position: [gp[0] + 0.3, gp[1], gp[2]],
    rotation: group.rotation ? [...group.rotation] : undefined,
  }
  return {
    spec: { ...spec, parts: [...spec.parts, ...copies], partGroups: [...groups, copyGroup] },
    groupId: newId,
  }
}

/**
 * Mirror a whole transform group across the asset's centre (the X=0 / YZ plane):
 * deep-copy every member mirrored (same convention as `mirrorPart` — X negated,
 * Y/Z rotations negated) and add a new group whose transform is likewise
 * mirrored, so a symmetric assembly (two arms, a leg cluster) is one click.
 * Returns `{ spec, groupId }`.
 */
export function mirrorPartGroup(
  spec: AssetEditSpec,
  groupId: string,
): { spec: AssetEditSpec; groupId: string | null } {
  const group = partGroups(spec).find((g) => g.id === groupId)
  if (!group) return { spec, groupId: null }
  const copies: ShapePart[] = []
  for (const id of group.partIds) {
    const src = spec.parts.find((p) => p.id === id)
    if (!src) continue
    copies.push(
      clonePart(src, (p) => ({
        position: [-p.position[0], p.position[1], p.position[2]],
        rotation: p.rotation ? [p.rotation[0], -p.rotation[1], -p.rotation[2]] : undefined,
      })),
    )
  }
  if (copies.length === 0) return { spec, groupId: null }
  const gp = group.position ?? [0, 0, 0]
  const gr = group.rotation
  const groups = partGroups(spec)
  const newId = newPartGroupId()
  const mirroredPos: [number, number, number] = [-gp[0], gp[1], gp[2]]
  const mirrorGroup: PartGroup = {
    id: newId,
    name: `Group ${groups.length + 1}`,
    partIds: copies.map((p) => p.id),
    ...(mirroredPos.some((v) => v !== 0) ? { position: mirroredPos } : {}),
    ...(gr ? { rotation: [gr[0], -gr[1], -gr[2]] as [number, number, number] } : {}),
  }
  return {
    spec: { ...spec, parts: [...spec.parts, ...copies], partGroups: [...groups, mirrorGroup] },
    groupId: newId,
  }
}

/** Clone a part (full transform + material), offset slightly along X so the copy
 *  is visible, and append it. Returns the spec unchanged if the id is unknown.
 *  Arrays are deep-copied so the clone never shares a mutable tuple. */
export function duplicatePart(spec: AssetEditSpec, id: string): AssetEditSpec {
  const src = spec.parts.find((p) => p.id === id)
  if (!src) return spec
  const copy = clonePart(src, (p) => ({
    position: [p.position[0] + 0.2, p.position[1], p.position[2]],
    rotation: p.rotation,
  }))
  return { ...spec, parts: [...spec.parts, copy] }
}

/** Clone a part mirrored across the asset's centre (the X=0 / YZ plane): the
 *  copy sits at the opposite X with its Y/Z rotations negated, so a symmetric
 *  pair (chair arms, table legs, sofa sides) is one click. Geometry isn't
 *  negatively scaled, so symmetric primitives mirror exactly and an asymmetric
 *  one (wedge) mirrors its placement but keeps its own handedness. No-op for an
 *  unknown id. */
export function mirrorPart(spec: AssetEditSpec, id: string): AssetEditSpec {
  const src = spec.parts.find((p) => p.id === id)
  if (!src) return spec
  const copy = clonePart(src, (p) => ({
    position: [-p.position[0], p.position[1], p.position[2]],
    rotation: p.rotation ? [p.rotation[0], -p.rotation[1], -p.rotation[2]] : undefined,
  }))
  return { ...spec, parts: [...spec.parts, copy] }
}

export function updatePart(
  spec: AssetEditSpec,
  id: string,
  patch: Partial<ShapePart>,
): AssetEditSpec {
  return { ...spec, parts: spec.parts.map((p) => (p.id === id ? { ...p, ...patch, id: p.id } : p)) }
}

/** True when the spec would produce a non-empty asset (a source or ≥1 part). */
export function isBuildable(spec: AssetEditSpec): boolean {
  return !!spec.sourceAssetId || spec.parts.length > 0
}
