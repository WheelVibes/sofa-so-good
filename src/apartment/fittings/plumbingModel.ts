/**
 * PLUMBING-FITTINGS — the wet-area hardware the 2D plan already knows about and the 3D view
 * never drew: the chrome-rimmed FLOOR TRAP in every wet room, the bib tap / angle valve on the
 * wall, the floor waste at a basin, the 100 mm PVC soil pipe running floor-to-ceiling behind the
 * WC, and the wall-hung storage water heater. Sibling of `fittingModel.ts` (electrical): an HDB
 * bathroom, kitchen and service yard read as REAL largely because of these five objects.
 *
 * Source points: `plan.plumbingPoints` (the persisted MEP layer) or, when the plan carries none,
 * `furniture/mepSuggest.ts:derivePlumbingPoints` (toilet → soil pipe + cistern water point;
 * basin/sink → water + drainage; shower → floor trap + water; washer → water + floor trap)
 * plus {@link wetRoomTraps} — a derived layout only gives a room a trap when a SHOWER or a
 * WASHER sits in it, and every real HDB wet room has one whether or not it is furnished.
 *
 * Two placement rules, not one:
 * - `floor-trap` sits ON THE FLOOR, never on a wall: nudged to at least
 *   {@link FLOOR_TRAP_CLEAR_M} from every wall centreline, kept inside a room, dropped if it
 *   cannot be (a trap floating in the void reads worse than no trap).
 * - `water-point` / `drainage` / `soil-pipe` / `water-heater` snap to the nearest wall face
 *   through the shared `wallSnap.ts` — the same maths the electrical plates use. A DERIVED
 *   point sits at the FIXTURE's centre, which can be well over `WALL_SNAP_M` from any wall (a
 *   WC pan stands ~0.4 m off the wall its soil pipe is on), so `soil-pipe` and `water-point`
 *   get a wider {@link FIXTURE_SNAP_M} fallback rather than being dropped.
 *
 * Pure: no three, no store. Heights come from the MEP layer's own
 * `PLUMBING_MOUNT_DEFAULTS_MM` unless the point carries a `mountHeightMm`.
 */
import { PLUMBING_MOUNT_DEFAULTS_MM } from '../../floorplan/mepPoints'
import { roomCategoryFromName } from '../../floorplan/roomCategory'
import {
  type FloorPlan,
  type PlanRoom,
  type PlumbingKind,
  pointInRoom,
  roomPolygon,
} from '../../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../../furniture/types'
import { nearestStraightWall, placeOnWall, roomSide, WALL_SNAP_M } from './wallSnap'

export interface PlumbingFitting {
  kind: PlumbingKind
  /** Centre, world metres (x, z); `y` is the mount height (0 + 3 mm for a floor trap). */
  x: number
  y: number
  z: number
  /** Yaw about +Y so the fitting's +Z face points out of the wall into the room (0 on the floor). */
  yaw: number
  /** Host wall, for the orbit wall-fade — null for floor items, which never fade. */
  wallId: string | null
  /** The room the fitting serves, or null when it sits outside every room polygon. */
  roomId: string | null
}

export interface PlumbingPointLike {
  x: number
  z: number
  kind: PlumbingKind
  mountHeightMm?: number
  levelId?: string
}

/** Floor trap grating: 150 mm square, sitting 3 mm proud of the finished floor. */
export const FLOOR_TRAP_SIZE_M = 0.15
export const FLOOR_TRAP_Y = 0.003
/** Minimum clearance from any wall CENTRELINE for a floor trap — a grating half-buried in a
 *  120 mm partition is the one artefact this whole module has to avoid. */
export const FLOOR_TRAP_CLEAR_M = 0.25
/** Wider snap for the two kinds a derived layout puts at the FIXTURE rather than the wall. */
export const FIXTURE_SNAP_M = 1.2
/** 100 mm PVC soil stack, hugging the wall face floor-to-ceiling. */
export const SOIL_PIPE_DIA_M = 0.1
/** 50 mm PVC waste stub at the floor/wall junction. */
export const DRAIN_STUB_DIA_M = 0.05
/** Bib tap / angle valve: how far the spout stands off the wall face. */
export const TAP_DEPTH_M = 0.09
/** How far ALONG the wall a bib tap is shifted when it lands on a soil stack (TAP-IN-PIPE): a
 *  WC's soil pipe and its cistern valve derive from the same fixture centre, so both resolve to
 *  the same point on the wall behind the pan and the tap renders INSIDE the 100 mm stack. */
