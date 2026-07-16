/**
 * GLB Asset Designer — Stage 5 decal geometry + material. Projects a curated
 * detail (button / stitch / seam / patch / wear) onto a target part's surface
 * using three's `DecalGeometry`, producing REAL geometry (position/normal/uv)
 * that exports into the GLB and reimports intact. Rendered as a thin overlay
 * physically offset a hair along the surface normal (so it never z-fights, even
 * after a GLB round-trip that drops `polygonOffset`) with `depthWrite: false`.
 *
 * Coordinate frame: a decal's `position`/`normal` live in the TARGET PART'S local
 * frame (the raycast hit converted via `worldToLocal` + the geometry-local face
 * normal). We project against the part geometry at IDENTITY, so the resulting
 * decal geometry is likewise part-local — the caller renders it as a CHILD of the
 * part mesh, so it follows the part under any group/transform (plan Stage 5).
 *
 * Pure of React/store — three math needs no GPU, so the orientation + geometry
 * are unit-testable; the tiny canvas texture is guarded for headless.
 */

import { type BufferGeometry, Euler, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js'
import { decalTexture } from './decalTexture'
import type { Decal, DecalKind } from './editSpec'

const Z_AXIS = new Vector3(0, 0, 1)
/** Physical stand-off of the decal above the surface (m) — enough to clear
 *  z-fighting after export (glTF has no polygonOffset) yet invisibly thin. */
const OFFSET_M = 0.0007

/** Default thread/button tint per kind (the material tints the white pattern). */
const DEFAULT_COLOR: Record<DecalKind, string> = {
  button: '#c9c2b4',
  stitch: '#efe9dc',
  seam: '#e6e0d2',
  patch: '#b9b2a2',
  wear: '#2b2620',
}

/** The projector box size (m) for a kind at in-plane `size`: buttons/patches are
 *  square; the line kinds are long + thin. The Z extent is the projection depth
 *  (kept modest so a thin part's far face isn't also caught). */
export function decalSizeVec(kind: DecalKind, size: number): Vector3 {
  // A generous projection depth so a decal reliably catches a bevelled or
  // plumped (bulged) surface a few cm off the flat plane, without reaching a
  // typical cushion/panel's far face.
  const depth = Math.max(0.07, size * 1.2)
  switch (kind) {
    case 'stitch':
      return new Vector3(size, size * 0.18, depth)
    case 'seam':
      return new Vector3(size, size * 0.32, depth)
    default:
      return new Vector3(size, size, depth)
  }
}

/**
 * The projector orientation (Euler) that aims the decal's +Z along `normal` and
 * rolls it `rollDeg` about that normal in-plane (orients the stitch/seam lines).
 * Pure.
 */
export function decalOrientation(normal: readonly [number, number, number], rollDeg = 0): Euler {
  const n = new Vector3(normal[0], normal[1], normal[2])
  if (n.lengthSq() < 1e-9) n.set(0, 1, 0)
  n.normalize()
  const align = new Quaternion().setFromUnitVectors(Z_AXIS, n)
  const roll = new Quaternion().setFromAxisAngle(Z_AXIS, (rollDeg * Math.PI) / 180)
  // align ∘ roll: roll happens in the projector's own frame (about +Z), then the
  // frame is rotated so +Z lands on the surface normal.
  return new Euler().setFromQuaternion(align.multiply(roll))
}

/**
 * Build the decal's projected geometry against a target part geometry (already
 * built, part-local, at identity). Offsets vertices a hair along their normal so
 * the overlay clears the surface. The input geometry is NOT mutated. Returns a
 * fresh `BufferGeometry` (may be empty if the projector missed the surface).
 */
export function decalGeometry(targetGeo: BufferGeometry, decal: Decal): BufferGeometry {
  const mesh = new Mesh(targetGeo)
  mesh.updateMatrixWorld(true)
  const position = new Vector3(decal.position[0], decal.position[1], decal.position[2])
  const orientation = decalOrientation(decal.normal, decal.rotation ?? 0)
  const size = decalSizeVec(decal.kind, decal.size)
  const geo = new DecalGeometry(mesh, position, orientation, size)
  // Physical stand-off along each vertex normal (survives export; no z-fight).
  const pos = geo.getAttribute('position')
  const nor = geo.getAttribute('normal')
  if (pos && nor) {
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(
        i,
        pos.getX(i) + nor.getX(i) * OFFSET_M,
        pos.getY(i) + nor.getY(i) * OFFSET_M,
        pos.getZ(i) + nor.getZ(i) * OFFSET_M,
      )
    }
    pos.needsUpdate = true
  }
  return geo
}

/**
 * The owned material for a decal (caller disposes; the shared cached texture is
 * never disposed). Transparent + `depthWrite:false` + `polygonOffset` for a
 * clean overlay in the editor; the map is the kind's procedural pattern, tinted
 * by the decal colour. Falls back to a flat tint where no canvas is available.
 */
export function decalMaterial(decal: Decal): MeshStandardMaterial {
  const tex = decalTexture(decal.kind)
  return new MeshStandardMaterial({
    color: decal.color ?? DEFAULT_COLOR[decal.kind],
    map: tex ?? undefined,
    transparent: true,
    alphaTest: tex ? 0.06 : 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    roughness: decal.kind === 'button' ? 0.5 : 0.8,
    metalness: 0,
  })
}
