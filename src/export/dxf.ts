/**
 * DXF floor-plan export (feature F31; TODO G6 enrichment).
 *
 * Serialises a {@link FloorPlan} (+ optionally its placed furniture) to a
 * minimal but valid **ASCII DXF R12** document for CAD handoff (RoomSketcher /
 * Cedreo / a carpentry fabricator's CAD package all accept DXF). The output is
 * a plain string; callers download it as a `.dxf`.
 *
 * Layers:
 *  - `WALLS`          — each wall as a LINE.
 *  - `ROOMS`          — each room outline as a closed POLYLINE (R12 has no
 *                       LWPOLYLINE, so we emit POLYLINE/VERTEX/SEQEND with the
 *                       closed flag).
 *  - `DOORS`          — each door opening as a LINE spanning its width along
 *                       the wall.
 *  - `WINDOWS`        — each window opening as a LINE spanning its width along
 *                       the wall.
 *  - `LABELS`         — room-name TEXT at the room centroid.
 *  - `FURNITURE`      — each placed item's rotated footprint (the same OBB
 *                       `collision/placement.ts:itemFootprint` uses for
 *                       collision/selection) as a closed 4-vertex POLYLINE.
 *  - `FURNITURE_TEXT` — the item's display name as TEXT at its footprint
 *                       centre.
 *  - `DIMENSIONS`     — the auto-dimension strings (`floorplan/autoDimension.ts`
 *                       — the same geometry the report plan SVG draws) as
 *                       LINE + TEXT primitives (see {@link dxfDimension}).
 *  - `OPENING_MARKS`  — a D1/D2…/W1/W2… mark TEXT beside each door/window,
 *                       cross-referencing the door/window schedule
 *                       (`analysis/openingSchedule.ts`).
 *
 * Units: DXF is unitless; `$INSUNITS = 6` declares metres, and all coordinates
 * are written in plan metres.
 *
 * Y-axis convention: the app frame is +X east / +Z south (Z grows downward on
 * screen), whereas DXF is right-handed with +Y up. We map plan `(x, z)` to DXF
 * `(x, -z)` — flipping Z to -Y — so the exported plan reads the same way it
 * looks on screen instead of being mirrored top-to-bottom.
 */

import { obbCorners } from '../collision/obb'
import { itemFootprint } from '../collision/placement'
import { buildDimensions, type Dimension } from '../floorplan/autoDimension'
import {
  type FloorPlan,
  type PlanOpening,
  type PlanVec2,
  type PlanWall,
  roomPolygon,
  wallLength,
} from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import type { UnitSystem } from '../utils/measurement'

/** DXF Y for a plan Z (flip so +Z south reads downward, not mirrored). */
const dxfY = (z: number): number => -z

/** Format a number for DXF: finite, fixed precision, no exponent. */
const num = (n: number): string => (Number.isFinite(n) ? n.toFixed(6) : '0.000000')

/** A single group-code / value pair (two physical DXF lines). */
const pair = (code: number, value: string | number): string => `${code}\n${value}`

/** Join group-code pairs into a block with a trailing newline. */
const block = (...pairs: string[]): string => `${pairs.join('\n')}\n`

/** A LINE entity from (x1,z1) to (x2,z2) on `layer` (plan coords; Z flipped). */
export function dxfLine(layer: string, x1: number, z1: number, x2: number, z2: number): string {
  return block(
    pair(0, 'LINE'),
    pair(8, layer),
    pair(10, num(x1)),
    pair(20, num(dxfY(z1))),
    pair(30, num(0)),
    pair(11, num(x2)),
    pair(21, num(dxfY(z2))),
    pair(31, num(0)),
  )
}

/** A closed POLYLINE entity over `pts` on `layer` (plan coords; Z flipped). */
export function dxfPolyline(layer: string, pts: PlanVec2[]): string {
  const header = block(
    pair(0, 'POLYLINE'),
    pair(8, layer),
    // 66 = "vertices follow" (required in R12), 70 = 1 → closed polyline.
    pair(66, 1),
    pair(70, 1),
    pair(10, num(0)),
    pair(20, num(0)),
    pair(30, num(0)),
  )
  const verts = pts
    .map(([x, z]) =>
      block(
        pair(0, 'VERTEX'),
        pair(8, layer),
        pair(10, num(x)),
        pair(20, num(dxfY(z))),
        pair(30, num(0)),
      ),
    )
    .join('')
  const end = block(pair(0, 'SEQEND'), pair(8, layer))
  return header + verts + end
}

