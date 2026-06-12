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

import { itemsOnLevel, levelAsPlan, planLevels, visibleLevels } from '../floorplan/levels'
import {
  type FloorPlan,
  type PlanRoom,
  planRoomArea,
  pointInRoom,
  roomPolygon,
  wallLength,
} from '../floorplan/types'
import type { PlanLight } from './lightingPlan'
import { planLightLumens, SCENE_INTENSITY_CALIBRATION, UTILISATION_FACTOR } from './roomLux'

/** Default sample spacing (m). Fine enough to show lamp pools, coarse enough
 *  that a whole flat is a few thousand samples. */
export const LUX_GRID_CELL = 0.25

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
export const DAYLIGHT_REF_GLAZING = 1.5

/** Distance (m) into the room at which the daylight wash halves. */
export const DAYLIGHT_HALF_DEPTH = 1.8

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
}

export interface LuxGridOptions {
  /** Fixture contribution 0–1 (night = 1, daylight = 0, or lights-mode override). */
  fixtureLevel: number
  /** Daylight contribution 0–1 (inverse of the above in auto mode). */
  daylightLevel: number
  /** Sample spacing (m); defaults to {@link LUX_GRID_CELL}. */
  cell?: number
}

/** Every window of a (single-level pseudo-)plan as a daylight source. */
export function planWindowSources(plan: FloorPlan): WindowSource[] {
  const out: WindowSource[] = []
  for (const o of plan.openings) {
    if (o.kind !== 'window') continue
    const wall = plan.walls.find((w) => w.id === o.wallId)
    if (!wall) continue
    const len = wallLength(wall)
    if (len <= 0) continue
    const dx = (wall.end[0] - wall.start[0]) / len
    const dz = (wall.end[1] - wall.start[1]) / len
    const along = Math.min(Math.max(o.offset + o.width / 2, 0), len)
    const x = wall.start[0] + dx * along
    const z = wall.start[1] + dz * along
    const glazing = Math.max(0, o.width) * Math.max(0, o.head - o.sill)
    if (glazing <= 0) continue
    // Wall normal (either side — the room test picks the interior one).
    const nx = -dz
    const nz = dx
    out.push({
      x,
      z,
      glazing,
      probes: [
        [x + nx * WINDOW_PROBE_OFFSET, z + nz * WINDOW_PROBE_OFFSET],
        [x - nx * WINDOW_PROBE_OFFSET, z - nz * WINDOW_PROBE_OFFSET],
      ],
    })
  }
  return out
}

/** Direct illuminance (lx) at a floor point from one fixture: inverse-square
 *  with cosine incidence, using the calibrated registry candela. */
export function pointIlluminance(
  light: Pick<PlanLight, 'x' | 'z' | 'height' | 'intensity'>,
  px: number,
  pz: number,
): number {
  const h = Math.max(0.05, light.height)
  const dx = px - light.x
  const dz = pz - light.z
  const d2 = h * h + dx * dx + dz * dz
  const candela = light.intensity * SCENE_INTENSITY_CALIBRATION
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
      for (const l of roomLights) direct += pointIlluminance(l, px, pz) * fixtureLevel
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
  let maxLux = 0
  for (let i = 0; i < values.length; i++) {
    if (values[i] === MASKED) continue
    values[i] += ambient
    if (values[i] > maxLux) maxLux = values[i]
  }
  return { roomId: room.id, x0: minX, z0: minZ, cols, rows, cell, values, maxLux }
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
  return levels.map((level) => {
    const levelLights = itemsOnLevel(lights, level.id)
    const windows = planWindowSources(levelAsPlan(plan, level))
    const grids: RoomLuxGrid[] = []
    for (const room of level.rooms) {
      const grid = buildRoomLuxGrid(room, levelLights, windows, opts)
      if (grid) grids.push(grid)
    }
    return { levelId: level.id, elevation: level.elevation, grids }
  })
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}
