/**
 * Per-room point-illuminance grid (the LP5 tail) — the *spatial* counterpart
 * of `roomLux.ts`'s lumen-method room average, feeding the 3D floor heatmap
 * overlay (`scene/LuxOverlay.tsx`).
 *
 * The room floor is sampled on a regular grid of cell centres. Each cell sums:
 *  - **direct fixture light** from the room's own emitters (a light belongs to
 *    the room containing its bulb, exactly like `estimateRoomLux` — interior
 *    walls block light): inverse-square with cosine incidence on the
 *    horizontal plane, E = I·h / (h² + r²)^(3/2), using the SAME calibrated
 *    candela the average estimate derives lumens from (registry intensity ×
 *    {@link SCENE_INTENSITY_CALIBRATION}) — no new photometry. Scaled by the
 *    scene's current fixture level (1 at night → 0 in daylight, or the user's
 *    lights-mode override — mirroring `FurnitureLights`).
 *  - **a uniform indirect (inter-reflected) term** that tops the room's mean
 *    direct level up to the lumen-method average (`Φ × UF / A`, the very
 *    number `estimateRoomLux` reports) — so the heatmap *redistributes* the
 *    2D table's average spatially (pools under fixtures, dimmer corners)
 *    instead of contradicting it: direct-only point calcs ignore the
 *    reflected component the utilisation factor accounts for.
 *  - **a simple daylight wash** near the room's windows: a documented
 *    near-window illuminance scaled by the window's glazing area and the
 *    current daylight level, decaying with distance into the room. A
 *    visual-QC heuristic (bright by the window, dimmer deep in the plan), not
 *    a daylight-factor simulation.
 *
 * Pure (no three, no React) → unit-testable. Cells outside the room polygon
 * carry the {@link MASKED} sentinel (-1); every in-room value is a finite,
 * non-negative lux number (zero lights at night → uniform 0, never NaN).
 */

import {
  allPlanRooms,
  GROUND_LEVEL_ID,
  itemsOnLevel,
  levelAsPlan,
  planLevels,
  visibleLevels,
} from '../floorplan/levels'
import { openingProbePoints } from '../floorplan/openingProbe'
import {
  type FloorPlan,
  type PlanRoom,
  planRoomArea,
  pointInRoom,
  roomPolygon,
  type SingleLevelPlan,
} from '../floorplan/types'
import {
  bleedMeanLux,
  type DoorOpenMap,
  directionalBleedWeight,
  interRoomDoorwaySources,
} from './doorwayBleed'
import type { PlanLight } from './lightingPlan'
import {
  MIN_UNIFORMITY,
  planLightLumens,
  roomLuxKind,
  SCENE_INTENSITY_CALIBRATION,
  UTILISATION_FACTOR,
  WORK_PLANE_HEIGHT_M,
} from './roomLux'

/** Default sample spacing (m). Fine enough to show lamp pools, coarse enough
 *  that a whole flat is a few thousand samples. */
const LUX_GRID_CELL = 0.25

/** Hard cap per grid axis — a huge polygon room grows its cell size instead
 *  of its sample count, keeping texture uploads bounded. */
export const LUX_GRID_MAX_DIM = 96

/** Sentinel for a cell whose centre lies outside the room (rendered fully
 *  transparent). Kept finite so the texture path never sees NaN/Infinity. */
export const MASKED = -1

/**
 * Interior daylight illuminance (lx) right beside a typical window at full
 * daylight — a rule-of-thumb daylight-factor value (~2% of a 50k–100k lx
 * tropical sky reaching the area just inside the glass, before decay).
 */
export const DAYLIGHT_NEAR_WINDOW_LUX = 1600

/** Reference glazing area (m²) producing the full near-window value; larger
 *  windows scale up (capped) and small ventilation panes scale down. */
const DAYLIGHT_REF_GLAZING = 1.5

/** Distance (m) into the room at which the daylight wash halves. */
const DAYLIGHT_HALF_DEPTH = 1.8

/** How far (m) to probe perpendicular to a window's wall when assigning it to
 *  a room (same trick as `analysis/daylight.ts`). */
const WINDOW_PROBE_OFFSET = 0.2

/** A window opening reduced to a daylight point source on the wall line. */
export interface WindowSource {
  x: number
  z: number
  /** Glazing area, m² (width × (head − sill)). */
  glazing: number
  /** Probe points just inside / outside the wall, for room assignment. */
  probes: [number, number][]
}

