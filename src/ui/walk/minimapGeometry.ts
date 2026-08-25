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

export interface PlanContentBounds {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

/**
 * True world-metre bounding box of the **drawn** apartment (walls + room
 * shapes), as opposed to `planBounds` which returns only the max corner against
 * `plan.extent`. The minimap centres on this so the apartment sits in the middle
 * of the widget regardless of where it lives in plan space or how the extent is
 * padded. Returns a zero box for an empty plan.
 */
export function planContentBounds(plan: FloorPlan): PlanContentBounds {
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  const acc = (x: number, z: number) => {
    if (x < minX) minX = x
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (z > maxZ) maxZ = z
  }
  for (const w of plan.walls) {
    if (wallLength(w) === 0) continue
    acc(w.start[0], w.start[1])
    acc(w.end[0], w.end[1])
  }
  for (const r of plan.rooms) {
    if (r.polygon && r.polygon.length >= 3) {
      for (const [px, pz] of r.polygon) acc(px, pz)
    } else if (r.width > 0 && r.depth > 0) {
      acc(r.origin[0], r.origin[1])
      acc(r.origin[0] + r.width, r.origin[1] + r.depth)
      if (r.extension && r.extension.width > 0 && r.extension.depth > 0) {
        acc(r.origin[0] + r.extension.offset[0], r.origin[1] + r.extension.offset[1])
        acc(
          r.origin[0] + r.extension.offset[0] + r.extension.width,
          r.origin[1] + r.extension.offset[1] + r.extension.depth,
        )
      }
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minZ: 0, maxX: 0, maxZ: 0 }
  return { minX, minZ, maxX, maxZ }
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

export interface MinimapView {
  /** World metres → svg units. */
  scale: number
  /** Svg-unit offset of the padded content box's left edge. */
  offX: number
  /** Svg-unit offset of the padded content box's top edge. */
  offY: number
}

/**
 * Fit the plan's content bounds into the minimap's **actual** (non-square) box.
 *
 * The minimap used to draw into a fixed SQUARE viewBox inside a wider-than-tall
 * widget, so the browser's `xMidYMid meet` letterboxed the square content and
 * the map only ever filled the box's SHORTER side — a fat empty margin left and
 * right, on top of the widget's own CSS padding. Sizing the viewBox to the
 * measured box (`svg` units = CSS px) and fitting here instead lets the map fill
 * the rectangle, with `inset` as the only breathing room.
 *
 * `worldPad` is the metre margin kept around the apartment itself (so wall
 * strokes and the player arrow never clip at the edge); `inset` is svg-unit
 * padding inside the box. Uniform scale on both axes — never distorted.
 */
export function fitMinimapView(
  bounds: PlanContentBounds,
  boxW: number,
  boxH: number,
  inset: number,
  worldPad: number,
): MinimapView {
  const contentW = bounds.maxX - bounds.minX + worldPad * 2
  const contentH = bounds.maxZ - bounds.minZ + worldPad * 2
  const innerW = Math.max(1, boxW - inset * 2)
  const innerH = Math.max(1, boxH - inset * 2)
  const scale = contentW > 0 && contentH > 0 ? Math.min(innerW / contentW, innerH / contentH) : 1
  return {
    scale,
    offX: (boxW - contentW * scale) / 2,
    offY: (boxH - contentH * scale) / 2,
  }
}
