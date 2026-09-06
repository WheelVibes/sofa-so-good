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
 * The marking is a per-TRIANGLE test in WORLD space, and the sentinel it writes is `uv1 = (-2,-2)`
 * — a value no box-atlas UV can take (they live in [0,1]), which `visibilityLightmap.ts` branches
 * on in the fragment shader. `markCutCapFaces` writes `(-1,-1)` instead: both skip the bake, and
 * only the exterior faces additionally take the daylight boost (EXTERIOR-FACE-DAYLIGHT).
 *
 * Pure and dependency-free (no three, no store, no plan types) so it is unit-testable on its own:
 * the caller supplies world positions and an `insideBuilding` predicate.
 *
 * `markCutCapFaces` at the bottom of this file is the SAME mechanism applied to the other family
 * of faces the bake never covered — the up-facing tops of the wall boxes, which orbit mode's
 * ceiling cull turns into a visible building section (ORBIT-NIGHT-CAPS). It lives here because it
 * writes the same sentinel for the same reason; it is a separate pass because `markExteriorFaces`
 * tests VERTICAL faces only and its `|n.y| > 0.5` gate skips exactly those tops.
 */

/**
 * The `uv1` a fragment shader reads as "this is a section-CUT CAP — use the analytic fill".
 *
 * Two distinct sentinel values, not one (EXTERIOR-FACE-DAYLIGHT, `v0.33.1.13`). Both families of
 * face skip the interior bake, but only one of them is a REAL, sky-lit surface: an exterior wall
 * face is lit by the whole sky dome and reads near-white in a Cycles reference, while a section cut
 * is not a physical surface at all and has nothing to be lit by. The shader therefore has to tell
 * them apart to give the exterior faces a daylight boost (`visibilityLightmap.ts`'s `exteriorBoost`
 * uniform) and leave the cut caps on the bare analytic fill — so the sentinel carries which kind of
 * face it is, and the branch is `vVisUv.x < -1.5` for exterior against `< 0.0` for either.
 */
export const CUT_CAP_UV_SENTINEL = -1

/**
 * The `uv1` a fragment shader reads as "this face points OUT of the building — analytic fill plus
 * the daylight boost". See {@link CUT_CAP_UV_SENTINEL} for why the two values differ.
 *
 * Any negative value works as a "not a real atlas UV" marker (box-atlas UVs live in [0,1]); −2 is
 * chosen so a single `< -1.5` test separates the two without a second varying.
 */
export const EXTERIOR_FACE_UV_SENTINEL = -2

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
 * Overwrite `uv` with {@link EXTERIOR_FACE_UV_SENTINEL} for every vertex of every outward-facing
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
    uv[v * 2] = EXTERIOR_FACE_UV_SENTINEL
    uv[v * 2 + 1] = EXTERIOR_FACE_UV_SENTINEL
  }
  return { faces, conflicts }
}

/**
 * How flat-UP a triangle's winding normal must be to count as a section-CUT CAP. A cut cap is the
 * top of a wall box, exactly axis-aligned, so this is a tight gate: 0.9 admits a face tilted up to
 * ~26° off vertical-up and rejects everything else, including the near-vertical faces
 * {@link markExteriorFaces} already handles (`|n.y| > 0.5` skips those, which is why the cut caps
 * were left behind by that fix — same mechanism, a face the bake never covered, different faces).
 */
const CUT_CAP_MIN_NY = 0.9

/**
 * Give the {@link CUT_CAP_UV_SENTINEL} to every up-facing triangle sitting at the orbit SECTION
 * CUT (ORBIT-NIGHT-CAPS).
 *
 * **The defect this fixes.** Orbit mode culls the ceiling and shows the flat as a building
 * section, so the top of every wall box (`y = ceilingHeight`) becomes a visible cut face. The
 * irradiance bake fills only ROOM-FACING atlas slots, so a wall's TOP slot is empty and
 * `lightmapUv.ts:computeBoxAtlasUv` relocates the lookup into the mirror row of the same column —
 * the cut face then renders the BOTTOM face's irradiance. At 20:00 that read as a bright white rim
 * along every wall top, which the bloom then amplified: the single brightest thing in a night
 * dollhouse, and not a photoreal cue, because **a section cut is not a physical surface at all**.
 * There is nothing to render a Cycles reference of — no real room has one, so no reference exists
 * to match; the honest render is whatever the analytic fill gives a horizontal face, which is what
 * the sentinel restores. (The pre-GI caps were near-black and judged "by design" by the earlier
 * NIGHT-WALL-CAP verdict in `src/scene/CLAUDE.md`; the GI patch is what turned them bright.)
 *
 * Same family as {@link markExteriorFaces} and deliberately a SEPARATE pass: that one tests
 * VERTICAL faces against the building footprint, and its `|n.y| > 0.5` gate skips exactly the
 * faces this one is for.
 *
 * **Height, not orientation, is what makes a face a cut cap.** Worktops, shelves, sills and
 * cabinet tops are all up-facing boxes with the same unfilled-top-slot problem, but they are never
 * sectioned by the orbit cut and their bake, right or wrong, is what the room has always looked
 * like — so only faces within `tol` of the cut plane are touched.
 *
 * @param positionsWorld flat `xyz` triples in WORLD metres, one per vertex
 * @param indices triangle vertex indices, or `null` for a non-indexed geometry
 * @param uv flat `uv` pairs, one per vertex — as returned by `computeBoxAtlasUv`
 * @param cutY world Y of the section cut (the plan's ceiling height)
 * @param tol how far below `cutY` a centroid may sit and still count, in metres
 */
export function markCutCapFaces(
  positionsWorld: ArrayLike<number>,
  indices: ArrayLike<number> | null,
  uv: Float32Array,
  cutY: number,
  tol = 0.03,
): ExteriorFaceResult {
  const vertexCount = Math.floor(positionsWorld.length / 3)
  const triangleCount = indices ? Math.floor(indices.length / 3) : Math.floor(vertexCount / 3)
  // Two passes, for the same reason `markExteriorFaces` uses two: a conflict has to be SEEN
  // before anything is overwritten.
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
    const by = positionsWorld[ib * 3 + 1]
    const cy = positionsWorld[ic * 3 + 1]
    const e1x = positionsWorld[ib * 3] - ax
    const e1y = by - ay
    const e1z = positionsWorld[ib * 3 + 2] - az
    const e2x = positionsWorld[ic * 3] - ax
    const e2y = cy - ay
    const e2z = positionsWorld[ic * 3 + 2] - az
    // Normal from the WINDING, matching `computeBoxAtlasUv`'s slot choice — the same reason
    // `markExteriorFaces` does not read the normal attribute.
    const nx = e1y * e2z - e1z * e2y
    const ny = e1z * e2x - e1x * e2z
    const nz = e1x * e2y - e1y * e2x
    const len = Math.hypot(nx, ny, nz)
    const mapped = () => {
      wantsMapped[ia] = 1
      wantsMapped[ib] = 1
      wantsMapped[ic] = 1
    }
    if (len < 1e-12) continue // degenerate triangle: no orientation to test
    if (ny / len < CUT_CAP_MIN_NY) {
      mapped()
      continue
    }
    if ((ay + by + cy) / 3 < cutY - tol) {
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
    uv[v * 2] = CUT_CAP_UV_SENTINEL
    uv[v * 2 + 1] = CUT_CAP_UV_SENTINEL
  }
  return { faces, conflicts }
}
