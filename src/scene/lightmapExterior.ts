/**
 * EXTERIOR-FACE-LIGHTMAP — mark the faces of a baked mesh that point OUT of the building, so the
 * shader can fall back to the analytic fill for them instead of sampling the interior bake.
 *
 * **The defect this fixes.** The irradiance bake fills only the ROOM-FACING faces of a shell box
 * (`bake_material.py` writes 3 of the 6 box-atlas slots for a typical wall), but
 * `lightmapUv.ts:computeBoxAtlasUv` is handed the bake's own slot occupancy and relocates a face
 * whose computed slot is empty into the **mirror row of the same column**. That reconciliation is
 * right for a winding disagreement and wrong for a face the bake never covered: an EXTERIOR face
 * then samples the INTERIOR face's irradiance — the wrong data, at the wrong scale. Standing at
 * the living-room window of the default flat looking down and out, the flat's own outside wall
 * (1.3 × 2.6 × 0.3 m at world 9.18, 0, 0.65, a plain `#f1f0ec` `MeshStandardMaterial` with NO
 * albedo/normal/roughness map at all) read as a soft grey-brown mottle at 10–20 cm scale — the
 * texel grid of a 256 px atlas stretched over a 1.3 m face. A Cycles reference of the same pose
 * renders that face flat and near-white.
 *
 * The marking is a per-TRIANGLE test in WORLD space, and the sentinel it writes is `uv1 = (-1,-1)`
 * — a value no box-atlas UV can take (they live in [0,1]), which `visibilityLightmap.ts` branches
 * on in the fragment shader.
 *
 * Pure and dependency-free (no three, no store, no plan types) so it is unit-testable on its own:
 * the caller supplies world positions and an `insideBuilding` predicate.
 */

/** The `uv1` a fragment shader reads as "this face is outside — use the analytic fill". */
export const EXTERIOR_UV_SENTINEL = -1

/**
 * How far outward from a face's centroid the inside/outside probe is taken, in metres.
 *
 * Not exported: an export nothing imports fails `npm run deadcode`.
 *
 * The predicate tests against the exterior walls' CENTRE-LINES, and a shell wall is 0.1–0.3 m
 * thick — so the two faces of an exterior wall straddle the outline, one about half a thickness
 * outside it and one about half a thickness inside. Probing 6 cm along the face normal is enough
 * to leave the outline for a face that lies ON it and small enough to stay inside the room for the
 * room-facing twin (which is already ≥ 5 cm inside).
 */
const EXTERIOR_PROBE_M = 0.06

/**
 * Faces flatter than this in Y are never tested: a floor or a ceiling cannot face out of the
 * building, and its outward probe would be a horizontal no-op at the centroid.
 */
const VERTICAL_MAX_ABS_NY = 0.5

export interface ExteriorFaceResult {
  /** Triangles found to face out of the building and given the sentinel. */
  faces: number
  /**
   * Vertices that one face wanted to sentinel and another wanted to keep mapped.
   *
   * Box and plane geometries duplicate their corners per face, so a vertex is never shared across
   * a hard normal boundary and this is 0 for the shell. It is COUNTED rather than resolved because
   * silently picking one of the two answers is how a per-vertex attribute lies about a per-face
   * quantity — the same trap `computeBoxAtlasUv.conflicts` exists for.
   */
  conflicts: number
}

/**
 * Overwrite `uv` with {@link EXTERIOR_UV_SENTINEL} for every vertex of every outward-facing
 * triangle. Mutates `uv` in place and returns the counts.
 *
 * @param positionsWorld flat `xyz` triples in WORLD metres, one per vertex
 * @param indices triangle vertex indices, or `null` for a non-indexed geometry
 * @param uv flat `uv` pairs, one per vertex — as returned by `computeBoxAtlasUv`
 * @param insideBuilding `true` when the world point (x, z) is inside the building footprint
 */
export function markExteriorFaces(
  positionsWorld: ArrayLike<number>,
  indices: ArrayLike<number> | null,
  uv: Float32Array,
  insideBuilding: (x: number, z: number) => boolean,
): ExteriorFaceResult {
  const vertexCount = Math.floor(positionsWorld.length / 3)
  const triangleCount = indices ? Math.floor(indices.length / 3) : Math.floor(vertexCount / 3)
  // Two passes so a conflict can be SEEN before anything is overwritten: a single pass that wrote
  // as it went would have already destroyed the mapped uv it was about to disagree with.
  const wantsSentinel = new Uint8Array(vertexCount)
  const wantsMapped = new Uint8Array(vertexCount)
  let faces = 0

  for (let t = 0; t < triangleCount; t += 1) {
    const ia = indices ? indices[t * 3] : t * 3
    const ib = indices ? indices[t * 3 + 1] : t * 3 + 1
    const ic = indices ? indices[t * 3 + 2] : t * 3 + 2
    const ax = positionsWorld[ia * 3]
    const ay = positionsWorld[ia * 3 + 1]
    const az = positionsWorld[ia * 3 + 2]
    const e1x = positionsWorld[ib * 3] - ax
    const e1y = positionsWorld[ib * 3 + 1] - ay
    const e1z = positionsWorld[ib * 3 + 2] - az
    const e2x = positionsWorld[ic * 3] - ax
    const e2y = positionsWorld[ic * 3 + 1] - ay
    const e2z = positionsWorld[ic * 3 + 2] - az
    // Face normal from the WINDING, exactly as `computeBoxAtlasUv` picks its slot — a shaded
    // normal attribute may be smoothed or flipped by the exporter, and the two have to agree
    // about which way a face points or the sentinel would land on the opposite face.
    let nx = e1y * e2z - e1z * e2y
    let ny = e1z * e2x - e1x * e2z
    let nz = e1x * e2y - e1y * e2x
    const len = Math.hypot(nx, ny, nz)
    if (len < 1e-12) continue // degenerate triangle: nothing to face outward
    nx /= len
    ny /= len
    nz /= len
    const mapped = () => {
      wantsMapped[ia] = 1
      wantsMapped[ib] = 1
      wantsMapped[ic] = 1
    }
    if (Math.abs(ny) > VERTICAL_MAX_ABS_NY) {
      mapped()
      continue
    }
    const cx = (ax + positionsWorld[ib * 3] + positionsWorld[ic * 3]) / 3
    const cz = (az + positionsWorld[ib * 3 + 2] + positionsWorld[ic * 3 + 2]) / 3
    if (insideBuilding(cx + nx * EXTERIOR_PROBE_M, cz + nz * EXTERIOR_PROBE_M)) {
      mapped()
      continue
    }
    faces += 1
    wantsSentinel[ia] = 1
    wantsSentinel[ib] = 1
    wantsSentinel[ic] = 1
  }

  let conflicts = 0
  for (let v = 0; v < vertexCount; v += 1) {
    if (!wantsSentinel[v]) continue
    if (wantsMapped[v]) conflicts += 1
    uv[v * 2] = EXTERIOR_UV_SENTINEL
    uv[v * 2 + 1] = EXTERIOR_UV_SENTINEL
  }
  return { faces, conflicts }
}
