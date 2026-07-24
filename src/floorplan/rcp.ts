/**
 * Reflected Ceiling Plan (RCP) core — canonical drawing #4 (TODO H4). Reuses the
 * existing model wholesale rather than inventing a parallel one:
 *
 *  - **Ceiling zones**: `PlanRoom.ceiling`/`ceilingHeight` fed straight into the
 *    SAME geometry engine the 3D scene renders from (`apartment/ceiling/
 *    ceilingModel.ts:buildCeiling`) — so a printed "FFL to false ceiling: 2450mm"
 *    note and inset border/box rect can never drift from what the room actually
 *    shows in 3D. `buildCeiling` is pure (no three/React), so importing it here
 *    doesn't pull any rendering weight into this module.
 *  - **Ceiling-mounted fixtures**: the SAME `PlanLight[]` the lighting plan (LP2)
 *    already derives from placed furniture (`lighting2d/lightingPlan.ts:
 *    buildLightingPlan`) — filtered here to the ceiling-mounted subset
 *    (`CEILING_FIXTURE_TYPES`; floor/table lamps, sconces, vanity bulbs etc are
 *    NOT ceiling fixtures and are excluded).
 *  - **Aircon points**: the SAME persisted/heuristic `PlanElectricalPoint[]` the
 *    electrical plan draws, filtered to `kind === 'aircon'` — the RCP just marks
 *    them for cross-reference (the electrical plan carries their full schedule).
 *
 * Self-contained beyond `./types` + `apartment/ceiling/ceilingModel` (pure) +
 * `lighting2d/lightingPlan`'s `PlanLight` type. No three/React imports.
 */

import { buildAirconSystemPlan } from '../analysis/airconSystem'
import { buildAirconTrunkingPlan, resolveAirconTrunkingInput } from '../analysis/airconTrunking'
import { buildCeiling, ceilingStyleLabel } from '../apartment/ceiling/ceilingModel'
import { isFeatureEnabled } from '../features/featureFlags'
import { CORNICE_MIN_M, MIN_FINISHED_CLEARANCE_M } from './ceilingClearance'
import { electricalMountDefaultMm } from './mepPoints'
import type { CeilingStyle, FloorPlan, PlanRoom, PlanVec2, PlanWall } from './types'
import { roomPolygon, wallLength } from './types'

/** Furniture types (matches `PlanLight.type`, itself the item's furniture-def
 *  key) that are ceiling-MOUNTED fixtures — the family this plan marks, as
 *  opposed to floor/table lamps, wall sconces, or the vanity's mirror bulbs.
 *  Mirrors `furniture/lightEmitters.ts`'s `LIGHT_EMITTERS` registry. */
export const CEILING_FIXTURE_TYPES = new Set(['ceiling-light', 'ceiling-fan', 'cove-light'])

/** Minimal shape this module needs from a lighting-plan fixture — kept
 *  structural (not importing `PlanLight` as a value) so this file has no
 *  runtime dependency on `lighting2d/lightingPlan.ts`. */
export interface RcpFixtureInput {
  id: string
  type: string
  label: string
  x: number
  z: number
  levelId?: string
}

/** Minimal shape this module needs from an electrical point (aircon marking
 *  only) — structural, not `PlanElectricalPoint`/`electricalPlan.ts`'s
 *  `ElectricalPoint`, so either shape (persisted or the export-time schedule
 *  builder's stripped-id copy) can be passed straight through without an
 *  adapter. */
export interface RcpAirconInput {
  x: number
  z: number
  kind: string
  mountHeightMm?: number
  label?: string
}

/** A dimensioned rect (world metres) — used for a tray/dropped treatment's
 *  inset border/box outline. */
export interface RcpRect {
  cx: number
  cz: number
  w: number
  d: number
}

/** One room's ceiling zone: its resolved flat ceiling height, an optional
 *  treatment (only present when the geometry engine actually applied one —
 *  a non-rectangular room or too-low ceiling falls back to flat, same as the
 *  3D render), and a print-ready one-line note. */
