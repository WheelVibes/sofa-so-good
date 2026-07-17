/**
 * GLB Asset Designer — Stage 2 two-tone gradient. Pure geometry helper that bakes
 * a per-vertex `COLOR_0` attribute onto a part's `BufferGeometry`, lerping the
 * `from` colour at the chosen local bbox axis minimum to the `to` colour at the
 * maximum. Rendered with `vertexColors: true` (set by `buildSurfaceMaterial`) and
 * survives GLB export losslessly as COLOR_0 (verified round-trip).
 *
 * Works on every shape kind (box, lathe, extrude, sweep, rounded box, mesh) —
 * it only reads the geometry's own position bounds, so it is shape-agnostic.
 * Pure of React/store/GPU → unit-testable on the CPU.
 */

import { Color, Float32BufferAttribute } from 'three'
import type { PartGradient } from './editSpec'

const AXIS_INDEX: Record<PartGradient['axis'], number> = { x: 0, y: 1, z: 2 }

/**
 * Bake `gradient` into `geo` as a `COLOR_0` attribute (three linear colour
 * space, matching how three feeds vertex colours to the shader). Idempotent-ish:
 * overwrites any existing `color` attribute. A degenerate axis span (flat
 * geometry on that axis) fills every vertex with the `from` colour. Mutates the
 * geometry in place; returns it for chaining.
 */
export function applyGradientColors<T extends { getAttribute: (n: string) => unknown }>(
  geo: T,
  gradient: PartGradient,
): T {
  // Narrow to the BufferGeometry shape we actually use (kept generic so callers
  // don't need to import three's type here).
  const g = geo as unknown as {
    getAttribute: (n: string) =>
      | {
          count: number
          getX: (i: number) => number
          getY: (i: number) => number
          getZ: (i: number) => number
        }
      | undefined
    setAttribute: (n: string, a: Float32BufferAttribute) => void
  }
  const pos = g.getAttribute('position')
  if (!pos || pos.count === 0) return geo
  const axis = AXIS_INDEX[gradient.axis]
  const getOnAxis = (i: number) =>
    axis === 0 ? pos.getX(i) : axis === 1 ? pos.getY(i) : pos.getZ(i)
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (let i = 0; i < pos.count; i++) {
    const v = getOnAxis(i)
    if (v < min) min = v
    if (v > max) max = v
  }
  const span = max - min
  // `Color` parses the sRGB hex and converts to three's working linear space —
  // the correct space for a `COLOR_0` vertex attribute.
  const from = new Color(gradient.from)
  const to = new Color(gradient.to)
  const colors = new Float32Array(pos.count * 3)
  const tmp = new Color()
  for (let i = 0; i < pos.count; i++) {
    const t = span > 1e-9 ? (getOnAxis(i) - min) / span : 0
    tmp.copy(from).lerp(to, t)
    colors[i * 3] = tmp.r
    colors[i * 3 + 1] = tmp.g
    colors[i * 3 + 2] = tmp.b
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return geo
}
