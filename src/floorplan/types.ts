/**
 * Editable floor-plan model. This is a self-contained, serialisable description
 * of an apartment shell (walls / openings / rooms) that the Floor Plan Editor
 * mutates and the 3D apartment can render. It is intentionally decoupled from
 * the fixed `apartment/constants.ts` types (which use a closed `RoomId` union):
 * a user-authored plan has arbitrary string room ids.
 *
 * Coordinates are metres in the apartment frame (0,0 at the NW corner, +X east,
 * +Z south) — the same frame the rest of the app uses.
 */

export type PlanVec2 = [number, number]

export interface PlanWall {
  id: string
  start: PlanVec2
  end: PlanVec2
  thickness: 'external' | 'internal'
  /** Optional name. Absent = a generated default (`Wall <hash>`). Room/auto-room
   *  allocation may write a `<room> wall ##` name here, but only over an
   *  unset/auto name — a user-set name (with `nameAuto` cleared) always wins. */
  name?: string
  /** True when `name` was assigned automatically by room allocation (so a later
   *  allocation may replace it). Cleared when the user edits the name, which
   *  makes it permanent. */
  nameAuto?: boolean
  /** When true the wall can't be dragged, reshaped, or deleted from the canvas
   *  (matches furniture lock). Edited in the 2D plan inspector. */
  locked?: boolean
  /** Optional explicit thickness (m) for THIS wall, overriding both its
   *  external/internal category default and the plan-level default. Absent =
   *  use the plan default for the category (falling back to 0.2 m external /
   *  0.1 m internal). Edited in the 2D plan inspector (pro). */
  thicknessM?: number
  /** Optional cap on solid-wall height (parapets on balconies); floor→ceiling when unset. */
  topHeight?: number
  /** Optional top height at the wall's `end` (SweetHome3DJS sloping-wall parity):
   *  when set, the wall top ramps linearly from `topHeight` (or ceiling) at start
   *  to this at end — a shed/mono-pitch wall. A sloped wall renders as a
   *  rectangular lower band (which hosts openings) + a triangular upper wedge. */
  topHeightEnd?: number
  /** Optional curvature (SweetHome3DJS parity): signed perpendicular bulge (m) at
   *  the wall's midpoint, measured from the straight chord. Absent/0 = straight.
   *  Curved walls are approximated as chord sub-segments for rendering/collision
   *  (see `wallArc.ts`) and cannot host openings in this version. */
  arc?: number
  /** Optional per-wall baseboard / skirting override (SweetHome3DJS baseboard
   *  parity). `height` (m) and `color` (hex) tune the skirting strip along this
   *  wall's foot; `hidden` suppresses it entirely. Absent fields fall back to the
   *  shell default (0.09 m, off-white). */
  baseboard?: { height?: number; color?: string; hidden?: boolean }
  /** Optional per-wall paint colour (hex), overriding the plan-wide `wallColor`
   *  for THIS wall only. Absent = use the plan default. Edited in the 2D plan
   *  inspector (`elementColors`). */
  color?: string
}

export interface PlanOpening {
  id: string
  kind: 'door' | 'window'
  /** Wall this opening cuts through. */
  wallId: string
  /** Optional user-given name; absent = a generated default (`Door <hash>` /
   *  `Window <hash>`). A custom name takes precedence and is never overwritten. */
  name?: string
  /** True when `name` was assigned automatically by room allocation (`<room>
   *  door ##`), so a later room rename may re-flow it. Cleared when the user
   *  edits the name in the inspector — a user-set name then always wins. */
  nameAuto?: boolean
  /** When true the opening can't be dragged or deleted from the canvas. */
  locked?: boolean
  /** Distance from the wall's start along its length, to the opening's start. */
  offset: number
  width: number
  /** Bottom edge above floor (0 for doors). */
  sill: number
  /** Top edge above floor. */
  head: number
  /** Doors only: which jamb the hinge pivots on, relative to the wall's
   *  start→end direction. Defaults to 'start' when unset. */
  hinge?: 'start' | 'end'
  /** Doors only: which side of the wall the leaf swings toward — 'right' is the
   *  wall's right-hand normal (−Z of the start→end tangent), 'left' the other.
   *  Defaults to 'right' when unset. */
  swing?: 'left' | 'right'
  /** Optional colour (hex). For a **door** it paints the leaf (frame/panels
   *  derive a darker shade); for a **window** it tints the glass. Absent = the
   *  default timber / cool-glass look. Edited in the 2D plan inspector
   *  (`elementColors`). */
  color?: string
  /** Optional style/type (`openingStyles`). Doors: `panel` (default, recessed
   *  panels) / `flush` (plain slab) / `glazed` (upper vision panel). Windows:
   *  `plain` (default glass) / `grille` (vertical safety bars) / `louvre`
   *  (horizontal slats). Absent = the default for the kind. */
  style?: string
}

