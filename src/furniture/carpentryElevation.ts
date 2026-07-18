/**
 * Carpentry/joinery elevations + sections (TODO G8 — contractor-handover
 * research: the single most-cited DIY handover gap). Turns a `ParametricSpec`
 * into a dimensioned front elevation + one representative vertical section,
 * derived ENTIRELY from `buildParametric`'s real part-box output — never a
 * second, invented geometry model. Pure + render-agnostic (no SVG/DOM here);
 * `ui/carpentrySheetSvg.ts` renders the `CarpentryView`s this module returns.
 *
 * Section cut choice (picked per type from the piece's OWN part positions,
 * not re-derived bay math):
 *  - bookshelf / sideboard: through the first bay (`bayCenterXs()[0]`).
 *  - wardrobe: through the bay carrying the most `shelf` parts (falls back to
 *    the first bay when no bay has any — e.g. an all-hanging-rail wardrobe).
 *  - kitchen-run: through the first bay (a base-cabinet column; when the run
 *    has uppers the same cut also slices the upper cabinet above it).
 *  - desk: through the pedestal (when `deskLegs==='pedestal'`, the midpoint of
 *    its two `side` panels) or through the first leg (four-leg desk).
 */

import {
  buildParametric,
  type ParametricPart,
  type ParametricPartRole,
} from './parametric/buildParts'
import type { ParametricSpec, ParametricType } from './parametric/spec'

/** A single 2D box in a view's local plane (metres). */
export interface CarpentryRect {
  x0: number
  y0: number
  x1: number
  y1: number
  role: ParametricPartRole
  /** Hidden-line convention: drawn dashed (a shelf/rail that may sit behind a
   *  closed door/drawer front — still real, still worth showing, but not a
   *  guaranteed-visible face). */
  hidden: boolean
}

/** A dimensioned span. `axis: 'h'` measures along the view's horizontal
 *  (X for elevation, Z/depth for section) between `from`/`to`; `axis: 'v'`
 *  measures the vertical (Y/height) the same way. `at` is the perpendicular
 *  coordinate the dimension line itself is drawn at (further from the
 *  geometry = more "outer" in the nested chain). */
export interface CarpentryDim {
  axis: 'h' | 'v'
  from: number
  to: number
  at: number
  label: string
  valueMm: number
  /** For a `'v'` dim only: which way the label text should extend from its
   *  tick line — `'left'` (into the open margin to the left, for a dim whose
   *  `at` sits LEFT of the geometry) or `'right'` (the mirror, for a dim
   *  positioned to the right). Extending the label AWAY from the geometry
   *  (rather than always left) keeps a right-side dim's text from reading
   *  back over the drawing. Ignored for `'h'` dims (label is always centred
   *  above the line). */
  labelSide: 'left' | 'right'
}

export interface CarpentryView {
  rects: CarpentryRect[]
  dims: CarpentryDim[]
}

export interface CarpentryPiece {
  type: ParametricType
  elevation: CarpentryView
  section: CarpentryView
  sectionLabel: string
  overallMm: { w: number; h: number; d: number }
}

const mm = (m: number): number => Math.round(m * 1000)

/** Roles drawn in the front elevation — the visible carcass/front-cover
 *  parts (solid) plus the interior fit-out parts (shelf/rail) that read as
 *  hidden lines when a door/drawer front covers them. Handles are included
 *  (real, cheap contractor info: pull position); backs are never visible
 *  from the front and are excluded. */
const ELEVATION_ROLES: ReadonlySet<ParametricPartRole> = new Set<ParametricPartRole>([
  'side',
  'top',
  'bottom',
  'plinth',
  'divider',
  'door',
  'handle',
  'drawer-front',
  'drawer-handle',
  'worktop',
  'leg',
])
const ELEVATION_HIDDEN_ROLES: ReadonlySet<ParametricPartRole> = new Set<ParametricPartRole>([
  'shelf',
  'rail',
])

/** Bay boundaries (X, ascending) reconstructed from the piece's OWN `side`
 *  (outer bounds) + `divider` (internal bounds) parts — not a re-derivation
 *  of the builder's bay-width formula, just reading back the positions it
 *  already computed. `null` when there aren't at least two `side` parts
 *  (e.g. a four-leg desk has none at the carcass edges). */
function bayBoundaries(parts: ParametricPart[]): number[] | null {
  const sides = parts.filter((p) => p.role === 'side')
  if (sides.length < 2) return null
  const sideXs = sides.map((p) => p.position[0])
  const left = Math.min(...sideXs)
  const right = Math.max(...sideXs)
  const dividerXs = parts
    .filter((p) => p.role === 'divider')
    .map((p) => p.position[0])
    .sort((a, b) => a - b)
  return [left, ...dividerXs, right]
}

/** Bay centre X coordinates, ascending. Falls back to a single centre bay at
 *  X=0 when boundaries can't be reconstructed (desk without a pedestal). */