export const TAP_PIPE_CLEAR_M = 0.26
/** HDB storage water heater — a ~0.35 m cube hung at 1.8 m. */
export const HEATER_BOX = { w: 0.35, h: 0.35, d: 0.35 } as const
/** Default ceiling height when the plan does not carry one. */
export const DEFAULT_CEILING_M = 2.6
/** How far in front of a wall fitting to probe when deciding which room it belongs to. */
const ROOM_PROBE_M = 0.15
/** Half a grating plus a small margin — how far a trap's CENTRE must stay outside a fixture
 *  footprint (TRAP-UNDER-TRAY). */
const TRAP_OBSTACLE_CLEAR_M = FLOOR_TRAP_SIZE_M / 2 + 0.02

/**
 * A furniture footprint a floor trap must not end up under (TRAP-UNDER-TRAY). The derived
 * layout puts a shower's trap at the shower's CENTRE and a washer's beside it — and the 3D
 * shower is a raised TRAY, so the grating rendered underneath it showed as a chrome sliver
 * poking through the tray on the first real-GPU frame. A real HDB wet room has its trap in the
 * open floor beside the fixture, which is also the only place it can be SEEN, so the trap is
 * pushed out of any footprint it lands in. Axis-aligned box in the item's own frame; `rotation`
 * is the item's yaw. Optional — a caller with no furniture (a plan-only test) passes nothing.
 */
export interface FloorObstacle {
  x: number
  z: number
  w: number
  d: number
  rotation?: number
}

/** Push (x, z) out of every obstacle it is inside, along the shortest escape axis. */
function outOfObstacles(
  obstacles: readonly FloorObstacle[],
  x0: number,
  z0: number,
): { x: number; z: number } {
  let x = x0
  let z = z0
  for (let pass = 0; pass < 6; pass++) {
    let moved = false
    for (const o of obstacles) {
      const t = o.rotation ?? 0
      const c = Math.cos(t)
      const s = Math.sin(t)
      const dx = x - o.x
      const dz = z - o.z
      const lx = dx * c + dz * s
      const lz = -dx * s + dz * c
      const hw = o.w / 2 + TRAP_OBSTACLE_CLEAR_M
      const hd = o.d / 2 + TRAP_OBSTACLE_CLEAR_M
      if (Math.abs(lx) >= hw || Math.abs(lz) >= hd) continue
      let nlx = lx
      let nlz = lz
      if (hw - Math.abs(lx) <= hd - Math.abs(lz)) nlx = lx >= 0 ? hw : -hw
      else nlz = lz >= 0 ? hd : -hd
      x = o.x + (nlx * c - nlz * s)
      z = o.z + (nlx * s + nlz * c)
      moved = true
    }
    if (!moved) break
  }
  return { x, z }
}

/** True when (x, z) sits inside any obstacle footprint (plus the trap's own margin). */
function insideObstacle(obstacles: readonly FloorObstacle[], x: number, z: number): boolean {
  const p = outOfObstacles(obstacles, x, z)
  return Math.hypot(p.x - x, p.z - z) > 1e-9
}

/** Depth (m) of each wall-mounted kind — the distance its body stands off the wall face. */
function wallDepthFor(kind: PlumbingKind): number {
  switch (kind) {
    case 'water-point':
      return TAP_DEPTH_M
    case 'drainage':
      return DRAIN_STUB_DIA_M
    case 'soil-pipe':
      return SOIL_PIPE_DIA_M
    default:
      return HEATER_BOX.d
  }
}

function roomAt(plan: FloorPlan, x: number, z: number): string | null {
  return plan.rooms.find((r) => pointInRoom(r, x, z))?.id ?? null
}

function isWetRoom(r: PlanRoom): boolean {
  const cat = r.category ?? roomCategoryFromName(r.name)
  return cat === 'bath' || cat === 'powder' || cat === 'kitchen' || cat === 'serviceYard'
}

