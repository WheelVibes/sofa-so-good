import type { DoorSpec, FlatSpec, RoomDef, RoomId, WallSpec, WindowSpec } from './types';

// Apartment external bounding box. NW external corner is at (0, 0).
// Geometry derived from docs/reference/floor-plan.svg (2026-04-26 revision).
// SVG-to-apartment scale: 1 SVG px = 0.014 m. The SVG NW external centerline
// (50, 65) maps to apartment centerline (0.10, 0.10), so:
//   apartment cx = (sx − 50) × 0.014 + 0.10
//   apartment cz = (sy − 65) × 0.014 + 0.10
//
// The apartment polygon is irregular: the SVG bounding rectangle (50, 65) →
// (945, 720) maps to (0, 0) → (12.75, 9.35), but four notches are excluded:
//   • NE notch (above L/D): SVG x=[690, 945] y=[65, 150]
//   • SE notch (south of main entrance): SVG x=[765, 945] y=[630, 720]
//   • SW upper notch (AC ledge): SVG x=[50, 140] y=[420, 720]
//   • SW lower notch (service yard): SVG x=[140, 320] y=[600, 720]
// All in-apartment coordinates round to 50 mm increments.
export const APARTMENT_EXT_W = 12.75;
export const APARTMENT_EXT_D = 9.35;

export const FLAT: FlatSpec = {
  ceilingHeight: 2.6,
  bathroomCeilingHeight: 2.4,
  externalWallThickness: 0.2,
  internalWallThickness: 0.1,
  doorHeight: 2.1,
  doorThickness: 0.05,
  mainDoorWidth: 1.0,
  internalDoorWidth: 0.8,
  bedroomWindowSill: 0.95,
  windowHeadHeight: 2.1,
};