function bayCenterXs(parts: ParametricPart[]): number[] {
  const b = bayBoundaries(parts)
  if (!b || b.length < 2) return [0]
  const centers: number[] = []
  for (let i = 0; i < b.length - 1; i++) centers.push((b[i]! + b[i + 1]!) / 2)
  return centers
}

function nearestCenterIndex(x: number, centers: number[]): number {
  let best = 0
  let bestDist = Infinity
  centers.forEach((cx, i) => {
    const dist = Math.abs(x - cx)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  })
  return best
}

/** Pick the vertical-section cut X (metres, local frame) + its caption,
 *  per the rules documented at the top of this file. */
function pickSectionCut(
  type: ParametricType,
  parts: ParametricPart[],
): { x: number; label: string } {
  if (type === 'desk') {
    const sides = parts.filter((p) => p.role === 'side')
    if (sides.length >= 2) {
      const xs = sides.map((p) => p.position[0])
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, label: 'Section through pedestal' }
    }
    const leg = parts.find((p) => p.role === 'leg')
    return { x: leg ? leg.position[0] : 0, label: 'Section through leg' }
  }

  const centers = bayCenterXs(parts)

  if (type === 'wardrobe') {
    const shelfXs = parts.filter((p) => p.role === 'shelf').map((p) => p.position[0])
    if (shelfXs.length > 0) {
      const counts = new Array(centers.length).fill(0)
      for (const x of shelfXs) counts[nearestCenterIndex(x, centers)]++
      let best = 0
      for (let i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i
      if (counts[best] > 0) return { x: centers[best]!, label: 'Section through a shelf bay' }
    }
    return { x: centers[0]!, label: 'Section through bay 1' }
  }

  if (type === 'kitchen-run') {
    return { x: centers[0]!, label: 'Section through a base cabinet' }
  }

  // bookshelf / sideboard
  return { x: centers[0]!, label: 'Section through bay 1' }
}

/** Project a part onto its front-elevation rectangle (drop Z). */
function elevationRect(p: ParametricPart): CarpentryRect {
  const [x, y] = p.position
  const [w, h] = p.size
  return {
    x0: x - w / 2,
    x1: x + w / 2,
    y0: y - h / 2,
    y1: y + h / 2,
    role: p.role,
    hidden: ELEVATION_HIDDEN_ROLES.has(p.role),
  }
}

/** Project a part onto its section rectangle (drop X; horizontal = Z/depth). */
function sectionRect(p: ParametricPart): CarpentryRect {
  const [, y, z] = p.position
  const [, h, d] = p.size
  return {
    x0: z - d / 2,
    x1: z + d / 2,
    y0: y - h / 2,
    y1: y + h / 2,
    role: p.role,
    hidden: false,
  }
}

const OUT_GAP = 0.16 // metres between nested dimension rows (wide enough that a
// typical label ("Shelf 2 height AFF — 1234 mm") clears the previous row's text)
const OUT_START = 0.14 // metres from the geometry to the first (innermost) row

/** Build the elevation dims: overall W/H (outermost) + per-bay widths
 *  (nested, only when there's more than one bay). */
function elevationDims(parts: ParametricPart[], w: number, h: number): CarpentryDim[] {
  const dims: CarpentryDim[] = []
  const boundaries = bayBoundaries(parts)
  const bays = boundaries && boundaries.length > 2 ? boundaries.length - 1 : 0

  if (bays > 0 && boundaries) {
    for (let i = 0; i < bays; i++) {
      dims.push({
        axis: 'h',
        from: boundaries[i]!,
        to: boundaries[i + 1]!,
        at: h + OUT_START,
        label: `Bay ${i + 1} width`,
        valueMm: mm(boundaries[i + 1]! - boundaries[i]!),
        labelSide: 'right',
      })
    }
  }
  dims.push({
    axis: 'h',
    from: -w / 2,
    to: w / 2,
    at: h + OUT_START + (bays > 0 ? OUT_GAP : 0),
    label: 'Overall width',
    valueMm: mm(w),
    labelSide: 'right',
  })
  dims.push({
    axis: 'v',
    from: 0,
    to: h,
    at: -w / 2 - OUT_START,
    label: 'Overall height',
    valueMm: mm(h),
    labelSide: 'left',
  })
  return dims
}

/** Build the section dims: overall depth/height (outermost), carcass panel
 *  thickness, plinth/toe-kick height, worktop thickness, and — the single
 *  most-cited DIY gap — every shelf/rail/drawer-front height above floor in
 *  the cut bay, nested innermost-first. */