interface RcpZone {
  roomId: string
  roomName: string
  outline: PlanVec2[]
  /** Flat ceiling height (mm, AFFL) — the room's "head height" regardless of
   *  any treatment (a tray's raised centre panel sits AT this height). */
  ceilingHeightMm: number
  treatment?: {
    style: Exclude<CeilingStyle, 'flat'>
    /** Lowest finished surface the treatment introduces (mm, AFFL) — the
     *  number a contractor needs ("FFL to false ceiling: …"). */
    dropToMm: number
    /** Inset border/box rect (tray's raised centre / dropped's soffit) —
     *  absent for coffered (drawn as a beam grid instead) and sloped (a
     *  single pitched plane, no rect). */
    rect?: RcpRect
    /** Coffered beam-grid strips (perimeter + internal dividers). */
    beams?: RcpRect[]
  }
  /** e.g. "FFL to clg: 2600mm" (flat) or "FFL to false ceiling: 2450mm (Tray)". */
  note: string
  /** Finished-headroom clearance check (R4-2), attached ONLY when the
   *  `ceilingClearance` feature flag is on AND the room has a real (non-flat,
   *  non-fallback) treatment — so the sheet can print a headroom readout and a
   *  warning marking when the finished clearance falls below the SG minimum.
   *  Absent for flat / untreated / fallback zones (nothing to warn). */
  clearance?: {
    /** Finished clearance under the treatment's lowest surface (mm AFFL) —
     *  equal to `treatment.dropToMm`. */
    headroomMm: number
    /** Below the 2.4 m SG minimum finished clearance. */
    warn: boolean
    /** Below even the ~2.1 m cornice floor. */
    belowCornice: boolean
  }
}

/** One ceiling fixture, positioned + dimensioned off the nearest wall on each
 *  axis (RCP convention — the two figures a contractor cross-checks a fixture
 *  against on site). Centreline distance (not face-offset): unlike the
 *  setting-out sheet's chained dimensions (`settingOut.ts`, wall-FACE precision
 *  for partition setout), a ceiling point only needs to read "roughly here off
 *  that wall" — the electrical/lighting plans use the same centreline
 *  convention for their own points. */
export interface RcpFixture {
  id: string
  type: string
  label: string
  x: number
  z: number
  levelId?: string
  /** Nearest wall running along Z (i.e. a "vertical", constant-x wall) —
   *  gives an X-axis offset. `null` when the storey has no such wall. */
  dimX: { faceX: number; distance: number } | null
  /** Nearest wall running along X (constant-z) — gives a Z-axis offset. */
  dimZ: { faceZ: number; distance: number } | null
}

/** One aircon MEP point, marked for cross-reference (full schedule lives on
 *  the electrical plan). */
interface RcpAircon {
  x: number
  z: number
  mountHeightMm: number
  label?: string
}

/** One RESOLVED trunking run for the RCP overlay (BSJ-2 follow-up) — a dashed
 *  polyline in plan projection [x,z] (the 3D route's Y is dropped, since a
 *  reflected ceiling plan is a top-down view) + its length for the caption. */
export interface RcpTrunkingRun {
  systemIndex: number
  roomName: string
  points: PlanVec2[]
  lengthM: number
}

export interface ReflectedCeilingPlan {
  zones: RcpZone[]
  fixtures: RcpFixture[]
  aircon: RcpAircon[]
  /** Modeled refrigerant-trunking routes (BSJ-2 follow-up), resolved runs
   *  only — empty when the `airconTrunking` flag is off or nothing resolves. */
  trunking: RcpTrunkingRun[]
}

/** The nearest wall of the given orientation (`'x'` = a wall running along Z,
 *  giving an X-axis offset; `'z'` = a wall running along X, giving a Z-axis
 *  offset), by centreline coordinate. `null` when no wall of that orientation
 *  exists. Axis-aligned walls only (a diagonal wall has no single offset
 *  coordinate on either axis, same limitation as `settingOut.ts`). */
