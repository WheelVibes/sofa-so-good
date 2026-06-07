import type { FloorPlan, PlanRoom } from '../../floorplan/types'
import { wallLength } from '../../floorplan/types'

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

export interface OpeningSeg {
  id: string
  kind: 'door' | 'window'
  /** Span endpoints in world metres, along the host wall. */
  a: [number, number]
  b: [number, number]
}

/**
 * World-metre line segments for each wall opening (door / window), resolved
 * along its host wall. Used by the minimap to draw doorways as gaps and windows
 * as ticks so the player can read where rooms connect. The opening span is
 * clamped to the wall so a malformed offset/width can't draw past the wall ends;
 * openings whose wall is missing or zero-length are skipped.
 */
export function openingSegments(plan: FloorPlan): OpeningSeg[] {
  const byId = new Map(plan.walls.map((w) => [w.id, w]))
  const segs: OpeningSeg[] = []
  for (const op of plan.openings) {
    const w = byId.get(op.wallId)
    if (!w) continue
    const len = wallLength(w)
    if (len < 1e-4) continue
    const ux = (w.end[0] - w.start[0]) / len
    const uz = (w.end[1] - w.start[1]) / len
    const s = Math.max(0, Math.min(len, op.offset))
    const e = Math.max(s, Math.min(len, op.offset + op.width))
    segs.push({
      id: op.id,
      kind: op.kind,
      a: [w.start[0] + ux * s, w.start[1] + uz * s],
      b: [w.start[0] + ux * e, w.start[1] + uz * e],
    })
  }
  return segs
}