export interface RoomLuxGrid {
  roomId: string
  /** World min-corner of the grid (m). */
  x0: number
  z0: number
  cols: number
  rows: number
  /** Cell size (m); grids of large rooms grow the cell, not the count. */
  cell: number
  /**
   * Row-major cell-centre illuminance (lx). Row 0 is the MIN-z row; index
   * `iz * cols + ix` is the cell centred at
   * (x0 + (ix+0.5)·cell, z0 + (iz+0.5)·cell). Out-of-room cells = {@link MASKED}.
   */
  values: Float32Array
  /** Highest in-room lux on the grid (0 when fully dark/masked). */
  maxLux: number
  /** Lowest in-room lux on the grid (0 when fully dark/masked). */
  minLux: number
  /** Mean in-room lux across unmasked cells (0 when none). */
  meanLux: number
  /**
   * Uniformity U0 = Emin / Eavg over the in-room cells, 0–1. A professional
   * lighting spec states this ALONGSIDE the average, because an average that
   * meets its target can still be a room of hotspots under each downlight and
   * dark corners — exactly what this grid reveals but never scored before.
   * EN 12464-style guidance: >= 0.6 for a task area, >= 0.4 general. 0 when the
   * room is fully dark or fully masked.
   */
  uniformity: number
  /** Height of the plane these values were sampled on (m); 0 = floor. */
  planeHeight: number
}

/** See {@link LuxGridOptions.iesShape}. */
export type IesShapeResolver = (profileId: string, angleDeg: number) => number

export interface LuxGridOptions {
  /** Fixture contribution 0–1 (night = 1, daylight = 0, or lights-mode override). */
  fixtureLevel: number
  /** Daylight contribution 0–1 (inverse of the above in auto mode). */
  daylightLevel: number
  /** Sample spacing (m); defaults to {@link LUX_GRID_CELL}. */
  cell?: number
  /** Measurement-plane height (m) — see {@link pointIlluminance}. Default 0
   *  (floor), which reproduces the previous behaviour exactly. Wins over
   *  {@link workPlane} when both are given. */
  planeHeight?: number
  /**
   * Resolve a fixture's IES distribution SHAPE at a vertical angle from nadir,
   * **Note what this can and cannot move.** The indirect term below tops the
   * direct field up to the lumen-method room average, so a directional
   * distribution changes the grid's SHAPE (peaks, minima, uniformity) and
   * leaves `meanLux` exactly unchanged — measured: a forced 20° cone on the
   * default flat moved maxLux 1430.6 → 1499.8 and U0 0.819 → 0.851 with the
   * mean identical at 1272.0. That is correct, not a bug: the room average is
   * the lumen method (Φ × UF / A), which is distribution-agnostic by
   * construction. Using IES for the AVERAGE too would mean abandoning the
   * lumen method for a full point-by-point integration.
   *
   * returning a factor in `[0, 1]` relative to the profile's own peak. Injected
   * rather than imported so this module stays pure — `lighting/ies/iesStore.ts`
   * carries module state. Absent ⇒ every fixture computes isotropically, the
   * previous behaviour exactly.
   */
  iesShape?: IesShapeResolver
  /**
   * Sample each room on its own per-kind WORK PLANE
   * ({@link WORK_PLANE_HEIGHT_M}) instead of the floor — what a lux target
   * actually applies to, and what an analysis/compliance read wants.
   *
   * Opt-in rather than default because the primary consumer of these grids is
   * the 3D floor heatmap: painting a kitchen's worktop illuminance onto its
   * floor would misrepresent the picture. Default false (floor).
   */
  workPlane?: boolean
  /** Door open/closed state (store `doors` map) for inter-room bleed (R-BLEED).
   *  Absent / a door absent → closed → no bleed. */
  doors?: DoorOpenMap
}

/** One neighbour→room bleed contribution for {@link buildRoomLuxGrid}: a doorway
 *  placement plus the mean lux it borrows from the adjacent room. */
export interface RoomBleedSource {
  /** World [x,z] centre of the doorway. */
  center: [number, number]
  /** Unit wall-normal pointing into THIS room. */
  inwardNormal: [number, number]
  /** Mean borrowed illuminance (lx) this doorway adds to the room. */
  meanLux: number
}