// Per-room dimensions derived from docs/reference/floor-plan.svg (2026-04-26).
// Layout bands (interior coordinates):
//   • Bedroom band  z=[0.20, 3.60]: MB / B2 / B3, partitions at cx=3.10 and 6.05
//   • Corridor band z=[3.70, 5.00]: full-width circulation strip; bedroom doors
//     on its north wall, bath/HS doors on its south wall
//   • Bath/shelter z=[5.10, 6.70]: bath1, bath2, household shelter (west-to-east),
//     and L/D middle column to the east. South wall of this band is SVG y=540.
//   • South band   z=[6.80, 9.15]: service yard (centre, EXTERNAL) and the
//     kitchen (east of service yard, south of HS), spanning the 2.35 m depth
//     from the bath/shelter south wall down to the apartment south perimeter.
// Living/Dining is L-shaped: a 4.00 × 5.40 m main body in the east column plus
// a 2.45 × 1.10 m SE alcove that hugs the apartment east wall down to the SE
// step (main entrance). The kitchen below is also a rectangle, extended east
// to where the SE jog wall would meet the kitchen north wall when extended.
//
// External annexes (excluded from interior area):
//   • acLedge — full SW external area below the bath1 south wall, combining
//     the inside-polygon strip (bath1 south slice) with the SW lower notch.
//     Accessed from bath1 / external; not livable.
//
// The service yard is counted as strata interior (it has an L-shape covering
// both the louvred south-band centre and the small enclosed utility strip
// directly to its west). The room-rectangle area sum lands at ≈ 90.2 m²
// excluding the AC ledge; the ±0.5 m² tolerance is enforced by the constants
// test.
export const ROOMS: Record<RoomId, RoomDef> = {
  mainBedroom: {
    id: 'mainBedroom',
    name: 'Main Bedroom',
    origin: [0.20, 0.20],
    width: 2.85,
    depth: 3.40,
    extensions: [
      {
        // MB foyer: the western strip of the corridor band is part of MB
        // (no MB south wall — MB main flows into the foyer). The foyer ends
        // at the small N-S wall just west of the B2 door (cx=4.30), which
        // hosts the MB door. Foyer interior cx=[0.20, 4.25] cz=[3.60, 5.00].
        offset: [0, 3.40],
        width: 4.05,
        depth: 1.40,
      },
    ],
    derivation:
      'L-shape: bedroom + south foyer. Main body NW of plan, SVG x=[50,265] y=[65,320] → cx=[0.10,3.10] cz=[0.10,3.65] (north window centred, tall sliding window on west wall over SVG y=[140,290]). Foyer extends south through the corridor band (cz=[3.65, 5.05]) up to a small partition at cx=4.30 — that partition hosts the MB door, just west of the B2 door. Bath1 sits south of the foyer and is reached via the existing corridor-S door cutout at cx=[2.40, 3.20].',
  },
  bedroom2: {
    id: 'bedroom2',
    name: 'Bedroom 2',
    origin: [3.15, 0.20],
    width: 2.85,
    depth: 3.40,
    derivation:
      'North-centre. SVG x=[265,475] y=[65,320]. Shared partitions with MB (cx=3.10) and B3 (cx=6.05). North window centred.',
  },
  bedroom3: {
    id: 'bedroom3',
    name: 'Bedroom 3',
    origin: [6.10, 0.20],
    width: 2.85,
    depth: 3.40,
    derivation:
      'NE of bedroom band. SVG x=[475,690] y=[65,320]. East wall (cx=9.05) is also the apartment external NE-notch wall in z=[0.10, 1.30] and the corridor-east / L/D-west partition below.',
  },
  corridor: {
    id: 'corridor',
    name: 'Corridor',
    origin: [4.35, 3.70],
    // Extends east to the outer body face of the b3-LD partition (cx=9.10)
    // so the corridor reaches the bedroom / living-room wall corner; this
    // lets the corridor finish on the bedroom-S south face cover all the way
    // to the outer L-corner instead of stopping at the b3-LD west body face.
    width: 4.75,
    depth: 1.30,
    derivation:
      'Central circulation strip from the small MB-foyer partition (cx=4.30) east to L/D, linking B2/B3 (north) to bath2/kitchen/L-D (south). The corridor band west of cx=4.30 is the MB foyer (part of MB, no separating wall from MB main). North wall (cz=3.65) carries the B2 and B3 doors; south wall (cz=5.05) carries the bath2 and kitchen doors (bath1 door is on the foyer-S wall). East end opens to L/D (no wall over cz=[3.65, 5.05] at cx=9.05).',
  },
  bath1: {
    id: 'bath1',
    name: 'Bath/WC 1',
    origin: [1.45, 5.10],
    width: 2.40,
    depth: 1.60,
    ceilingHeight: 2.4,
    derivation:
      'West of the bath/kitchen band. SVG x=[140,320] y=[420,540]. West wall is the apartment SW-jog external wall (cx=1.35); east wall is the bath1/bath2 partition (cx=3.90); south wall is the bath1/AC-ledge internal wall at SVG y=540 (cz=6.75), separating the room from the AC ledge in the bath1 SW corner.',
  },
  bath2: {
    id: 'bath2',
    name: 'Bath/WC 2',
    origin: [3.95, 5.10],
    width: 2.05,
    depth: 1.60,
    ceilingHeight: 2.4,
    derivation:
      'Common bath, east of bath1. SVG x=[320,475] y=[420,540]. Door on north wall (corridor-S).',
  },
  householdShelter: {
    id: 'householdShelter',
    name: 'Household Shelter',
    origin: [6.10, 5.10],
    width: 2.35,
    depth: 1.60,
    derivation:
      'East of bath2 in the bath/shelter band. SVG x=[475,650] y=[420,540]. North door from corridor (the blast door); east wall (cx=8.50) is the HS / L/D partition; south wall at cz=6.75 (SVG y=540) abuts the kitchen below. Reinforced concrete walls (modeled at internal-wall thickness for v1).',
  },
  kitchen: {
    id: 'kitchen',
    name: 'Kitchen',
    origin: [6.40, 6.80],
    width: 3.70,
    depth: 2.35,
    derivation:
      'South band, east of the service yard and south of the household shelter, extending east to the SE step (main entrance alcove). SVG x=[495,810] y=[540,720]. Bounded west by the SY/kitchen partition (cx=6.35), north by the HS-S / mid-S wall (cz=6.75), south by the apartment external south wall (cz=9.25). The east side is physically open to the L/D — no partition wall — but for area accounting the rectangle is closed by extending the kitchen north wall (cz=6.75) east and the SE jog wall (cx=10.10) north until they meet at the notional NE corner (10.10, 6.75). Interior 3.70 × 2.35 = 8.695 m².',
  },
  serviceYard: {
    id: 'serviceYard',
    name: 'Service Yard',
    origin: [3.90, 6.80],
    width: 2.40,
    depth: 2.35,
    derivation:
      'Louvred utility space in the south band centre, between bath2 (north) and the apartment external south wall. SVG x=[320,495] y=[540,720]. Bounded west by the bath1/bath2 partition extended south (cx=3.90, also the SW lower notch east wall), east by the SY/kitchen partition (cx=6.35) — the latter has a door (SVG gap y=[580,680]) opening east into the kitchen. The previous SY-W partition (cx=4.60) has been removed: the small strip west of it was structural/utility-only and is now merged into the SY proper. Counted as strata interior per HDB area conventions.',
  },
  livingDining: {
    id: 'livingDining',
    // Main rectangle = the SOUTH ARM (bath/HS band), the widest contiguous
    // portion. The earlier model used a single 4.00 × 5.40 rectangle that
    // extended up into the bedroom band; that overstated the interior
    // because the b3↔L/D partition (cx=9.05) cuts a 0.55 × 2.25 m slice
    // off the west side up there. Modelling the L-shape with explicit
    // sub-rectangles is more spatially honest: the north arm is genuinely
    // narrower than the south arm, and a sofa placed up there has less
    // free wall-to-wall space than the south-arm width suggests.
    name: 'Living / Dining',
    origin: [8.55, 3.65],
    width: 4.00,
    depth: 3.15,
    extensions: [
      {
        // North arm (bedroom band): cx=[9.10, 12.55] cz=[1.40, 3.65].
        // West edge is the b3↔L/D partition's interior face (cx=9.10 =
        // 9.05 centerline + 0.05 half-thickness), NOT the south-arm west
        // edge. This is the slice the previous single-rectangle model
        // got wrong.
        offset: [0.55, -2.25],
        width: 3.45,
        depth: 2.25,
      },
      {
        // SE alcove: cx=[10.10, 12.55] cz=[6.80, 7.90]. Hugs the apartment
        // east wall down to the SE step (main entrance). Open-plan with
        // the south arm and with the kitchen.
        offset: [1.55, 3.15],
        width: 2.45,
        depth: 1.10,
      },
    ],
    derivation:
      'East column, true L-shape modelled with three rectangles: south arm cx=[8.55,12.55] cz=[3.65,6.80] (4.00 × 3.15 m, the main), north arm cx=[9.10,12.55] cz=[1.40,3.65] (3.45 × 2.25 m), SE alcove cx=[10.10,12.55] cz=[6.80,7.90] (2.45 × 1.10 m). North arm is narrower because the b3↔L/D partition (cx=9.05) takes a 0.55 m bite off the west side over cz=[1.40,3.65]. South arm shares its west wall (cx=8.50) with HS (cz=5.05–6.75); kitchen (cx=[6.40,10.10] cz=[6.80,9.15]) bounds the south arm on the south below cx=10.10. Total interior 12.60 + 7.7625 + 2.695 = 23.0575 m².',
  },
  acLedge: {
    id: 'acLedge',
    name: 'AC Ledge',
    origin: [1.35, 6.75],
    width: 2.55,
    depth: 0.85,
    external: true,
    derivation:
      'External SW annex: the inside-polygon strip immediately south of bath1 (SVG y=[540,600]) — cx=[1.35,3.90] cz=[6.75,7.60]. Bounded north by the full-height bath1 south wall, east/west/south by half-height parapets (wall-int-acLedge-sy, wall-ext-SW-jog-W-acLedge, wall-ext-SW-bath). The SW lower notch south of cz=7.60 is outside the apartment polygon and not part of the AC ledge. Accessed from bath1.',
  },
};

