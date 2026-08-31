import type { FloorPlan } from './types'
import { wallLength } from './types'

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
