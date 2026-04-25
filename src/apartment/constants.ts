import type { DoorSpec, FlatSpec, RoomDef, RoomId, WallSpec, WindowSpec } from './types';

// Apartment external bounding box. NW external corner is at (0, 0).
// The apartment-proper *envelope* is NOT a simple rectangle — its SW corner is
// notched inward by the AC ledge annex (a ~2.0 × 1.5 m external box that hangs
// south of bath1, outside the 90 m² interior). The bounding box below covers
// the apartment proper plus the AC-ledge annex; the actual perimeter walls
// (see WALLS) trace the irregular outline.
export const APARTMENT_EXT_W = 13.2;
export const APARTMENT_EXT_D = 8.1;

export const FLAT: FlatSpec = {
  ceilingHeight: 2.6,
  bathroomCeilingHeight: 2.4,
  externalWallThickness: 0.2,
  internalWallThickness: 0.1,
  doorHeight: 2.1,
  mainDoorWidth: 1.0,
  internalDoorWidth: 0.8,
  bedroomWindowSill: 0.95,
  windowHeadHeight: 2.1,
};

// Per-room dimensions approved 2026-04-25 (see docs/reference/dimensions-derivation.md).
// Origins place the NW interior corner of each room. External wall thickness 0.20 m,
// internal partition 0.10 m. Living/Dining is L-shaped: main column on the east side
// plus an extension wing south-west of it. Three minor adjustments vs the approved table,
// all driven by the irregular envelope shape (apartment proper has an SW notch where
// the AC-ledge annex hangs out):
//   • livingDining.depth bumped 7.50 → 7.70 to align its south face with the kitchen's
//     south face (= apartment-proper south wall over kitchen+L/D x range).
//   • livingDining.extension.depth kept at the approved 3.70 m (the extension's south
//     face = main column south face = apartment-proper south).
//   • serviceYard.depth trimmed 1.40 → 1.10 m so its south face sits at z=6.6, flush
//     with the apartment-proper south wall over the AC-ledge x range (any deeper and
//     part of the room would fall outside the envelope, into the AC-ledge annex).
// Net total interior area: 90.10 m² summed (within the ±0.5 m² tolerance of the 90 m²
// target). Note this sum double-counts the bath2/shelter strip where it overlaps the
// L/D extension corridor (~1.65 m²); the true non-overlapping interior is ~88.45 m².
export const ROOMS: Record<RoomId, RoomDef> = {
  mainBedroom: {
    id: 'mainBedroom',
    name: 'Main Bedroom',
    origin: [0.2, 0.2],
    width: 3.6,
    depth: 3.4,
    derivation: 'NW of plan. 3.60 × 3.40 m, proportional + 50 mm round.',
  },
  bedroom2: {
    id: 'bedroom2',
    name: 'Bedroom 2',
    origin: [3.9, 0.2],
    width: 2.7,
    depth: 3.0,
    derivation: 'North-centre. 2.70 × 3.00 m, proportional + 50 mm round.',
  },
  bedroom3: {
    id: 'bedroom3',
    name: 'Bedroom 3',
    origin: [6.7, 0.2],
    width: 2.7,
    depth: 3.0,
    derivation: 'East of bedroom2. 2.70 × 3.00 m, proportional + 50 mm round.',
  },
  bath1: {
    id: 'bath1',
    name: 'Bath/WC 1',
    origin: [0.2, 3.4],
    width: 1.6,
    depth: 2.1,
    ceilingHeight: 2.4,
    derivation: 'Master bath, south of mainBedroom. 1.60 × 2.10 m.',
  },
  bath2: {
    id: 'bath2',
    name: 'Bath/WC 2',
    origin: [3.9, 3.3],
    width: 1.5,
    depth: 1.7,
    ceilingHeight: 2.4,
    derivation: 'Common bath, south of bedroom2. 1.50 × 1.70 m.',
  },
  householdShelter: {
    id: 'householdShelter',
    name: 'Household Shelter',
    origin: [6.7, 3.3],
    width: 1.5,
    depth: 2.0,
    derivation: 'South of bedroom3. 1.50 × 2.00 m, HDB-typical bomb shelter.',
  },
  serviceYard: {
    id: 'serviceYard',
    name: 'Service Yard',
    origin: [0.2, 5.5],
    width: 1.5,
    depth: 1.1,
    derivation:
      'South of bath1, west of kitchen. Approved 1.50 × 1.40 m; depth trimmed to 1.10 m so its south face sits at z=6.6, flush with apartment-proper south wall over the AC-ledge annex (any further south would put part of the room outside the apartment envelope).',
  },
  kitchen: {
    id: 'kitchen',
    name: 'Kitchen',
    origin: [1.8, 5.4],
    width: 3.0,
    depth: 2.5,
    derivation: 'South strip, east of serviceYard. 3.00 × 2.50 m.',
  },
  livingDining: {
    id: 'livingDining',
    name: 'Living / Dining',
    origin: [9.5, 0.2],
    width: 3.5,
    depth: 7.7,
    extension: {
      offset: [-4.5, 4.0],
      width: 4.5,
      depth: 3.7,
    },
    derivation:
      'L-shape. Main column 3.50 × 7.70 m (east, full apartment height). Extension 4.50 × 3.70 m (south-west wing for foyer + dining; the household shelter sits as an internal island within the north edge of this extension and the bath2/shelter row overlaps the extension by ~1.65 m² along the corridor). Combined accounted area 43.60 m².',
  },
  acLedge: {
    id: 'acLedge',
    name: 'AC Ledge',
    origin: [0.2, 6.6],
    width: 2.0,
    depth: 1.5,
    external: true,
    derivation:
      'External AC condenser ledge, south of bath1. 2.00 × 1.50 m. Annex outside the apartment-proper envelope (the south wall of the apartment proper jogs north over its x range). Excluded from interior area.',
  },
};