/** Grid step (m) for the floor-trap spot search — 50 mm is finer than the 150 mm grating. */
const TRAP_SEARCH_STEP_M = 0.05

/**
 * The valid trap spot inside `room` NEAREST to (x, z): at least {@link FLOOR_TRAP_CLEAR_M} from
 * every wall centreline, inside the room polygon, and outside every fixture footprint. One
 * search satisfies all three constraints at once — nudging a point off the walls and then off a
 * washing machine just pushes it back under the washing machine (measured on the service yard).
 * Returns null when the room has no such spot (caller drops the trap).
 */
function bestSpotInRoom(
  plan: FloorPlan,
  room: PlanRoom,
  obstacles: readonly FloorObstacle[],
  x: number,
  z: number,
): { x: number; z: number } | null {
  const poly = roomPolygon(room)
  const xs = poly.map((p) => p[0])
  const zs = poly.map((p) => p[1])
  let best: { x: number; z: number; d: number } | null = null
  for (let px = Math.min(...xs); px <= Math.max(...xs); px += TRAP_SEARCH_STEP_M) {
    for (let pz = Math.min(...zs); pz <= Math.max(...zs); pz += TRAP_SEARCH_STEP_M) {
      const d = Math.hypot(px - x, pz - z)
      if (best && d >= best.d) continue
      if (!pointInRoom(room, px, pz)) continue
      const hit = nearestStraightWall(plan.walls, px, pz)
      if (hit && hit.dist < FLOOR_TRAP_CLEAR_M) continue
      if (insideObstacle(obstacles, px, pz)) continue
      best = { x: px, z: pz, d }
    }
  }
  return best ? { x: best.x, z: best.z } : null
}

/**
 * Place a floor trap requested at (x, z): the nearest valid spot in the room that contains the
 * request, or — when the request falls in no room (a derived point under a fixture that straddles
 * a threshold) — in the nearest room whose own best spot is closest. Null = drop it.
 */
function trapSpot(
  plan: FloorPlan,
  obstacles: readonly FloorObstacle[],
  x: number,
  z: number,
): { x: number; z: number } | null {
  const own = plan.rooms.find((r) => pointInRoom(r, x, z))
  if (!own) return null
  return bestSpotInRoom(plan, own, obstacles, x, z)
}

/**
 * The floor footprints a trap must dodge: every ground-storey item that actually stands on the
 * floor. Wall/ceiling-mounted items (`mounted`) and flat coverings (`noClip`, a rug) are not
 * obstacles — a trap under a rug is fine, a trap under a shower tray is not.
 */
export function floorObstacles(
  items: readonly FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
): FloorObstacle[] {
  const out: FloorObstacle[] = []
  for (const it of items) {
    if (it.levelId) continue
    const def = catalog[it.defId]
    if (!def || def.mounted || def.noClip) continue
    if ((def.verticalSpan?.base ?? 0) > 0.1) continue
    out.push({
      x: it.position[0],
      z: it.position[1],
      w: def.defaultFootprint.w,
      d: def.defaultFootprint.d,
      rotation: it.rotation ?? 0,
    })
  }
  return out
}

/**
 * Every WET room (bath, powder, kitchen, service yard) that no source point already gives a
 * floor trap gets one, placed at the point of its polygon nearest the centroid that clears
 * every wall by {@link FLOOR_TRAP_CLEAR_M}. Only used when the plan has NO persisted MEP layer —
 * a user who placed points sees exactly those.
 */
export function wetRoomTraps(
  plan: FloorPlan,
  existing: readonly PlumbingPointLike[],
  obstacles: readonly FloorObstacle[] = [],
): PlumbingPointLike[] {
  const out: PlumbingPointLike[] = []
  for (const room of plan.rooms) {
    if (!isWetRoom(room)) continue
    const has = existing.some(
      (p) => p.kind === 'floor-trap' && !p.levelId && pointInRoom(room, p.x, p.z),
    )
    if (has) continue
    const poly = roomPolygon(room)
    const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length
    const cz = poly.reduce((a, p) => a + p[1], 0) / poly.length
    const spot = bestSpotInRoom(plan, room, obstacles, cx, cz)
    if (spot) out.push({ x: spot.x, z: spot.z, kind: 'floor-trap' })
  }
  return out
}

