/**
 * Floor build-up + the HDB thickness limits, and the FFL that FOLLOWS from them.
 *
 * **The gap this closes.** `PlanRoom.floorLevelMm` drives the FFL tags, doorway
 * step markers and kerb advisory (`floorplan/floorLevels.ts`), the 3D risers
 * (`floorLevels3d.ts`) and the tiler pack — and it is entirely HAND-ENTERED.
 * `MaterialDef` carried no thickness, so specifying 15 mm bedded porcelain in
 * the living room against 7 mm LVT in the bedroom told the app nothing: it
 * could not report the 8 mm step at the doorway between them. The user had to
 * already know the answer they came to the plan for. A designer works the other
 * way round — you specify finishes, and the levels fall out of the build-ups.
 *
 * **Two HDB limits, and they are written against different sums.**
 *
 *  - **50 mm** — "the combined thickness of the floor finish and screed must not
 *    exceed 50mm", and it is a limit on the TOTAL: existing finishes plus new
 *    flooring, not just the layer being added.
 *  - **13 mm** — laying new tiles over an existing finish with adhesive, "only
 *    one layer of existing finish may be present, and the total thickness of the
 *    new tiles plus adhesive must not exceed 13 mm".
 *
 * Which one applies is decided by `FloorPlan.intakeState`, because that is what
 * says whether an existing finish is still there:
 *
 *  | Intake | Existing layer | Limit |
 *  |---|---|---|
 *  | `bto-bare` | none (bare screed) | 50 mm |
 *  | `resale-stripout` | none in dry rooms (hacked) | 50 mm |
 *  | `bto-ocs` | OCS vinyl/porcelain | 13 mm overlay |
 *  | `resale-asis` | previous owner's finish | 13 mm overlay |
 *
 * **This module states limits; it does not grant approval.** Every finding is
 * worded as something to verify with HDB or the contractor, because the app
 * knows the specified build-up and not the site: the existing finish's real
 * thickness, whether a previous owner already overlaid once, and how level the
 * slab is all change the answer. The 13 mm rule's "only one layer of existing
 * finish" condition in particular is a site fact the model cannot see.
 *
 * Sources: `docs/research/2026-09-03-floor-build-up.md`. Pure — no store, no
 * three, no DOM.
 */

import { roomFloorLevelMm } from '../floorplan/floorLevels'
import { allPlanRooms, planLevels } from '../floorplan/levels'
import { roomsAcrossOpening } from '../floorplan/openingProbe'
import { roomCategory } from '../floorplan/roomCategory'
import type { FloorPlan, IntakeStateId, PlanRoom, RoomCategory } from '../floorplan/types'
import type { MaterialDef } from '../materials/types'

/** "The combined thickness of the floor finish and screed must not exceed 50mm." */
export const HDB_MAX_BUILD_UP_MM = 50
/** "New tiles plus adhesive must not exceed 13 mm" when overlaying one existing layer. */
export const HDB_MAX_OVERLAY_MM = 13
/**
 * A doorway step worth drawing a threshold detail for (mm).
 *
 * Not a regulation — a documentation threshold. Below this the transition strip
 * absorbs it and a step marker would be noise on every doorway in the flat;
 * at or above it the contractor needs a detail. Chosen to sit under the
 * smallest step the catalogue can actually produce between two specified
 * finishes (15 mm bedded tile vs 7 mm LVT = 8 mm), so a real finish change is
 * never silently below the bar.
 */
export const STEP_REPORTING_MIN_MM = 5

/** Categories whose floor must not fall toward a dry room. Matches
 *  `floorLevels.ts:KERB_CATEGORIES` — the same rooms, a stricter question. */
const WET_CATEGORIES: ReadonlySet<RoomCategory> = new Set<RoomCategory>(['bath', 'powder'])

/** Intake states that leave an existing floor finish in place. */
const OVERLAY_INTAKE: ReadonlySet<IntakeStateId> = new Set<IntakeStateId>([
  'bto-ocs',
  'resale-asis',
])

/** Probe offset (m) either side of a door — matches `floorLevels.ts`. */
const PROBE_OFFSET = 0.2

export interface RoomBuildUp {
  roomId: string
  roomName: string
  levelId: string
  materialId: string
  materialName: string
  /** The finish's own thickness (mm). */
  finishMm: number
  /** Bedding: adhesive, screed, underlay (mm). */
  beddingMm: number
  /** `finishMm + beddingMm` — what the limits are measured against. */
  totalMm: number
  /** Which limit applies to this plan, and whether the build-up clears it. */
  limitMm: number
  withinLimit: boolean
  /** The FFL this build-up implies, relative to the THINNEST room in the home. */
  derivedFflMm: number
  /** What the user declared, if anything (`PlanRoom.floorLevelMm`). */
  declaredFflMm: number | null
  note?: string
}