export interface PlanRoom {
  id: string
  name: string
  /** NW corner of the room's interior rectangle. */
  origin: PlanVec2
  width: number
  depth: number
  /** Optional second rectangle for L-shaped rooms (offset from `origin`). */
  extension?: { offset: PlanVec2; width: number; depth: number }
  /** Optional explicit polygon outline (absolute world metres, CW or CCW). When
   *  present it is the authoritative room shape — area, floor render, and
   *  point-in-room all use it, and origin/width/depth/extension are ignored
   *  (origin/width/depth are kept as the polygon's bounding box for back-compat
   *  with consumers that still read them). Enables arbitrary non-rectangular
   *  rooms beyond the rect + single L-extension. */
  polygon?: PlanVec2[]
  /** Optional per-room ceiling height. */
  ceilingHeight?: number
  /** Optional floor finish (catalog material id); defaults to oak in the shell. */
  floor?: string
  /** Optional wall finish (catalog material id); plain plaster when unset. */
  wall?: string
  /** Optional ceiling treatment (tray / coffered / dropped); absent → flat. */
  ceiling?: CeilingConfig
  /** Optional ceiling finish (catalog material id); plain white when unset. */
  ceilingFinish?: string
  /** Optional floor-texture transform (SweetHome3DJS texture scale/angle parity):
   *  `floorTexScale` multiplies tile size (×, >1 = bigger), `floorTexAngle`
   *  rotates the texture (radians). Absent = default tiling. */
  floorTexScale?: number
  floorTexAngle?: number
  /** Optional in-plane offset (metres) of the room's name label from its
   *  centroid, so a label can be nudged clear of furniture / a tight room
   *  (Sweet Home 3D movable labels). Absent → centred on the centroid. */
  labelOffset?: PlanVec2
  /** Optional rotation (radians, clockwise on the 2D plan) of the room's name
   *  label, to align it with a slanted room or wall (Sweet Home 3D label angle).
   *  Absent → horizontal. */
  labelAngle?: number
  /** Optional font-size multiplier for the room's name label (×, >1 = bigger),
   *  for emphasising / shrinking a label (Sweet Home 3D label font size). Absent
   *  → default size. */
  labelFontScale?: number
}

/** Per-room ceiling treatment. `flat` (or absent) renders the plain ceiling. */
export type CeilingStyle = 'flat' | 'tray' | 'coffered' | 'dropped' | 'sloped'

export interface CeilingConfig {
  style: CeilingStyle
  /** Recess / drop depth in metres (tray border + coffer + dropped box). */
  drop?: number
  /** Perimeter border width (tray) / box inset (dropped) in metres. */
  margin?: number
  /** Coffered grid divisions [cols, rows]. */
  grid?: [number, number]
  /** Perimeter cove-light glow (tray / dropped). */
  coveLight?: boolean
  /** Cove glow colour (hex); defaults to a warm white. */
  coveColor?: string
  /** Sloped ceiling (pitched plane): which axis the ceiling falls along and how
   *  far it drops from the high edge to the low edge (m). Pairs with sloping
   *  walls (PARITY-SLOPEWALL). Only read when `style === 'sloped'`. */
  slope?: { axis: 'x' | 'z'; rise: number }
}

