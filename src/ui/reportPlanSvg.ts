import { assignOpeningMarks } from '../analysis/openingSchedule'
import { doorPlanSymbol } from '../floorplan/doorSwing'
import { roomLabelPosition } from '../floorplan/roomCentroid'
import { anyTileMarksOmitted, tileSettingOutPoints } from '../floorplan/settingOut'
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
const TILE = '#7c3aed' // violet — tile setting-out marks, distinct from both of the above
const MARK = '#be123c' // rose — opening D/W mark callouts (H1-F), distinct from all of the above

/** Tile setting-out start-point crosses (TODO G3) — one per room, at its
 *  centroid (`settingOut.ts:tileSettingOutPoints`). v1-modest: a small cross,
 *  no grid (there is no tile size/pattern in the model to derive a real grid
 *  from). The convention note is printed ONCE (`tileSettingOutCaption`, in the
 *  scale-bar strip) rather than repeated per mark — a small flat can have 8+
 *  rooms, and a full sentence at every centroid overlapped illegibly with
 *  neighbouring room labels/furniture in a compact HDB layout. Only drawn when
 *  the caller opts in (`showTileMarks` — gated to when the finishes sheet is
 *  ALSO on the drawing set, so the note doesn't appear detached from the
 *  finishes it refers to). */
function tileSettingOutSvg(plan: FloorPlan): string {
  const R = 0.09
  return tileSettingOutPoints(plan)
    .map(({ point: [x, z] }) => {
      const cx = x.toFixed(3)
      const cz = z.toFixed(3)
      return (
        `<line x1="${(x - R).toFixed(3)}" y1="${cz}" x2="${(x + R).toFixed(3)}" y2="${cz}" stroke="${TILE}" stroke-width="0.045"/>` +
        `<line x1="${cx}" y1="${(z - R).toFixed(3)}" x2="${cx}" y2="${(z + R).toFixed(3)}" stroke="${TILE}" stroke-width="0.045"/>`
      )
    })
    .join('')
}

/** The tile setting-out convention, printed once (not per-mark — see above).
 *  When `omitted` (some room on this storey had its mark skipped — see
 *  `settingOut.ts:tileMarkPoint` — a room too small in every direction for
 *  the mark to clear its own name/area label, e.g. an AC ledge), appends a
 *  second line noting the omission ONCE for the whole sheet rather than
 *  leaving a silently-missing mark unexplained. */
function tileSettingOutCaption(capY: number, omitted = false): string {
  const omittedLine = omitted
    ? `<tspan x="0" dy="0.34">(marks omitted for small utility rooms)</tspan>`
    : ''
  return (
    `<text x="0" y="${capY.toFixed(3)}" font-size="0.24" fill="${TILE}">` +
    `+ Tile setting-out point — start laying here, verify joints on site${omittedLine}</text>`
  )
}

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
        const sym = doorPlanSymbol(wall, o)
        if (sym?.kind === 'swing') {
          for (const lf of sym.leaves) {
            s += `<line x1="${lf.hinge[0].toFixed(3)}" y1="${lf.hinge[1].toFixed(3)}" x2="${lf.leafTip[0].toFixed(3)}" y2="${lf.leafTip[1].toFixed(3)}" stroke="#6b7280" stroke-width="0.04"/>`
            s += `<path d="M ${lf.freeJamb[0].toFixed(3)} ${lf.freeJamb[1].toFixed(3)} A ${lf.radius.toFixed(3)} ${lf.radius.toFixed(3)} 0 0 ${lf.sweep} ${lf.leafTip[0].toFixed(3)} ${lf.leafTip[1].toFixed(3)}" fill="none" stroke="#9ca3af" stroke-width="0.025"/>`
          }
        } else if (sym?.kind === 'sliding') {
          // Sliding: leaf bar + slide-direction arrow (no swing arc).
          const [b0, b1] = sym.bar
          const [a0, a1] = sym.arrow
          s += `<line x1="${b0[0].toFixed(3)}" y1="${b0[1].toFixed(3)}" x2="${b1[0].toFixed(3)}" y2="${b1[1].toFixed(3)}" stroke="#6b7280" stroke-width="0.05"/>`
          s += `<line x1="${a0[0].toFixed(3)}" y1="${a0[1].toFixed(3)}" x2="${a1[0].toFixed(3)}" y2="${a1[1].toFixed(3)}" stroke="#9ca3af" stroke-width="0.025"/>`
          const adx = a1[0] - a0[0]
          const adz = a1[1] - a0[1]
          const alen = Math.hypot(adx, adz) || 1
          const uax = adx / alen
          const uaz = adz / alen
          const hb = 0.09
          s += `<line x1="${a1[0].toFixed(3)}" y1="${a1[1].toFixed(3)}" x2="${(a1[0] - (uax + uaz) * hb).toFixed(3)}" y2="${(a1[1] - (uaz - uax) * hb).toFixed(3)}" stroke="#9ca3af" stroke-width="0.025"/>`
          s += `<line x1="${a1[0].toFixed(3)}" y1="${a1[1].toFixed(3)}" x2="${(a1[0] - (uax - uaz) * hb).toFixed(3)}" y2="${(a1[1] - (uaz + uax) * hb).toFixed(3)}" stroke="#9ca3af" stroke-width="0.025"/>`
        }
      } else {
        s += `<line x1="${sx.toFixed(3)}" y1="${sz.toFixed(3)}" x2="${ex.toFixed(3)}" y2="${ez.toFixed(3)}" stroke="#9ca3af" stroke-width="0.03"/>`
      }
      return s
    })
    .join('')
}