/** Every window of a (single-level pseudo-)plan as a daylight source. */
export function planWindowSources(plan: SingleLevelPlan): WindowSource[] {
  const out: WindowSource[] = []
  for (const o of plan.openings) {
    if (o.kind !== 'window') continue
    const wall = plan.walls.find((w) => w.id === o.wallId)
    if (!wall) continue
    // Centre clamped into the wall span; the two ± probes let the per-room test
    // (`probes.some(pointInRoom)`) pick whichever side is the interior.
    const probe = openingProbePoints(wall, o, WINDOW_PROBE_OFFSET, true)
    if (!probe) continue
    const glazing = Math.max(0, o.width) * Math.max(0, o.head - o.sill)
    if (glazing <= 0) continue
    out.push({
      x: probe.center[0],
      z: probe.center[1],
      glazing,
      probes: [probe.plus, probe.minus],
    })
  }
  return out
}

/**
 * Direct illuminance (lx) at a point on the measurement plane from one fixture:
 * inverse-square with cosine incidence, using the calibrated registry candela.
 *
 * `planeHeight` is the height of the plane being measured (m). Standards specify
 * illuminance at the WORK PLANE — ~0.75 m at a desk, ~0.85 m at a kitchen
 * worktop — not at the floor, and that is where a 300–500 lx target actually
 * applies. Default 0 (floor) preserves the previous behaviour for callers that
 * do not opt in. A plane at or above the fixture clamps to a 0.05 m drop rather
 * than dividing by zero.
 */
export function pointIlluminance(
  light: Pick<PlanLight, 'x' | 'z' | 'height' | 'intensity' | 'iesProfile'>,
  px: number,
  pz: number,
  planeHeight = 0,
  iesShape?: IesShapeResolver,
): number {
  const h = Math.max(0.05, light.height - planeHeight)
  const dx = px - light.x
  const dz = pz - light.z
  const r2 = dx * dx + dz * dz
  const d2 = h * h + r2
  let candela = light.intensity * SCENE_INTENSITY_CALIBRATION
  // Directional distribution (G4): scale the peak candela by the fixture's own
  // IES shape at this point's vertical angle from nadir. Without a profile the
  // factor is 1, i.e. the previous isotropic behaviour, byte-identical.
  if (light.iesProfile && iesShape) {
    const angleDeg = (Math.atan2(Math.sqrt(r2), h) * 180) / Math.PI
    const factor = iesShape(light.iesProfile, angleDeg)
    if (Number.isFinite(factor) && factor >= 0) candela *= factor
  }
  return (candela * h) / d2 ** 1.5
}

/** Daylight wash (lx) at a floor point from one window at full daylight. */
export function windowIlluminance(win: WindowSource, px: number, pz: number): number {
  const d = Math.hypot(px - win.x, pz - win.z)
  const glazingFactor = Math.min(1.5, win.glazing / DAYLIGHT_REF_GLAZING)
  return (DAYLIGHT_NEAR_WINDOW_LUX * glazingFactor) / (1 + (d / DAYLIGHT_HALF_DEPTH) ** 2)
}

/**
 * Sample one room. `lights`/`windows` may be the whole storey's sets — only
 * those inside (lights) or bordering (windows) this room contribute. Returns
 * `null` for a degenerate room (no usable extent).
 */
