/**
 * Sweet Home 3D (`.sh3d`) plan importer — PURE parser core.
 *
 * A `.sh3d` file is a ZIP archive whose `Home.xml` entry describes the plan:
 * walls, rooms (polygon outlines) and furniture. This module unzips the archive
 * (via `fflate`), reads `Home.xml`, and maps its geometry into OUR plan model
 * (`floorplan/types.ts`). It is intentionally dependency-free of three.js / React /
 * the store — just `bytes → data` so it stays unit-testable.
 *
 * Coordinate conversion (Sweet Home 3D → us):
 *   - SH3D uses **centimetres**; we use **metres** → divide by 100.
 *   - SH3D plan axes are X→right, Y→down (screen coords); our plan frame is
 *     X→east, Z→south (also "down" on the 2D plan, 0,0 at NW). Both increase the
 *     same way down/right, so the mapping is `x_m = x_cm / 100`, `z_m = y_cm / 100`.
 *   - We then translate the whole plan so its bounding box starts at (0,0) — SH3D
 *     plans can sit at arbitrary (often negative) coordinates, but our shell
 *     expects a plan anchored near the origin with a positive `extent`.
 *
 * Geometry (walls + rooms) is the priority; furniture is a best-effort name→category
 * map (unmapped pieces are reported in `warnings`, never silently dropped).
 *
 * Format reference: Sweet Home 3D / SweetHome3DJS `Home.xml` schema —
 * see REFERENCES.md (SweetHome3DJS) and docs/research/sweethome3djs-feature-analysis.md.
 */

import { unzipSync } from 'fflate'
import type { FurnitureCategory } from '../../furniture/types'
import type { FloorPlan, PlanOpening, PlanRoom, PlanVec2, PlanWall } from '../types'

/** SH3D centimetres → our metres. */
const CM_TO_M = 0.01
/** Default ceiling height (m) when the file declares none. */
const DEFAULT_CEILING_M = 2.6
/** A wall is treated as `external` (thicker) at/above this thickness (m). */
const EXTERNAL_WALL_THICKNESS_M = 0.16
/** Reject coordinates beyond this (m) as corrupt — a 10 km plan is not a home. */
const MAX_COORD_M = 10000

/** One furniture piece located on the imported plan, in our model frame. */
export interface Sh3dImportItem {
  /** Stable id derived from the source. */
  id: string
  /** Original SH3D piece name (name / catalogId). */
  name: string
  /** Best-effort mapped catalog category (`null` when unmapped → see warnings). */
  category: FurnitureCategory | null
  /** Footprint centre in our metres (X east, Z south). */
  position: PlanVec2
  /** Yaw rotation (radians, our convention). */
  rotation: number
  /** Footprint dimensions in metres. */
  width: number
  depth: number
  height: number
}

export interface Sh3dImportResult {
  /** The parsed plan geometry (walls + rooms + openings), already in metres and
   *  anchored near the origin. A `FloorPlan` minus the bits a consumer fills in
   *  (id is supplied by `importResultToFloorPlan`). */
  plan: {
    name: string
    ceilingHeight: number
    extent: PlanVec2
    walls: PlanWall[]
    openings: PlanOpening[]
    rooms: PlanRoom[]
  }
  /** Best-effort furniture descriptors (geometry-only; placement is the caller's
   *  job in a later slice). */
  items: Sh3dImportItem[]
  /** Non-fatal problems: unmapped furniture, skipped malformed elements, etc. */
  warnings: string[]
}

/** Thrown only for unrecoverable input (not a zip / no Home.xml). Soft problems
 *  go to `warnings` instead so the importer degrades gracefully. */
export class Sh3dParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'Sh3dParseError'
  }
}

/** Best-effort SH3D piece name → our catalog category. Case-insensitive word
 *  match, first hit wins; order matters (more specific terms first). */
