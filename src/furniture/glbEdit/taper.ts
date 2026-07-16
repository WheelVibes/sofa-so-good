/**
 * GLB Asset Designer — Stage 8b TAPER deformer. A pure, resolution-independent
 * vertex transform that shrinks one face of a box/extrude prism relative to the
 * opposite face, so a solid reads as a splayed carcass side, a tapered pedestal
 * or an A-frame — forms a lathe/loft can't express on a rectangular footprint.
 *
 * ## What taper does (documented scope)
 * `taper` is a single 0…1 factor that scales the cross-section linearly along one
 * axis: at the axis MINIMUM the cross-section is full size (scale 1), at the axis
 * MAXIMUM it is `1 − taper`. So the TOP shrinks relative to the BOTTOM — the
 * overwhelmingly common furniture case (splayed sides, tapered legs/pedestals).
 *  - **box** → taper axis is **Y** (height): the +Y (top) face shrinks in X and Z.
 *  - **extrude** → taper axis is **Z** (the extrude/depth axis): the +Z (front)
 *    cross-section shrinks in X and Y toward the outline centroid. (Extrude's
 *    cross-section lives in XY and is extruded along Z, so the depth axis is the
 *    only one that leaves a full face at one end and a shrunk face at the other.)
 *
 * A directional / wedge-like taper (different shrink per side, or a shear) is
 * deliberately OUT of scope — one symmetric shrink-toward-centroid factor covers
 * the furniture cases and keeps the control a single slider. The transform runs
 * AFTER geometry construction (so it composes with bevel — a rounded tapered box
 * is a common planter/pedestal), recomputes normals so the sloped sides shade
 * correctly, and leaves UVs untouched (a linear XY/XZ scale keeps box-projected
 * tiling sane). Pure of React/store → unit-testable on the CPU.
 */

import type { BufferGeometry } from 'three'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** The axis along which a part's taper varies (see file header). */
export type TaperAxis = 'y' | 'z'

/**
 * Scale `geo`'s cross-section linearly along `axis` in place: a vertex at the
 * axis minimum keeps full size, one at the maximum is scaled by `1 − taper`,
 * shrinking the two perpendicular coordinates toward the cross-section centre.
 * Recomputes normals + bounds. No-op for `taper <= 0`. The perpendicular axes
 * scale toward the geometry's bounding-box centre on those axes (the footprint
 * centroid for our footprint-centred primitives), so a centred box/extrude
 * stays centred.
 */
export function applyTaper(geo: BufferGeometry, taper: number, axis: TaperAxis): void {
  const t = clamp01(taper)
  if (t <= 0) return
  geo.computeBoundingBox()
  const bb = geo.boundingBox
  if (!bb) return
  const min = axis === 'y' ? bb.min.y : bb.min.z
  const max = axis === 'y' ? bb.max.y : bb.max.z
  const span = max - min
  if (span < 1e-6) return
  // Centres of the two perpendicular axes (scale target).
  const cx = (bb.min.x + bb.max.x) / 2
  const cy = (bb.min.y + bb.max.y) / 2
  const cz = (bb.min.z + bb.max.z) / 2
  const pos = geo.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const along = axis === 'y' ? y : z
    const f = clamp01((along - min) / span)
    const s = 1 - t * f
    if (axis === 'y') {
      pos.setXYZ(i, cx + (x - cx) * s, y, cz + (z - cz) * s)
    } else {
      pos.setXYZ(i, cx + (x - cx) * s, cy + (y - cy) * s, z)
    }
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
}
