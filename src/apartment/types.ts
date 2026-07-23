export type RoomId =
  | 'mainBedroom'
  | 'bedroom2'
  | 'bedroom3'
  | 'bath1'
  | 'bath2'
  | 'livingDining'
  | 'kitchen'
  | 'corridor'
  | 'serviceYard'
  | 'householdShelter'
  | 'acLedge'

type DoorId = string
type WindowId = string

/** Position in metres from the apartment origin (0,0 at NW external corner, +X east, +Z south). */
export type Vec2 = readonly [number, number]

export interface RoomDef {
  id: RoomId
  name: string
  /** NW corner of the *interior* of the room (after wall thickness). */
  origin: Vec2
  /** Interior width (X-axis). */
  width: number
  /** Interior depth (Z-axis). */
  depth: number
  /** Optional ceiling override; defaults to FLAT.ceilingHeight. */
  ceilingHeight?: number
  external?: boolean
  /** Free-form derivation note for traceability (see spec §6.2). */
  derivation?: string
  /**
   * Optional secondary rectangle for L-shaped rooms (e.g. living/dining that
   * wraps around another space). Offset is relative to the room's `origin`.
   * The two rectangles are treated as a single logical room for finishes,
   * floor rendering, and area accounting.
   */
  extension?: {
    offset: Vec2
    width: number
    depth: number
  }
}

type CutoutKind = 'door' | 'window'

interface Cutout {
  kind: CutoutKind
  /** Distance from wall start at floor level (X-axis along the wall). */
  offset: number
  /** Cutout width along the wall. */
  width: number
  /** Bottom edge height above floor. */
  sill: number
  /** Top edge height above floor. */
  head: number
  /** Reference to the DoorSpec.id (when kind === 'door') or WindowSpec.id (when kind === 'window').
   *  Should always be set in v1 — every cutout has a corresponding spec. */
  refId?: string
}

export interface WallSpec {
  id: string
  start: Vec2
  end: Vec2
  thickness: 'external' | 'internal'
  cutouts: Cutout[]
  /** Optional cap on solid-wall height (e.g. parapets on open balconies/yards).
   *  When unset, walls run from floor to ceiling. */
  topHeight?: number
  /** When true, render an open railing (top rail + balusters) up to `topHeight`
   *  instead of a solid half-wall — only meaningful alongside `topHeight`. */
  railing?: boolean
  /** Structural classification traced from the official HDB floor plan
   *  (assets/floor_plan/default.png legend + assets/floor_plan/walls.jpg):
   *  solid-black fill = structural RC (`'load-bearing'`), the distinct
   *  gable-end lining symbol (walls.jpg legend #3 — the block's exposed
   *  external end wall) = `'gable-end'`, hollow double lines = normal
   *  non-structural partition (`'brick-partition'`). Copied onto
   *  `PlanWall.structure` by `buildDefaultPlan` so the hackability overlay /
   *  demolition sheet seed from the plan's own classification instead of
   *  `'unknown'`. Same value vocabulary as `PlanWall.structure` (kept in
   *  parity; not imported to avoid an apartment → floorplan dependency). */
  structure?:
    | 'load-bearing'
    | 'rc-partition'
    | 'brick-partition'
    | 'drywall'
    | 'gable-end'
    | 'unknown'
  /** Optional explicit thickness (m) for THIS wall, overriding the external/
   *  internal category default (0.2 m / 0.1 m) — for the plan's extra-thick
   *  black structural runs that don't match the flat's usual wall gauge.
   *  Mirrors `PlanWall.thicknessM`; mapped through 1:1 by `buildDefaultPlan`.
   *  First use: `wall-ext-S` is 0.3 m thick, derived from the plan's own
   *  dimension chains — the kitchen band runs 2400 mm centreline-to-
   *  centreline (SY/kitchen partition → south wall) while the kitchen's
   *  annotated INTERIOR depth is 2200 mm: 2400 − 50 (half the 100 mm
   *  partition) − t/2 = 2200 ⇒ t = 300 mm. */
  thicknessM?: number
}

export interface DoorSpec {
  id: DoorId
  /** Wall id this door cuts through. */
  wallId: string
  /** Distance along the wall (must match a Cutout.offset on that wall). */
  offset: number
  width: number
  /** Hinge side relative to wall direction. */
  hinge: 'start' | 'end'
  /** Which side the door swings into. */
  swing: 'left' | 'right'
  /** Initial state. */
  defaultOpen: boolean
  /** Optional leaf style (same vocab as `PlanOpening.style` on a door:
   *  `panel`/`flush`/`glazed`/`bifold`/`sliding`/`double`). Absent → the
   *  pre-existing panelled-timber look (`panel`). */
  style?: string
  /** Optional leaf finish (same vocab as `PlanOpening.material` reused on a
   *  door: `painted`/`wood`/`vinyl`, plus `metal` for a household-shelter
   *  blast door / aluminium-framed glazed door). Absent → the style's
   *  resolved default (`resolveDoorLeafMaterialKind`). */
  material?: string
  /** Optional leaf colour (hex). Absent → the pre-existing default per finish. */
  color?: string
  /** When true, render an HDB metal security gate hinged at the same jamb,
   *  on the exterior side of the wall — the standard fixture outside an HDB
   *  entrance's laminated timber door. */
  gate?: boolean
}

export interface WindowSpec {
  id: WindowId
  wallId: string
  offset: number
  width: number
  sill: number
  head: number
  /** Optional window style (same vocab as `PlanOpening.style` on a window:
   *  `plain`/`grille`/`invisible-grille`/`louvre`/`casement`/`awning`/
   *  `hopper`/`transom`). Absent → the pre-existing always-on grille look. */
  style?: string
  /** Optional glass kind (same vocab as `PlanOpening.material` reused on a
   *  window: `clear`/`frosted`/`textured`/`glass-block`). Absent → clear. */
  glass?: string
}

export interface FlatSpec {
  ceilingHeight: number
  bathroomCeilingHeight: number
  externalWallThickness: number
  internalWallThickness: number
  doorHeight: number
  doorThickness: number
  mainDoorWidth: number
  internalDoorWidth: number
  bedroomWindowSill: number
  windowHeadHeight: number
}