/**
 * Resolve plumbing points onto the floor and the wall faces. `points` is the union the caller
 * chooses (persisted MEP points, or the derived layout plus {@link wetRoomTraps}). Ground storey
 * only: upper-storey points are skipped (the walk view renders one storey's shell at a time).
 */
export function resolvePlumbingFittings(
  plan: FloorPlan,
  points: readonly PlumbingPointLike[],
  obstacles: readonly FloorObstacle[] = [],
): PlumbingFitting[] {
  const out: PlumbingFitting[] = []
  // Where the soil stacks land, so a bib tap from the SAME fixture can step aside (TAP-IN-PIPE).
  const stacks: { wallId: string; offset: number }[] = []
  for (const p of points) {
    if (p.levelId || p.kind !== 'soil-pipe') continue
    const h = nearestStraightWall(plan.walls, p.x, p.z)
    if (h && h.dist <= FIXTURE_SNAP_M) stacks.push({ wallId: h.wall.id, offset: h.offset })
  }
  for (const p of points) {
    if (p.levelId) continue
    if (p.kind === 'floor-trap') {
      const spot = trapSpot(plan, obstacles, p.x, p.z)
      if (!spot) continue
      out.push({
        kind: 'floor-trap',
        x: spot.x,
        y: FLOOR_TRAP_Y,
        z: spot.z,
        yaw: 0,
        wallId: null,
        roomId: roomAt(plan, spot.x, spot.z),
      })
      continue
    }
    const hit = nearestStraightWall(plan.walls, p.x, p.z)
    if (!hit) continue
    // A derived point sits at the FIXTURE; a WC's soil pipe and its cistern valve are on the
    // wall behind the pan, up to a fixture depth away.
    const reach = p.kind === 'soil-pipe' || p.kind === 'water-point' ? FIXTURE_SNAP_M : WALL_SNAP_M
    if (hit.dist > reach) continue
    const y = (p.mountHeightMm ?? PLUMBING_MOUNT_DEFAULTS_MM[p.kind]) / 1000
    const side = hit.dist < 0.02 ? (roomSide(hit.wall, plan, hit.offset) ?? hit.side) : hit.side
    let offset = hit.offset
    if (p.kind === 'water-point') {
      const clash = stacks.find(
        (q) => q.wallId === hit.wall.id && Math.abs(q.offset - offset) < TAP_PIPE_CLEAR_M,
      )
      if (clash) offset = clash.offset + TAP_PIPE_CLEAR_M
    }
    const placed = placeOnWall(hit.wall, plan, offset, side, y, wallDepthFor(p.kind))
    if (!placed) continue
    out.push({
      kind: p.kind,
      ...placed,
      roomId: roomAt(
        plan,
        placed.x + Math.sin(placed.yaw) * ROOM_PROBE_M,
        placed.z + Math.cos(placed.yaw) * ROOM_PROBE_M,
      ),
    })
  }
  return out
}

/**
 * Scope a resolved plumbing list to ONE room — the per-room editor isolates a single room, and
 * a tap on some other room's wall would render floating in the void (EDITOR-LOCKSTEP; mirrors
 * `fittingModel.ts:fittingsForRoom`). A floor trap is tested at its OWN position; a wall item at
 * the point {@link ROOM_PROBE_M} in front of it along its own yaw. An id that matches no room
 * yields an empty list rather than falling back to the whole flat.
 */
export function plumbingForRoom(
  fittings: readonly PlumbingFitting[],
  plan: FloorPlan,
  roomId: string,
): PlumbingFitting[] {
  const room = plan.rooms.find((r) => r.id === roomId)
  if (!room) return []
  return fittings.filter((f) => {
    if (f.wallId === null) return pointInRoom(room, f.x, f.z)
    return pointInRoom(
      room,
      f.x + Math.sin(f.yaw) * ROOM_PROBE_M,
      f.z + Math.cos(f.yaw) * ROOM_PROBE_M,
    )
  })
}
