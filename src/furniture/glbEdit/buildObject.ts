import {
  BoxGeometry,
  type BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  SphereGeometry,
  TorusGeometry,
} from 'three'
import type { AssetEditSpec, MeshOverride, ShapePart } from './editSpec'

/**
 * Apply per-mesh recolour/hide overrides to a (cloned) source object, in place.
 * Matches `Mesh.name` against the override map; recolouring clones the mesh's
 * material first so shared materials aren't mutated across other meshes/instances.
 * Pure of the store + spec types — directly unit-testable on a synthetic graph.
 */
export function applyMeshOverrides(
  object: Object3D,
  overrides: Record<string, MeshOverride>,
): void {
  if (Object.keys(overrides).length === 0) return
  object.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const ov = overrides[o.name]
    if (!ov) return
    if (ov.hidden) {
      o.visible = false
      return
    }
    if (ov.color !== undefined) {
      const src = o.material as Material | Material[]
      const recolour = (m: Material): Material => {
        const c = m.clone() as Material & { color?: Color }
        if (c.color) c.color = new Color(ov.color)
        return c
      }
      o.material = Array.isArray(src) ? src.map(recolour) : recolour(src)
    }
  })
}

/** Geometry for one primitive part, sized in metres (footprint-centred).
 *  `torus` reads size as [outer diameter, tube diameter, _]; `capsule` as
 *  [diameter, total height, _]; `pyramid` is a 4-sided cone rotated so a flat
 *  face points +Z (front). Exported so the live designer preview builds the
 *  exact geometry the export will, with no per-kind drift. */
export function partGeometry(part: ShapePart): BufferGeometry {
  const [w, h, d] = part.size
  switch (part.kind) {
    case 'box':
      return new BoxGeometry(w, h, d)
    case 'cylinder':
      return new CylinderGeometry(w / 2, w / 2, h, 32)
    case 'cone':
      return new ConeGeometry(w / 2, h, 32)
    case 'pyramid': {
      // 4 radial segments = square base; widen so flat-to-flat ≈ w, then turn a
      // face to the front instead of a corner.
      const geo = new ConeGeometry(w / Math.SQRT2, h, 4)
      geo.rotateY(Math.PI / 4)
      return geo
    }
    case 'capsule': {
      const radius = Math.max(0.01, w / 2)
      // CapsuleGeometry's `length` excludes the two hemispherical caps.
      const length = Math.max(0, h - 2 * radius)
      return new CapsuleGeometry(radius, length, 8, 24)
    }
    case 'torus': {
      const tube = Math.max(0.01, h / 2)
      const radius = Math.max(tube, w / 2 - tube)
      return new TorusGeometry(radius, tube, 16, 48)
    }
    default:
      return new SphereGeometry(Math.max(w, h, d) / 2, 32, 16)
  }
}

/**
 * Build the designer's edited asset as a three.Group, floor-anchored and centred
 * (the app's asset convention): an optional cloned + uniformly-scaled source GLB
 * plus every primitive part as a `MeshStandardMaterial` box/cylinder/sphere.
 * Pure of the store — the caller supplies the already-loaded `source` object (or
 * null for a from-scratch asset). The returned group is ready for `exportGlb`.
 */
export function buildEditedObject(source: Object3D | null, spec: AssetEditSpec): Group {
  const group = new Group()
  group.name = 'sofa-asset'

  if (source) {
    const clone = source.clone(true)
    const s = spec.sourceScale > 0 ? spec.sourceScale : 1
    clone.scale.multiplyScalar(s)
    applyMeshOverrides(clone, spec.meshOverrides)
    group.add(clone)
  }

  spec.parts.forEach((part, i) => {
    const mesh = new Mesh(
      partGeometry(part),
      new MeshStandardMaterial({ color: part.color, roughness: 0.6, metalness: 0.05 }),
    )
    // Name parts so a saved asset's components are addressable when it's later
    // reopened as a source for per-mesh recolour/hide.
    mesh.name = `${part.kind}-${i + 1}`
    mesh.position.set(part.position[0], part.position[1], part.position[2])
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  })
  return group
}