// Cutouts for windows and doors. Offsets are along each wall from its `start` point.
// Window sills/heads use FLAT defaults unless noted; door headers go from `head` to ceiling.
const WIN_SILL = FLAT.bedroomWindowSill;
const WIN_HEAD = FLAT.windowHeadHeight;
const DOOR_HEAD = FLAT.doorHeight;
const DOOR_W = FLAT.internalDoorWidth;
const MAIN_DOOR_W = FLAT.mainDoorWidth;

// Convenience: bedroom window widths (≈1.5 m typical HDB sliding panel pair).
const BEDROOM_WIN_W = 1.5;
const KITCHEN_WIN_W = 1.2;
const LD_BAY_WIN_W = 2.4;

// Apartment-proper envelope traced clockwise from NW (0, 0). The envelope is
// rectangular except for the SW notch where the AC-ledge annex hangs south of
// bath1 (apartment-proper south wall jogs north over the AC-ledge x range).
//
//   (0,0) ────────────────────────────────────── (13.2, 0)      [N]
//     │                                              │
//     │                 apartment proper              │           [W on left,
//     │                                              │            E on right]
//   (0,6.6)──(2.2,6.6)                                │
//                  │                                  │
//                  │   (AC ledge annex                │
//                  │    south of bath1,               │
//                  │    outside envelope)             │
//                  │                                  │
//             (2.2,8.1)─────────────────────────(13.2, 8.1)      [S main]
//
// AC ledge has its own west + south walls (its north/east coincide with the
// apartment-proper south-bath1 / south-jog walls and aren't duplicated).
export const WALLS: WallSpec[] = [
  // ── External perimeter ─────────────────────────────────────────────────
  // North wall: full width across the three bedrooms.
  {
    id: 'wall-ext-N',
    start: [0, 0],
    end: [APARTMENT_EXT_W, 0],
    thickness: 'external',
    cutouts: [
      // Bedroom windows centred over each bedroom (along the wall's X axis).
      // Wall spans x=0..13.20; rooms sit at internal origins shifted by 0.20 m.
      { kind: 'window', offset: 1.25, width: BEDROOM_WIN_W, sill: WIN_SILL, head: WIN_HEAD, refId: 'win-mainBedroom' },
      { kind: 'window', offset: 4.5, width: BEDROOM_WIN_W, sill: WIN_SILL, head: WIN_HEAD, refId: 'win-bedroom2' },
      { kind: 'window', offset: 7.3, width: BEDROOM_WIN_W, sill: WIN_SILL, head: WIN_HEAD, refId: 'win-bedroom3' },
    ],
  },
  // East wall: full height down the L/D side, with the L/D bay window near the
  // top and the main entrance door near the south end.
  {
    id: 'wall-ext-E',
    start: [APARTMENT_EXT_W, 0],
    end: [APARTMENT_EXT_W, APARTMENT_EXT_D],
    thickness: 'external',
    cutouts: [
      // L/D bay window over the living area (sofa zone, top half of L/D column).
      { kind: 'window', offset: 2.0, width: LD_BAY_WIN_W, sill: WIN_SILL, head: WIN_HEAD, refId: 'win-livingDining' },
      // Main entrance door near the south end of the east wall.
      { kind: 'door', offset: 6.6, width: MAIN_DOOR_W, sill: 0, head: DOOR_HEAD, refId: 'door-main' },
    ],
  },
  // South wall (main span): from the SE corner west across L/D, kitchen, and
  // serviceYard's south strip, stopping at the AC ledge's east edge.
  {
    id: 'wall-ext-S-main',
    start: [APARTMENT_EXT_W, APARTMENT_EXT_D],
    end: [2.2, APARTMENT_EXT_D],
    thickness: 'external',
    cutouts: [
      // Kitchen window above the sink, centred on the kitchen's south wall.
      // Wall runs E→W; offset measured from (13.2, 8.1). Kitchen interior x=1.8..4.8;
      // window centred at x=3.3 → offset = 13.2 − 3.3 − KITCHEN_WIN_W/2 = 9.3.
      { kind: 'window', offset: 9.3, width: KITCHEN_WIN_W, sill: WIN_SILL, head: WIN_HEAD, refId: 'win-kitchen' },
    ],
  },
  // SW jog: at x=2.2, going north from the south face up to the AC ledge's
  // north edge. This is the east face of the AC-ledge annex (shared wall).
  {
    id: 'wall-ext-S-jog',
    start: [2.2, APARTMENT_EXT_D],
    end: [2.2, 6.6],
    thickness: 'external',
    cutouts: [],
  },
  // South wall (bath1 strip): from x=2.2 west to x=0, at z=6.6. This is the
  // apartment-proper south wall over the AC-ledge x range, and simultaneously
  // the AC ledge's north wall.
  {
    id: 'wall-ext-S-bath1',
    start: [2.2, 6.6],
    end: [0, 6.6],
    thickness: 'external',
    cutouts: [],
  },
  // West wall: from (0, 6.6) north back to (0, 0). No window — the floor plan
  // shows the west elevation as solid wall (mainBedroom's only window is the
  // north window).
  {
    id: 'wall-ext-W',
    start: [0, 6.6],
    end: [0, 0],
    thickness: 'external',
    cutouts: [],
  },

  // ── AC-ledge annex (external box south of bath1) ───────────────────────
  // Its north and east walls coincide with apartment-proper walls
  // (wall-ext-S-bath1 and wall-ext-S-jog respectively) and aren't duplicated.
  // West wall of AC ledge.
  {
    id: 'wall-acl-W',
    start: [0, 6.6],
    end: [0, APARTMENT_EXT_D],
    thickness: 'external',
    cutouts: [],
  },
  // South wall of AC ledge.
  {
    id: 'wall-acl-S',
    start: [0, APARTMENT_EXT_D],
    end: [2.2, APARTMENT_EXT_D],
    thickness: 'external',
    cutouts: [],
  },

  // ── Internal partitions: bedroom band ──────────────────────────────────
  // Vertical wall between mainBedroom and bedroom2 (and continuing south through bath1/bath2 row).
  {
    id: 'wall-int-mb-b2',
    start: [3.85, 0],
    end: [3.85, 5.4],
    thickness: 'internal',
    cutouts: [],
  },
  // Vertical wall between bedroom2 and bedroom3.
  {
    id: 'wall-int-b2-b3',
    start: [6.65, 0],
    end: [6.65, 5.4],
    thickness: 'internal',
    cutouts: [],
  },
  // Vertical wall between bedroom3 / householdShelter and livingDining main column.
  {
    id: 'wall-int-b3-ld',
    start: [9.45, 0],
    end: [9.45, APARTMENT_EXT_D],
    thickness: 'internal',
    cutouts: [],
  },

  // South wall of mainBedroom (separates it from bath1). Door to mainBedroom is here.
  {
    id: 'wall-int-mb-S',
    start: [0, 3.35],
    end: [3.85, 3.35],
    thickness: 'internal',
    cutouts: [
      { kind: 'door', offset: 2.6, width: DOOR_W, sill: 0, head: DOOR_HEAD, refId: 'door-mainBedroom' },
    ],
  },
  // South wall of bedroom2 (separates from bath2 / corridor).
  {
    id: 'wall-int-b2-S',
    start: [3.85, 3.25],
    end: [6.65, 3.25],
    thickness: 'internal',
    cutouts: [
      { kind: 'door', offset: 2.0, width: DOOR_W, sill: 0, head: DOOR_HEAD, refId: 'door-bedroom2' },
    ],
  },
  // South wall of bedroom3 (separates from householdShelter / corridor).
  {
    id: 'wall-int-b3-S',
    start: [6.65, 3.25],
    end: [9.45, 3.25],
    thickness: 'internal',
    cutouts: [
      { kind: 'door', offset: 0.4, width: DOOR_W, sill: 0, head: DOOR_HEAD, refId: 'door-bedroom3' },
    ],
  },

  // ── Internal partitions: utility band ──────────────────────────────────
  // South wall of bath1.
  {
    id: 'wall-int-bath1-S',
    start: [0, 5.5],
    end: [1.85, 5.5],
    thickness: 'internal',
    cutouts: [
      { kind: 'door', offset: 1.0, width: DOOR_W, sill: 0, head: DOOR_HEAD, refId: 'door-bath1' },
    ],
  },
  // South wall of bath2.
  {
    id: 'wall-int-bath2-S',
    start: [3.85, 5.05],
    end: [5.45, 5.05],
    thickness: 'internal',
    cutouts: [
      { kind: 'door', offset: 0.6, width: DOOR_W, sill: 0, head: DOOR_HEAD, refId: 'door-bath2' },
    ],
  },
  // East wall of bath2 (separates from householdShelter).
  {
    id: 'wall-int-bath2-E',
    start: [5.45, 3.25],
    end: [5.45, 5.05],
    thickness: 'internal',
    cutouts: [],
  },
  // South wall of householdShelter.
  {
    id: 'wall-int-shelter-S',
    start: [6.65, 5.35],
    end: [8.25, 5.35],
    thickness: 'internal',
    cutouts: [
      { kind: 'door', offset: 0.5, width: DOOR_W, sill: 0, head: DOOR_HEAD, refId: 'door-shelter' },
    ],
  },
  // East wall of householdShelter.
  {
    id: 'wall-int-shelter-E',
    start: [8.25, 3.25],
    end: [8.25, 5.35],
    thickness: 'internal',
    cutouts: [],
  },

  // ── Internal partitions: south band ────────────────────────────────────
  // North wall of kitchen (separates kitchen from L/D extension foyer area).
  {
    id: 'wall-int-kitchen-N',
    start: [1.75, 5.35],
    end: [4.85, 5.35],
    thickness: 'internal',
    cutouts: [],
  },
  // East wall of kitchen (separates from L/D extension dining area). Door from kitchen → L/D.
  {
    id: 'wall-int-kitchen-E',
    start: [4.85, 5.35],
    end: [4.85, APARTMENT_EXT_D],
    thickness: 'internal',
    cutouts: [
      { kind: 'door', offset: 1.4, width: DOOR_W, sill: 0, head: DOOR_HEAD, refId: 'door-kitchen' },
    ],
  },
  // West wall of kitchen / east wall of serviceYard. Stops at z=6.6 where the
  // apartment-proper south wall jogs over the AC-ledge annex.
  {
    id: 'wall-int-sy-E',
    start: [1.75, 5.45],
    end: [1.75, 6.6],
    thickness: 'internal',
    cutouts: [
      { kind: 'door', offset: 0.3, width: DOOR_W, sill: 0, head: DOOR_HEAD, refId: 'door-serviceYard' },
    ],
  },
  // South wall of serviceYard (= apartment-proper south wall over AC-ledge x range,
  // already covered by wall-ext-S-bath1 — no extra internal wall needed).
];

