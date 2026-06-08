/**
 * GLB Asset Designer — the pure, serialisable spec describing a custom asset the
 * user builds in the designer (`ui/glbEditor/`). An asset is an optional source
 * GLB (uploaded/bundled) plus a uniform scale, plus a list of primitive shapes
 * "kit-bashed" around it. `buildObject.ts` turns a spec (+ the loaded source
 * object) into a three.Object3D; `saveAsset.ts` exports that to a GLB and
 * persists it as a new catalog asset. Keeping the spec pure makes the geometry
 * decisions (bounds, validation, part maths) unit-testable without a GPU.
 */

export type ShapeKind = 'box' | 'cylinder' | 'sphere'

export interface ShapePart {
  id: string
  kind: ShapeKind
  /** Centre position in metres (asset-local, floor at y=0, +Z front). */
  position: [number, number, number]
  /** Box: full W/H/D. Cylinder: [diameter, height, diameter]. Sphere: [d,d,d]. */
  size: [number, number, number]
  color: string
}

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

/** Sensible starting dimensions/colour per shape kind (metres). */
export function defaultPart(kind: ShapeKind): ShapePart {
  const size: [number, number, number] =
    kind === 'box' ? [0.4, 0.4, 0.4] : kind === 'cylinder' ? [0.3, 0.5, 0.3] : [0.3, 0.3, 0.3]
  return { id: shapeId(), kind, position: [0, size[1] / 2, 0], size, color: '#b08d57' }
}

export function addPart(spec: AssetEditSpec, kind: ShapeKind): AssetEditSpec {
  return { ...spec, parts: [...spec.parts, defaultPart(kind)] }
}

export function removePart(spec: AssetEditSpec, id: string): AssetEditSpec {
  return { ...spec, parts: spec.parts.filter((p) => p.id !== id) }
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

/**
 * Axis-aligned footprint + height of the primitive parts only (metres), used to
 * seed the new def's `defaultFootprint`. Returns null when there are no parts
 * (the caller falls back to the source GLB's measured bounds). Each part spans
 * ±size/2 about its centre; spheres/cylinders use their diameter as width/depth.
 */
export function partsBounds(parts: ShapePart[]): { w: number; d: number; h: number } | null {
  if (parts.length === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  let maxY = 0
  for (const p of parts) {
    const [sx, sy, sz] = p.size
    minX = Math.min(minX, p.position[0] - sx / 2)
    maxX = Math.max(maxX, p.position[0] + sx / 2)
    minZ = Math.min(minZ, p.position[2] - sz / 2)
    maxZ = Math.max(maxZ, p.position[2] + sz / 2)
    maxY = Math.max(maxY, p.position[1] + sy / 2)
  }
  return { w: maxX - minX, d: maxZ - minZ, h: maxY }
}