/** One storey above the ground floor. The plan's top-level walls/openings/
 *  rooms ARE the ground floor (untouched for back-compat); upper storeys are
 *  additive extras with their own geometry at an elevation offset. Room ids
 *  must be unique across ALL levels so room-keyed consumers (finishes, score,
 *  reports) keep working unchanged. See docs/research/multi-level-design.md. */
export interface PlanUpperLevel {
  id: string
  name: string
  /** Floor-slab top height above the ground floor's y=0 (m). */
  elevation: number
  /** Optional per-level ceiling height; the plan default when unset. */
  ceilingHeight?: number
  walls: PlanWall[]
  openings: PlanOpening[]
  rooms: PlanRoom[]
}

/** Top-level housing category for the template picker. */
export type HousingType = 'HDB' | 'Condominium'

/** Three-level template categorisation: housing type → project → apartment type
 *  (e.g. HDB › Serangoon North Vista › 4-Room). Every built-in template carries
 *  one; user-saved plans are prompted for it. */
export interface PlanCategory {
  housingType: HousingType
  /** Development / estate name (e.g. "Serangoon North Vista"). */
  projectName: string
  /** Unit type within the project (e.g. "4-Room", "2-Bedroom"). */
  apartmentType: string
}

export interface FloorPlan {
  id: string
  name: string
  /** Optional template categorisation (housing type → project → apartment type)
   *  driving the template picker. Built-ins set all three; user plans may prompt.
   *  Optional + additive — older saved plans simply have none. */
  category?: PlanCategory
  ceilingHeight: number
  /** External footprint (metres) for the floor slab + grid. */
  extent: PlanVec2
  walls: PlanWall[]
  openings: PlanOpening[]
  rooms: PlanRoom[]
  /** Wall paint colour (hex) for a custom plan's walls. Defaults to a warm
   *  off-white when unset. (Custom-plan walls are a solid colour; the built-in
   *  apartment uses per-room procedural finishes.) */
  wallColor?: string
  /** Optional plan-wide default wall thickness (m) per category, overriding the
   *  built-in 0.2 m external / 0.1 m internal. A wall's own `thicknessM` wins
   *  over this. Applies to custom plans AND the curated flat (the global default
   *  is read by both renderers). Additive + optional. */
  wallThickness?: { external?: number; internal?: number }
  /** Optional storeys above the ground floor (the top-level fields above ARE
   *  the ground floor). Absent/empty = the single-storey plans of today. */
  upperLevels?: PlanUpperLevel[]
  /** Free-text annotation notes placed on the plan (PARITY-DIMTEXT). Each is
   *  level-tagged (`levelId` absent = ground). Additive + optional. */
  notes?: PlanNote[]
  /** Custom dimension lines drawn on the plan (PARITY-DIMTEXT). Length is
   *  computed from the endpoints. Level-tagged. Additive + optional. */
  dimensions?: PlanDimension[]
  /** Free-form polyline markup drawn on the plan (PARITY-POLYLINE) — open or
   *  closed paths with optional dashed stroke / end arrow, for sketching zones,
   *  routes and callouts beyond walls/rooms. Level-tagged. Additive + optional. */
  polylines?: PlanPolyline[]
}

/** A free-text note placed on the 2D plan at a world position. */
export interface PlanNote {
  id: string
  /** World position (metres). */
  x: number
  z: number
  text: string
  /** Storey the note sits on; absent = ground (F13). */
  levelId?: string
}

/** A custom dimension line between two world points (metres). */
export interface PlanDimension {
  id: string
  a: PlanVec2
  b: PlanVec2
  /** Storey the dimension sits on; absent = ground (F13). */
  levelId?: string
}

/** A free-form polyline annotation: an ordered list of world points (metres),
 *  optionally closed into a loop, with optional dashed stroke + end arrowhead. */
export interface PlanPolyline {
  id: string
  /** Ordered vertices (≥2). */
  points: PlanVec2[]
  /** Join the last point back to the first (a closed loop); absent = open. */
  closed?: boolean
  /** Dashed stroke instead of solid; absent = solid. */
  dashed?: boolean
  /** Arrowhead at the final point (open polylines only); absent = none. */
  arrow?: boolean
  /** Storey the polyline sits on; absent = ground (F13). */
  levelId?: string
}

