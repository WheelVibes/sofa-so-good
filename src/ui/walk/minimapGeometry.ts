import type { PlanRoom } from '../../floorplan/types'

/**
 * SVG path `d` for a room's floor shape in world-metre coordinates (the minimap
 * uses a 1:1 world→viewBox mapping). Mirrors `pointInRoom`'s shape precedence:
 * an explicit `polygon` (≥3 pts) wins, else the main rectangle plus an optional
 * L-shape `extension` rectangle as a second subpath. Returns '' for a
 * degenerate room (no polygon and non-positive size) so callers can skip it.
 */
export function roomPathD(r: PlanRoom): string {
  if (r.polygon && r.polygon.length >= 3) {
    const [first, ...rest] = r.polygon
    return `M${first[0].toFixed(3)} ${first[1].toFixed(3)}${rest
      .map((p) => `L${p[0].toFixed(3)} ${p[1].toFixed(3)}`)
      .join('')}Z`
  }
  if (!(r.width > 0) || !(r.depth > 0)) return ''
  const [ox, oz] = r.origin
  const rect = (x: number, z: number, w: number, d: number) =>
    `M${x.toFixed(3)} ${z.toFixed(3)}h${w.toFixed(3)}v${d.toFixed(3)}h${(-w).toFixed(3)}Z`
  let d = rect(ox, oz, r.width, r.depth)
  if (r.extension && r.extension.width > 0 && r.extension.depth > 0) {
    d += rect(
      ox + r.extension.offset[0],
      oz + r.extension.offset[1],
      r.extension.width,
      r.extension.depth,
    )
  }
  return d
}