export interface DoorwayStep {
  openingId: string
  /** The two rooms, in the order the probe found them. */
  roomAName: string
  roomBName: string
  /** Level difference implied by the two build-ups (mm, always positive). */
  stepMm: number
  /** The higher of the two, by name. */
  higherRoomName: string
}

export interface FloorBuildUpReport {
  /** Which limit this plan is assessed against, and why. */
  limitMm: number
  overlay: boolean
  intakeState: IntakeStateId | null
  rows: RoomBuildUp[]
  /** Rooms whose finish carries no specified build-up — stated, never assumed. */
  unassessedRooms: string[]
  /** Build-ups over the applicable HDB limit. */
  overLimit: RoomBuildUp[]
  /** Doorways where the two finishes imply a step worth a detail. */
  steps: DoorwayStep[]
  /**
   * Rooms where the DERIVED level and the DECLARED `floorLevelMm` disagree by
   * more than a millimetre. This is the finding a contractor most wants: the
   * drawing says one thing and the specified finishes say another, and one of
   * them is wrong before anyone mixes screed.
   */
  declaredMismatches: Array<{ roomName: string; declaredMm: number; derivedMm: number }>
  /**
   * Wet rooms whose DERIVED floor sits ABOVE the dry room across the doorway,
   * so the fall is out of the bathroom and into the bedroom.
   *
   * This is the finding the build-up derivation exists for, and the existing
   * kerb advisory in `floorplan/floorLevels.ts` cannot produce it: that one
   * fires when a wet room is at the SAME level as its neighbour, which is
   * already the benign end of the problem. A wet room 8 mm HIGH is the
   * malignant end, and it is invisible until the finishes' build-ups are
   * compared — 15 mm bedded porcelain against 7 mm LVT does it, which is the
   * single most ordinary finish pairing in an HDB flat and exactly what the
   * shipped default flat specifies.
   */
  wetRoomsFallingOutward: Array<{
    wetRoomName: string
    dryRoomName: string
    aboveByMm: number
    openingId: string
  }>
}

function buildUpOf(
  room: PlanRoom,
  floorFinishes: Record<string, string | undefined>,
  materials: Record<string, MaterialDef | undefined>,
): { mat: MaterialDef; finishMm: number; beddingMm: number } | null {
  const matId = floorFinishes[room.id]
  const mat = matId ? materials[matId] : undefined
  if (!mat?.buildUp) return null
  const { finishMm, beddingMm } = mat.buildUp
  if (!Number.isFinite(finishMm) || !Number.isFinite(beddingMm)) return null
  if (finishMm < 0 || beddingMm < 0) return null
  return { mat, finishMm, beddingMm }
}

/**
 * Build-up, limit compliance, derived FFL and doorway steps for every room on
 * every storey.
 *
 * Whole-home (F13): reads `allPlanRooms`, never `plan.rooms`, so an upstairs
 * bathroom's build-up is assessed too. Doorway steps are resolved PER STOREY,
 * because `roomsAcrossOpening` matches on proximity in XZ and a door upstairs
 * would otherwise pair with the room beneath it.
 */
