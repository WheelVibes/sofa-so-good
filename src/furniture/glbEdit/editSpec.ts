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

/** Kinds edited via a 2D profile point list (the shared profile editor). */
export const PROFILE_KINDS: PrimitiveShapeKind[] = ['lathe', 'extrude']

/** A part is either a parametric primitive or a baked `mesh` — the result of a
 *  CSG combine (`csgCombine.ts`), whose triangles live in `ShapePart.geometry`. */
export type ShapeKind = PrimitiveShapeKind | 'mesh'

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

/** Per-group material configuration baked at CSG combine time. Mirrors the
 *  surface-look fields of `ShapePart` but without id/kind/transform — pure data
 *  so the spec stays serialisable. Absent fields fall back to the same defaults
 *  as `partMaterial` (roughness 0.6, metalness 0.05, opaque, no glow). */
export interface GroupMaterialData {
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

export interface ShapePart {
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
  return { ...spec, parts: spec.parts.filter((p) => p.id !== id) }
}

/** Clone a part (full transform + material), offset slightly along X so the copy
 *  is visible, and append it. Returns the spec unchanged if the id is unknown.
 *  Arrays are deep-copied so the clone never shares a mutable tuple. */
export function duplicatePart(spec: AssetEditSpec, id: string): AssetEditSpec {
  const src = spec.parts.find((p) => p.id === id)
  if (!src) return spec
  const copy: ShapePart = {
    ...src,
    id: newPartId(),
    position: [src.position[0] + 0.2, src.position[1], src.position[2]],
    size: [...src.size],
    rotation: src.rotation ? [...src.rotation] : undefined,
    profile: src.profile ? src.profile.map((p) => [...p]) : undefined,
    outline: src.outline ? src.outline.map((p) => [...p]) : undefined,
  }
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
  const copy: ShapePart = {
    ...src,
    id: newPartId(),
    position: [-src.position[0], src.position[1], src.position[2]],
    size: [...src.size],
    rotation: src.rotation ? [src.rotation[0], -src.rotation[1], -src.rotation[2]] : undefined,
    profile: src.profile ? src.profile.map((p) => [...p]) : undefined,
    outline: src.outline ? src.outline.map((p) => [...p]) : undefined,
  }
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