const CATEGORY_KEYWORDS: ReadonlyArray<[RegExp, FurnitureCategory]> = [
  [/\b(bed|mattress|bunk|crib|cradle)\b/i, 'beds'],
  [/\b(sofa|couch|armchair|chair|stool|bench|ottoman|seat|recliner)\b/i, 'seating'],
  [/\b(table|desk|nightstand|sidetable|side table|console)\b/i, 'tables'],
  [
    /\b(wardrobe|cupboard|cabinet|shelf|shelv|bookcase|bookshelf|drawer|dresser|sideboard|chest|closet|rack)\b/i,
    'storage',
  ],
  [/\b(sink|stove|hob|cooktop|kitchen|worktop|counter)\b/i, 'kitchen'],
  [/\b(toilet|wc|bath|bathtub|shower|basin|bidet|washbasin|lavatory)\b/i, 'bathroom'],
  [/\b(fridge|refrigerator|freezer|oven|microwave|dishwasher|hood|range)\b/i, 'appliances'],
  [/\b(washing|washer|dryer|laundry)\b/i, 'laundry'],
  [/\b(lamp|light|chandelier|sconce|pendant|lantern|luminaire)\b/i, 'lighting'],
  [/\b(tv|television|monitor|computer|speaker|stereo)\b/i, 'electronics'],
  [
    /\b(plant|vase|frame|picture|painting|mirror|clock|rug|carpet|book|candle|bowl|sculpture|decor)\b/i,
    'decor',
  ],
  [/\b(curtain|blind|cushion|pillow|throw|drape)\b/i, 'textiles'],
  [/\b(toy|kids|children|playpen|highchair)\b/i, 'kids'],
  [/\b(garden|patio|outdoor|parasol|deck)\b/i, 'outdoor'],
]

/** Map an SH3D piece name to a catalog category (best-effort; `null` = unknown). */
export function categoryForPieceName(name: string): FurnitureCategory | null {
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(name)) return cat
  }
  return null
}

/** Locate the Home descriptor entry inside an unzipped archive's file list. */
function findHomeXmlName(names: string[]): string | null {
  const lower = names.map((n) => [n, n.toLowerCase()] as const)
  const exact = lower.find(([, l]) => l === 'home.xml' || l.endsWith('/home.xml'))
  if (exact) return exact[0]
  const anyXml = lower.find(([, l]) => l.endsWith('.xml'))
  return anyXml ? anyXml[0] : null
}

interface RawWall {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  thickness: number
}

/** Parse `Home.xml` text into the normalized result. Coordinates IN = cm, OUT = m
 *  (already anchored to the origin). Split out from `parseSh3d` so the XML→model
 *  step is independently testable with a plain XML string. */