const WIN_SILL = FLAT.bedroomWindowSill;
const WIN_HEAD = FLAT.windowHeadHeight;
const DOOR_HEAD = FLAT.doorHeight;
const DOOR_W = FLAT.internalDoorWidth;
const MAIN_DOOR_W = FLAT.mainDoorWidth;

// Window widths (SVG-derived, rounded to 50 mm).
const BEDROOM_WIN_W = 1.40; // SVG 100 px → 1.40 m
const LD_NORTH_WIN_W = 2.50; // SVG 180 px → 2.52 m
const MB_WEST_WIN_W = 2.10; // SVG 150 px → 2.10 m

// Wall paths trace centerlines. Apartment perimeter goes clockwise from NW.
// Internal partitions follow SVG paths in docs/reference/floor-plan.svg.
export const WALLS: WallSpec[] = [
  // ── External perimeter (clockwise from NW) ──────────────────────────────
  // North wall over the bedroom band (NW to NE notch corner).
  {
    id: 'wall-ext-N',
    start: [0.10, 0.10],
    end: [9.05, 0.10],
    thickness: 'external',
    cutouts: [
      // MB north window (SVG x=[110,210] → offset 0.84, width 1.40).
      { kind: 'window', offset: 0.85, width: BEDROOM_WIN_W, sill: WIN_SILL, head: WIN_HEAD, refId: 'win-mainBedroom-N' },
      // B2 north window (SVG x=[320,420] → offset 3.78).
      { kind: 'window', offset: 3.80, width: BEDROOM_WIN_W, sill: WIN_SILL, head: WIN_HEAD, refId: 'win-bedroom2-N' },
      // B3 north window (SVG x=[530,630] → offset 6.72).
      { kind: 'window', offset: 6.70, width: BEDROOM_WIN_W, sill: WIN_SILL, head: WIN_HEAD, refId: 'win-bedroom3-N' },
    ],
  },
  // NE notch west wall: vertical jog from bedroom-N east edge down to L/D-N.
  {
    id: 'wall-ext-NE-jog-W',
    start: [9.05, 0.10],
    end: [9.05, 1.30],
    thickness: 'external',
    cutouts: [],
  },
  // NE notch south wall = L/D north wall.
  {
    id: 'wall-ext-NE-jog-S',
    start: [9.05, 1.30],
    end: [12.65, 1.30],
    thickness: 'external',
    cutouts: [
      // L/D north window (SVG x=[730,910] → offset 0.56, width 2.52).
      { kind: 'window', offset: 0.55, width: LD_NORTH_WIN_W, sill: WIN_SILL, head: WIN_HEAD, refId: 'win-livingDining-N' },
    ],
  },
  // East wall (full L/D height; ends at the SE step at cz=8.00).
  {
    id: 'wall-ext-E',
    start: [12.65, 1.30],
    end: [12.65, 8.00],
    thickness: 'external',
    cutouts: [],
  },
  // SE step horizontal wall (with main entrance door cutout).
  {
    id: 'wall-ext-SE-step',
    start: [12.65, 8.00],
    end: [10.10, 8.00],
    thickness: 'external',
    cutouts: [
      // Main entrance door (SVG gap x=[810,895] at y=630). Wall direction is
      // east → west; door centred in the gap → offset 0.80 from start.
      { kind: 'door', offset: 0.80, width: MAIN_DOOR_W, sill: 0, head: DOOR_HEAD, refId: 'door-main' },
    ],
  },
  // SE jog: vertical wall from the SE step down to the main south wall.
  {
    id: 'wall-ext-SE-jog-W',
    start: [10.10, 8.00],
    end: [10.10, 9.25],
    thickness: 'external',
    cutouts: [],
  },
  // South wall (main span: from SE jog west to SW-lower-notch east edge).
  {
    id: 'wall-ext-S',
    start: [10.10, 9.25],
    end: [3.90, 9.25],
    thickness: 'external',
    cutouts: [],
  },
  // SW lower notch east wall (jog north from the main south wall). This is the
  // boundary between the AC ledge (west, in the SW lower notch) and the
  // service yard (east). Both sides are open-air utility spaces, so the wall
  // is a half-height parapet rather than a full enclosing wall.
  {
    id: 'wall-ext-SW-jog-E',
    start: [3.90, 9.25],
    end: [3.90, 7.60],
    thickness: 'external',
    cutouts: [],
    topHeight: 1.0,
  },
  // SW lower notch north wall = south wall of bath1 over the notch x range.
  {
    id: 'wall-ext-SW-bath',
    start: [3.90, 7.60],
    end: [1.35, 7.60],
    thickness: 'external',
    cutouts: [],
    topHeight: 1.0,
  },
  // SW upper notch east wall, north portion = west wall of bath1 (full height,
  // bath is enclosed).
  {
    id: 'wall-ext-SW-jog-W-bath',
    start: [1.35, 6.75],
    end: [1.35, 5.05],
    thickness: 'external',
    cutouts: [],
  },
  // SW upper notch east wall, south portion = west wall of the AC ledge
  // (bath1-south slice). Open-air balcony — modeled as a half-height parapet.
  {
    id: 'wall-ext-SW-jog-W-acLedge',
    start: [1.35, 7.60],
    end: [1.35, 6.75],
    thickness: 'external',
    cutouts: [],
    topHeight: 1.0,
  },
  // SW upper notch north wall = bedroom band south wall stub over AC-ledge x.
  {
    id: 'wall-ext-SW-bedroom',
    start: [1.35, 5.05],
    end: [0.10, 5.05],
    thickness: 'external',
    cutouts: [],
  },
  // West wall (full bedroom band height; tall MB sliding window).
  {
    id: 'wall-ext-W',
    start: [0.10, 5.05],
    end: [0.10, 0.10],
    thickness: 'external',
    cutouts: [
      // MB west window (SVG y=[140,290] → window cz=[1.15,3.25]; wall runs
      // south → north so offset = 5.05 − 3.25 = 1.80; width 2.10).
      { kind: 'window', offset: 1.80, width: MB_WEST_WIN_W, sill: WIN_SILL, head: WIN_HEAD, refId: 'win-mainBedroom-W' },
    ],
  },

  // ── Internal partitions ────────────────────────────────────────────────
  // MB / B2 partition (SVG terminates at cz=3.65 = bedroom south wall).
  {
    id: 'wall-int-mb-b2',
    start: [3.10, 0.10],
    end: [3.10, 3.65],
    thickness: 'internal',
    cutouts: [],
  },
  // B2 / B3 partition.
  {
    id: 'wall-int-b2-b3',
    start: [6.05, 0.10],
    end: [6.05, 3.65],
    thickness: 'internal',
    cutouts: [],
  },
  // Bedroom south wall = north wall of corridor (and of MB foyer west of
  // cx=4.30). MB has no traditional south wall — the cx=[0.10, 3.10] section
  // is omitted so MB main flows into the foyer below it. Wall starts at the
  // MB/B2 partition (cx=3.10) and runs east to the B3 east wall (cx=9.05).
  {
    id: 'wall-int-bedroom-S',
    start: [3.10, 3.65],
    end: [9.05, 3.65],
    thickness: 'internal',
    cutouts: [
      // B2 door — wall starts at cx=3.10; door cx=[5.10, 5.90] → offset 2.00.
      { kind: 'door', offset: 2.00, width: DOOR_W, sill: 0, head: DOOR_HEAD, refId: 'door-bedroom2' },
      // B3 door — cx=[6.10, 6.90] → offset 3.00.
      { kind: 'door', offset: 3.00, width: DOOR_W, sill: 0, head: DOOR_HEAD, refId: 'door-bedroom3' },
    ],
  },
  // MB-foyer / corridor partition — the small N-S wall just west of the B2
  // door. Hosts the MB door (perpendicular to the bedroom-S wall and to the
  // bath/kitchen doors on corridor-S). Walking east down the corridor, this
  // is the last wall on the left before the B2 door.
  {
    id: 'wall-int-mb-foyer-E',
    start: [4.30, 3.65],
    end: [4.30, 5.05],
    thickness: 'internal',
    cutouts: [
      // MB door centred on the partition. Wall length 1.40; door 0.80 with
      // 0.30 wall on either side → offset 0.30, span cz=[3.95, 4.75].
      { kind: 'door', offset: 0.30, width: DOOR_W, sill: 0, head: DOOR_HEAD, refId: 'door-mainBedroom' },
    ],
  },
  // Bedroom 3 east wall / L/D west wall over the bedroom band.
  // SVG: M 690 160 L 690 320 → cx=9.05, cz=[1.40, 3.65]; extended slightly
  // north to meet the NE-jog external wall corner at (9.05, 1.30) so the
  // cx=9.05 line is continuous from cz=0.10 (NW external) through to the
  // bedroom-S wall at cz=3.65. The corridor (cz=[3.65, 5.05]) is left open
  // to L/D on its east end — that opening is the corridor entrance to L/D.
  {
    id: 'wall-int-b3-LD',
    start: [9.05, 1.30],
    end: [9.05, 3.65],
    thickness: 'internal',
    cutouts: [],
  },
  // Corridor south wall = bath1/bath2/kitchen north wall. Wall runs west → east
  // and ends at the kitchen / L/D partition (cx=8.50); the 0.55 m gap east of
  // that is the corridor → L/D opening.
  {
    id: 'wall-int-corridor-S',
    start: [0.10, 5.05],
    end: [8.50, 5.05],
    thickness: 'internal',
    cutouts: [
      // Bath1 door — SVG gap x=[210,280] centred cx=2.825 → offset 2.30.
      { kind: 'door', offset: 2.30, width: DOOR_W, sill: 0, head: DOOR_HEAD, refId: 'door-bath1' },
      // Bath2 door — SVG gap x=[390,475] centred cx=5.45 → offset 4.95.
      { kind: 'door', offset: 4.95, width: DOOR_W, sill: 0, head: DOOR_HEAD, refId: 'door-bath2' },
      // Household shelter door (blast door) — SVG gap x=[515,565] centred
      // cx=6.95 → offset 6.45.
      { kind: 'door', offset: 6.45, width: DOOR_W, sill: 0, head: DOOR_HEAD, refId: 'door-householdShelter' },
    ],
  },
  // Bath1 / bath2 partition (SVG x=320, y=[420,540]) — full height between the
  // two enclosed bathrooms.
  {
    id: 'wall-int-bath1-bath2',
    start: [3.90, 5.05],
    end: [3.90, 6.75],
    thickness: 'internal',
    cutouts: [],
  },
  // Continuation of the cx=3.90 partition between the AC ledge (west) and the
  // service yard (east), south of the bath/shelter band. Both sides are open-
  // air utility spaces — modeled as a half-height parapet.
  {
    id: 'wall-int-acLedge-sy',
    start: [3.90, 6.75],
    end: [3.90, 7.60],
    thickness: 'internal',
    cutouts: [],
    topHeight: 1.0,
  },
  // Bath1 / AC-ledge partition (SVG y=540, x=[140,320]). Segregates bath1
  // (north) from the AC ledge tucked into the bath1 SW corner (south).
  {
    id: 'wall-int-bath1-acLedge',
    start: [1.35, 6.75],
    end: [3.90, 6.75],
    thickness: 'internal',
    cutouts: [],
  },
  // Bath2 / kitchen partition (SVG x=475, y=[420,530] drawn; effectively spans
  // y=[420,540] joining the mid-S wall at cz=6.75).
  {
    id: 'wall-int-bath2-kitchen',
    start: [6.05, 5.05],
    end: [6.05, 6.75],
    thickness: 'internal',
    cutouts: [],
  },
  // HS east / L/D west partition (SVG x=650, y=[420,540]). Wall stops at
  // cz=6.75 — the kitchen south of here is open to the L/D on its east side
  // (no kitchen-east partition).
  {
    id: 'wall-int-shelter-LD',
    start: [8.50, 5.05],
    end: [8.50, 6.75],
    thickness: 'internal',
    cutouts: [],
  },
  // Bath/shelter south wall at SVG y=540 (cz=6.75). West stretch (cx=3.90–4.60)
  // is bath2 south above the gap to SY; centre stretch (cx=4.60–6.35) is the
  // bath2-south / SY-north partition; east stretch (cx=6.35–8.50) is the
  // HS-south / kitchen-north partition.
  {
    id: 'wall-int-mid-S',
    start: [3.90, 6.75],
    end: [8.50, 6.75],
    thickness: 'internal',
    cutouts: [],
  },
  // Service yard east wall = kitchen west wall (SVG x=495 in two segments
  // y=[550,580] and y=[680,720]; door gap y=[580,680] → cz=[7.30, 8.70]).
  {
    id: 'wall-int-shelter-E',
    start: [6.35, 6.75],
    end: [6.35, 9.25],
    thickness: 'internal',
    cutouts: [
      // Service yard access door — DOOR_W centred in gap cz=[7.30, 8.70] →
      // cz=[7.60, 8.40]. Wall starts at cz=6.75 → offset = 0.85.
      { kind: 'door', offset: 0.85, width: DOOR_W, sill: 0, head: DOOR_HEAD, refId: 'door-serviceYard' },
    ],
  },
];