/** Strip newlines/control chars from a TEXT value so the DXF stays well-formed. */
function sanitizeText(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').trim() || 'Room'
}

/** A single-line TEXT entity anchored at (x,z) on `layer` (plan coords). */
export function dxfText(layer: string, x: number, z: number, text: string, height = 0.25): string {
  return block(
    pair(0, 'TEXT'),
    pair(8, layer),
    pair(10, num(x)),
    pair(20, num(dxfY(z))),
    pair(30, num(0)),
    pair(40, num(height)),
    pair(1, sanitizeText(text)),
  )
}

/** Centroid of a polygon (simple vertex average — adequate for label placement). */
function polygonCentroid(pts: PlanVec2[]): PlanVec2 {
  if (pts.length === 0) return [0, 0]
  let sx = 0
  let sz = 0
  for (const [x, z] of pts) {
    sx += x
    sz += z
  }
  return [sx / pts.length, sz / pts.length]
}

/** Endpoint along a wall at distance `d` from its start (clamped). */
function wallPointAt(w: PlanWall, d: number): PlanVec2 {
  const len = wallLength(w)
  if (len === 0) return [w.start[0], w.start[1]]
  const t = Math.max(0, Math.min(1, d / len))
  const dx = w.end[0] - w.start[0]
  const dz = w.end[1] - w.start[1]
  return [w.start[0] + dx * t, w.start[1] + dz * t]
}

/** Unit perpendicular of a wall (rotate its direction 90°), or `[0, 0]` for a
 *  zero-length wall. Used to nudge an opening mark label off the wall line. */
function wallPerp(w: PlanWall): PlanVec2 {
  const len = wallLength(w)
  if (len === 0) return [0, 0]
  const ux = (w.end[0] - w.start[0]) / len
  const uz = (w.end[1] - w.start[1]) / len
  return [-uz, ux]
}

/** Distance (m) an opening mark label sits off the wall centreline, clear of
 *  the DOORS/WINDOWS line and the wall thickness. */
const MARK_OFFSET = 0.3

/** Quantised (kind, width, height) group key for an opening — mirrors
 *  `analysis/openingSchedule.ts`'s grouping (identical size ⇒ one mark). */
function openingMarkKey(o: PlanOpening): string {
  const height = Math.max(0, o.head - o.sill)
  const q = (n: number) => Math.round(n / 1e-3)
  return `${o.kind}:${q(o.width)}:${q(height)}`
}

/**
 * Assigns each door/window opening a schedule mark (`D1`, `D2`… / `W1`,
 * `W2`…), grouping openings with identical (kind, width, height) — the same
 * grouping `analysis/openingSchedule.ts:buildOpeningSchedule` uses, so the
 * DXF's marks line up with the door/window schedule a contractor reads
 * alongside it. Re-implemented locally (rather than imported) because that
 * module only returns aggregated marks, not a per-opening label, and this
 * export — like the rest of `entitiesSection` — treats `plan` as a single
 * storey (no `levelId` fan-out).
 */
function assignOpeningMarks(openings: PlanOpening[]): Map<string, string> {
  const order: string[] = []
  const seen = new Set<string>()
  for (const o of openings) {
    if (o.kind !== 'door' && o.kind !== 'window') continue
    const key = openingMarkKey(o)
    if (!seen.has(key)) {
      seen.add(key)
      order.push(key)
    }
  }
  const labelByKey = new Map<string, string>()
  let dN = 0
  let wN = 0
  for (const key of order) {
    labelByKey.set(key, key.startsWith('door:') ? `D${++dN}` : `W${++wN}`)
  }
  const labelByOpening = new Map<string, string>()
  for (const o of openings) {
    if (o.kind !== 'door' && o.kind !== 'window') continue
    const label = labelByKey.get(openingMarkKey(o))
    if (label) labelByOpening.set(o.id, label)
  }
  return labelByOpening
}

/** Unit perpendicular of a dimension line (rotate its direction 90°); falls
 *  back to a vertical perpendicular for a degenerate/zero-length line. */
function dimPerp(d: Dimension): PlanVec2 {
  const dx = d.x2 - d.x1
  const dz = d.y2 - d.y1
  const len = Math.hypot(dx, dz)
  if (len < 1e-9) return [0, 1]
  return [-dz / len, dx / len]
}

