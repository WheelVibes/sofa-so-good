import type { FloorPlan } from '../floorplan/types'
import { planBounds, wallLength } from '../floorplan/types'
import type { MeasurementAnnotation } from '../state/slices/measurementsSlice'
import { formatArea, formatDims, formatLength, type UnitSystem } from '../utils/measurement'

const esc = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

const ANN = '#0d9488' // teal — dimension callouts, distinct from the wall strokes

/** Render pinned dimension annotations as dashed lines/rects + labels (world
 *  metres, same coord space as the plan). */
function annotationSvg(annotations: MeasurementAnnotation[], units: UnitSystem): string {
  return annotations
    .map((an) => {
      const [ax, az] = an.a
      const [bx, bz] = an.b
      if (an.shape === 'rect') {
        const x = Math.min(ax, bx)
        const y = Math.min(az, bz)
        const w = Math.abs(bx - ax)
        const h = Math.abs(bz - az)
        if (w < 1e-3 || h < 1e-3) return ''
        const label = `${formatDims(w, h, units)} · ${formatArea(w * h, units)}`
        return `<rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${w.toFixed(3)}" height="${h.toFixed(3)}" fill="${ANN}" fill-opacity="0.1" stroke="${ANN}" stroke-width="0.04" stroke-dasharray="0.15 0.1"/><text x="${(x + w / 2).toFixed(3)}" y="${(y + h / 2).toFixed(3)}" font-size="0.28" fill="${ANN}" text-anchor="middle" dominant-baseline="middle">${esc(label)}</text>`
      }
      const len = Math.hypot(bx - ax, bz - az)
      if (len < 1e-3) return ''
      return `<line x1="${ax.toFixed(3)}" y1="${az.toFixed(3)}" x2="${bx.toFixed(3)}" y2="${bz.toFixed(3)}" stroke="${ANN}" stroke-width="0.05" stroke-dasharray="0.15 0.1"/><text x="${((ax + bx) / 2).toFixed(3)}" y="${((az + bz) / 2 - 0.18).toFixed(3)}" font-size="0.28" fill="${ANN}" text-anchor="middle" dominant-baseline="middle">${esc(formatLength(len, units))}</text>`
    })
    .join('')
}

/**
 * Build a self-contained inline **SVG** floor-plan diagram for the printable
 * report — walls as strokes (thicker for external) + room name labels at their
 * centres. Pure string generation from the plan geometry (no canvas/DOM), so it
 * works headlessly and prints crisply. Coordinates are plan metres (x east, y =
 * z south); the viewBox lets it scale to any container width. Returns '' when
 * the plan has no extent.
 */
export function reportPlanSvg(
  plan: FloorPlan,
  annotations: MeasurementAnnotation[] = [],
  units: UnitSystem = 'metric',
): string {
  // Defensive: a malformed/partial plan (no extent or no walls) yields no
  // diagram rather than throwing.
  if (!Array.isArray(plan.extent) || !Array.isArray(plan.walls) || plan.walls.length === 0) {
    return ''
  }
  const [w, d] = planBounds(plan)
  if (!(w > 0.1 && d > 0.1)) return ''
  const pad = 0.4

  const walls = plan.walls
    .filter((wl) => wallLength(wl) > 0.001)
    .map((wl) => {
      const sw = wl.thickness === 'external' ? 0.18 : 0.09
      return `<line x1="${wl.start[0].toFixed(3)}" y1="${wl.start[1].toFixed(3)}" x2="${wl.end[0].toFixed(3)}" y2="${wl.end[1].toFixed(3)}" stroke="#374151" stroke-width="${sw}" stroke-linecap="round"/>`
    })
    .join('')

  const labels = plan.rooms
    .map((r) => {
      const cx = (r.origin[0] + r.width / 2).toFixed(3)
      const cy = (r.origin[1] + r.depth / 2).toFixed(3)
      return `<text x="${cx}" y="${cy}" font-size="0.32" fill="#6b7280" text-anchor="middle" dominant-baseline="middle">${esc(r.name)}</text>`
    })
    .join('')

  return `<svg class="plan-svg" viewBox="${-pad} ${-pad} ${(w + pad * 2).toFixed(3)} ${(d + pad * 2).toFixed(3)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Floor plan">${walls}${labels}${annotationSvg(annotations, units)}</svg>`
}