export const DOORS: DoorSpec[] = [
  {
    id: 'door-main',
    wallId: 'wall-ext-SE-step',
    offset: 0.80,
    width: MAIN_DOOR_W,
    hinge: 'start',
    swing: 'right',
    defaultOpen: false,
  },
  {
    id: 'door-mainBedroom',
    wallId: 'wall-int-mb-foyer-E',
    offset: 0.30,
    width: DOOR_W,
    hinge: 'start',
    swing: 'right',
    defaultOpen: false,
  },
  {
    id: 'door-bedroom2',
    wallId: 'wall-int-bedroom-S',
    offset: 2.00,
    width: DOOR_W,
    hinge: 'end',
    swing: 'right',
    defaultOpen: false,
  },
  {
    id: 'door-bedroom3',
    wallId: 'wall-int-bedroom-S',
    offset: 3.00,
    width: DOOR_W,
    hinge: 'start',
    swing: 'left',
    defaultOpen: false,
  },
  {
    id: 'door-bath1',
    wallId: 'wall-int-corridor-S',
    offset: 2.30,
    width: DOOR_W,
    hinge: 'start',
    swing: 'right',
    defaultOpen: false,
  },
  {
    id: 'door-bath2',
    wallId: 'wall-int-corridor-S',
    offset: 4.95,
    width: DOOR_W,
    hinge: 'start',
    swing: 'right',
    defaultOpen: false,
  },
  {
    id: 'door-householdShelter',
    wallId: 'wall-int-corridor-S',
    offset: 6.45,
    width: DOOR_W,
    hinge: 'start',
    swing: 'left',
    defaultOpen: false,
  },
  {
    id: 'door-serviceYard',
    wallId: 'wall-int-shelter-E',
    offset: 0.85,
    width: DOOR_W,
    hinge: 'start',
    swing: 'right',
    defaultOpen: false,
  },
];