export const DOORS: DoorSpec[] = [
  {
    id: 'door-main',
    wallId: 'wall-ext-E',
    offset: 6.6,
    width: MAIN_DOOR_W,
    hinge: 'start',
    swing: 'left',
    defaultOpen: false,
  },
  {
    id: 'door-mainBedroom',
    wallId: 'wall-int-mb-S',
    offset: 2.6,
    width: DOOR_W,
    hinge: 'start',
    swing: 'left',
    defaultOpen: false,
  },
  {
    id: 'door-bedroom2',
    wallId: 'wall-int-b2-S',
    offset: 2.0,
    width: DOOR_W,
    hinge: 'end',
    swing: 'left',
    defaultOpen: false,
  },
  {
    id: 'door-bedroom3',
    wallId: 'wall-int-b3-S',
    offset: 0.4,
    width: DOOR_W,
    hinge: 'start',
    swing: 'right',
    defaultOpen: false,
  },
  {
    id: 'door-bath1',
    wallId: 'wall-int-bath1-S',
    offset: 1.0,
    width: DOOR_W,
    hinge: 'start',
    swing: 'left',
    defaultOpen: false,
  },
  {
    id: 'door-bath2',
    wallId: 'wall-int-bath2-S',
    offset: 0.6,
    width: DOOR_W,
    hinge: 'start',
    swing: 'left',
    defaultOpen: false,
  },
  {
    id: 'door-shelter',
    wallId: 'wall-int-shelter-S',
    offset: 0.5,
    width: DOOR_W,
    hinge: 'start',
    swing: 'right',
    defaultOpen: false,
  },
  {
    id: 'door-kitchen',
    wallId: 'wall-int-kitchen-E',
    offset: 1.4,
    width: DOOR_W,
    hinge: 'end',
    swing: 'left',
    defaultOpen: true,
  },
  {
    id: 'door-serviceYard',
    wallId: 'wall-int-sy-E',
    offset: 0.3,
    width: DOOR_W,
    hinge: 'start',
    swing: 'left',
    defaultOpen: false,
  },
];

