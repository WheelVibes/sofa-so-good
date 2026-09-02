/**
 * "Suggest views" (SAVED-VIEWS-SUGGEST) — pure pose math for auto-generating a
 * starter set of saved camera views: a corner three-quarter angle per major
 * furnished room, plus one whole-flat overview. The saved-views family
 * (Present…, Cinematic tour, Record walkthrough, Render all views, Day→night
 * clip) all consume `savedViews` but give the user no way to get started
 * without hand-authoring every bookmark — this computes a sane opening set.
 *
 * Kept free of React/three.js (mirrors `frameSelection.ts`/`cameraTween.ts`)
 * so the geometry is unit-testable with plain numbers; the actions layer
 * (`state/slices/cameraViewsSlice.ts:suggestSavedViews`) is the only caller
 * that touches the store.
 *
 * Works for BOTH the default flat (`apartment/constants.ts` `ROOMS`) and a
 * custom plan (`FloorPlan.rooms`) — both room shapes carry the same
 * `origin`/`width`/`depth` bounding-rect fields, so one code path handles
 * either. For an L-shaped room this uses only the base rectangle (the
 * `extension` is ignored) — a deliberate simplification: the base rect is
 * always the larger/primary part of the room and still yields a sane corner
 * framing; picking up the extension would need a full polygon-corner search
 * for a marginal framing improvement.
 */
import { APARTMENT_EXT_D, APARTMENT_EXT_W, ROOMS } from '../../apartment/constants'
import { roomBounds } from '../../apartment/roomGeometry'
import { allPlanRooms } from '../../floorplan/levels'
import { isDefaultPlan } from '../../floorplan/planGeometry'
import { type FloorPlan, type PlanRoom, planBounds, roomPolygon } from '../../floorplan/types'
import type { FurnitureItem } from '../../furniture/types'
import { fitDistanceForFov } from './frameSelection'

type Vec3 = [number, number, number]

/** One computed starter view: a name + a pose ready to hand to
 *  `saveView`/`SavedView`. */
export interface SuggestedView {
  name: string
  pos: Vec3
  target: Vec3
}

interface RoomRect {
  id: string
  name: string
  /** NW corner of the room's interior bounding rect. */
  ox: number
  oz: number
  width: number
  depth: number
}

const EYE_HEIGHT = 1.5 // m — roughly eye-level standing in the room
const LOOK_HEIGHT = 1.0 // m — a natural look-at height (between floor and eye)
const CORNER_MARGIN = 0.5 // m — pull the eye in from the bare corner
/** Rooms smaller than this along either axis are skipped (baths, shelters,
 *  service yards) — too tight for a meaningful corner shot. Also guarantees
 *  the ≥1.5 m focal-wall clearance below (dimension − `CORNER_MARGIN` stays
 *  comfortably above it, since the far-corner choice puts the eye on the
 *  opposite side of the room from the target/focal wall). */
const MIN_ROOM_DIM = 2.5
/** How many of the largest furnished rooms get their own corner view. */
const MAX_ROOM_VIEWS = 3
const REF_FOV_RAD = (45 * Math.PI) / 180 // mirrors OrbitCamera's REF_FOV_DEG
const OVERVIEW_ASPECT = 16 / 9 // a fixed, viewport-independent reference aspect
const APPROX_WALL_H = 2.7 // include wall height, like OrbitCamera's dollhouseFraming

/** All non-external rooms of the active plan as plain bounding rects — the
 *  default flat's fixed `ROOMS` table, or a custom plan's own `rooms`. */
function roomRectsForPlan(plan: FloorPlan): RoomRect[] {
  if (isDefaultPlan(plan)) {
    return Object.values(ROOMS)
      .filter((r) => !r.external)
      .map((r) => {
        // Bounds over the room's WHOLE footprint, not just its primary rect —
        // a multi-part room framed off rect 1 alone cuts off the rest of itself.
        const b = roomBounds(r)
        return {
          id: r.id,
          name: r.name,
          ox: b.x0,
          oz: b.z0,
          width: b.x1 - b.x0,
          depth: b.z1 - b.z0,
        }
      })
  }
  // EVERY storey (F13) — suggested views skipped every upstairs room.
  return allPlanRooms(plan).map((r) => {
    const [minX, minZ, maxX, maxZ] = planRoomBounds(r)
    return { id: r.id, name: r.name, ox: minX, oz: minZ, width: maxX - minX, depth: maxZ - minZ }
  })
}

/** True if a world XZ point falls inside a room's bounding rect. */
function inRect(x: number, z: number, r: RoomRect): boolean {
  return x >= r.ox && x <= r.ox + r.width && z >= r.oz && z <= r.oz + r.depth
}

/** Unweighted centroid of the furniture positions that fall inside a room
 *  rect, or `null` when the room holds no furniture. A simple, robust proxy
 *  for "where the action is" — used to bias the look-at target and to pick
 *  which room corner to shoot from (the one furthest from the furniture). */
