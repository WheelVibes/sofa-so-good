import { PlaneGeometry, Shape, ShapeGeometry } from 'three'

/**
 * A plane whose UVs are expressed in metres rather than the default 0..1,
 * so a tiling texture (repeat = tiles-per-metre) covers the surface at a
 * consistent physical scale regardless of the plane's dimensions. This lets
 * one shared material tile correctly across rooms/walls of different sizes.
 */
export function worldUvPlaneGeometry(width: number, height: number): PlaneGeometry {
  const geo = new PlaneGeometry(width, height)
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * width, uv.getY(i) * height)
  }
  uv.needsUpdate = true
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
export function worldUvShapeGeometry(points: [number, number][]): ShapeGeometry {
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
  return geo
}