export const WINDOWS: WindowSpec[] = [
  {
    id: 'win-mainBedroom-N',
    wallId: 'wall-ext-N',
    offset: 0.85,
    width: BEDROOM_WIN_W,
    sill: WIN_SILL,
    head: WIN_HEAD,
  },
  {
    id: 'win-bedroom2-N',
    wallId: 'wall-ext-N',
    offset: 3.80,
    width: BEDROOM_WIN_W,
    sill: WIN_SILL,
    head: WIN_HEAD,
  },
  {
    id: 'win-bedroom3-N',
    wallId: 'wall-ext-N',
    offset: 6.70,
    width: BEDROOM_WIN_W,
    sill: WIN_SILL,
    head: WIN_HEAD,
  },
  {
    id: 'win-livingDining-N',
    wallId: 'wall-ext-NE-jog-S',
    offset: 0.55,
    width: LD_NORTH_WIN_W,
    sill: WIN_SILL,
    head: WIN_HEAD,
  },
  {
    id: 'win-mainBedroom-W',
    wallId: 'wall-ext-W',
    offset: 1.80,
    width: MB_WEST_WIN_W,
    sill: WIN_SILL,
    head: WIN_HEAD,
  },
];

// Total interior area, summing each room's main rectangle plus any extension. Should
// be ≈ 82.5 m² ± 0.5 m² (service yard counted as external per HDB convention; tolerance
// enforced by the constants test).
function roomArea(r: RoomDef): number {
  const main = r.width * r.depth;
  const ext = (r.extensions ?? []).reduce((acc, e) => acc + e.width * e.depth, 0);
  return main + ext;
}

export const INTERIOR_AREA_M2 = Object.values(ROOMS)
  .filter((r) => !r.external)
  .reduce((acc, r) => acc + roomArea(r), 0);

export const AC_LEDGE_AREA_M2 = roomArea(ROOMS.acLedge);

export const TOTAL_AREA_M2 = INTERIOR_AREA_M2 + AC_LEDGE_AREA_M2;