function furnitureCentroid(items: FurnitureItem[], r: RoomRect): [number, number] | null {
  let sx = 0
  let sz = 0
  let n = 0
  for (const it of items) {
    const [x, z] = it.position
    if (!inRect(x, z, r)) continue
    sx += x
    sz += z
    n++
  }
  return n > 0 ? [sx / n, sz / n] : null
}

/** Corner three-quarter view for one room: eye pulled in from the room
 *  corner FARTHEST from the focal target, looking at the target. Returns
 *  `null` for a room too small to frame meaningfully. */
export function cornerViewForRoom(r: RoomRect, items: FurnitureItem[]): SuggestedView | null {
  if (r.width < MIN_ROOM_DIM || r.depth < MIN_ROOM_DIM) return null

  const roomCenter: [number, number] = [r.ox + r.width / 2, r.oz + r.depth / 2]
  const cluster = furnitureCentroid(items, r)
  // Bias the look-at target halfway toward the furniture cluster (if any),
  // else just the room centre.
  const target2d: [number, number] = cluster
    ? [(roomCenter[0] + cluster[0]) / 2, (roomCenter[1] + cluster[1]) / 2]
    : roomCenter

  const corners: [number, number][] = [
    [r.ox, r.oz],
    [r.ox + r.width, r.oz],
    [r.ox + r.width, r.oz + r.depth],
    [r.ox, r.oz + r.depth],
  ]
  let best = corners[0]
  let bestDist = -1
  for (const c of corners) {
    const d = Math.hypot(c[0] - target2d[0], c[1] - target2d[1])
    if (d > bestDist) {
      bestDist = d
      best = c
    }
  }

  // Pull the eye in from the bare corner toward the room centre, clamped so
  // it never crosses the centre (a very small room would otherwise invert).
  const margin = Math.min(CORNER_MARGIN, r.width / 2 - 0.1, r.depth / 2 - 0.1)
  const ex = best[0] + Math.sign(roomCenter[0] - best[0]) * margin
  const ez = best[1] + Math.sign(roomCenter[1] - best[1]) * margin

  return {
    name: `${r.name} — corner`,
    pos: [ex, EYE_HEIGHT, ez],
    target: [target2d[0], LOOK_HEIGHT, target2d[1]],
  }
}

/** Whole-flat 3/4 dollhouse overview — mirrors `OrbitCamera.tsx`'s
 *  `dollhouseFraming` (same bounding-sphere fit + 3/4 direction), but
 *  computed against a fixed reference FOV/aspect since a saved view's pose is
 *  a static snapshot, not a live per-frame viewport fit. */
export function overviewView(plan: FloorPlan): SuggestedView {
  const [pw, pd]: [number, number] = isDefaultPlan(plan)
    ? [APARTMENT_EXT_W, APARTMENT_EXT_D]
    : planBounds(plan)
  const cx = pw / 2
  const cz = pd / 2
  const radius = 0.5 * Math.hypot(pw, pd, APPROX_WALL_H) * 1.1
  const dist = fitDistanceForFov(radius, REF_FOV_RAD, OVERVIEW_ASPECT)
  const inv = 1 / Math.hypot(0.82, 0.6, 0.82)
  const dx = 0.82 * inv
  const dy = 0.6 * inv
  const dz = 0.82 * inv
  return {
    name: 'Overview',
    pos: [cx + dx * dist, dy * dist, cz + dz * dist],
    target: [cx, 1.0, cz],
  }
}

/**
 * Compute the full starter set: a corner view for each of the 2-3 largest
 * FURNISHED rooms (skipping any too small to frame), plus one whole-flat
 * overview. Pure — the caller (`suggestSavedViews`) is responsible for
 * de-duplicating against already-saved view names and persisting the result.
 */
export function suggestViews(plan: FloorPlan, items: FurnitureItem[]): SuggestedView[] {
  const rects = roomRectsForPlan(plan)
  const furnished = rects.filter((r) =>
    items.some((it) => inRect(it.position[0], it.position[1], r)),
  )
  const byAreaDesc = [...furnished].sort((a, b) => b.width * b.depth - a.width * a.depth)
  const roomViews = byAreaDesc
    .slice(0, MAX_ROOM_VIEWS)
    .map((r) => cornerViewForRoom(r, items))
    .filter((v): v is SuggestedView => v !== null)
  return [...roomViews, overviewView(plan)]
}

/** `[minX, minZ, maxX, maxZ]` over a PLAN room's whole outline (rect,
 *  L-extension or explicit polygon) — `roomPolygon` resolves all three. */
function planRoomBounds(r: PlanRoom): [number, number, number, number] {
  const poly = roomPolygon(r)
  const xs = poly.map((p) => p[0])
  const zs = poly.map((p) => p[1])
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]
}
