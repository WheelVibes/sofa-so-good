import { doorSwingGeometry } from '../floorplan/doorSwing'
import { roomLabelPoint } from '../floorplan/roomCentroid'
import type { FloorPlan } from '../floorplan/types'
import { planBounds, planRoomArea, wallLength } from '../floorplan/types'
import type { MeasurementAnnotation } from '../state/slices/measurementsSlice'
import { formatArea, formatDims, formatLength, type UnitSystem } from '../utils/measurement'

// Full escape (incl. quotes) — these SVGs render via dangerouslySetInnerHTML, so
// keep it attribute-safe even if a user string is ever placed in an attribute.
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

const ANN = '#0d9488' // teal — dimension callouts, distinct from the wall strokes
const NOTE = '#b45309' // amber — free text callouts (matches the drawing-set storey notes)

/** Render the plan's free-text notes (the editor's Text tool, PARITY-DIMTEXT) as
 *  amber text callouts with a small locator dot — so the user's on-plan
 *  annotations carry through to the printed report + drawing set. */
function notesSvg(plan: FloorPlan): string {
  return (plan.notes ?? [])
    .filter((n) => n.text.trim().length > 0)
    .map((n) => {
      const x = n.x.toFixed(3)
      const z = n.z.toFixed(3)
      return `<circle cx="${x}" cy="${z}" r="0.06" fill="${NOTE}"/><text x="${x}" y="${(n.z - 0.16).toFixed(3)}" font-size="0.3" font-weight="600" fill="${NOTE}" text-anchor="middle" dominant-baseline="middle">${esc(n.text)}</text>`
    })
    .join('')
}

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
 * Architectural opening symbols over the walls: each opening first "cuts" the
 * wall with a white gap (the `.plan-wrap` is white), then a door draws its leaf
 * line + swing arc (honouring hinge/swing via the shared geometry helper) and a
 * window a thin pane line — so the report plan reads like a real drawing.
 */
function openingsSvg(plan: FloorPlan): string {
  return plan.openings
    .map((o) => {
      const wall = plan.walls.find((wl) => wl.id === o.wallId)
      if (!wall) return ''
      const len = wallLength(wall)
      if (len === 0) return ''
      const ux = (wall.end[0] - wall.start[0]) / len
      const uz = (wall.end[1] - wall.start[1]) / len
      const sx = wall.start[0] + ux * o.offset
      const sz = wall.start[1] + uz * o.offset
      const ex = wall.start[0] + ux * (o.offset + o.width)
      const ez = wall.start[1] + uz * (o.offset + o.width)
      const maskW = (wall.thickness === 'external' ? 0.18 : 0.09) + 0.05
      let s = `<line x1="${sx.toFixed(3)}" y1="${sz.toFixed(3)}" x2="${ex.toFixed(3)}" y2="${ez.toFixed(3)}" stroke="#ffffff" stroke-width="${maskW.toFixed(3)}" stroke-linecap="butt"/>`
      if (o.kind === 'door') {
        const g = doorSwingGeometry(wall, o)
        if (g) {
          s += `<line x1="${g.hinge[0].toFixed(3)}" y1="${g.hinge[1].toFixed(3)}" x2="${g.leafTip[0].toFixed(3)}" y2="${g.leafTip[1].toFixed(3)}" stroke="#6b7280" stroke-width="0.04"/>`
          s += `<path d="M ${g.freeJamb[0].toFixed(3)} ${g.freeJamb[1].toFixed(3)} A ${o.width.toFixed(3)} ${o.width.toFixed(3)} 0 0 ${g.sweep} ${g.leafTip[0].toFixed(3)} ${g.leafTip[1].toFixed(3)}" fill="none" stroke="#9ca3af" stroke-width="0.025"/>`
        }
      } else {
        s += `<line x1="${sx.toFixed(3)}" y1="${sz.toFixed(3)}" x2="${ex.toFixed(3)}" y2="${ez.toFixed(3)}" stroke="#9ca3af" stroke-width="0.03"/>`
      }
      return s
    })
    .join('')
}

/** Pick a "nice" round scale-bar length that fits ~a quarter of the plan width.
 *  Metric → 0.5/1/2/5/10 m; imperial → 1/2/5/10/20 ft (drawn at its true metre
 *  length). Returns the bar length in METRES plus its label. */
