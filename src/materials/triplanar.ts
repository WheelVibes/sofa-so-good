/**
 * Triplanar (dominant-axis world) UV projection for non-planar wall geometry
 * (MAT-006b). Sloped / curved walls are triangle soup whose faces don't share a
 * single plane, so a single planar UV unwrap stretches a tiled finish badly. A
 * triplanar projection instead picks, per triangle, the world axis its face
 * normal points along most strongly, and projects the other two world
 * coordinates as (U, V). Adjacent faces that share an orientation share a
 * consistent projection, so a tiled texture reads at a constant world scale with
 * no stretch — the standard fix for arbitrary geometry.
 *
 * Pure geometry: takes a flat `positions` Float32Array (3 floats/vertex, triangle
 * list) and returns a matching `uv` Float32Array (2 floats/vertex). `scale` is
 * metres-per-UV-unit (one texture tile spans `scale` metres). No three/React.
 */

/** Dominant world axis (0=x,1=y,2=z) of a face normal — the axis it points along
 *  most strongly. The projection drops this axis and uses the other two as U,V. */
export function dominantAxis(nx: number, ny: number, nz: number): 0 | 1 | 2 {
  const ax = Math.abs(nx)
  const ay = Math.abs(ny)
  const az = Math.abs(nz)
  if (ax >= ay && ax >= az) return 0
  if (ay >= az) return 1
  return 2
}

/** The (U, V) for a world point given the projection axis (metres → tiles via
 *  `scale`). For the X-dominant (side) walls we project (z, y); Y-dominant
 *  (floors/ceilings) (x, z); Z-dominant walls (x, y) — so vertical stays vertical. */
export function projectUv(
  x: number,
  y: number,
  z: number,
  axis: 0 | 1 | 2,
  scale: number,
): [number, number] {
  const s = scale > 1e-6 ? scale : 1
  if (axis === 0) return [z / s, y / s]
  if (axis === 1) return [x / s, z / s]
  return [x / s, y / s]
}

/**
 * Build triplanar UVs for a non-indexed triangle-list geometry. Each triangle
 * (3 consecutive vertices) is projected as a unit using its own face normal's
 * dominant axis, so all three of its vertices share one projection (no per-vertex
 * seams within a face). Returns `uv` (2 floats/vertex) or null when `positions`
 * isn't a whole triangle list.
 */
export function triplanarUv(positions: Float32Array, scale = 1): Float32Array | null {
  const vertCount = positions.length / 3
  if (!Number.isInteger(vertCount) || vertCount % 3 !== 0) return null
  const uv = new Float32Array(vertCount * 2)
  for (let t = 0; t < vertCount; t += 3) {
    const i0 = t * 3
    const i1 = (t + 1) * 3
    const i2 = (t + 2) * 3
    // Face normal via cross product of two edges.
    const ax = positions[i1] - positions[i0]
    const ay = positions[i1 + 1] - positions[i0 + 1]
    const az = positions[i1 + 2] - positions[i0 + 2]
    const bx = positions[i2] - positions[i0]
    const by = positions[i2 + 1] - positions[i0 + 1]
    const bz = positions[i2 + 2] - positions[i0 + 2]
    const nx = ay * bz - az * by
    const ny = az * bx - ax * bz
    const nz = ax * by - ay * bx
    const axis = dominantAxis(nx, ny, nz)
    for (let k = 0; k < 3; k++) {
      const pi = (t + k) * 3
      const [u, v] = projectUv(positions[pi], positions[pi + 1], positions[pi + 2], axis, scale)
      uv[(t + k) * 2] = u
      uv[(t + k) * 2 + 1] = v
    }
  }
  return uv
}
