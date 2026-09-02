/**
 * Tiling layout plan SVG renderer (G5 follow-up).
 *
 * `tileCoursing.ts` already computes the setting-out — origin, full-tile field,
 * perimeter cut width per axis, sliver flag — and the drawing set prints it as a
 * TABLE. A table is not the deliverable a tiler works from. Transferring
 * "origin 137 mm / 212 mm, 9 x 6 full tiles" from a column onto a slab is exactly
 * the step where the most expensive category of tiling rework happens, and it is
 * the step a drawing removes: a tiling layout plan shows the grid itself, in
 * position, so which wall gets the cut is visible at a glance rather than
 * derived.
 *
 * So this draws, per room and to scale: the room outline, the tile grid struck
 * from the computed origin, the perimeter cut bands tinted, the setting-out
 * origin marked with a cross, and a per-room note giving the module and the cut
 * widths. A room whose cut falls below a quarter module (`sliver`) is called out
 * on the drawing, not just flagged in a column — that warning exists to be seen
 * before the tiles are cut.
 *
 * Rooms with no specified modular finish are drawn as plain outlines and counted
 * in the footer, never silently omitted — "12 rooms, 3 without a specified
 * module" is honest; showing 9 rooms is not.
 *
 * Pure `(SingleLevelPlan-shaped plan, coursing rows) → SVG string`. Colours come
 * from the injected palette; free text is escaped. Mirrors
 * `electricalPlanSvg.ts`'s shape (wall context + per-room overlay + legend,
 * `printMmPerM` sizing) rather than inventing a second scaffolding.
 */

import type { RoomTileCoursing } from './tileCoursing'
import type { FloorPlan, PlanRoom, PlanWall } from './types'
import { planRoomArea, roomPolygon, wallLength } from './types'

/** Palette injected by the caller (resolved theme tokens). */
export interface TileLayoutPalette {
  /** Plan wall stroke. */
  wall: string
  /** Legend + note text. */
  ink: string
  /** Tile grid lines. */
  grid: string
  /** Perimeter cut band fill. */
  cut: string
  /** Setting-out origin cross + sliver call-out. */
  accent: string
}

export interface TileLayoutSvgOpts {
  palette: TileLayoutPalette
  /** Target SVG width in pixels (height derives from plan aspect). Default 800. */
  widthPx?: number
  /** Locked print scale (mm of paper per plan metre), for print-true sizing. */
  printMmPerM?: number
  /** Rooms with a finish but no specified module — reported in the footer. */
  omittedRooms?: number
}

const PAD = 0.6
/** Grid lines thinner than this many px are dropped — a 50 mm mosaic at 1:100
 *  would otherwise render as solid ink and hide the room. */
const MIN_GRID_PX = 2.2
const FONT = 11
/** Rough text-width estimate (avg glyph ~0.55x font size) — enough to decide
 *  "does this note fit inside the room", not a real text-metrics measurement.
 *  Same approach `sectionSvg.ts` uses for its label-collision check. */
const estWidthPx = (text: string): number => text.length * (FONT - 1) * 0.55

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function n(v: number): string {
  return (Math.round(v * 100) / 100).toString()
}

interface Bounds {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

/** Bounding box over every non-degenerate wall AND room, so a room outside the
 *  wall envelope (a balcony drawn without its own walls) still fits the frame. */
function planBoundsFor(walls: PlanWall[], rooms: PlanRoom[]): Bounds {
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
  for (const w of walls) {
    if (wallLength(w) === 0) continue
    acc(w.start[0], w.start[1])
    acc(w.end[0], w.end[1])
  }
  for (const r of rooms) {
    const poly = roomPolygon(r)
    if (poly && poly.length >= 3) for (const [x, z] of poly) acc(x, z)
    else {
      acc(r.origin[0], r.origin[1])
      acc(r.origin[0] + r.width, r.origin[1] + r.depth)
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minZ: 0, maxX: 0, maxZ: 0 }
  return { minX, minZ, maxX, maxZ }
}

/** A room's axis-aligned extent in metres (the field the coursing was computed
 *  over — `tileCoursing.roomExtentM` uses the same polygon-aware bbox). */
function roomRect(r: PlanRoom): { x0: number; z0: number; x1: number; z1: number } {
  const poly = roomPolygon(r)
  if (poly && poly.length >= 3) {
    const xs = poly.map((p) => p[0])
    const zs = poly.map((p) => p[1])
    return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) }
  }
  return { x0: r.origin[0], z0: r.origin[1], x1: r.origin[0] + r.width, z1: r.origin[1] + r.depth }
}