export const WINDOWS: WindowSpec[] = [
  {
    id: 'win-mainBedroom',
    wallId: 'wall-ext-N',
    offset: 1.25,
    width: BEDROOM_WIN_W,
    sill: WIN_SILL,
    head: WIN_HEAD,
  },
  {
    id: 'win-bedroom2',
    wallId: 'wall-ext-N',
    offset: 4.5,
    width: BEDROOM_WIN_W,
    sill: WIN_SILL,
    head: WIN_HEAD,
  },
  {
    id: 'win-bedroom3',
    wallId: 'wall-ext-N',
    offset: 7.3,
    width: BEDROOM_WIN_W,
    sill: WIN_SILL,
    head: WIN_HEAD,
  },
  {
    id: 'win-livingDining',
    wallId: 'wall-ext-E',
    offset: 2.0,
    width: LD_BAY_WIN_W,
    sill: WIN_SILL,
    head: WIN_HEAD,
  },
  {
    id: 'win-kitchen',
    wallId: 'wall-ext-S-main',
    offset: 9.3,
    width: KITCHEN_WIN_W,
    sill: WIN_SILL,
    head: WIN_HEAD,
  },
];

// Total interior area, summing each room's main rectangle plus any extension. Should
// be ≈ 90 m² ± 0.5 m² (the 90 m² target absorbs all rounding slack from 50 mm rounding
// per HDB convention; the ±0.5 m² tolerance is enforced by the constants test).
export const INTERIOR_AREA_M2 = Object.values(ROOMS)
  .filter((r) => !r.external)
  .reduce((acc, r) => {
    const main = r.width * r.depth;
    const ext = r.extension ? r.extension.width * r.extension.depth : 0;
    return acc + main + ext;
  }, 0);
