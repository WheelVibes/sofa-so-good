/**
 * MITRE-END-INHERIT — a mitred wall body's diagonal end face samples its OWN wall's map at the
 * texel of the adjacent ROOM-FACING body face, instead of the unconditional analytic-fill
 * sentinel `lightmapExterior.ts:markMitreEndFaces` gives every mitred end (MITRE-SEAM-IN-REVEAL,
 * v0.35.11.0).
 *
 * **Why the sentinel is a fallback, not the answer.** MITRE-SEAM-IN-REVEAL's own measurement
 * recorded the residual plainly: at the a225e35 corner-mitre pose the analytic fill patch reads
 * **137.0** against the adjacent wall's own bake of **82.5** — 1.66x, down from 2.32x but still
 * brighter than the wall it sits on, "analytic fill still reads brighter than this wall's own
 * baked value, a smaller, honestly-reported residual." The sentinel was the right call at the
 * time because `computeBoxAtlasUv`'s per-triangle axis bucketing has no clean donor UV for a
 * SHEARED quad — its winding normal is a mix of the wall's length and thickness axes, not one of
 * the atlas's six canonical directions.
 *
 * **The donor exists after all, and it does not require re-deriving a UV from scratch.**
 * `wallBodyGeometry.ts:applyMiter` clamps a vertex's along-axis (local X) to the cut line
 * `x = at + slope*z`, moving X only — Z is untouched, and every vertex in this extruded body sits
 * at EXACTLY one of the two thickness extremes (`z = ±thickness/2`), because `ExtrudeGeometry`
 * duplicates the outline's boundary once per Z end for the side-wall sweep and once more for each
 * flat CAP at that same Z. So a mitred vertex's Z tells you, exactly, WHICH room-facing cap
 * (`axis = 2`, the thickness axis) it sits on the trimmed edge of — the mitre shears the cap's own
 * near-corner vertices along the identical line (`applyMiter` clamps every vertex meeting its X/Z
 * test, cap or end-face alike), so the end face and its adjacent cap share not just an edge but the
 * SAME already-being-computed (a, b) parameterisation. Projecting the end-face vertex is therefore
 * exactly: **force `axis = 2`** (instead of letting the mitred normal's ambiguous largest-magnitude
 * component pick an unrelated slot) and read off the SAME `otherAxes(2) = [0, 1]` (length, height)
 * coordinate pair `computeBoxAtlasUv` would use for any other vertex on that cap.
 *
 * **Which of the two thickness rows is still resolved the way `computeBoxAtlasUv` resolves it**
 * — from the bake's own recorded `occupiedSlots`, with the same mirror-row correction
 * (`v0.31.7.98`) for a winding disagreement between the exporter and Blender. If NEITHER row of
 * the thickness column is occupied (an interior partition wall whose bake covers neither
 * thickness face — e.g. both sides open onto rooms the bake skipped, or a wall with no baked map
 * at all reaching this code path via a stale key), there is no donor and the caller's sentinel
 * stands: this module never removes information, only replaces it when a real donor is found.
 *
 * **The "clamped one texel inside" step exists because of the LONG side of a mitre.**
 * `geometricCornerMiter`'s `abut` is chosen so the wall's outline reaches the corner's true
 * convex vertex — i.e. the long side of the mitre projects to `a = 0` or `a = 1` exactly, the
 * mesh's own bounding-box extreme. Sampling exactly at that edge lands on the boundary between
 * this slot and the atlas's own inter-slot margin (`LIGHTMAP_UV_MARGIN`), which `bake_material.py`
 * fills by dilation rather than by a real irradiance sample. Nudging the normalised (a, b) inward
 * by one texel (matching `lightmapUv.ts:ROW_TEXELS`, the same texel size `ceilingClampV`'s `back`
 * margin is stated in) keeps the sample inside the slot's own dilated interior — the same reason
 * `computeBoxAtlasUv`'s `bounds` option clamps a donor-frame receiver away from [0, 1]'s raw edge.
 *
 * Pure and dependency-free (no three, no store) like its siblings in `lightmapExterior.ts`, so it
 * is unit-testable on synthetic vertex arrays without building an `ExtrudeGeometry`.
 */
import { ATLAS_COLS, ATLAS_ROWS, LIGHTMAP_UV_MARGIN, otherAxes, ROW_TEXELS } from './lightmapUv'

/** The atlas column a mitred end face always projects to — thickness, never the ambiguous mitred
 *  normal's own largest-magnitude axis. See the module doc for why this is forced rather than
 *  computed per triangle. */
const THICKNESS_AXIS = 2

export interface MitreEndInheritResult {
  /** Vertices that found an occupied donor row and now sample their own wall's cap. */
  inherited: number
  /** Vertices with no occupied row on either thickness sign — left at the caller's existing
   *  sentinel `uv`, unmodified. */
  fallback: number
}

/**
 * The atlas row (`0` or `1`) for a thickness-axis (`axis = 2`) cap on the given side of the wall,
 * or `null` when neither row is occupied — mirrors `computeBoxAtlasUv`'s own winding-disagreement
 * correction (`v0.31.7.98`) rather than re-deriving a new rule.
 *
 * @param zSign the sign of the vertex's own local Z (which thickness extreme it sits on)
 * @param occupied the bake's recorded slot occupancy, or `null` when none was supplied (every row
 *   is assumed reachable — matches `computeBoxAtlasUv`'s own `occupiedSlots` contract)
 */