/** Half-length (m) of the perpendicular tick mark at each dimension-line end. */
const TICK_LEN = 0.08
/** Length (m) of the extension stub linking an exterior dimension line back
 *  toward the wall it measures (interior room dimensions run flush with the
 *  room edge and need no stub). */
const EXT_LEN = 0.15

/** Which way an extension stub points, back from the offset overall
 *  dimension line toward the plan interior — the mirror image of
 *  `autoDimension.ts`'s (unexported) `offsetForSide`. `null` for `'interior'`
 *  dims, which already run flush against the room edge. */
function extDir(side: Dimension['side']): PlanVec2 | null {
  switch (side) {
    case 'top':
      return [0, 1]
    case 'bottom':
      return [0, -1]
    case 'left':
      return [1, 0]
    case 'right':
      return [-1, 0]
    default:
      return null
  }
}

/**
 * Renders one auto-dimension line (`floorplan/autoDimension.ts`) as R12-safe
 * primitives: the dimension LINE itself, a short perpendicular tick LINE at
 * each end (standing in for an arrowhead), an extension stub back to the wall
 * face for exterior dims, and the length TEXT centred on the line.
 *
 * We deliberately do NOT emit a DXF `DIMENSION` entity: R12 dimensions need a
 * matching `DIMSTYLE` table entry (block geometry, text/arrow style) to
 * render correctly, and lightweight/GENERIC DXF readers (the kind a
 * fabricator's CAD package or a CNC importer uses) are notoriously
 * inconsistent about resolving that association — a plain LINE + TEXT
 * "dumb dimension" is guaranteed to parse and measure correctly everywhere,
 * which is what a contractor handoff needs most.
 */
function dxfDimension(d: Dimension): string {
  let out = dxfLine('DIMENSIONS', d.x1, d.y1, d.x2, d.y2)

  const [px, pz] = dimPerp(d)
  for (const [x, z] of [
    [d.x1, d.y1],
    [d.x2, d.y2],
  ] as const) {
    out += dxfLine(
      'DIMENSIONS',
      x - (px * TICK_LEN) / 2,
      z - (pz * TICK_LEN) / 2,
      x + (px * TICK_LEN) / 2,
      z + (pz * TICK_LEN) / 2,
    )
  }

  const dir = extDir(d.side)
  if (dir) {
    const [ex, ez] = dir
    out += dxfLine('DIMENSIONS', d.x1, d.y1, d.x1 + ex * EXT_LEN, d.y1 + ez * EXT_LEN)
    out += dxfLine('DIMENSIONS', d.x2, d.y2, d.x2 + ex * EXT_LEN, d.y2 + ez * EXT_LEN)
  }

  const mx = (d.x1 + d.x2) / 2
  const mz = (d.y1 + d.y2) / 2
  out += dxfText('DIMENSIONS', mx, mz, d.label, 0.15)
  return out
}

/** Furniture footprints (FURNITURE) + name labels (FURNITURE_TEXT). Items
 *  whose def isn't in `catalog` are skipped (never crash on a stale/removed
 *  def). Footprint source is the same `itemFootprint` OBB collision/selection
 *  use, so the DXF rectangle matches what the app actually placed — rotation
 *  and flipX/flipZ are already folded into that OBB. */
function furnitureSection(items: FurnitureItem[], catalog: Record<string, FurnitureDef>): string {
  let out = ''
  for (const it of items) {
    const def = catalog[it.defId]
    if (!def) continue
    const obb = itemFootprint(it, def)
    out += dxfPolyline('FURNITURE', obbCorners(obb))
    const name = it.label || def.name || it.defId
    out += dxfText('FURNITURE_TEXT', obb.cx, obb.cz, name, 0.15)
  }
  return out
}

/** A LAYER table entry. */
function layerEntry(name: string, color: number): string {
  return block(pair(0, 'LAYER'), pair(2, name), pair(70, 0), pair(62, color), pair(6, 'CONTINUOUS'))
}

/** LAYER table: name → AutoCAD Color Index (ACI). Conventional-ish palette —
 *  walls white/7, rooms blue/5, doors green/3, windows cyan/4, labels
 *  yellow/2, dimensions red/1, furniture cyan/4 (footprints, a different
 *  layer from WINDOWS so it can be toggled independently even though the ACI
 *  repeats — DXF allows two layers to share a colour), furniture text
 *  yellow/2, opening marks magenta/6. */