/** Default wall colour for custom plans when `wallColor` is unset. */
export const DEFAULT_PLAN_WALL_COLOR = '#ede9e2'

/** Signed-area shoelace over a polygon (absolute value = area, m²). */
export function polygonArea(pts: PlanVec2[]): number {
  if (pts.length < 3) return 0
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i]
    const [x2, z2] = pts[(i + 1) % pts.length]
    a += x1 * z2 - x2 * z1
  }
  return Math.abs(a) / 2
}

/** Ray-cast point-in-polygon test (even-odd rule). */
export function pointInPolygon(x: number, z: number, pts: PlanVec2[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i]
    const [xj, zj] = pts[j]
    const intersects = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

/** Outline polygon of the union of axis-aligned rectangles (`[x0,z0,x1,z1]`).
 *  Robust for ANY arrangement (adjacent on any side, overlapping, or a notch):
 *  it overlays the rect edges into a coarse grid, marks filled cells, then
 *  stitches the cell-boundary edges into a single closed loop. Winding is not
 *  guaranteed (consumers use shoelace |area| + even-odd containment, both
 *  winding-agnostic). Collinear vertices are dropped. */
export function rectUnionOutline(rects: Array<[number, number, number, number]>): PlanVec2[] {
  const xs = [...new Set(rects.flatMap((r) => [r[0], r[2]]))].sort((a, b) => a - b)
  const zs = [...new Set(rects.flatMap((r) => [r[1], r[3]]))].sort((a, b) => a - b)
  const filled = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= xs.length - 1 || j >= zs.length - 1) return false
    const cx = (xs[i]! + xs[i + 1]!) / 2
    const cz = (zs[j]! + zs[j + 1]!) / 2
    return rects.some((r) => cx > r[0] && cx < r[2] && cz > r[1] && cz < r[3])
  }
  // Boundary edges = a filled cell's side whose neighbour across it is empty.
  const key = (p: PlanVec2) => `${p[0]},${p[1]}`
  const adj = new Map<string, PlanVec2[]>()
  const addEdge = (a: PlanVec2, b: PlanVec2) => {
    for (const [p, q] of [
      [a, b],
      [b, a],
    ] as const) {
      const list = adj.get(key(p))
      if (list) list.push(q)
      else adj.set(key(p), [q])
    }
  }
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      if (!filled(i, j)) continue
      const x0 = xs[i]!
      const x1 = xs[i + 1]!
      const z0 = zs[j]!
      const z1 = zs[j + 1]!
      if (!filled(i - 1, j)) addEdge([x0, z0], [x0, z1])
      if (!filled(i + 1, j)) addEdge([x1, z0], [x1, z1])
      if (!filled(i, j - 1)) addEdge([x0, z0], [x1, z0])
      if (!filled(i, j + 1)) addEdge([x0, z1], [x1, z1])
    }
  }
  if (adj.size === 0) return []
  // Walk the loop from any vertex.
  const startKey = adj.keys().next().value as string
  const start: PlanVec2 = [Number(startKey.split(',')[0]), Number(startKey.split(',')[1])]
  const loop: PlanVec2[] = [start]
  let prev: PlanVec2 | null = null
  let cur = start
  for (let guard = 0; guard < adj.size + 2; guard++) {
    const nexts = adj.get(key(cur)) ?? []
    const next = nexts.find((p) => !prev || key(p) !== key(prev)) ?? nexts[0]
    if (!next || (key(next) === key(start) && loop.length > 2)) break
    loop.push(next)
    prev = cur
    cur = next
  }
  // Drop collinear vertices.
  const out: PlanVec2[] = []
  for (let i = 0; i < loop.length; i++) {
    const a = loop[(i - 1 + loop.length) % loop.length]!
    const b = loop[i]!
    const c = loop[(i + 1) % loop.length]!
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    if (Math.abs(cross) > 1e-9) out.push(b)
  }
  return out.length >= 3 ? out : loop
}

/** The room's outline as an absolute-metre polygon: the explicit `polygon`
 *  when set, else derived from the rectangle (+ L-extension) so every room has
 *  a single polygon representation for area / render / containment. */