function nearestAxisWall(
  x: number,
  z: number,
  walls: PlanWall[],
  axis: 'x' | 'z',
): { coord: number; distance: number } | null {
  const EPS = 1e-4
  let best: { coord: number; distance: number } | null = null
  for (const w of walls) {
    if (wallLength(w) <= 0) continue
    const dx = w.end[0] - w.start[0]
    const dz = w.end[1] - w.start[1]
    if (axis === 'x') {
      if (Math.abs(dx) > EPS) continue // not a constant-x (vertical) wall
      const coord = (w.start[0] + w.end[0]) / 2
      const d = Math.abs(x - coord)
      if (!best || d < best.distance) best = { coord, distance: d }
    } else {
      if (Math.abs(dz) > EPS) continue // not a constant-z (horizontal) wall
      const coord = (w.start[1] + w.end[1]) / 2
      const d = Math.abs(z - coord)
      if (!best || d < best.distance) best = { coord, distance: d }
    }
  }
  return best
}

const MIN_FINISHED_CLEARANCE_MM = Math.round(MIN_FINISHED_CLEARANCE_M * 1000)
const CORNICE_MIN_MM = Math.round(CORNICE_MIN_M * 1000)

/** The clearance sub-object for a treated zone, or `undefined` when the
 *  `ceilingClearance` flag is off (so the annotation stays feature-gated
 *  without touching this sheet's caller). `dropToMm` is the finished clearance
 *  (mm AFFL) under the treatment's lowest surface. */
function clearanceOf(withClearance: boolean, dropToMm: number): RcpZone['clearance'] {
  if (!withClearance) return undefined
  return {
    headroomMm: dropToMm,
    warn: dropToMm < MIN_FINISHED_CLEARANCE_MM,
    belowCornice: dropToMm < CORNICE_MIN_MM,
  }
}

/** Build one room's ceiling zone via the shared 3D geometry engine.
 *  `withClearance` gates the R4-2 finished-headroom check annotation. */
function buildZone(room: PlanRoom, defaultCeilingHeightM: number, withClearance: boolean): RcpZone {
  const ceilM = typeof room.ceilingHeight === 'number' ? room.ceilingHeight : defaultCeilingHeightM
  const ceilingHeightMm = Math.round(ceilM * 1000)
  const outline = roomPolygon(room)
  const config = room.ceiling
  const flat: RcpZone = {
    roomId: room.id,
    roomName: room.name,
    outline,
    ceilingHeightMm,
    note: `FFL to clg: ${ceilingHeightMm}mm`,
  }
  if (!config || config.style === 'flat') return flat

  const model = buildCeiling(outline, ceilM, config)
  if (model.fallback) {
    // The geometry engine couldn't apply the treatment (non-rectangular room /
    // ceiling too low) — same fallback the 3D render uses; the printed sheet
    // must not claim a treatment that isn't actually built.
    return {
      ...flat,
      note: `${flat.note} (treatment not applied — verify room shape/height on site)`,
    }
  }

  const dropToMm = Math.round(model.lowestY * 1000)
  const label = ceilingStyleLabel(config)
  if (config.style === 'sloped') {
    return {
      ...flat,
      treatment: { style: 'sloped', dropToMm },
      note: `FFL to clg: ${ceilingHeightMm}mm at high edge, ${dropToMm}mm at low edge (${label})`,
      clearance: clearanceOf(withClearance, dropToMm),
    }
  }

  const inner = model.parts.find(
    (p) => p.kind === 'plane' && (p.role === 'centre' || p.role === 'soffit'),
  ) as { cx: number; cz: number; w: number; d: number } | undefined
  const beams =
    config.style === 'coffered'
      ? (model.parts.filter((p) => p.kind === 'plane' && p.role === 'beam') as {
          cx: number
          cz: number
          w: number
          d: number
        }[])
      : undefined

  return {
    ...flat,
    treatment: {
      style: config.style as Exclude<CeilingStyle, 'flat'>,
      dropToMm,
      rect: inner ? { cx: inner.cx, cz: inner.cz, w: inner.w, d: inner.d } : undefined,
      beams: beams?.map((b) => ({ cx: b.cx, cz: b.cz, w: b.w, d: b.d })),
    },
    note: `FFL to false ceiling: ${dropToMm}mm (${label})`,
    clearance: clearanceOf(withClearance, dropToMm),
  }
}