/** Distance (m) an opening mark label sits off the wall centreline, clear of
 *  the wall stroke and the door-swing arc — matches `export/dxf.ts`'s own
 *  `MARK_OFFSET` (independent constant; that module is out of scope here —
 *  see `analysis/openingSchedule.ts:assignOpeningMarks`'s header). */
const MARK_LABEL_OFFSET = 0.3

/**
 * On-plan D1/W1… mark callouts (H1-F, contractor-handover punch list): a
 * small rose label near each door/window, keyed off the SAME
 * `assignOpeningMarks` grouping the door & window schedule sheet uses, so a
 * mark on this plan can never drift from the schedule that types it. Nudged
 * off the wall centreline (perpendicular offset) so it clears the opening's
 * gap + door-swing arc.
 */
function openingMarksSvg(plan: FloorPlan): string {
  const marks = assignOpeningMarks(plan.openings)
  if (marks.size === 0) return ''
  return plan.openings
    .map((o) => {
      const label = marks.get(o.id)
      if (!label) return ''
      const wall = plan.walls.find((wl) => wl.id === o.wallId)
      if (!wall) return ''
      const len = wallLength(wall)
      if (len === 0) return ''
      const ux = (wall.end[0] - wall.start[0]) / len
      const uz = (wall.end[1] - wall.start[1]) / len
      const mx = wall.start[0] + ux * (o.offset + o.width / 2)
      const mz = wall.start[1] + uz * (o.offset + o.width / 2)
      // Perpendicular (rotate the wall direction 90°) — nudges the label off
      // the wall line, toward whichever side keeps it inside the plan extent.
      const px = -uz
      const pz = ux
      const sign = mz + pz * MARK_LABEL_OFFSET < plan.extent[1] ? 1 : -1
      const lx = mx + px * MARK_LABEL_OFFSET * sign
      const lz = mz + pz * MARK_LABEL_OFFSET * sign
      return `<text x="${lx.toFixed(3)}" y="${lz.toFixed(3)}" font-size="0.24" font-weight="700" fill="${MARK}" text-anchor="middle" dominant-baseline="middle">${esc(label)}</text>`
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
  /** When set (mm printed per metre of real-world extent, from
   *  `floorplan/drawingScale.ts:pickDrawingScale`), sizes the returned
   *  `<svg>` with explicit `width`/`height` in mm instead of leaving it
   *  unsized to stretch to its container — print-true (TODO G2). */
  printMmPerM?: number,
  /** Draw tile setting-out start-point crosses (TODO G3, `settingOutDims`
   *  flag) — gated by the caller to when the finishes sheet is ALSO on the
   *  drawing set. Default false (existing callers are unaffected). */
  showTileMarks = false,
  /** Draw each door/window's D1/W1… schedule mark near it on the plan (H1-F)
   *  — gated by the caller to when the door & window schedule sheet is ALSO
   *  on the drawing set, so a mark never appears with nothing to cross-
   *  reference against. Default false (existing callers are unaffected). */
  showOpeningMarks = false,
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
      const [lx, lz] = roomLabelPosition(r)
      const x = lx.toFixed(3)
      return `<text x="${x}" y="${lz.toFixed(3)}" font-size="0.32" fill="#6b7280" text-anchor="middle"><tspan x="${x}" dy="-0.14">${esc(r.name)}</tspan><tspan x="${x}" dy="0.42" font-size="0.26" fill="#9ca3af">${esc(formatArea(planRoomArea(r), units))}</tspan></text>`
    })
    .join('')

  // Extra strip below the plan for a scale bar (standard on architectural
  // plans) — taller when the tile setting-out caption also rides in it (G3),
  // taller still when a second "marks omitted" line is needed (re-review
  // follow-up to H-D2).
  const tileMarksOmitted = showTileMarks && anyTileMarksOmitted(plan)
  const scaleStrip = showTileMarks ? (tileMarksOmitted ? 1.64 : 1.3) : 0.9
  const barY = d + pad + 0.9 * 0.55
  const vbH = d + pad * 2 + scaleStrip
  const openings = openingsSvg(plan)
  const fullW = w + pad * 2
  // Print-true sizing (TODO G2): the viewBox is already 1 unit = 1 metre, so
  // the full viewBox extent (metres) × mmPerM (mm per metre) is the sheet's
  // exact printed size at the locked scale. An inline `style` (not a bare
  // `width`/`height` attribute) is required: presentational attributes have
  // the LOWEST CSS priority, so a plain attribute would be silently
  // overridden by the drawing-set's `.draw svg { width:100% }` rule.
  const sizeAttr =
    printMmPerM != null
      ? ` style="width:${(fullW * printMmPerM).toFixed(3)}mm;height:${(vbH * printMmPerM).toFixed(3)}mm"`
      : ''
  const tileMarks = showTileMarks ? tileSettingOutSvg(plan) : ''
  const tileCaption = showTileMarks ? tileSettingOutCaption(barY + 0.55, tileMarksOmitted) : ''
  const openingMarks = showOpeningMarks ? openingMarksSvg(plan) : ''
  return `<svg class="plan-svg"${sizeAttr} viewBox="${-pad} ${-pad} ${fullW.toFixed(3)} ${vbH.toFixed(3)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Floor plan">${furniture}${walls}${openings}${openingMarks}${labels}${notesSvg(plan)}${annotationSvg(annotations, units)}${scaleBarSvg(w, barY, units)}${tileMarks}${tileCaption}</svg>`
}