export function parseHomeXml(xml: string, planName = 'Imported plan'): Sh3dImportResult {
  const warnings: string[] = []
  const doc = parseXmlDoc(xml)
  if (!doc) {
    throw new Sh3dParseError('Home.xml is not valid XML')
  }

  // --- Ceiling height: SH3D <home wallHeight=…> (cm) is the default wall height. ---
  const homeEl = doc.querySelector('home') ?? doc.documentElement
  const declaredWallH = num(homeEl?.getAttribute('wallHeight'))
  const ceilingHeight =
    declaredWallH != null && declaredWallH > 0
      ? clampCoord(declaredWallH * CM_TO_M)
      : DEFAULT_CEILING_M

  // --- Walls (cm) ---
  const rawWalls: RawWall[] = []
  let wallIdx = 0
  for (const el of Array.from(doc.querySelectorAll('wall'))) {
    const x1 = num(el.getAttribute('xStart'))
    const y1 = num(el.getAttribute('yStart'))
    const x2 = num(el.getAttribute('xEnd'))
    const y2 = num(el.getAttribute('yEnd'))
    if (x1 == null || y1 == null || x2 == null || y2 == null) {
      warnings.push('Skipped a wall with missing endpoint coordinates')
      continue
    }
    if (![x1, y1, x2, y2].every(finiteAndSane)) {
      warnings.push('Skipped a wall with out-of-range coordinates')
      continue
    }
    const thickness = num(el.getAttribute('thickness')) ?? 7.5
    rawWalls.push({
      id: el.getAttribute('id') || `sh3d-wall-${wallIdx}`,
      x1,
      y1,
      x2,
      y2,
      thickness,
    })
    wallIdx++
  }

  // --- Rooms (cm polygon points) ---
  interface RawRoom {
    id: string
    name: string
    points: Array<[number, number]>
  }
  const rawRooms: RawRoom[] = []
  let roomIdx = 0
  for (const el of Array.from(doc.querySelectorAll('room'))) {
    const pts: Array<[number, number]> = []
    for (const p of Array.from(el.querySelectorAll('point'))) {
      const px = num(p.getAttribute('x'))
      const py = num(p.getAttribute('y'))
      if (px == null || py == null || !finiteAndSane(px) || !finiteAndSane(py)) continue
      pts.push([px, py])
    }
    if (pts.length < 3) {
      warnings.push(`Skipped room "${el.getAttribute('name') || 'unnamed'}" (fewer than 3 points)`)
      continue
    }
    rawRooms.push({
      id: el.getAttribute('id') || `sh3d-room-${roomIdx}`,
      name: el.getAttribute('name') || `Room ${roomIdx + 1}`,
      points: pts,
    })
    roomIdx++
  }

  // --- Furniture (cm; centre x,y + angle + dims) ---
  interface RawItem {
    id: string
    name: string
    x: number
    y: number
    angle: number
    width: number
    depth: number
    height: number
  }
  const rawItems: RawItem[] = []
  let itemIdx = 0
  // <pieceOfFurniture> plus the door/window + light subtypes carry the same attrs.
  const pieces = new Set<Element>([
    ...Array.from(doc.querySelectorAll('pieceOfFurniture')),
    ...Array.from(doc.querySelectorAll('doorOrWindow')),
    ...Array.from(doc.querySelectorAll('light')),
  ])
  for (const el of pieces) {
    const x = num(el.getAttribute('x'))
    const y = num(el.getAttribute('y'))
    const width = num(el.getAttribute('width'))
    const depth = num(el.getAttribute('depth'))
    const height = num(el.getAttribute('height'))
    const name = el.getAttribute('name') || el.getAttribute('catalogId') || 'Furniture'
    if (x == null || y == null || width == null || depth == null) {
      warnings.push(`Skipped furniture "${name}" with incomplete geometry`)
      continue
    }
    if (![x, y, width, depth].every(finiteAndSane)) {
      warnings.push(`Skipped furniture "${name}" with out-of-range geometry`)
      continue
    }
    rawItems.push({
      id: el.getAttribute('id') || `sh3d-piece-${itemIdx}`,
      name,
      x,
      y,
      angle: num(el.getAttribute('angle')) ?? 0,
      width,
      depth,
      height: height ?? 0,
    })
    itemIdx++
  }

  // --- Compute the plan bounding box (cm) for origin translation + extent. ---
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  const stretch = (x: number, y: number) => {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  for (const w of rawWalls) {
    stretch(w.x1, w.y1)
    stretch(w.x2, w.y2)
  }
  for (const r of rawRooms) for (const [px, py] of r.points) stretch(px, py)
  for (const it of rawItems) stretch(it.x, it.y)

  const hasGeometry = Number.isFinite(minX) && Number.isFinite(minY)
  // Translate so the box starts at the origin; in metres.
  const ox = hasGeometry ? minX : 0
  const oy = hasGeometry ? minY : 0
  const toM = (x: number, y: number): PlanVec2 => [
    clampCoord((x - ox) * CM_TO_M),
    clampCoord((y - oy) * CM_TO_M),
  ]

  const extent: PlanVec2 = hasGeometry
    ? [clampCoord((maxX - minX) * CM_TO_M), clampCoord((maxY - minY) * CM_TO_M)]
    : [0, 0]

  // --- Emit walls in metres. ---
  const walls: PlanWall[] = rawWalls.map((w) => {
    const tM = clampCoord(w.thickness * CM_TO_M)
    const out: PlanWall = {
      id: w.id,
      start: toM(w.x1, w.y1),
      end: toM(w.x2, w.y2),
      thickness: tM >= EXTERNAL_WALL_THICKNESS_M ? 'external' : 'internal',
    }
    if (tM > 0) out.thicknessM = tM
    return out
  })

  // --- Emit rooms in metres (polygon authoritative; bbox → origin/width/depth). ---
  const rooms: PlanRoom[] = rawRooms.map((r) => {
    const polygon: PlanVec2[] = r.points.map(([px, py]) => toM(px, py))
    let rminX = Number.POSITIVE_INFINITY
    let rminY = Number.POSITIVE_INFINITY
    let rmaxX = Number.NEGATIVE_INFINITY
    let rmaxY = Number.NEGATIVE_INFINITY
    for (const [px, py] of polygon) {
      if (px < rminX) rminX = px
      if (py < rminY) rminY = py
      if (px > rmaxX) rmaxX = px
      if (py > rmaxY) rmaxY = py
    }
    return {
      id: r.id,
      name: r.name,
      origin: [rminX, rminY],
      width: clampCoord(rmaxX - rminX),
      depth: clampCoord(rmaxY - rminY),
      polygon,
    }
  })

  // --- Emit furniture descriptors + collect unmapped warnings. ---
  const items: Sh3dImportItem[] = rawItems.map((it) => {
    const category = categoryForPieceName(it.name)
    if (category == null) {
      warnings.push(`Furniture "${it.name}" could not be matched to a catalog category`)
    }
    const [px, pz] = toM(it.x, it.y)
    return {
      id: it.id,
      name: it.name,
      category,
      position: [px, pz],
      // SH3D `angle` is radians, clockwise on the screen-Y-down plan — the same
      // sense our plan uses (Z increases "down"), so it carries over directly.
      rotation: it.angle,
      width: clampCoord(it.width * CM_TO_M),
      depth: clampCoord(it.depth * CM_TO_M),
      height: clampCoord(it.height * CM_TO_M),
    }
  })

  if (walls.length === 0 && rooms.length === 0) {
    warnings.push('No walls or rooms were found in the file')
  }

  return {
    plan: {
      name: planName,
      ceilingHeight,
      extent,
      walls,
      openings: [],
      rooms,
    },
    items,
    warnings,
  }
}

/**
 * Parse a `.sh3d` archive into normalized plan data. Never throws for "soft"
 * problems (malformed pieces, empty plan) — those land in `warnings`. Throws
 * `Sh3dParseError` only when the input is not a usable archive (bad zip / no
 * Home.xml).
 */
export function parseSh3d(bytes: Uint8Array, planName = 'Imported plan'): Sh3dImportResult {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch (e) {
    throw new Sh3dParseError(`Not a valid .sh3d archive: ${(e as Error).message}`)
  }
  const names = Object.keys(files)
  if (names.length === 0) {
    throw new Sh3dParseError('The .sh3d archive is empty')
  }
  const homeName = findHomeXmlName(names)
  if (!homeName) {
    throw new Sh3dParseError(
      'No Home.xml found in the archive. This .sh3d may use the legacy serialized format, which is not supported yet.',
    )
  }
  const xml = decodeUtf8(files[homeName]!)
  return parseHomeXml(xml, planName)
}

/** Build a complete `FloorPlan` from a parse result (for `setFloorPlan`). */
export function importResultToFloorPlan(result: Sh3dImportResult, id?: string): FloorPlan {
  const plan = result.plan
  // Ensure a non-degenerate extent even for a bare/empty plan.
  const extent: PlanVec2 = [Math.max(plan.extent[0], 1), Math.max(plan.extent[1], 1)]
  return {
    id: id ?? `sh3d-${Date.now()}`,
    name: plan.name,
    ceilingHeight: plan.ceilingHeight,
    extent,
    walls: plan.walls,
    openings: plan.openings,
    rooms: plan.rooms,
  }
}

// --- low-level helpers -------------------------------------------------------

/** Decode UTF-8 bytes to a string (TextDecoder is in browser + happy-dom). */
function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}

/** Parse an XML string into a Document, or `null` on failure. Uses DOMParser
 *  (browser + happy-dom/jsdom); returns `null` when unavailable so the caller
 *  raises a clean error. */
function parseXmlDoc(xml: string): Document | null {
  if (typeof DOMParser === 'undefined') return null
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    // A parse error surfaces as a <parsererror> element in most implementations.
    if (doc.querySelector('parsererror')) return null
    if (!doc.documentElement) return null
    return doc
  } catch {
    return null
  }
}

/** Parse an attribute as a finite number, or `null`. */
function num(v: string | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** A value (cm) is finite and within a sane planet-sized bound (×100 → m bound). */
function finiteAndSane(cm: number): boolean {
  return Number.isFinite(cm) && Math.abs(cm) <= MAX_COORD_M / CM_TO_M
}

/** Clamp a metre value to a sane range and round to mm. */
function clampCoord(m: number): number {
  const clamped = Math.max(-MAX_COORD_M, Math.min(MAX_COORD_M, m))
  return Math.round(clamped * 1000) / 1000
}