function sectionDims(cutParts: ParametricPart[], d: number, h: number): CarpentryDim[] {
  const dims: CarpentryDim[] = []
  const zs = cutParts.map((p) => p.position[2] - p.size[2] / 2)
  const ze = cutParts.map((p) => p.position[2] + p.size[2] / 2)
  const dMin = zs.length ? Math.min(...zs) : -d / 2
  const dMax = ze.length ? Math.max(...ze) : d / 2

  dims.push({
    axis: 'h',
    from: dMin,
    to: dMax,
    at: h + OUT_START,
    label: 'Overall depth',
    valueMm: mm(dMax - dMin),
    labelSide: 'right',
  })
  dims.push({
    axis: 'v',
    from: 0,
    to: h,
    at: dMin - OUT_START,
    label: 'Overall height',
    valueMm: mm(h),
    labelSide: 'left',
  })

  // Panel/carcass thickness — a top or bottom panel spans the full width so
  // it's present at (almost) any cut; its Y-size IS the panel thickness.
  // Placed on the LEFT (with "Overall height") — the right side is reserved
  // for the shelf/rail/drawer AFF chain below, which needs the most room.
  const panel = cutParts.find((p) => p.role === 'top' || p.role === 'bottom')
  if (panel) {
    dims.push({
      axis: 'v',
      from: panel.position[1] - panel.size[1] / 2,
      to: panel.position[1] + panel.size[1] / 2,
      at: dMin - OUT_START - OUT_GAP,
      label: 'Panel thickness',
      valueMm: mm(panel.size[1]),
      labelSide: 'left',
    })
  }

  // Plinth / toe-kick height — recessed base, floor → its top.
  const plinth = cutParts.find((p) => p.role === 'plinth')
  if (plinth) {
    dims.push({
      axis: 'v',
      from: 0,
      to: plinth.position[1] + plinth.size[1] / 2,
      at: dMin - OUT_START - OUT_GAP * 2,
      label: 'Plinth height',
      valueMm: mm(plinth.position[1] + plinth.size[1] / 2),
      labelSide: 'left',
    })
  }

  // Worktop thickness (kitchen-run / desk) — right side, its own row so it
  // never shares a column with the shelf/rail/drawer chain below.
  const worktop = cutParts.find((p) => p.role === 'worktop')
  if (worktop) {
    dims.push({
      axis: 'v',
      from: worktop.position[1] - worktop.size[1] / 2,
      to: worktop.position[1] + worktop.size[1] / 2,
      at: dMax + OUT_START,
      label: 'Worktop thickness',
      valueMm: mm(worktop.size[1]),
      labelSide: 'right',
    })
  }

  // Shelf / rail / drawer-front heights above floor (AFF) — ascending, each
  // in its OWN column stepped well clear of the last (OUT_GAP is wide enough
  // that one label's text never reaches the next column's tick line). This is
  // the exact "internal wardrobe shelf heights" gap the contractor-handover
  // research names as the most-cited DIY-plan omission.
  const interior = cutParts.filter(
    (p) => p.role === 'shelf' || p.role === 'rail' || p.role === 'drawer-front',
  )
  const worktopCols = worktop ? 1 : 0
  interior.forEach((p, i) => {
    const label =
      p.role === 'shelf'
        ? `Shelf ${interior.filter((q) => q.role === 'shelf').indexOf(p) + 1} height AFF`
        : p.role === 'rail'
          ? `Rail ${interior.filter((q) => q.role === 'rail').indexOf(p) + 1} height AFF`
          : `Drawer ${interior.filter((q) => q.role === 'drawer-front').indexOf(p) + 1} height AFF`
    dims.push({
      axis: 'v',
      from: 0,
      to: p.position[1],
      at: dMax + OUT_START + OUT_GAP * (worktopCols + i + 1),
      label,
      valueMm: mm(p.position[1]),
      labelSide: 'right',
    })
  })

  return dims
}

/** Build the front elevation + one representative section for a placed
 *  parametric piece, purely from `buildParametric`'s part list. */
export function buildCarpentryPiece(spec: ParametricSpec): CarpentryPiece {
  const model = buildParametric(spec)
  const { parts, bounds } = model
  const { w, h, d } = bounds

  const elevationRects = parts
    .filter((p) => ELEVATION_ROLES.has(p.role) || ELEVATION_HIDDEN_ROLES.has(p.role))
    .map(elevationRect)

  const cut = pickSectionCut(spec.type, parts)
  const cutParts = parts.filter((p) => {
    const x0 = p.position[0] - p.size[0] / 2
    const x1 = p.position[0] + p.size[0] / 2
    return cut.x >= x0 - 1e-6 && cut.x <= x1 + 1e-6
  })
  const sectionRects = cutParts.map(sectionRect)

  return {
    type: spec.type,
    elevation: { rects: elevationRects, dims: elevationDims(parts, w, h) },
    section: { rects: sectionRects, dims: sectionDims(cutParts, d, h) },
    sectionLabel: cut.label,
    overallMm: { w: mm(w), h: mm(h), d: mm(d) },
  }
}