/** Minimal shape this module needs to re-derive the trunking route — a placed
 *  (or heuristic-fallback) furniture item, structural like `RcpAirconInput`
 *  above so this file stays free of a `furniture/types.ts` dependency. */
export interface RcpTrunkingItemInput {
  defId: string
  roomId?: string
  position: [number, number]
}

/**
 * Build the reflected ceiling plan for one storey (caller resolves the storey
 * via `levels.ts:levelAsPlan`, matching every other per-storey plan builder in
 * this codebase — `buildElectricalPlan`/`buildPlumbingPlan`). `fixtures` and
 * `electricalPoints` are the caller's already-level-filtered lists (e.g.
 * `itemsOnLevel(lighting.lights, level.id)`), mirroring the lighting/electrical
 * sheet loops in `ui/drawingSet.ts`. `trunkingItems`/`orientationDeg` (optional,
 * whole-flat — the aircon system planner and its routes aren't level-filtered
 * the way fixtures/points are) drive the trunking overlay when the
 * `airconTrunking` flag is on; omitted/flag-off ⇒ `trunking: []`, unchanged
 * from before this field existed.
 */
export function buildReflectedCeilingPlan(
  plan: FloorPlan,
  fixtures: RcpFixtureInput[],
  electricalPoints: RcpAirconInput[],
  trunkingItems: RcpTrunkingItemInput[] = [],
  orientationDeg = 0,
): ReflectedCeilingPlan {
  const rooms = Array.isArray(plan.rooms) ? plan.rooms : []
  const walls = Array.isArray(plan.walls) ? plan.walls : []
  const defaultCeilingHeightM = typeof plan.ceilingHeight === 'number' ? plan.ceilingHeight : 2.6

  // R4-2 finished-headroom check is feature-gated here (not in the caller): the
  // clearance annotation data is only attached when `ceilingClearance` is on.
  const withClearance = isFeatureEnabled('ceilingClearance')
  const zones = rooms.map((r) => buildZone(r, defaultCeilingHeightM, withClearance))

  const ceilingFixtures: RcpFixture[] = (Array.isArray(fixtures) ? fixtures : [])
    .filter((f) => CEILING_FIXTURE_TYPES.has(f.type))
    .map((f) => {
      const nx = nearestAxisWall(f.x, f.z, walls, 'x')
      const nz = nearestAxisWall(f.x, f.z, walls, 'z')
      return {
        id: f.id,
        type: f.type,
        label: f.label,
        x: f.x,
        z: f.z,
        levelId: f.levelId,
        dimX: nx ? { faceX: nx.coord, distance: nx.distance } : null,
        dimZ: nz ? { faceZ: nz.coord, distance: nz.distance } : null,
      }
    })

  const aircon: RcpAircon[] = (Array.isArray(electricalPoints) ? electricalPoints : [])
    .filter((p) => p.kind === 'aircon')
    .map((p) => ({
      x: p.x,
      z: p.z,
      mountHeightMm:
        typeof p.mountHeightMm === 'number' ? p.mountHeightMm : electricalMountDefaultMm('aircon'),
      label: p.label,
    }))

  // Trunking overlay (BSJ-2 follow-up), gated on its own flag — same
  // resolved-only convention as the 3D renderer (an unresolved run keeps only
  // the DaylightPanel advisory text, never a partial/guessed line on a sheet).
  let trunking: RcpTrunkingRun[] = []
  if (isFeatureEnabled('airconTrunking')) {
    const systemPlan = buildAirconSystemPlan(plan, orientationDeg)
    if (systemPlan.systems.length > 0) {
      const input = resolveAirconTrunkingInput(plan, systemPlan, trunkingItems)
      const routed = buildAirconTrunkingPlan(plan, systemPlan, input)
      trunking = routed.runs
        .filter((r) => r.resolved)
        .map((r) => ({
          systemIndex: r.systemIndex,
          roomName: r.roomName,
          points: r.waypoints.map(([x, , z]) => [x, z] as PlanVec2),
          lengthM: r.lengthM,
        }))
    }
  }

  return { zones, fixtures: ceilingFixtures, aircon, trunking }
}
