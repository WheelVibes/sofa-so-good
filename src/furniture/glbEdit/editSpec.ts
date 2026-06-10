/**
 * GLB Asset Designer — the pure, serialisable spec describing a custom asset the
 * user builds in the designer (`ui/glbEditor/`). An asset is an optional source
 * GLB (uploaded/bundled) plus a uniform scale, plus a list of primitive shapes
 * "kit-bashed" around it. `buildObject.ts` turns a spec (+ the loaded source
 * object) into a three.Object3D; `saveAsset.ts` exports that to a GLB and
 * persists it as a new catalog asset. Keeping the spec pure makes the geometry
 * decisions (bounds, validation, part maths) unit-testable without a GPU.
 */

export type ShapeKind = 'box' | 'cylinder' | 'sphere' | 'cone' | 'torus' | 'capsule' | 'pyramid'

/** All primitive kinds, in palette order. Source of truth for the designer's
 *  "add shape" controls + the geometry switch in `buildObject.ts`. */
export const SHAPE_KINDS: ShapeKind[] = [
  'box',
  'cylinder',
  'sphere',
  'cone',
  'pyramid',
  'capsule',
  'torus',
]

export const SHAPE_LABEL: Record<ShapeKind, string> = {
  box: 'Box',
  cylinder: 'Cylinder',
  sphere: 'Sphere',
  cone: 'Cone',
  pyramid: 'Pyramid',
  capsule: 'Capsule',
  torus: 'Torus',
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
  /** PBR surface roughness 0 (mirror-smooth) … 1 (fully matte). Absent → 0.6. */
  roughness?: number
  /** PBR metalness 0 (dielectric: wood/plastic/fabric) … 1 (metal). Absent → 0.05. */
  metalness?: number
  /** Self-illumination strength (emissive in the part's own colour). 0/absent →
   *  no glow; >0 makes the part read as lit (neon, a lamp shade, a screen). */
  emissiveIntensity?: number
  /** Surface opacity 0…1. <1 makes the part translucent (glass, acrylic).
   *  Absent → 1 (opaque). */
  opacity?: number
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
function shapeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  seq += 1
  return `shape-${Date.now().toString(36)}-${seq}`
}

/** Sensible starting dimensions per shape kind (metres). For `torus`, size is
 *  [outer diameter, tube diameter, _]; `capsule` is [diameter, total height, _]. */
const DEFAULT_SIZE: Record<ShapeKind, [number, number, number]> = {
  box: [0.4, 0.4, 0.4],
  cylinder: [0.3, 0.5, 0.3],
  sphere: [0.3, 0.3, 0.3],
  cone: [0.4, 0.5, 0.4],
  pyramid: [0.5, 0.5, 0.5],
  capsule: [0.25, 0.6, 0.25],
  torus: [0.4, 0.12, 0.4],
}

/** Sensible starting dimensions/colour + floor-resting Y per shape kind. */
export function defaultPart(kind: ShapeKind): ShapePart {
  const size = [...DEFAULT_SIZE[kind]] as [number, number, number]
  // Rest the shape on the floor: a standing torus spans its outer radius in Y
  // (it lies in the XY plane), everything else spans half its height.
  const y = kind === 'torus' ? size[0] / 2 : size[1] / 2
  return { id: shapeId(), kind, position: [0, y, 0], size, color: '#b08d57' }
}

export function addPart(spec: AssetEditSpec, kind: ShapeKind): AssetEditSpec {
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
    id: shapeId(),
    position: [src.position[0] + 0.2, src.position[1], src.position[2]],
    size: [...src.size],
    rotation: src.rotation ? [...src.rotation] : undefined,
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