export function roomPolygon(r: PlanRoom): PlanVec2[] {
  if (r.polygon && r.polygon.length >= 3) return r.polygon
  const [ox, oz] = r.origin
  const x1 = ox + r.width
  const z1 = oz + r.depth
  if (!r.extension) {
    return [
      [ox, oz],
      [x1, oz],
      [x1, z1],
      [ox, z1],
    ]
  }
  // L-shape: the rectilinear union of the main rect + the offset extension rect,
  // correct for an extension attached on ANY side (not just the south edge).
  const e = r.extension
  const ex0 = ox + e.offset[0]
  const ez0 = oz + e.offset[1]
  return rectUnionOutline([
    [ox, oz, x1, z1],
    [ex0, ez0, ex0 + e.width, ez0 + e.depth],
  ])
}

/** Interior floor area of a room (m²): shoelace over the room's rectilinear
 *  union outline (`roomPolygon`) — the SAME polygon used for the floor render
 *  and `planRoomPerimeter`, so area, perimeter, and geometry are mutually
 *  consistent. Invariant: `planRoomArea(r) === polygonArea(roomPolygon(r))`.
 *  This matters for L-shapes whose extension OVERLAPS the main rect: a naive
 *  `main + ext` sum would double-count the overlap and inflate the area (BUG-004);
 *  the union polygon counts it once. Simple rects and non-overlapping extensions
 *  are unchanged (their union area equals the rect / rect-sum). */
export function planRoomArea(r: PlanRoom): number {
  return polygonArea(roomPolygon(r))
}

/** Interior wall perimeter of a room (m): the closed-loop edge length of its
 *  outline polygon (explicit `polygon`, else the rectangle / L-shape outline via
 *  `roomPolygon`). Shared by the 2D plan labels and the printable report so a
 *  single edge length is used everywhere. */
export function planRoomPerimeter(r: PlanRoom): number {
  const poly = roomPolygon(r)
  let p = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    p += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return p
}

/** Whether a world point lies inside the room (polygon-aware). */
export function pointInRoom(r: PlanRoom, x: number, z: number): boolean {
  if (r.polygon && r.polygon.length >= 3) return pointInPolygon(x, z, r.polygon)
  const inMain =
    x >= r.origin[0] && x <= r.origin[0] + r.width && z >= r.origin[1] && z <= r.origin[1] + r.depth
  if (inMain) return true
  if (r.extension) {
    const ex = r.origin[0] + r.extension.offset[0]
    const ez = r.origin[1] + r.extension.offset[1]
    return x >= ex && x <= ex + r.extension.width && z >= ez && z <= ez + r.extension.depth
  }
  return false
}

/** Total interior area of a plan (sum of room areas), m². */
export function planTotalArea(plan: FloorPlan): number {
  return plan.rooms.reduce((sum, r) => sum + planRoomArea(r), 0)
}

/** Length of a wall (m). */
export function wallLength(w: PlanWall): number {
  return Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])
}

/**
 * Effective footprint that covers everything in the plan — the max of the
 * declared `extent` and the bounding box of all walls and rooms. Used for the
 * floor slab / grid / editor viewport so drawing beyond the initial extent
 * still renders fully.
 */
export function planBounds(plan: FloorPlan): PlanVec2 {
  let mx = plan.extent[0]
  let mz = plan.extent[1]
  for (const w of plan.walls) {
    mx = Math.max(mx, w.start[0], w.end[0])
    mz = Math.max(mz, w.start[1], w.end[1])
  }
  for (const r of plan.rooms) {
    if (r.polygon && r.polygon.length >= 3) {
      for (const [px, pz] of r.polygon) {
        mx = Math.max(mx, px)
        mz = Math.max(mz, pz)
      }
      continue
    }
    mx = Math.max(mx, r.origin[0] + r.width)
    mz = Math.max(mz, r.origin[1] + r.depth)
    if (r.extension) {
      mx = Math.max(mx, r.origin[0] + r.extension.offset[0] + r.extension.width)
      mz = Math.max(mz, r.origin[1] + r.extension.offset[1] + r.extension.depth)
    }
  }
  return [mx, mz]
}
