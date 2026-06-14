/**
 * Sloping-wall geometry (SweetHome3DJS variable-height wall parity).
 *
 * A wall gains an optional `topHeightEnd`: when set, its top edge ramps linearly
 * from `topHeight` (or the ceiling height) at `start` to `topHeightEnd` at `end`
 * — a shed/mono-pitch wall. A flat-top wall is a rotated box (`wallBoxes`), but a
 * sloped top is a prism whose top face is slanted, so it needs real geometry:
 * this builds the prism as a **non-indexed** triangle soup (each face's verts are
 * unshared) so `computeVertexNormals` yields crisp flat normals — no rounded
 * edges, no z-fighting. Pure (no three/React imports) + unit-tested; the renderer
 * just wraps the returned positions in a BufferGeometry.
 */
import type { PlanWall } from './types'

/** True when the wall's top slopes (a distinct end height is set). */
export function isSlopedWall(w: Pick<PlanWall, 'topHeightEnd'>): boolean {
  return typeof w.topHeightEnd === 'number'
}

/** Start/end top heights for a (possibly sloped) wall, given the ceiling height. */
export function slopedWallHeights(w: PlanWall, ceilingHeight: number): [number, number] {
  const h0 = w.topHeight ?? ceilingHeight
  const h1 = w.topHeightEnd ?? h0
  return [h0, h1]
}

function thicknessOf(w: PlanWall): number {
  return w.thickness === 'external' ? 0.2 : 0.1
}

/**
 * World-space triangle positions (flat array, 3 floats/vertex, 36 verts = 12
 * triangles) for a sloped wall prism: rectangular floor footprint, vertical end
 * caps at h0 (start) and h1 (end), a slanted top, and four sides.
 */
export function slopedWallTriangles(w: PlanWall, ceilingHeight: number): Float32Array {
  const [sx, sz] = w.start
  const [ex, ez] = w.end
  const dx = ex - sx
  const dz = ez - sz
  const len = Math.hypot(dx, dz) || 1
  // Unit left-normal in XZ for the half-thickness offset.
  const nx = -dz / len
  const nz = dx / len
  const t = thicknessOf(w) / 2
  const [h0, h1] = slopedWallHeights(w, ceilingHeight)

  // 8 corners: base (y=0) + top (sloped). L/R = ±left-normal side; S/E = start/end.
  const SLb: V = [sx + nx * t, 0, sz + nz * t]
  const SRb: V = [sx - nx * t, 0, sz - nz * t]
  const ELb: V = [ex + nx * t, 0, ez + nz * t]
  const ERb: V = [ex - nx * t, 0, ez - nz * t]
  const SLt: V = [SLb[0], h0, SLb[2]]
  const SRt: V = [SRb[0], h0, SRb[2]]
  const ELt: V = [ELb[0], h1, ELb[2]]
  const ERt: V = [ERb[0], h1, ERb[2]]

  const out: number[] = []
  // Each quad emitted as two triangles (winding consistent enough for flat
  // normals via computeVertexNormals; walls are viewed from both sides anyway).
  quad(out, SLb, SRb, ERb, ELb) // bottom
  quad(out, SLt, ELt, ERt, SRt) // slanted top
  quad(out, SLb, SLt, SRt, SRb) // start cap
  quad(out, ELb, ERb, ERt, ELt) // end cap
  quad(out, SLb, ELb, ELt, SLt) // left side
  quad(out, SRb, SRt, ERt, ERb) // right side
  return new Float32Array(out)
}

type V = [number, number, number]

function quad(out: number[], a: V, b: V, c: V, d: V): void {
  out.push(...a, ...b, ...c, ...a, ...c, ...d)
}