export function scaleBarChoice(
  planWidthM: number,
  units: UnitSystem,
): { meters: number; label: string } {
  const target = Math.max(0.5, planWidthM / 4)
  if (units === 'imperial') {
    const ft = [20, 10, 5, 2, 1].find((f) => f * 0.3048 <= target) ?? 1
    return { meters: ft * 0.3048, label: `${ft} ft` }
  }
  const m = [10, 5, 2, 1, 0.5].find((v) => v <= target) ?? 0.5
  return { meters: m, label: m < 1 ? `${m * 100} cm` : `${m} m` }
}

/** A scale bar drawn in the strip below the plan (world-metre coords). It scales
 *  with the plan, so the bar always represents its labelled real length at the
 *  diagram's printed size. */
function scaleBarSvg(planWidthM: number, barY: number, units: UnitSystem): string {
  const { meters, label } = scaleBarChoice(planWidthM, units)
  const x0 = 0
  const x1 = meters
  const tick = 0.12
  return (
    `<line x1="${x0}" y1="${barY.toFixed(3)}" x2="${x1.toFixed(3)}" y2="${barY.toFixed(3)}" stroke="#374151" stroke-width="0.05"/>` +
    `<line x1="${x0}" y1="${(barY - tick).toFixed(3)}" x2="${x0}" y2="${(barY + tick).toFixed(3)}" stroke="#374151" stroke-width="0.05"/>` +
    `<line x1="${x1.toFixed(3)}" y1="${(barY - tick).toFixed(3)}" x2="${x1.toFixed(3)}" y2="${(barY + tick).toFixed(3)}" stroke="#374151" stroke-width="0.05"/>` +
    `<text x="${(x1 + 0.2).toFixed(3)}" y="${barY.toFixed(3)}" font-size="0.3" fill="#6b7280" dominant-baseline="middle">${esc(label)}</text>`
  )
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
  /** Top-down furniture footprints (world-metre corner polygons + a category
   *  tint) drawn under the walls, so the report plan reads as a furnished
   *  layout — "where things go", colour-keyed by furniture type. */
  footprints: { corners: [number, number][]; fill: string }[] = [],
): string {
  // Defensive: a malformed/partial plan (no extent or no walls) yields no
  // diagram rather than throwing.
  if (!Array.isArray(plan.extent) || !Array.isArray(plan.walls) || plan.walls.length === 0) {
    return ''
  }
  const [w, d] = planBounds(plan)
  if (!(w > 0.1 && d > 0.1)) return ''
  const pad = 0.4

  // Furniture footprints first (drawn under walls + labels): muted architectural
  // fill so the layout reads without competing with the structure.
  const furniture = footprints
    .filter((f) => f.corners.length >= 3)
    .map((f) => {
      const pts = f.corners.map(([x, z]) => `${x.toFixed(3)},${z.toFixed(3)}`).join(' ')
      // Low-opacity category tint (print-friendly) + a thin slate edge.
      return `<polygon points="${pts}" fill="${f.fill}" fill-opacity="0.45" stroke="#475569" stroke-width="0.025"/>`
    })
    .join('')

  const walls = plan.walls
    .filter((wl) => wallLength(wl) > 0.001)
    .map((wl) => {
      const sw = wl.thickness === 'external' ? 0.18 : 0.09
      return `<line x1="${wl.start[0].toFixed(3)}" y1="${wl.start[1].toFixed(3)}" x2="${wl.end[0].toFixed(3)}" y2="${wl.end[1].toFixed(3)}" stroke="#374151" stroke-width="${sw}" stroke-linecap="round"/>`
    })
    .join('')

  // Each room labelled with its name + area (standard architectural practice —
  // the plan reads on its own without cross-referencing the rooms table).
  const labels = plan.rooms
    .map((r) => {
      const [lx, lz] = roomLabelPoint(r)
      const x = lx.toFixed(3)
      return `<text x="${x}" y="${lz.toFixed(3)}" font-size="0.32" fill="#6b7280" text-anchor="middle"><tspan x="${x}" dy="-0.14">${esc(r.name)}</tspan><tspan x="${x}" dy="0.42" font-size="0.26" fill="#9ca3af">${esc(formatArea(planRoomArea(r), units))}</tspan></text>`
    })
    .join('')

  // Extra strip below the plan for a scale bar (standard on architectural plans).
  const scaleStrip = 0.9
  const barY = d + pad + scaleStrip * 0.55
  const vbH = d + pad * 2 + scaleStrip
  const openings = openingsSvg(plan)
  return `<svg class="plan-svg" viewBox="${-pad} ${-pad} ${(w + pad * 2).toFixed(3)} ${vbH.toFixed(3)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Floor plan">${furniture}${walls}${openings}${labels}${notesSvg(plan)}${annotationSvg(annotations, units)}${scaleBarSvg(w, barY, units)}</svg>`
}
