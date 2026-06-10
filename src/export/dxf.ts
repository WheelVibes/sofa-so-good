/**
 * DXF floor-plan export (feature F31).
 *
 * Serialises a {@link FloorPlan} to a minimal but valid **ASCII DXF R12**
 * document for CAD handoff (RoomSketcher / Cedreo accept DXF). The output is a
 * plain string; callers download it as a `.dxf`.
 *
 * Layers:
 *  - `WALLS`   — each wall as a LINE.
 *  - `ROOMS`   — each room outline as a closed POLYLINE (R12 has no LWPOLYLINE,
 *               so we emit POLYLINE/VERTEX/SEQEND with the closed flag).
 *  - `DOORS`   — each door opening as a LINE spanning its width along the wall.
 *  - `WINDOWS` — each window opening as a LINE spanning its width along the wall.
 *  - `LABELS`  — room-name TEXT at the room centroid.
 *
 * Units: DXF is unitless; `$INSUNITS = 6` declares metres, and all coordinates
 * are written in plan metres.
 *
 * Y-axis convention: the app frame is +X east / +Z south (Z grows downward on
 * screen), whereas DXF is right-handed with +Y up. We map plan `(x, z)` to DXF
 * `(x, -z)` — flipping Z to -Y — so the exported plan reads the same way it
 * looks on screen instead of being mirrored top-to-bottom.
 */

import {
  type FloorPlan,
  type PlanVec2,
  type PlanWall,
  roomPolygon,
  wallLength,
} from '../floorplan/types'

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

/** A LAYER table entry. */
function layerEntry(name: string, color: number): string {
  return block(pair(0, 'LAYER'), pair(2, name), pair(70, 0), pair(62, color), pair(6, 'CONTINUOUS'))
}

const LAYERS: ReadonlyArray<readonly [string, number]> = [
  ['WALLS', 7],
  ['ROOMS', 5],
  ['DOORS', 3],
  ['WINDOWS', 4],
  ['LABELS', 2],
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

/** ENTITIES section: walls, rooms, openings, labels. */
function entitiesSection(plan: FloorPlan): string {
  const walls = Array.isArray(plan.walls) ? plan.walls : []
  const rooms = Array.isArray(plan.rooms) ? plan.rooms : []
  const openings = Array.isArray(plan.openings) ? plan.openings : []
  const wallById = new Map<string, PlanWall>(walls.map((w) => [w.id, w]))

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
  }

  for (const r of rooms) {
    const [cx, cz] = polygonCentroid(roomPolygon(r))
    out += dxfText('LABELS', cx, cz, r.name ?? r.id ?? 'Room')
  }

  out += block(pair(0, 'ENDSEC'))
  return out
}

/** Serialise a {@link FloorPlan} to an ASCII DXF R12 document string. */
export function planToDxf(plan: FloorPlan): string {
  return headerSection() + tablesSection() + entitiesSection(plan) + block(pair(0, 'EOF'))
}

export { dxfY, polygonCentroid, wallPointAt }
