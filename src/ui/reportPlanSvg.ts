import type { FloorPlan } from '../floorplan/types'
import { planBounds, wallLength } from '../floorplan/types'

const esc = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

/**
 * Build a self-contained inline **SVG** floor-plan diagram for the printable
 * report — walls as strokes (thicker for external) + room name labels at their
 * centres. Pure string generation from the plan geometry (no canvas/DOM), so it
 * works headlessly and prints crisply. Coordinates are plan metres (x east, y =
 * z south); the viewBox lets it scale to any container width. Returns '' when
 * the plan has no extent.
 */
export function reportPlanSvg(plan: FloorPlan): string {
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

  return `<svg class="plan-svg" viewBox="${-pad} ${-pad} ${(w + pad * 2).toFixed(3)} ${(d + pad * 2).toFixed(3)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Floor plan">${walls}${labels}</svg>`
}
