import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  SphereGeometry,
} from 'three'
import type { AssetEditSpec, ShapePart } from './editSpec'

/** Geometry for one primitive part, sized in metres (footprint-centred). */
function partGeometry(part: ShapePart): BufferGeometry {
  const [w, h, d] = part.size
  if (part.kind === 'box') return new BoxGeometry(w, h, d)
  if (part.kind === 'cylinder') return new CylinderGeometry(w / 2, w / 2, h, 32)
  return new SphereGeometry(Math.max(w, h, d) / 2, 32, 16)
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
    group.add(clone)
  }

  for (const part of spec.parts) {
    const mesh = new Mesh(
      partGeometry(part),
      new MeshStandardMaterial({ color: part.color, roughness: 0.6, metalness: 0.05 }),
    )
    mesh.position.set(part.position[0], part.position[1], part.position[2])
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }
  return group
}
