import { type BufferGeometry, PlaneGeometry, Shape, ShapeGeometry } from 'three'

/** Per-surface texture transform (SweetHome3DJS texture angle/scale parity):
 *  scale tile size by `scale` (×, >1 = bigger tiles) and rotate the texture by
 *  `angle` (radians), about the surface's UV centre. Identity when absent. */
export interface UvTransform {
  scale?: number
  angle?: number
}

/** Apply a {@link UvTransform} in place to a geometry's UV attribute (world-metre
 *  UVs): `uv' = c + Rot(angle)·((uv − c) / scale)`, where `c` is the UV-bounds
 *  centre. A no-op for the identity transform. Pure-ish (mutates the passed geo). */
export function applyUvTransform(geo: BufferGeometry, t?: UvTransform): void {
  const scale = t?.scale && t.scale > 0 ? t.scale : 1
  const angle = t?.angle ?? 0
  if (scale === 1 && angle === 0) return
  const uv = geo.attributes.uv
  let minU = Infinity
  let minV = Infinity
  let maxU = -Infinity
  let maxV = -Infinity
  for (let i = 0; i < uv.count; i++) {
    minU = Math.min(minU, uv.getX(i))
    maxU = Math.max(maxU, uv.getX(i))
    minV = Math.min(minV, uv.getY(i))
    maxV = Math.max(maxV, uv.getY(i))
  }
  const cu = (minU + maxU) / 2
  const cv = (minV + maxV) / 2
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  for (let i = 0; i < uv.count; i++) {
    const du = (uv.getX(i) - cu) / scale
    const dv = (uv.getY(i) - cv) / scale
    uv.setXY(i, cu + du * cos - dv * sin, cv + du * sin + dv * cos)
  }
  uv.needsUpdate = true
}

/**
 * A plane whose UVs are expressed in metres rather than the default 0..1,
 * so a tiling texture (repeat = tiles-per-metre) covers the surface at a
 * consistent physical scale regardless of the plane's dimensions. This lets
 * one shared material tile correctly across rooms/walls of different sizes.
 */
export function worldUvPlaneGeometry(
  width: number,
  height: number,
  transform?: UvTransform,
): PlaneGeometry {
  const geo = new PlaneGeometry(width, height)
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * width, uv.getY(i) * height)
  }
  uv.needsUpdate = true
  applyUvTransform(geo, transform)
  return geo
}

/**
 * A triangulated floor from an arbitrary world-space polygon (`[x, z]` metres),
 * for non-rectangular rooms. The shape is built with vertices `(x, -z)` so that
 * a mesh rotated `[-π/2, 0, 0]` (the floor orientation) lands each vertex at
 * world `(x, 0, z)` with the normal facing up. UVs are set in metres (`x`, `z`)
 * so a tiling texture covers it at the same physical scale as the rect floors.
 * The mesh using this geometry needs no position offset (verts are absolute).
 */
export function worldUvShapeGeometry(
  points: [number, number][],
  transform?: UvTransform,
): ShapeGeometry {
  const shape = new Shape()
  points.forEach(([x, z], i) => {
    if (i === 0) shape.moveTo(x, -z)
    else shape.lineTo(x, -z)
  })
  shape.closePath()
  const geo = new ShapeGeometry(shape)
  const pos = geo.attributes.position
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    // pos.y === -worldZ (see above) → v = worldZ.
    uv.setXY(i, pos.getX(i), -pos.getY(i))
  }
  uv.needsUpdate = true
  applyUvTransform(geo, transform)
  return geo
}