export function buildRoomLuxGrid(
  room: PlanRoom,
  lights: PlanLight[],
  windows: WindowSource[],
  opts: LuxGridOptions,
  bleed: RoomBleedSource[] = [],
): RoomLuxGrid | null {
  const poly = roomPolygon(room)
  if (poly.length < 3) return null
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const [px, pz] of poly) {
    minX = Math.min(minX, px)
    minZ = Math.min(minZ, pz)
    maxX = Math.max(maxX, px)
    maxZ = Math.max(maxZ, pz)
  }
  const w = maxX - minX
  const d = maxZ - minZ
  if (!(w > 0) || !(d > 0)) return null

  const planeHeight = Math.max(0, opts.planeHeight ?? 0)
  const base = Math.max(0.05, opts.cell ?? LUX_GRID_CELL)
  // Grow the cell (never the count) when a room out-sizes the texture cap.
  const cell = Math.max(base, w / LUX_GRID_MAX_DIM, d / LUX_GRID_MAX_DIM)
  const cols = Math.max(1, Math.ceil(w / cell))
  const rows = Math.max(1, Math.ceil(d / cell))

  const fixtureLevel = clamp01(opts.fixtureLevel)
  const daylightLevel = clamp01(opts.daylightLevel)

  const roomLights = fixtureLevel > 0 ? lights.filter((l) => pointInRoom(room, l.x, l.z)) : []
  const roomWindows =
    daylightLevel > 0
      ? windows.filter((win) => win.probes.some(([px, pz]) => pointInRoom(room, px, pz)))
      : []

  // Pass 1: direct fixture light + the daylight wash per in-room cell.
  const values = new Float32Array(cols * rows)
  let directSum = 0
  let inRoomCells = 0
  for (let iz = 0; iz < rows; iz++) {
    const pz = minZ + (iz + 0.5) * cell
    for (let ix = 0; ix < cols; ix++) {
      const px = minX + (ix + 0.5) * cell
      const i = iz * cols + ix
      if (!pointInRoom(room, px, pz)) {
        values[i] = MASKED
        continue
      }
      let direct = 0
      for (const l of roomLights)
        direct += pointIlluminance(l, px, pz, planeHeight, opts.iesShape) * fixtureLevel
      let lux = direct
      for (const win of roomWindows) lux += windowIlluminance(win, px, pz) * daylightLevel
      // Belt-and-braces: the texture path must never see NaN/Infinity.
      values[i] = Number.isFinite(lux) ? lux : 0
      directSum += Number.isFinite(direct) ? direct : 0
      inRoomCells += 1
    }
  }

  // Pass 2: uniform indirect term — lift the mean DIRECT level to the
  // lumen-method room average (`estimateRoomLux`'s number), so the heatmap's
  // fixture component averages to exactly what the 2D table reports. Zero
  // when direct alone already reaches it (tiny room, low bulb).
  const area = planRoomArea(room)
  let ambient = 0
  if (inRoomCells > 0 && area > 0 && roomLights.length > 0) {
    const lumens = roomLights.reduce((sum, l) => sum + planLightLumens(l), 0)
    const lumenAvg = ((lumens * UTILISATION_FACTOR) / area) * fixtureLevel
    ambient = Math.max(0, lumenAvg - directSum / inRoomCells)
  }
  for (let i = 0; i < values.length; i++) {
    if (values[i] === MASKED) continue
    values[i] += ambient
  }

  // Pass 3: inter-room bleed through open doorways (R-BLEED). Each source adds
  // its borrowed room-MEAN distributed with the directional (facing + distance)
  // weight, normalised to unit mean over the in-room cells — so the per-room
  // average gained equals `estimateRoomLux`'s borrowed term (the lumen-method
  // lock-step holds) while the SPATIAL distribution pools near/in front of the
  // doorway and fades around corners.
  if (inRoomCells > 0) {
    const weight = new Float32Array(cols * rows)
    for (const src of bleed) {
      if (!(src.meanLux > 0)) continue
      let sumW = 0
      for (let iz = 0; iz < rows; iz++) {
        const pz = minZ + (iz + 0.5) * cell
        for (let ix = 0; ix < cols; ix++) {
          const i = iz * cols + ix
          if (values[i] === MASKED) continue
          const px = minX + (ix + 0.5) * cell
          const wgt = directionalBleedWeight(src.center, src.inwardNormal, px, pz)
          weight[i] = wgt
          sumW += wgt
        }
      }
      // Mean-preserving: Σ addedᵢ = meanLux · inRoomCells (so mean added = meanLux).
      // Degenerate lobe (no cell faces the door) → fall back to a uniform lift.
      const norm = sumW > 1e-9 ? (src.meanLux * inRoomCells) / sumW : 0
      for (let i = 0; i < values.length; i++) {
        if (values[i] === MASKED) continue
        values[i] += norm > 0 ? weight[i] * norm : src.meanLux
      }
    }
  }

  // Min / mean / uniformity over the IN-ROOM cells only — a masked cell is
  // outside the room, not a dark spot, so folding it in would report a
  // uniformity of ~0 for every non-rectangular room.
  let maxLux = 0
  let minLux = Number.POSITIVE_INFINITY
  let sum = 0
  let count = 0
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v === MASKED) continue
    if (v > maxLux) maxLux = v
    if (v < minLux) minLux = v
    sum += v
    count += 1
  }
  const meanLux = count > 0 ? sum / count : 0
  return {
    roomId: room.id,
    x0: minX,
    z0: minZ,
    cols,
    rows,
    cell,
    values,
    maxLux,
    minLux: count > 0 ? minLux : 0,
    meanLux,
    uniformity: meanLux > 0 ? (count > 0 ? minLux : 0) / meanLux : 0,
    planeHeight,
  }
}

export interface LevelLuxGrids {
  levelId: string
  /** Floor-slab elevation of the storey (m); the overlay renders at this + ε. */
  elevation: number
  grids: RoomLuxGrid[]
}

/**
 * Grids for every room on every level visible under the View→Levels selection
 * (multi-storey: each storey's rooms light from ITS fixtures/windows at ITS
 * elevation — same scoping as `estimateRoomLux` / `FurnitureLayer`).
 */