const LAYERS: ReadonlyArray<readonly [string, number]> = [
  ['WALLS', 7],
  ['ROOMS', 5],
  ['DOORS', 3],
  ['WINDOWS', 4],
  ['LABELS', 2],
  ['FURNITURE', 4],
  ['FURNITURE_TEXT', 2],
  ['DIMENSIONS', 1],
  ['OPENING_MARKS', 6],
]

/** Minimal HEADER section: declare metres via $INSUNITS = 6. */
function headerSection(): string {
  return (
    block(pair(0, 'SECTION'), pair(2, 'HEADER')) +
    block(pair(9, '$INSUNITS'), pair(70, 6)) +
    block(pair(9, '$ACADVER'), pair(1, 'AC1009')) +
    block(pair(0, 'ENDSEC'))
  )
}

/** TABLES section defining the LAYER table. */
function tablesSection(): string {
  const entries = LAYERS.map(([name, color]) => layerEntry(name, color)).join('')
  return (
    block(pair(0, 'SECTION'), pair(2, 'TABLES')) +
    block(pair(0, 'TABLE'), pair(2, 'LAYER'), pair(70, LAYERS.length)) +
    entries +
    block(pair(0, 'ENDTAB')) +
    block(pair(0, 'ENDSEC'))
  )
}

/**
 * ENTITIES section: walls, rooms, openings + their schedule marks, labels,
 * placed furniture footprints + name labels, and auto-dimension strings.
 * `items`/`catalog` default to empty so a caller exporting bare geometry
 * (or an older call site) still gets a valid document with no FURNITURE
 * entities.
 */
function entitiesSection(
  plan: FloorPlan,
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  units: UnitSystem,
): string {
  const walls = Array.isArray(plan.walls) ? plan.walls : []
  const rooms = Array.isArray(plan.rooms) ? plan.rooms : []
  const openings = Array.isArray(plan.openings) ? plan.openings : []
  const wallById = new Map<string, PlanWall>(walls.map((w) => [w.id, w]))
  const markByOpening = assignOpeningMarks(openings)

  let out = block(pair(0, 'SECTION'), pair(2, 'ENTITIES'))

  for (const w of walls) {
    if (wallLength(w) === 0) continue
    out += dxfLine('WALLS', w.start[0], w.start[1], w.end[0], w.end[1])
  }

  for (const r of rooms) {
    const poly = roomPolygon(r)
    if (poly.length >= 2) out += dxfPolyline('ROOMS', poly)
  }

  for (const o of openings) {
    const w = wallById.get(o.wallId)
    if (!w) continue
    const layer = o.kind === 'door' ? 'DOORS' : 'WINDOWS'
    const start = wallPointAt(w, o.offset)
    const end = wallPointAt(w, o.offset + o.width)
    out += dxfLine(layer, start[0], start[1], end[0], end[1])

    const mark = markByOpening.get(o.id)
    if (mark) {
      const [mx, mz] = wallPointAt(w, o.offset + o.width / 2)
      const [px, pz] = wallPerp(w)
      out += dxfText('OPENING_MARKS', mx + px * MARK_OFFSET, mz + pz * MARK_OFFSET, mark, 0.15)
    }
  }

  for (const r of rooms) {
    const [cx, cz] = polygonCentroid(roomPolygon(r))
    out += dxfText('LABELS', cx, cz, r.name ?? r.id ?? 'Room')
  }

  out += furnitureSection(items, catalog)

  const dims = buildDimensions(plan, units)
  for (const d of [...dims.overall, ...dims.rooms]) out += dxfDimension(d)

  out += block(pair(0, 'ENDSEC'))
  return out
}

/**
 * Serialise a {@link FloorPlan} (+ optionally its placed furniture) to an
 * ASCII DXF R12 document string. `items`/`catalog` are optional — omitting
 * them exports bare plan geometry with an empty FURNITURE layer (the
 * pre-G6 behaviour); `units` only affects the DIMENSIONS text labels
 * (coordinates are always plan metres regardless).
 */
export function planToDxf(
  plan: FloorPlan,
  items: FurnitureItem[] = [],
  catalog: Record<string, FurnitureDef> = {},
  units: UnitSystem = 'metric',
): string {
  return (
    headerSection() +
    tablesSection() +
    entitiesSection(plan, items, catalog, units) +
    block(pair(0, 'EOF'))
  )
}