function donorRowForThicknessSide(
  zSign: number,
  occupied: ReadonlySet<string> | null,
): number | null {
  const row = zSign >= 0 ? 0 : 1
  if (!occupied) return row
  if (occupied.has(`${THICKNESS_AXIS},${row}`)) return row
  const mirror = row === 0 ? 1 : 0
  return occupied.has(`${THICKNESS_AXIS},${mirror}`) ? mirror : null
}

/**
 * Overwrite `uv` for every mitred end-face vertex that has a real donor, leaving every other
 * vertex — including a mitred one with no occupied thickness row — exactly as the caller left it.
 *
 * Intended to run AFTER `lightmapExterior.ts:markMitreEndFaces`, whose sentinel is this module's
 * fallback: a mitred vertex this function cannot resolve keeps that sentinel untouched, and this
 * function never needs to know the difference between "not mitred" and "mitred but already
 * correctly sentinel'd" — it only ever writes vertices where `mitreEnd` is truthy.
 *
 * @param positions flat local `xyz` triples, one per vertex — the SAME array `computeBoxAtlasUv`
 *   built the atlas UVs from (this module recomputes the identical bounding box unless `bounds`
 *   overrides it, so the two stay in the same frame without the caller threading it through
 *   separately)
 * @param mitreEnd per-vertex flag from `wallBodyGeometry.ts:MITRE_END_ATTR` (1 = clamped by
 *   `applyMiter`); every OTHER vertex is untouched regardless of what triangle it belongs to
 * @param uv flat `uv` pairs, one per vertex, already carrying `markMitreEndFaces`'s sentinel for
 *   every mitred vertex — mutated in place
 * @param occupiedSlots the bake's recorded slot occupancy, exactly as passed to
 *   `computeBoxAtlasUv` — `null` to skip the occupancy gate entirely (every donor assumed real)
 * @param margin matches `computeBoxAtlasUv`'s own default so a donor row's margin agrees with
 *   every other face's
 * @param texels how many atlas texels the "clamped one texel inside" inset covers; `0` disables it
 * @param bounds LIGHTMAP-NEIGHBOUR-INHERIT's own `bounds` option, for a mitred RECEIVER (a
 *   skirting or crown strip that is itself mitred at a corner, inheriting a donor wall's map):
 *   `positions` then already sit in the donor's local frame and must be normalised against the
 *   DONOR's box, not the receiver's own — mirrors `computeBoxAtlasUv`'s `bounds`, including its
 *   `[0, 1]` clamp before the texel inset, since a receiver's own vertices can sit slightly
 *   outside the donor's box (a skirting stands proud of its wall).
 */
export function computeMitreEndInheritUv(
  positions: ArrayLike<number>,
  mitreEnd: ArrayLike<number>,
  uv: Float32Array,
  occupiedSlots: ReadonlyArray<readonly [number, number]> | null = null,
  margin = LIGHTMAP_UV_MARGIN,
  texels = 1,
  bounds?: { min: readonly [number, number, number]; size: readonly [number, number, number] },
): MitreEndInheritResult {
  const vertexCount = Math.floor(positions.length / 3)
  const occupied = occupiedSlots?.length
    ? new Set(occupiedSlots.map(([c, r]) => `${c},${r}`))
    : null
  const [o1, o2] = otherAxes(THICKNESS_AXIS)

  let min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
  let size = [1e-6, 1e-6, 1e-6]
  if (bounds) {
    min = [...bounds.min]
    size = bounds.size.map((s) => Math.max(s, 1e-6))
  } else {
    const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
    for (let v = 0; v < vertexCount; v += 1) {
      for (let k = 0; k < 3; k += 1) {
        const value = positions[v * 3 + k]
        if (value < min[k]) min[k] = value
        if (value > max[k]) max[k] = value
      }
    }
    size = [0, 1, 2].map((k) => Math.max(max[k] - min[k], 1e-6))
  }
  const insetU = (texels * (1 / ATLAS_COLS)) / ROW_TEXELS
  const insetV = (texels * (1 / ATLAS_ROWS)) / ROW_TEXELS

  let inherited = 0
  let fallback = 0
  for (let v = 0; v < vertexCount; v += 1) {
    if (!mitreEnd[v]) continue
    const row = donorRowForThicknessSide(positions[v * 3 + THICKNESS_AXIS], occupied)
    if (row === null) {
      fallback += 1
      continue
    }
    let a = (positions[v * 3 + o1] - min[o1]) / size[o1]
    let b = (positions[v * 3 + o2] - min[o2]) / size[o2]
    a = a < insetU ? insetU : a > 1 - insetU ? 1 - insetU : a
    b = b < insetV ? insetV : b > 1 - insetV ? 1 - insetV : b
    uv[v * 2] = (THICKNESS_AXIS + margin + a * (1 - 2 * margin)) / ATLAS_COLS
    uv[v * 2 + 1] = (row + margin + b * (1 - 2 * margin)) / ATLAS_ROWS
    inherited += 1
  }
  return { inherited, fallback }
}