export function buildLuxGrids(
  plan: FloorPlan,
  lights: PlanLight[],
  viewLevelId: string,
  opts: LuxGridOptions,
): LevelLuxGrids[] {
  const levels = planLevels(plan).length > 1 ? visibleLevels(plan, viewLevelId) : planLevels(plan)
  const fixtureLevel = clamp01(opts.fixtureLevel)
  const doors = opts.doors ?? {}
  return levels.map((level) => {
    const levelLights = itemsOnLevel(lights, level.id)
    const windows = planWindowSources(levelAsPlan(plan, level))

    // Per-room OWN-fixture lux (lumen method at the current fixture level) — the
    // source term neighbours borrow from through open doorways (first-degree).
    const ownLux = new Map<string, number>()
    if (fixtureLevel > 0) {
      for (const room of level.rooms) {
        const area = planRoomArea(room)
        if (area <= 0) continue
        const lumens = levelLights.reduce(
          (sum, l) => (pointInRoom(room, l.x, l.z) ? sum + planLightLumens(l) : sum),
          0,
        )
        ownLux.set(room.id, ((lumens * UTILISATION_FACTOR) / area) * fixtureLevel)
      }
    }
    const bleedByRoom = new Map<string, RoomBleedSource[]>()
    if (fixtureLevel > 0) {
      for (const src of interRoomDoorwaySources(level.rooms, level.walls, level.openings, doors)) {
        const meanLux = bleedMeanLux(ownLux.get(src.sourceId) ?? 0, src.aperture, src.open)
        if (meanLux <= 0) continue
        const list = bleedByRoom.get(src.receiverId) ?? []
        list.push({ center: src.center, inwardNormal: src.inwardNormal, meanLux })
        bleedByRoom.set(src.receiverId, list)
      }
    }

    const grids: RoomLuxGrid[] = []
    for (const room of level.rooms) {
      // Plane: `workPlane` opts each room onto ITS OWN work plane (a kitchen
      // worktop is not a bathroom floor) for ANALYSIS. It is opt-in because
      // the default consumer is the 3D FLOOR heatmap (`scene/LuxOverlay.tsx`)
      // — painting worktop illuminance onto the floor would misrepresent it.
      // An explicit `planeHeight` still wins over both.
      const grid = buildRoomLuxGrid(
        room,
        levelLights,
        windows,
        {
          ...opts,
          planeHeight:
            opts.planeHeight ?? (opts.workPlane ? WORK_PLANE_HEIGHT_M[roomLuxKind(room)] : 0),
        },
        bleedByRoom.get(room.id) ?? [],
      )
      if (grid) grids.push(grid)
    }
    return { levelId: level.id, elevation: level.elevation, grids }
  })
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}

/** One room's uniformity assessment, for the lighting sheet's table. */
export interface RoomUniformity {
  roomId: string
  /** U0 = Emin/Eavg over the room's in-room cells. */
  u0: number
  /** Minimum acceptable U0 for the room's kind (`roomLux.ts:MIN_UNIFORMITY`). */
  minU0: number
  pass: boolean
  /** Plane the grid was sampled on (m) — 0 = floor. */
  planeHeight: number
}

/**
 * Per-room uniformity for the DESIGN condition — fixtures at full, no daylight,
 * every room on its own work plane. This is the condition a lighting spec is
 * written for: "does the artificial installation meet its target?", not "how
 * does the room look at 4pm".
 *
 * Keyed by room id so a caller can join it to `estimateRoomLux`'s rows without
 * re-deriving anything.
 */
export function buildRoomUniformity(
  plan: FloorPlan,
  lights: PlanLight[],
  iesShape?: IesShapeResolver,
): Map<string, RoomUniformity> {
  const out = new Map<string, RoomUniformity>()
  const levels = buildLuxGrids(plan, lights, GROUND_LEVEL_ID, {
    fixtureLevel: 1,
    daylightLevel: 0,
    workPlane: true,
    ...(iesShape ? { iesShape } : {}),
  })
  for (const level of levels) {
    for (const g of level.grids) {
      const room = allPlanRooms(plan).find((r) => r.id === g.roomId)
      if (!room) continue
      const minU0 = MIN_UNIFORMITY[roomLuxKind(room)]
      out.set(g.roomId, {
        roomId: g.roomId,
        u0: g.uniformity,
        minU0,
        // A fully dark room has no meaningful uniformity — do not fail it for
        // that; the room-average `status` already reports it as `low`.
        pass: g.meanLux <= 0 || g.uniformity >= minU0,
        planeHeight: g.planeHeight,
      })
    }
  }
  return out
}