/**
 * Render the tiling layout plan as a standalone SVG string. Plan metres map to
 * pixels by a uniform scale; +Z (south) maps to +Y (down), matching every other
 * plan sheet.
 */
export function tileLayoutSvg(
  plan: FloorPlan,
  coursing: RoomTileCoursing[],
  opts: TileLayoutSvgOpts,
): string {
  const { palette } = opts
  const widthPx = opts.widthPx && opts.widthPx > 0 ? opts.widthPx : 800
  const walls = (plan && Array.isArray(plan.walls) ? plan.walls : []).filter(
    (w) => wallLength(w) > 0,
  )
  // Single-storey read by design: the caller resolves the storey via
  // `levels.ts:levelAsPlan`, exactly as every other per-storey sheet does.
  const rooms = (plan && Array.isArray(plan.rooms) ? plan.rooms : []).filter(
    (r) => planRoomArea(r) > 0,
  )
  const byRoom = new Map(coursing.map((c) => [c.roomId, c]))

  const b = planBoundsFor(walls, rooms)
  const worldW = Math.max(b.maxX - b.minX + PAD * 2, 1)
  const worldH = Math.max(b.maxZ - b.minZ + PAD * 2, 1)
  const scale = widthPx / worldW
  const planH = worldH * scale
  const px = (x: number) => (x - b.minX + PAD) * scale
  const py = (z: number) => (z - b.minZ + PAD) * scale

  /** Notes too wide for their room, moved to the key under the plan. Filled
   *  during the room pass below, so the footer is built after it. */
  const keyed: { tag: string; note: string; sliver: boolean }[] = []
  const slivers = coursing.filter((c) => c.sliver)
  const parts: string[] = []

  // --- Per-room tile field --------------------------------------------------
  parts.push('<g class="tile-fields">')
  for (const r of rooms) {
    const c = byRoom.get(r.id)
    const rect = roomRect(r)
    const x0 = px(rect.x0)
    const z0 = py(rect.z0)
    const w = px(rect.x1) - x0
    const h = py(rect.z1) - z0
    if (!c) {
      // No specified module — a plain outline, never an invented grid.
      parts.push(
        `<rect x="${n(x0)}" y="${n(z0)}" width="${n(w)}" height="${n(h)}" fill="none" stroke="${esc(palette.grid)}" stroke-width="0.6" stroke-dasharray="3 3" />`,
      )
      continue
    }
    const [modW, modH] = c.moduleMm
    const [cutX, cutZ] = c.cutMm
    const stepX = (modW / 1000) * scale
    const stepZ = (modH / 1000) * scale
    const cutXPx = (cutX / 1000) * scale
    const cutZPx = (cutZ / 1000) * scale

    // Perimeter cut bands, tinted so the cut edge reads without measuring.
    const band = (bx: number, bz: number, bw: number, bh: number) =>
      bw > 0.2 && bh > 0.2
        ? `<rect x="${n(bx)}" y="${n(bz)}" width="${n(bw)}" height="${n(bh)}" fill="${esc(palette.cut)}" fill-opacity="0.35" />`
        : ''
    if (cutXPx > 0) {
      parts.push(band(x0, z0, cutXPx, h))
      parts.push(band(x0 + w - cutXPx, z0, cutXPx, h))
    }
    if (cutZPx > 0) {
      parts.push(band(x0, z0, w, cutZPx))
      parts.push(band(x0, z0 + h - cutZPx, w, cutZPx))
    }

    // The grid itself, struck from the setting-out origin. Skipped when the
    // module would print as solid ink — a drawing that hides the room is worse
    // than one that omits the hatch, and the table still carries the numbers.
    if (stepX >= MIN_GRID_PX && stepZ >= MIN_GRID_PX) {
      const lines: string[] = []
      for (let gx = x0 + cutXPx; gx <= x0 + w + 0.01; gx += stepX) {
        lines.push(
          `<line x1="${n(gx)}" y1="${n(z0)}" x2="${n(gx)}" y2="${n(z0 + h)}" stroke="${esc(palette.grid)}" stroke-width="0.5" />`,
        )
      }
      for (let gz = z0 + cutZPx; gz <= z0 + h + 0.01; gz += stepZ) {
        lines.push(
          `<line x1="${n(x0)}" y1="${n(gz)}" x2="${n(x0 + w)}" y2="${n(gz)}" stroke="${esc(palette.grid)}" stroke-width="0.5" />`,
        )
      }
      parts.push(`<g class="grid">${lines.join('')}</g>`)
    }

    // Room outline over the grid.
    parts.push(
      `<rect x="${n(x0)}" y="${n(z0)}" width="${n(w)}" height="${n(h)}" fill="none" stroke="${esc(palette.ink)}" stroke-width="1" />`,
    )

    // Setting-out origin cross at the first full tile's near corner.
    const ox = x0 + cutXPx
    const oz = z0 + cutZPx
    const t = 5
    parts.push(
      `<g class="origin"><line x1="${n(ox - t)}" y1="${n(oz)}" x2="${n(ox + t)}" y2="${n(oz)}" stroke="${esc(palette.accent)}" stroke-width="1.5" />` +
        `<line x1="${n(ox)}" y1="${n(oz - t)}" x2="${n(ox)}" y2="${n(oz + t)}" stroke="${esc(palette.accent)}" stroke-width="1.5" /></g>`,
    )

    // Per-room note: module, full-tile field, cut widths, sliver call-out.
    //
    // A note wider than its room is drawn as a TAG instead, with the full text
    // moved to a key under the plan. Drawn inline unconditionally, the notes for
    // a 4-room flat's small rooms overlapped illegibly — Bath/WC 1, Bath/WC 2
    // and Household Shelter ran into each other in the first frame of this
    // sheet. Tag-plus-key is the drafting answer; leader lines from 11 rooms
    // would be worse, which is why this does NOT reuse `mepLabelLayout` (built
    // for sparse point symbols, not one label per room).
    const note =
      `${c.roomName} · ${modW}×${modH} · ${c.fullTiles[0]}×${c.fullTiles[1]} full · ` +
      `cut ${Math.round(cutX)}/${Math.round(cutZ)} mm${c.sliver ? ' · SLIVER' : ''}`
    const colour = esc(c.sliver ? palette.accent : palette.ink)
    if (estWidthPx(note) + 6 <= w) {
      parts.push(
        `<text x="${n(x0 + 3)}" y="${n(z0 + FONT + 2)}" font-size="${FONT}" fill="${colour}">${esc(note)}</text>`,
      )
    } else {
      const tag = `T${keyed.length + 1}`
      keyed.push({ tag, note, sliver: c.sliver })
      parts.push(
        `<text x="${n(x0 + 3)}" y="${n(z0 + FONT + 2)}" font-size="${FONT}" fill="${colour}" font-weight="bold">${tag}</text>`,
      )
    }
  }
  parts.push('</g>')

  // --- Wall context ---------------------------------------------------------
  parts.push('<g class="walls">')
  for (const w of walls) {
    parts.push(
      `<line x1="${n(px(w.start[0]))}" y1="${n(py(w.start[1]))}" x2="${n(px(w.end[0]))}" y2="${n(py(w.end[1]))}" stroke="${esc(palette.wall)}" stroke-width="2" />`,
    )
  }
  parts.push('</g>')

  // --- Footer ---------------------------------------------------------------
  // Built AFTER the room pass, because the key's length (and so the sheet
  // height) depends on how many notes had to be tagged.
  const footerLines = [
    `${rooms.length} room${rooms.length === 1 ? '' : 's'} · ${coursing.length} with a specified module`,
    ...(opts.omittedRooms
      ? [
          `${opts.omittedRooms} room${opts.omittedRooms === 1 ? '' : 's'} omitted — no module specified for the finish`,
        ]
      : []),
    'Field set out CENTRED on each room; origin is the offset from the room min corner to the first full tile.',
    ...keyed.map((k) => `${k.tag} — ${k.note}`),
    ...(slivers.length
      ? [
          `SLIVER: ${slivers.map((s) => s.roomName).join(', ')} — a perimeter cut under a quarter module. Re-set the origin or accept deliberately.`,
        ]
      : []),
  ]
  const footerH = footerLines.length * (FONT + 5) + 10
  const heightPx = planH + footerH
  const sizeStyle =
    opts.printMmPerM != null
      ? ` style="width:${n(widthPx * (opts.printMmPerM / scale))}mm;height:${n(heightPx * (opts.printMmPerM / scale))}mm"`
      : ''

  parts.push('<g class="legend">')
  footerLines.forEach((line, i) => {
    const isKeyed = keyed.some((k) => line.startsWith(`${k.tag} — `) && k.sliver)
    parts.push(
      `<text x="4" y="${n(planH + 12 + i * (FONT + 5))}" font-size="${FONT}" fill="${esc(
        line.startsWith('SLIVER') || isKeyed ? palette.accent : palette.ink,
      )}">${esc(line)}</text>`,
    )
  })
  parts.push('</g>')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(widthPx)}" height="${n(heightPx)}"${sizeStyle} viewBox="0 0 ${n(widthPx)} ${n(heightPx)}">` +
    parts.join('') +
    '</svg>'
  )
}