export function buildFloorBuildUpReport(
  plan: FloorPlan,
  floorFinishes: Record<string, string | undefined>,
  materials: Record<string, MaterialDef | undefined>,
): FloorBuildUpReport {
  const intakeState = plan.intakeState ?? null
  const overlay = intakeState !== null && OVERLAY_INTAKE.has(intakeState)
  const limitMm = overlay ? HDB_MAX_OVERLAY_MM : HDB_MAX_BUILD_UP_MM

  const rows: RoomBuildUp[] = []
  const unassessedRooms: string[] = []
  const byRoomId = new Map<string, RoomBuildUp>()

  for (const level of planLevels(plan)) {
    for (const room of level.rooms) {
      const b = buildUpOf(room, floorFinishes, materials)
      if (!b) {
        unassessedRooms.push(room.name)
        continue
      }
      const totalMm = b.finishMm + b.beddingMm
      const declared = typeof room.floorLevelMm === 'number' ? roomFloorLevelMm(room) : null
      const row: RoomBuildUp = {
        roomId: room.id,
        roomName: room.name,
        levelId: level.id,
        materialId: b.mat.id,
        materialName: b.mat.name,
        finishMm: b.finishMm,
        beddingMm: b.beddingMm,
        totalMm,
        limitMm,
        withinLimit: totalMm <= limitMm,
        // Filled in below, once the whole-home minimum is known.
        derivedFflMm: 0,
        declaredFflMm: declared,
        note: b.mat.buildUp?.note,
      }
      rows.push(row)
      byRoomId.set(room.id, row)
    }
  }

  // Derived FFL is RELATIVE — the thinnest build-up in the home is the datum, so
  // every other room reads as a positive step above it. An absolute figure would
  // need the slab level, which the model does not have; a relative one is what a
  // threshold detail is actually dimensioned from.
  if (rows.length > 0) {
    const thinnest = Math.min(...rows.map((r) => r.totalMm))
    for (const r of rows) r.derivedFflMm = r.totalMm - thinnest
  }

  const steps: DoorwayStep[] = []
  for (const level of planLevels(plan)) {
    const wallById = new Map(level.walls.map((w) => [w.id, w] as const))
    for (const op of level.openings) {
      if (op.kind !== 'door') continue
      const wall = wallById.get(op.wallId)
      if (!wall) continue
      // 4th arg is a PERPENDICULAR probe distance, not `op.offset` (an
      // along-wall position with the same spelling and the same type) — the
      // confusion that got the parameter renamed to `probeOffsetM`.
      const pair = roomsAcrossOpening(level.rooms, wall, op, PROBE_OFFSET)
      const ra = pair?.plus ? byRoomId.get(pair.plus.id) : undefined
      const rb = pair?.minus ? byRoomId.get(pair.minus.id) : undefined
      if (!ra || !rb || ra.roomId === rb.roomId) continue
      const stepMm = Math.abs(ra.derivedFflMm - rb.derivedFflMm)
      if (stepMm < STEP_REPORTING_MIN_MM) continue
      steps.push({
        openingId: op.id,
        roomAName: ra.roomName,
        roomBName: rb.roomName,
        stepMm,
        higherRoomName: ra.derivedFflMm > rb.derivedFflMm ? ra.roomName : rb.roomName,
      })
    }
  }

  // A declared level is compared against the derived one only where BOTH exist.
  // An unset room is at the implicit datum by `hasExplicitFloorLevel`'s rule, and
  // treating that as a declaration of zero would report a mismatch for every
  // room in a plan nobody has tagged — the noise that makes a check ignorable.
  const declaredMismatches = rows
    .filter((r) => r.declaredFflMm !== null && Math.abs(r.declaredFflMm - r.derivedFflMm) > 1)
    .map((r) => ({
      roomName: r.roomName,
      declaredMm: r.declaredFflMm as number,
      derivedMm: r.derivedFflMm,
    }))

  // A wet room is only a problem if it is HIGHER, so the comparison is signed —
  // the `steps` list above deliberately carries an absolute magnitude, which
  // cannot answer this question. Reusing `steps` and re-deriving the sign from
  // `higherRoomName` would work but couples a safety finding to a display
  // field; the levels are re-read from the rows instead.
  const wetRoomsFallingOutward: FloorBuildUpReport['wetRoomsFallingOutward'] = []
  for (const level of planLevels(plan)) {
    const wallById = new Map(level.walls.map((w) => [w.id, w] as const))
    for (const op of level.openings) {
      if (op.kind !== 'door') continue
      const wall = wallById.get(op.wallId)
      if (!wall) continue
      const pair = roomsAcrossOpening(level.rooms, wall, op, PROBE_OFFSET)
      if (!pair?.plus || !pair.minus) continue
      for (const [wetSide, drySide] of [
        [pair.plus, pair.minus],
        [pair.minus, pair.plus],
      ] as const) {
        if (!WET_CATEGORIES.has(roomCategory(wetSide))) continue
        if (WET_CATEGORIES.has(roomCategory(drySide))) continue
        const w = byRoomId.get(wetSide.id)
        const d = byRoomId.get(drySide.id)
        if (!w || !d) continue
        const aboveByMm = w.derivedFflMm - d.derivedFflMm
        if (aboveByMm < STEP_REPORTING_MIN_MM) continue
        wetRoomsFallingOutward.push({
          wetRoomName: w.roomName,
          dryRoomName: d.roomName,
          aboveByMm,
          openingId: op.id,
        })
      }
    }
  }

  return {
    limitMm,
    overlay,
    intakeState,
    rows,
    unassessedRooms,
    overLimit: rows.filter((r) => !r.withinLimit),
    steps,
    declaredMismatches,
    wetRoomsFallingOutward,
  }
}

/** Total rooms this report could not assess, for a caller's honesty footer. */
export function unassessedCount(report: FloorBuildUpReport): number {
  return report.unassessedRooms.length
}

/** Every room on every storey, for a caller that wants the denominator. */
export function totalRoomCount(plan: FloorPlan): number {
  return allPlanRooms(plan).length
}
