import { roomFloorArea } from './roomGeometry'
import type { DoorSpec, FlatSpec, RoomDef, RoomId, WallSpec, WindowSpec } from './types'

// Apartment external bounding box. NW external corner is at (0, 0).
// Geometry derived from assets/floor_plan/default.png (HDB "4 Room Type - 1",
// 93 m² incl. AC ledge, 90 m² internal — 2026-07-23 revision). The plan's
// dimension chains are in mm to wall CENTRELINES; the app maps them as
//   app x = mm_x / 1000 + 0.10,  app z = mm_z / 1000 + 0.10
// so the NW external wall centreline sits at (0.10, 0.10), matching the
// renderer convention that external walls are inset half their 0.2 m
// thickness from the (0,0) footprint corner.
//
// Plan gridlines (mm, from the dimension chains):
//   x: 0 | 3230 (MB/B2) | 6090 (B2/B3) | 9075 (B3 / LD) | 12525 (east)
//      1365 (bath1 W) | 3715 (bath1/2) | 5665 (bath2/HS) | 8115 (HS E)
//      3975 (ledge E) | 4555 (SY W) | 6075 (SY/kitchen) | 10100 (SE jog)
//   z: 0 | 3675 (bedroom S) | 4775 (corridor S) | 6725 (bath band S)
//      7725 (ledge S) | 9125 (south) | 1100 (LD north) | 8135 (SE step)
//
// The apartment polygon is irregular; four areas are outside the flat:
//   • NE notch: x=[9075, 12525] z=[0, 1100] (L/D north wall is inset)
//   • SE entrance recess: x=[10100, 12525] z=[8135, 9125] (main door on the
//     step wall at z=8135)
//   • SW notch: everything west of the bath1 wall (x<1365) below z=4775,
//     plus the strip between the AC ledge and the service yard
//     (x=[3975, 4555] z=[6725, 9125]) and below the ledge (z>7725, x<3975)
// All coordinates below are app-space metres (mm/1000 + 0.1).
//
// STRUCTURAL WALL THICKNESS (v0.23.1.8): every wall the plan draws as a
// FULL-BLACK run (no window-band infill anywhere along its length) — not
// merely `structure: 'load-bearing'`, which some mixed external facades
// (wall-ext-N/-NE-jog-S/-E, deliberately conservative, see WALLS' header
// comment) also carry — is modeled at the real 300 mm RC/gable-end gauge
// instead of the flat's usual 200 mm external / 100 mm internal partition
// gauge: `wall-ext-S` (v0.23.1.7), `wall-ext-bath1-W`, `wall-ext-SE-jog-W`,
// `wall-ext-SE-step`, `wall-ext-W` (gable-end), and the household-shelter RC
// ring + `wall-int-b3-LD-col` (`wall-int-hs-N`/`-hs-S`/`-bath2-hs`/
// `-shelter-LD`). Wall centrelines never move — only faces — so every
// bounding ROOMS rect on the interior side of a thickened wall is
// re-derived; see each room's/wall's own comment for the exact delta.
export const APARTMENT_EXT_W = 12.725
// South exterior face: the south wall (wall-ext-S) is 300 mm thick (not the
// usual 200 mm external gauge — see its derivation comment in WALLS), so its
// exterior face sits 0.15 m (half-thickness) south of its z=9.225 centreline:
// 9.225 + 0.15 = 9.375.
export const APARTMENT_EXT_D = 9.375
// NOTE: `wall-ext-W` (the west perimeter wall) is ALSO thickened to 300 mm
// (v0.23.1.8), pushing its exterior face to x=0.1−0.15=−0.05 — 0.05 m past
// the nominal (0,0) NW corner. Unlike the south wall's case, this is NOT
// mirrored by bumping APARTMENT_EXT_W: that constant is a WIDTH measured
// from the fixed x=0 origin (extent/camera-framing/floor-bounds consumers —
// `CommentPins`/`TapeMeasure`/`suggestViews`/`OrbitCamera`/`WallSegment`'s
// CENTER_X/`defaultPlan`'s `extent` — all read it as `[0, EXT_W]`), so
// growing it would extend the EAST edge, not cover a WEST-side protrusion;
// doing so would misrepresent the footprint rather than fix the clip. The
// centreline convention is kept fixed and the 0.05 m protrusion is left as
// a harmless overhang (none of the above consumers clip/cull against a hard
// x=0 boundary — checked before making this call).

export const FLAT: FlatSpec = {
  ceilingHeight: 2.6,
  bathroomCeilingHeight: 2.4,
  externalWallThickness: 0.2,
  internalWallThickness: 0.1,
  doorHeight: 2.1,
  doorThickness: 0.05,
  mainDoorWidth: 1.0,
  internalDoorWidth: 0.8,
  // W1 spec (plan callout): every north-facing window is a three-quarter
  // height window over an approx 550 mm parapet wall.
  bedroomWindowSill: 0.55,
  windowHeadHeight: 2.1,
}

// Per-room dimensions derived from assets/floor_plan/default.png.
// Layout bands (wall-centreline coordinates, app space):
//   • Bedroom band  z=[0.10, 3.775]: MB / B2 / B3, partitions at cx=3.33, 6.19
//   • Corridor band z=[3.775, 4.875]: circulation strip; the west stretch
//     (x<3.475) is the MB foyer (part of MB — no wall between MB main and it),
//     closed off by the small partition at cx=3.475 that hosts the MB door
//   • Bath band     z=[4.875, 6.825]: bath1 / bath2 / household shelter
//     (west-to-east); bath1 is reached from the MB foyer, bath2 + HS from
//     the corridor
//   • South band    z=[6.825, 9.225]: AC ledge (external, 1.0 m deep with
//     half-height parapets), open service yard (half west wall), and the kitchen, which is
//     open to the L/D on its east side
// Living/Dining is L-shaped: a 3.30 × 5.475 m main body in the east column
// (north wall inset to z=1.2 — the NE notch) plus a 2.795 × 1.41 m entrance
// foyer along the SE step, where the main door is. The kitchen mirrors it
// with a small east extension to the SE jog wall.
export const ROOMS: Record<RoomId, RoomDef> = {
  mainBedroom: {
    id: 'mainBedroom',
    name: 'Main Bedroom',
    // West wall (wall-ext-W) is 300 mm (gable-end run, thickened with the
    // other full-black/gable runs): interior face 0.20 → 0.25, trimming
    // width 3.08 → 3.03 and the foyer extension's width 3.225 → 3.175 by the
    // same 0.05 (east wall + all z-bounding walls unchanged).
    origin: [0.25, 0.2],
    width: 3.03,
    depth: 3.525,
    extensions: [
      {
        // MB foyer: the western stretch of the corridor band belongs to MB
        // (no MB south wall — the main body flows into the foyer). It ends at
        // the small N-S partition at cx=3.475 which hosts the MB door; bath1
        // is entered from this foyer through the door on its south wall.
        offset: [0, 3.525],
        width: 3.175,
        depth: 1.1,
      },
    ],
    derivation:
      'L-shape: bedroom + south foyer. Main body mm x=[0,3230] z=[0,3675] (plan: 3230-wide first bay, 3675-deep bedroom band); single window on the north wall (west wall is solid — confirmed against the 3D reference render/video). Foyer spans the corridor band z=[3675,4775] west of the MB-door partition at x=3375. West wall (wall-ext-W) thickened to 300 mm RC/gable-end (v0.23.1.8): interior face 0.20→0.25 trims width 3230−150−50=3030 mm (and the foyer extension by the same 50 mm); east/north/south faces unaffected.',
  },
  bedroom2: {
    id: 'bedroom2',
    name: 'Bedroom 2',
    origin: [3.38, 0.2],
    width: 2.76,
    depth: 3.525,
    derivation:
      "North-centre bay, mm x=[3230,6090] z=[0,3675] (2860 wide per the top chain). Shared partitions with MB (x=3230) and B3 (x=6090). Door on the south wall just west of the B2/B3 partition. NOTE (v0.23.2.0): `wall-ext-N-pier`, the B2/B3 structural RC pier at x=[5.69,6.91] thickened to 300 mm, overlaps this room's NE corner (x=[5.69,6.14]) — its south face moves 0.20→0.25 (50 mm into the room) over that 0.45 m stretch only. Left un-derived here for the same reason as `wall-int-b3-LD-col` vs. bedroom3 below: a single rect can't express a thickness that varies along a wall's length, so this room stays sized off the unchanged 0.20 m north face and the extra RC mass renders over the floor.",
  },
  bedroom3: {
    id: 'bedroom3',
    name: 'Bedroom 3',
    origin: [6.24, 0.2],
    width: 2.885,
    depth: 3.525,
    derivation:
      "NE bay, mm x=[6090,9075] z=[0,3675] (2985 wide). East wall (x=9075) is external over the NE notch (z<1100), then the B3/LD partition (annotated 3675 on the plan). Door on the south wall just east of the B2/B3 partition. NOTE (v0.23.1.8): `wall-int-b3-LD-col`, the short RC column stub at z=[1.2,1.8] over this east face, thickened to 300 mm — its west face moves 9.125→9.025, 100 mm into this room over that 0.6 m stretch only. Left un-derived here for the same reason as the corridor rect below: a single rect can't express a thickness that varies along a wall's length, so this room stays sized off the unchanged `wall-int-b3-LD` face (9.125) and the extra RC mass renders over the floor. NOTE (v0.23.2.0): the same treatment applies at the NW corner of this room — `wall-ext-N-pier` (x=[5.69,6.91], 300 mm) overlaps x=[6.24,6.91], moving the north face 0.20→0.25 (50 mm into the room) over that 0.67 m stretch only; and `wall-ext-NE-jog-W` (now also 300 mm) overlaps the NE corner z=[0.1,1.2], moving the east face similarly — both left un-derived for the same reason.",
  },
  corridor: {
    id: 'corridor',
    name: 'Corridor',
    origin: [3.525, 3.825],
    width: 5.6,
    depth: 1.0,
    derivation:
      "Central circulation strip mm z=[3675,4775] (1100 deep per the plan annotation) from the MB-door partition (x=3375) east to the open L/D edge (x=9075). North wall carries the B2/B3 doors; south wall the bath2 + HS doors. The open strip SOUTH of this band and east of the HS (x=[8365,9125] z=[4825,6975]) is circulation into the living/dining and is declared as one of livingDining's parts, meeting this rect's south edge exactly (it used to be swallowed by an oversized L/D rect that overlapped this one). NOTE (v0.23.1.8): `wall-int-hs-N`, bounding this rect along the household-shelter stretch (x=[5.765,8.215]), thickened to 300 mm RC — its extra 100 mm of mass now juts 100 mm south into this rect over that stretch only. A single rect can't express a thickness that varies along its length, so this corridor rect is left at the THIN corridor-S wall face (z=3.825) unchanged; walls render over the floor, so the RC overlap is visually correct despite the un-carved rect (same treatment as `wall-int-b3-LD-col` vs. bedroom3, above).",
  },
  bath1: {
    id: 'bath1',
    name: 'Bath/WC 1',
    // West wall (wall-ext-bath1-W) thickened to 300 mm RC: interior face
    // 1.565 → 1.615, trimming width 2.2 → 2.15 (east/north/south unaffected).
    origin: [1.615, 4.925],
    width: 2.15,
    depth: 1.85,
    ceilingHeight: 2.4,
    derivation:
      'West of the bath band, mm x=[1365,3715] z=[4775,6725] (2350 × 1950 per the chains). West wall is external (structural, solid black — thickened to 300 mm, v0.23.1.8: interior face 1365+50+150=1615 mm ⇒ width 2350−150−50=2150 mm); door on the north wall, entered from the MB foyer. South wall separates it from the AC ledge.',
  },
  bath2: {
    id: 'bath2',
    name: 'Bath/WC 2',
    origin: [3.865, 4.925],
    // East wall (wall-int-bath2-hs, the HS ring's west wall) thickened to
    // 300 mm RC: its west face moves 5.715 → 5.615, trimming width
    // 1.85 → 1.75 (west/north/south unaffected).
    width: 1.75,
    depth: 1.85,
    ceilingHeight: 2.4,
    derivation:
      'Common bath, mm x=[3715,5665] z=[4775,6725] (1950 wide). Door on the north wall (corridor-S), against the household-shelter wall, which (v0.23.1.8) is thickened to 300 mm RC: its west face moves to 3715+50+150=3865+1750=5615 mm ⇒ width 1950−50−150=1750 mm.',
  },
  householdShelter: {
    id: 'householdShelter',
    name: 'Household Shelter',
    // All four RC ring walls thickened to 300 mm (v0.23.1.8, real HDB
    // shelters ARE 300 mm RC — the model previously used the 100 mm
    // partition gauge). West face 5.815→5.915, north face 4.925→5.025,
    // east face 8.165→8.065, south face 6.775→6.675: width 2.35→2.15,
    // depth 1.85→1.65 (both shrinks symmetric, so the room's centre point
    // is unchanged at (6.99, 5.85) — see furniture/defaults/utility.ts).
    origin: [5.915, 5.025],
    width: 2.15,
    depth: 1.65,
    derivation:
      'East of bath2, mm x=[5665,8115] z=[4775,6725] (2450 per the chain). Reinforced-concrete box, now correctly modeled at the real 300 mm RC gauge (v0.23.1.8, was internal-wall thickness): interior 2150×1650 mm. Blast door on the north wall opening to the corridor.',
  },
  kitchen: {
    id: 'kitchen',
    name: 'Kitchen',
    // North wall (wall-int-hs-S, the HS ring's south wall) thickened to
    // 300 mm RC (v0.23.1.8): its south (kitchen-facing) face moves
    // 6.875 → 6.975, trimming depth 2.2 → 2.1. West wall (wall-int-shelter-E)
    // and the south wall-ext-S face (already 300 mm since v0.23.1.7) are
    // both unaffected by this pass.
    origin: [6.225, 6.975],
    width: 3.505,
    // South wall (wall-ext-S) is 300 mm thick, moving its interior face
    // 9.125 → 9.075 (app space): depth 2.25 → 2.2 m, matching the plan's
    // annotated 2200 mm interior depth exactly (see wall-ext-S's derivation).
    // North wall thickening (above) trims a further 0.1 m: 2.2 → 2.1.
    depth: 2.1,
    extensions: [
      {
        // Small east strip between the open kitchen/LD boundary and the SE jog
        // wall, south of the entrance foyer. Its NORTH edge is the L/D foyer's
        // south edge (z=8.135): `wall-ext-SE-step` only starts at x=10.2, so
        // for x=[9.73,10.2] there is NO wall on that line and the two floors
        // must meet exactly — the old 8.285 north edge (a thin-wall face, left
        // behind when the step wall went to 300 mm) opened a 0.15 m white gap
        // there. Width trimmed 0.42 → 0.37 for `wall-ext-SE-jog-W`'s
        // thickening (its interior/west face moves 10.1 → 10.05, eating 50 mm
        // off this strip's east edge).
        offset: [3.505, 1.16],
        width: 0.37,
        depth: 0.94,
      },
    ],
    derivation:
      'South band, mm x=[6075,10100] z=[6725,9075] (4025 wide per the bottom chain, 2200 interior depth per the plan annotation — the south wall is 300 mm thick, not the usual 200 mm, so the interior face sits at z=9075 rather than 9125; see wall-ext-S). Bounded west by the SY partition (x=6075), north by the HS south wall — thickened to 300 mm RC (v0.23.1.8): north face 6875+100=6975 mm ⇒ depth 2200−100=2100 mm. OPEN to the L/D on the east — the accounting boundary follows the dashed line at x≈9630 up to the entrance foyer, with the strip to the SE jog (x=10100, also thickened to 300 mm, trimming the strip width 420→370 mm) as the extension.',
  },
  serviceYard: {
    id: 'serviceYard',
    name: 'Service Yard',
    origin: [4.705, 6.875],
    width: 1.42,
    // Same south-wall thickening as the kitchen (see wall-ext-S): interior
    // face 9.125 → 9.075, depth 2.25 → 2.2 m.
    depth: 2.2,
    derivation:
      'Open-air utility space, mm x=[4555,6075] z=[6725,9075] (1520 per the bottom chain). South wall (wall-ext-S) is 300 mm thick, not the usual 200 mm — interior face at z=9075 rather than 9125 (see wall-ext-S derivation). HALF WALL on the west side (low parapet, open above — no window); door on the east wall into the kitchen. Counted as strata interior per HDB convention.',
  },
  livingDining: {
    id: 'livingDining',
    name: 'Living / Dining',
    // THREE parts, each bounded by a real wall face — the L/D is not an L. It
    // used to be declared as one oversized rect reaching 0.76 m west of the
    // B3/LD partition (to carry the open strip east of the household shelter),
    // which meant its declared footprint OVERLAPPED bedroom3 and the corridor
    // and only the floor renderer's overlap-carve ever resolved that. Now that
    // a room may declare any number of parts, each one states the real space it
    // covers and nothing overlaps.
    //
    // Main: the east column, x=[9.125,12.525] z=[1.3,6.975]. West face is
    // `wall-int-b3-LD`'s LD side (9.125); north is the NE-jog wall (1.3);
    // south is the kitchen's north face / the HS ring's 300 mm south face
    // (6.975 — 6.775 was a 100 mm-wall face left behind when the ring went to
    // 300 mm, and east of the shelter there is no wall on that line at all, so
    // the mismatch showed as a white gap against the kitchen floor).
    origin: [9.125, 1.3],
    width: 3.4,
    depth: 5.675,
    extensions: [
      {
        // Circulation strip east of the household shelter, x=[8.365,9.125]
        // z=[4.825,6.975]: open on every side except its west face, which is
        // `wall-int-shelter-LD` (the HS ring's east wall, 300 mm ⇒ face 8.365).
        // Its north edge meets the corridor's south edge (4.825) and its south
        // edge the kitchen's north face (6.975), so the three floors close up
        // with no seam.
        offset: [-0.76, 3.525],
        width: 0.76,
        depth: 2.15,
      },
      {
        // Entrance foyer: the strip along the SE step wall (which hosts the
        // main door), east of the kitchen's open boundary — x=[9.73,12.525]
        // z=[6.975,8.135]. Open-plan with the L/D main and the kitchen (no
        // partitions); its west edge is the virtual x=9.73 accounting line
        // shared with the kitchen's east strip, and it reaches
        // `wall-ext-SE-step` (300 mm, interior face 8.085 — the last 50 mm
        // renders under the wall).
        offset: [0.605, 5.675],
        width: 2.795,
        depth: 1.16,
      },
    ],
    derivation:
      "East column + shelter-side strip + entrance foyer (three parts). Main mm x=[9075,12525] z=[1100,6975] (3450 wide per the top chain; north wall inset 1100 — the NE notch — with a 2450 window; east wall solid, 7035 tall per the right chain; south edge is the kitchen's north face, the HS ring's 300 mm south face at 6975). Strip east of the shelter x=[8365,9125] z=[4825,6975], bounded west by wall-int-shelter-LD (300 mm RC since v0.23.1.8: face 8265+100=8365 mm). Entrance foyer x=[9630,12525] z=[6975,8135] reaching the SE step wall (main door, also thickened to 300 mm), 990 recess below per the right chain. Before v0.30.3.2 this was ONE rect from x=8365 spanning the whole column, which overlapped bedroom3 and the corridor by 2.6 m² and was only resolved by the floor renderer's carve. NOTE (v0.23.2.0): the east wall (`wall-ext-E`) is now split into `wall-ext-E-col1`/`-mid`/`-col2`; the two 300 mm structural segments (z=[1.2,2.95] and z=[6.5,8.235]) push the interior face 12.525→12.475 (50 mm into the room) over those two stretches only — the un-thickened `-mid` segment (z=[2.95,6.5]) keeps the 200 mm face at 12.425. Left un-derived for the same reason as bedroom3's NE corner above (thickness varies along the wall's length; the extra RC mass renders over the floor).",
  },
  acLedge: {
    id: 'acLedge',
    name: 'AC Ledge',
    origin: [1.565, 6.875],
    width: 2.46,
    depth: 0.9,
    external: true,
    derivation:
      'External SW annex, mm x=[1365,3975] z=[6725,7725] (2610 × 1000 per the plan). Bounded north by the full-height bath south wall; west/south/east by half-height parapets. Not livable; the strip between it and the service yard (x=[3975,4555]) is outside the flat.',
  },
}

const WIN_SILL = FLAT.bedroomWindowSill
// North-facing W1 windows: 1.85 m of glass over the 550 mm parapet — head at
// 2.4 m, leaving 0.2 m from window top to the 2.6 m ceiling (plan callout:
// "three-quarter height window, approx 550mm high parapet wall").
const N_WIN_HEAD = 2.4
const DOOR_HEAD = FLAT.doorHeight
const DOOR_W = FLAT.internalDoorWidth
const MAIN_DOOR_W = FLAT.mainDoorWidth

// Window widths (measured off assets/floor_plan/default.png, rounded to 50 mm).
const MB_N_WIN_W = 1.8
const B2_N_WIN_W = 1.5
const B3_N_WIN_W = 1.5 // equal to bedroom 2 (reference render: matching windows)
const LD_NORTH_WIN_W = 2.45
// Bath ventilation windows (high-sill), over the AC ledge / service yard.
const BATH1_S_WIN_W = 0.8
const BATH2_S_WIN_W = 0.6

// Wall paths trace centerlines. Apartment perimeter goes clockwise from NW.
//
// STRUCTURE (assets/floor_plan/default.png legend + assets/floor_plan/walls.jpg):
// each wall carries the plan's structural classification. Solid-black fill =
// structural RC column/wall ("shall not be hacked") → 'load-bearing'; the
// distinct gable-end lining symbol (walls.jpg legend #3, west wall — the
// block's exposed structural end wall) → 'gable-end' (RC/structural, equally
// non-hackable, tagged separately so 2D/3D can draw its distinct lining
// symbol instead of the plain heavy structural line); hollow double lines =
// normal non-structural partition → 'brick-partition'. External runs that mix
// black RC piers with window-band infill are classified 'load-bearing' as a
// whole (the conservative and, for an external facade, practically correct
// reading — HDB never permits hacking external walls); comments give the
// measured black extents. Open parapets / railings are left unclassified
// (not room walls).
export const WALLS: WallSpec[] = [
  // ── External perimeter (clockwise from NW) ──────────────────────────────
  // North wall over the bedroom band (NW to NE notch corner) — SPLIT into
  // three (v0.23.2.0): the plan draws a solid-black RC pier at x≈[5.59,6.81]
  // (app [5.69,6.91]) straddling the B2/B3 partition junction, measured
  // pixel-for-pixel off assets/floor_plan/default.png (a solid-fill run
  // 81 px wide at the plan's ≈14.7 mm/px scale, calibrated off the top
  // dimension chain's 852 px = 12525 mm span) — distinct from the plain
  // window-band infill either side, so it's carved out as its own 300 mm
  // structural segment rather than thickening the whole run. West run
  // carries the MB + B2 windows; east run carries the B3 window (re-based
  // to the new wall's own start, offset 6.95−6.91=0.04).
  {
    id: 'wall-ext-N-west',
    start: [0.1, 0.1],
    end: [5.69, 0.1],
    thickness: 'external',
    structure: 'load-bearing',
    cutouts: [
      // MB north window (plan x=[700,2500] → offset 0.70, width 1.80).
      {
        kind: 'window',
        offset: 0.7,
        width: MB_N_WIN_W,
        sill: WIN_SILL,
        head: N_WIN_HEAD,
        refId: 'win-mainBedroom-N',
      },
      // B2 north window (plan x=[3650,5150] → offset 3.65).
      {
        kind: 'window',
        offset: 3.65,
        width: B2_N_WIN_W,
        sill: WIN_SILL,
        head: N_WIN_HEAD,
        refId: 'win-bedroom2-N',
      },
    ],
  },
  // B2/B3 structural pier: solid-black RC, measured x≈[5.59,6.81] mm (app
  // [5.69,6.91]) — see the split comment above. Thickened to 300 mm like the
  // other full-black-run segments; abuts both neighbours with no gap.
  {
    id: 'wall-ext-N-pier',
    start: [5.69, 0.1],
    end: [6.91, 0.1],
    thickness: 'external',
    thicknessM: 0.3,
    structure: 'load-bearing',
    cutouts: [],
  },
  {
    id: 'wall-ext-N-east',
    start: [6.91, 0.1],
    end: [9.175, 0.1],
    thickness: 'external',
    structure: 'load-bearing',
    cutouts: [
      // B3 north window — 1.5 wide, equal to B2, centred on the old span
      // (x=[6950,8450] → world offset 6.85 from the OLD wall-ext-N start at
      // 0.1, i.e. world x=6.95; re-based to this wall's own start at 6.91:
      // 6.95−6.91=0.04).
      {
        kind: 'window',
        offset: 0.04,
        width: B3_N_WIN_W,
        sill: WIN_SILL,
        head: N_WIN_HEAD,
        refId: 'win-bedroom3-N',
      },
    ],
  },
  // NE notch west wall: vertical jog from bedroom-N east edge down to L/D-N.
  // Plan: solid black for its full length (the NE RC column block, which runs
  // from the north wall down to z≈1.8 — its continuation below the notch is
  // `wall-int-b3-LD-col`). Thickened to 300 mm (v0.23.2.0): like
  // `wall-int-b3-LD-col`, this is a full-black run its whole length, not the
  // conservative mixed-facade classification the other jog walls get;
  // structure was already 'load-bearing'.
  {
    id: 'wall-ext-NE-jog-W',
    start: [9.175, 0.1],
    end: [9.175, 1.2],
    thickness: 'external',
    thicknessM: 0.3,
    structure: 'load-bearing',
    cutouts: [],
  },
  // NE notch south wall = L/D north wall. Plan: window infill band ending in
  // the black RC corner column at the east (x=12.625) junction.
  {
    id: 'wall-ext-NE-jog-S',
    start: [9.175, 1.2],
    end: [12.625, 1.2],
    thickness: 'external',
    structure: 'load-bearing',
    cutouts: [
      // L/D north window (plan x=[9490,11940] → offset 0.42, width 2.45).
      {
        kind: 'window',
        offset: 0.42,
        width: LD_NORTH_WIN_W,
        sill: WIN_SILL,
        head: N_WIN_HEAD,
        refId: 'win-livingDining-N',
      },
    ],
  },
  // East wall (full L/D height; ends at the SE step at cz=8.235). Solid — no
  // glazing symbol anywhere, and the 3D reference render shows it windowless.
  // SPLIT into three (v0.23.2.0): the plan draws solid-black RC runs at
  // z≈[1.2, 2.95] and z≈[6.5, 8.235] (already measured off the plan, see the
  // previous single-wall comment) with a normal window-less infill stretch
  // between — carved out as two 300 mm structural segments bracketing a
  // 200 mm infill run, alternating like the north wall's pier split above.
  // No cutouts anywhere on this wall (windowless).
  {
    id: 'wall-ext-E-col1',
    start: [12.625, 1.2],
    end: [12.625, 2.95],
    thickness: 'external',
    thicknessM: 0.3,
    structure: 'load-bearing',
    cutouts: [],
  },
  {
    id: 'wall-ext-E-mid',
    start: [12.625, 2.95],
    end: [12.625, 6.5],
    thickness: 'external',
    // Conservative mixed-facade classification (see the WALLS header
    // comment) — kept as-is, NOT thickened (plain infill on the plan here).
    structure: 'load-bearing',
    cutouts: [],
  },
  {
    id: 'wall-ext-E-col2',
    start: [12.625, 6.5],
    end: [12.625, 8.235],
    thickness: 'external',
    thicknessM: 0.3,
    structure: 'load-bearing',
    cutouts: [],
  },
  // SE step horizontal wall (with main entrance door cutout). Plan: normal
  // infill around the entrance, terminating in black RC corner blocks at both
  // ends (external — never hackable regardless). The two corner blocks are
  // wide enough (0.7 m + 0.725 m either side of the 1.0 m door gap) that they
  // ARE this wall's only solid stretches — no window-band infill anywhere
  // along its run — so, like `wall-ext-SE-jog-W` it continues into, it's
  // treated as a full-black run and thickened to 300 mm.
  {
    id: 'wall-ext-SE-step',
    start: [12.625, 8.235],
    end: [10.2, 8.235],
    thickness: 'external',
    thicknessM: 0.3,
    structure: 'load-bearing',
    cutouts: [
      // Main entrance door (plan gap x=[10925,11925] at z=8135). Wall
      // direction is east → west; offset 12.625 − 11.925 = 0.70.
      {
        kind: 'door',
        offset: 0.7,
        width: MAIN_DOOR_W,
        sill: 0,
        head: DOOR_HEAD,
        refId: 'door-main',
      },
    ],
  },
  // SE jog: vertical wall from the SE step down to the main south wall.
  // Plan: solid black for its full length.
  {
    id: 'wall-ext-SE-jog-W',
    start: [10.2, 8.235],
    end: [10.2, 9.225],
    thickness: 'external',
    thicknessM: 0.3,
    structure: 'load-bearing',
    cutouts: [],
  },
  // South wall (main span: kitchen + service yard, structural). Plan: solid
  // black for its full length, and thicker than the flat's other external
  // walls — the plan's own dimension chains prove it. The kitchen band runs
  // 2400 mm centreline-to-centreline (SY/kitchen partition at x=6075 → this
  // wall's centreline at z=9225), while the kitchen's annotated INTERIOR
  // depth is 2200 mm: 2400 − 50 (half the 100 mm partition) − t/2 = 2200 ⇒
  // t = 300 mm (vs. the usual 200 mm external gauge). Interior face moves
  // 9.125 → 9.075 (app space); exterior face 9.325 → 9.375.
  {
    id: 'wall-ext-S',
    start: [10.2, 9.225],
    end: [4.655, 9.225],
    thickness: 'external',
    thicknessM: 0.3,
    structure: 'load-bearing',
    cutouts: [],
  },
  // Service-yard west wall: a HALF WALL (open above — reference render/video
  // show a low parapet, no window/louvre). The strip west of it, down to the
  // AC-ledge parapet, is outside the flat.
  {
    id: 'wall-ext-SY-W',
    start: [4.655, 9.225],
    end: [4.655, 6.825],
    thickness: 'external',
    cutouts: [],
    topHeight: 1.0,
  },

  // AC ledge east parapet (open-air both sides — half height). Renders as an
  // open metal railing (not a solid half-wall) to match the reference render.
  {
    id: 'wall-ext-acLedge-E',
    start: [4.075, 6.825],
    end: [4.075, 7.825],
    thickness: 'external',
    cutouts: [],
    topHeight: 1.0,
    railing: true,
  },
  // AC ledge south parapet — open metal railing.
  {
    id: 'wall-ext-acLedge-S',
    start: [4.075, 7.825],
    end: [1.465, 7.825],
    thickness: 'external',
    cutouts: [],
    topHeight: 1.0,
    railing: true,
  },
  // AC ledge west parapet — open metal railing.
  {
    id: 'wall-ext-acLedge-W',
    start: [1.465, 7.825],
    end: [1.465, 6.825],
    thickness: 'external',
    cutouts: [],
    topHeight: 1.0,
    railing: true,
  },
  // Bath1 west wall (structural external — the SW notch east boundary).
  // Plan: solid black for its full length, so — like `wall-ext-S` — it's
  // thickened to 300 mm; interior (east) face moves 1.565 → 1.615.
  {
    id: 'wall-ext-bath1-W',
    start: [1.465, 6.825],
    end: [1.465, 4.875],
    thickness: 'external',
    thicknessM: 0.3,
    structure: 'load-bearing',
    cutouts: [],
  },
  // MB-foyer south wall stub west of bath1 (over the SW notch). Plan: normal
  // infill, terminating in the black RC west-wall corner (external).
  {
    id: 'wall-ext-SW-bedroom',
    start: [1.465, 4.875],
    end: [0.1, 4.875],
    thickness: 'external',
    structure: 'load-bearing',
    cutouts: [],
  },
  // West wall (MB main + foyer). Solid — the main bedroom's only window is
  // on the north wall (the 3D reference render/video shows the west face
  // windowless from every angle). Plan: black RC at z≈[0, 1.2] and
  // z≈[4.0, 4.875]; the stretch between (z≈[1.2, 4.0]) carries the GABLE-END
  // wall symbol (assets/floor_plan/walls.jpg legend #3) — the block's
  // structural end wall. Tagged 'gable-end' (not 'load-bearing') for the
  // whole run — a distinct, equally non-hackable classification — since the
  // plan marks the majority of this wall's length with that symbol.
  // Thickened to 300 mm: every stretch of this wall's length is either solid
  // black RC (z≈[0,1.2], z≈[4.0,4.875]) or the gable-end symbol (z≈[1.2,4.0])
  // — no plain/window-infill stretch anywhere along it, so like the other
  // full-black/gable runs it takes the RC gauge, not the 200 mm default.
  // Interior (east) face moves 0.20 → 0.25; exterior (west) face moves
  // 0.00 → −0.05 (protrudes 0.05 m past the nominal (0,0) NW corner — see
  // APARTMENT_EXT_W's comment for why the extent constant is NOT bumped to
  // match, unlike the south wall's analogous case).
  {
    id: 'wall-ext-W',
    start: [0.1, 4.875],
    end: [0.1, 0.1],
    thickness: 'external',
    thicknessM: 0.3,
    structure: 'gable-end',
    cutouts: [],
  },

  // ── Exterior protruding corner columns (v0.23.2.0) ──────────────────────
  // At four sites the plan's black RC fill runs PAST the facade line the
  // adjoining walls establish — a genuine oversized corner/junction column,
  // not merely the 300 mm gauge already applied to the walls themselves
  // above. Modeled as short stub walls (the HS-ring/`wall-int-b3-LD-col`
  // vocabulary: a free-standing `WallSpec`, not part of the perimeter loop)
  // abutting the host wall's corner point with no gap. Each has NO adjacent
  // room on either side (outside every ROOMS rect) — `orientOutward`'s probe
  // therefore reads "not interior" on BOTH faces and returns `null`, so
  // `WallSegment`'s dollhouse reveal leaves these stubs permanently solid/
  // opaque (never fades). That's a safe, arguably correct fallback for a
  // small structural nub with nothing to reveal — flagged here rather than
  // "fixed", per the caution in the task brief, for the coordinator's visual
  // pass to confirm nothing looks wrong (e.g. a stray opaque box) from an
  // orbit angle.
  //
  // NW corner (site 1, `wall-col-nw`): pixel-measured off
  // assets/floor_plan/default.png. Calibration: the top dimension chain's
  // 852 px span = 12525 mm (14.706 mm/px); at x=260 px (the NW corner pier)
  // the solid-black fill starts at y=138 px, while the plain north-wall face
  // line elsewhere along the run sits at y=148 px — a 10 px / ≈250 mm gap.
  // I.e. the corner pier's black fill runs ≈250 mm PAST the north wall's own
  // face line, into the (0,0)-and-beyond exterior void. Modeled as a stub
  // running north from the corner point, thicknessM matching the column
  // gauge. Protrudes to z=−0.15 (well past the already-protruding
  // `wall-ext-W`/west-run exterior faces at z≈−0.05..0.0) — a harmless
  // overhang past APARTMENT_EXT_D's z=0 plane, same treatment as
  // `wall-ext-W`'s x-overhang past APARTMENT_EXT_W (not mirrored by growing
  // the extent constant — see its comment).
  {
    id: 'wall-col-nw',
    start: [0.1, 0.1],
    end: [0.1, -0.15],
    thickness: 'external',
    thicknessM: 0.3,
    structure: 'load-bearing',
    cutouts: [],
  },
  // B2/B3 partition pier (site 2, `wall-col-b2b3`): the SAME pier that
  // `wall-ext-N-pier` (above) models in-plane — this stub is its EXTRA
  // protrusion past the plain wall's face, measured the same way as the NW
  // corner: at the pier's centre column (x≈664 px) the black fill starts at
  // y=131 px vs. the plain face line at y=148 px — 17 px / ≈250 mm, matching
  // the NW corner's protrusion exactly. Centred on the B2/B3 partition
  // (x=6.19, inside the pier's measured [5.69,6.91] span).
  {
    id: 'wall-col-b2b3',
    start: [6.19, 0.1],
    end: [6.19, -0.15],
    thickness: 'external',
    thicknessM: 0.3,
    structure: 'load-bearing',
    cutouts: [],
  },
  // B3 NE corner (site 3, `wall-col-b3-ne`): where `wall-ext-N-east` (200 mm)
  // meets `wall-ext-NE-jog-W` (thickened to 300 mm above) at (9.175, 0.1).
  // The plan's black fill is continuous and uniform-width through this
  // corner (no separately-legible extra nub the way sites 1/2 show one) —
  // this stub is modeled BY ANALOGY with the same 250 mm figure, on the
  // reasoning that a 300 mm wall meeting a 200 mm wall at a corner needs a
  // return of at least the gauge difference to avoid an exposed mismatched
  // step; the plan doesn't cleanly resolve a bigger number here at this
  // pixel scale. LOWER CONFIDENCE than sites 1/2 — flagged for the
  // coordinator's visual pass.
  {
    id: 'wall-col-b3-ne',
    start: [9.175, 0.1],
    end: [9.175, -0.15],
    thickness: 'external',
    thicknessM: 0.3,
    structure: 'load-bearing',
    cutouts: [],
  },
  // Living/Dining NE corner (site 4, `wall-col-ld-ne`): where
  // `wall-ext-NE-jog-S` (200 mm) meets `wall-ext-E-col1` (thickened to
  // 300 mm above) at (12.625, 1.2). Same reasoning/confidence caveat as site
  // 3 — protrudes EAST (perpendicular to the jog-S wall, which runs along x)
  // rather than north, since the thickness mismatch here is on the vertical
  // (east) wall.
  {
    id: 'wall-col-ld-ne',
    start: [12.625, 1.2],
    end: [12.875, 1.2],
    thickness: 'external',
    thicknessM: 0.3,
    structure: 'load-bearing',
    cutouts: [],
  },

  // ── Internal partitions ────────────────────────────────────────────────
  // Plan: all hollow double lines (normal non-structural walls) except the
  // household-shelter RC ring and the B3/LD column stub, marked individually.
  // MB / B2 partition.
  {
    id: 'wall-int-mb-b2',
    start: [3.33, 0.1],
    end: [3.33, 3.775],
    thickness: 'internal',
    structure: 'brick-partition',
    cutouts: [],
  },
  // B2 / B3 partition. (The solid-black RC pier the plan shows at this
  // junction sits in the NORTH wall run, not in this partition.)
  {
    id: 'wall-int-b2-b3',
    start: [6.19, 0.1],
    end: [6.19, 3.775],
    thickness: 'internal',
    structure: 'brick-partition',
    cutouts: [],
  },
  // Bedroom south wall = north wall of the corridor. MB has no south wall —
  // the stretch west of cx=3.33 is omitted so MB main flows into its foyer.
  {
    id: 'wall-int-bedroom-S',
    start: [3.33, 3.775],
    end: [9.175, 3.775],
    thickness: 'internal',
    structure: 'brick-partition',
    cutouts: [
      // B2 door — gap x=[4.99, 5.79] (hinged on its west jamb, swinging into
      // B2 toward the B2/B3 partition) → offset 1.66.
      {
        kind: 'door',
        offset: 1.66,
        width: DOOR_W,
        sill: 0,
        head: DOOR_HEAD,
        refId: 'door-bedroom2',
      },
      // B3 door — gap x=[6.38, 7.18], just east of the partition → offset 3.05.
      {
        kind: 'door',
        offset: 3.05,
        width: DOOR_W,
        sill: 0,
        head: DOOR_HEAD,
        refId: 'door-bedroom3',
      },
    ],
  },
  // MB-foyer / corridor partition — the small N-S wall hosting the MB door.
  {
    id: 'wall-int-mb-foyer-E',
    start: [3.475, 3.775],
    end: [3.475, 4.875],
    thickness: 'internal',
    structure: 'brick-partition',
    cutouts: [
      // MB door — gap cz=[3.925, 4.725] → offset 0.15.
      {
        kind: 'door',
        offset: 0.15,
        width: DOOR_W,
        sill: 0,
        head: DOOR_HEAD,
        refId: 'door-mainBedroom',
      },
    ],
  },
  // Bedroom 3 east wall / L/D west wall below the NE notch — TWO collinear
  // walls because the plan draws them differently: the NE RC column block
  // (solid black) continues past the notch corner down to z≈1.8, and only
  // below that does the run become a normal hollow partition. Splitting keeps
  // the column stub 'load-bearing' (must be retained if B3 is ever opened to
  // the L/D — a common reno) without misclassifying the hackable stretch.
  // Thickened to 300 mm (real RC column, not the 100 mm partition gauge).
  // Short (0.6 m) stub — bedroom3's east-face rect (fixed at x=9.125, sized
  // off the UNCHANGED `wall-int-b3-LD` face below it) doesn't shrink to
  // track this local jog; the column's extra 100 mm mass over this stretch
  // renders over the floor (the corridor/`wall-int-hs-N` pattern below).
  {
    id: 'wall-int-b3-LD-col',
    start: [9.175, 1.2],
    end: [9.175, 1.8],
    thickness: 'internal',
    thicknessM: 0.3,
    structure: 'load-bearing',
    cutouts: [],
  },
  {
    id: 'wall-int-b3-LD',
    start: [9.175, 1.8],
    end: [9.175, 3.775],
    thickness: 'internal',
    structure: 'brick-partition',
    cutouts: [],
  },
  // Corridor/foyer south wall = bath1/bath2 north wall, up to the household
  // shelter's west boundary (x=5.765). The corridor's east end (x=[9.175]) is
  // open to the L/D. Plan: hollow double lines (normal partition) — the black
  // stretch east of x=5.765 is the HS RC ring, split off as `wall-int-hs-N`.
  {
    id: 'wall-int-corridor-S',
    start: [1.465, 4.875],
    end: [5.765, 4.875],
    thickness: 'internal',
    structure: 'brick-partition',
    cutouts: [
      // Bath1 door — gap x=[2.59, 3.39] (entered from the MB foyer) →
      // offset 1.125.
      {
        kind: 'door',
        offset: 1.125,
        width: DOOR_W,
        sill: 0,
        head: DOOR_HEAD,
        refId: 'door-bath1',
      },
      // Bath2 door — gap x=[4.815, 5.615], against the HS wall → offset
      // 3.35 (nudged from 3.40/[4.865,5.665] — the HS ring's west face
      // `wall-int-bath2-hs` now thickened to 300 mm moved 100 mm west, from
      // 5.715 to 5.615, which would otherwise land inside the door gap).
      { kind: 'door', offset: 3.35, width: DOOR_W, sill: 0, head: DOOR_HEAD, refId: 'door-bath2' },
    ],
  },
  // Household shelter north wall (RC ring, solid black on the plan) — split
  // from the corridor wall so the never-hackable HS classification doesn't
  // spill onto the bath partitions (or vice versa). Hosts the blast door.
  // Real HDB household shelters are 300 mm RC (not the 100 mm partition
  // gauge the model previously used) — thickened here and on the other
  // three ring walls below. The corridor rect on the far side isn't
  // re-derived to track this (a single rect can't express thickness that
  // varies along its length — the corridor is thin over the bath1/bath2
  // stretch, thick here); walls render over the floor, so the extra 100 mm
  // of RC simply overlaps the corridor floor visually (same as the
  // `wall-int-b3-LD-col` case above).
  {
    id: 'wall-int-hs-N',
    start: [5.765, 4.875],
    end: [8.215, 4.875],
    thickness: 'internal',
    thicknessM: 0.3,
    structure: 'load-bearing',
    cutouts: [
      // Household shelter door (blast door) — gap x=[6.115, 6.915] →
      // offset 0.35 from this wall's start at x=5.765.
      {
        kind: 'door',
        offset: 0.35,
        width: DOOR_W,
        sill: 0,
        head: DOOR_HEAD,
        refId: 'door-householdShelter',
      },
    ],
  },
  // Bath1 / bath2 partition.
  {
    id: 'wall-int-bath1-bath2',
    start: [3.815, 4.875],
    end: [3.815, 6.825],
    thickness: 'internal',
    structure: 'brick-partition',
    cutouts: [],
  },
  // Bath2 / household shelter partition — this is the HS RC ring's west wall
  // (solid black on the plan; the model merges bath2's thin east face and the
  // HS wall into one segment, so the RC classification wins). Thickened to
  // 300 mm RC; bath2's east face moves 5.715 → 5.615 (width 1.85 → 1.75), the
  // HS west face moves 5.815 → 5.915.
  {
    id: 'wall-int-bath2-hs',
    start: [5.765, 4.875],
    end: [5.765, 6.825],
    thickness: 'internal',
    thicknessM: 0.3,
    structure: 'load-bearing',
    cutouts: [],
  },
  // HS east wall / L/D-corridor-strip west boundary (RC ring, solid black).
  // Thickened to 300 mm RC; HS east face moves 8.165 → 8.065, and the
  // livingDining rect (which carries the open strip on the far side) widens
  // its west face 8.265 → 8.365 to match.
  {
    id: 'wall-int-shelter-LD',
    start: [8.215, 4.875],
    end: [8.215, 6.825],
    thickness: 'internal',
    thicknessM: 0.3,
    structure: 'load-bearing',
    cutouts: [],
  },
  // Bath south wall — ONE continuous wall from bath1's west wall to the
  // service-yard wall (bath1 + bath2 over the AC ledge and the open-air
  // strip beside it). Carries BOTH high-sill bath ventilation windows; kept
  // as a single wall so the short bath2 stretch isn't an orphan stub with no
  // adjacent room (an orphan stub mis-orients the dollhouse wall-reveal and
  // rendered as a bare full-height gap).
  {
    id: 'wall-int-bath1-acLedge',
    start: [1.465, 6.825],
    end: [4.655, 6.825],
    thickness: 'internal',
    structure: 'brick-partition',
    cutouts: [
      // Bath1 ventilation window over the AC ledge (plan x=[2350,3150] →
      // offset 0.885). High-sill landscape vent (0.8 × 0.7 m, wider than
      // tall, per the reference render).
      {
        kind: 'window',
        offset: 0.885,
        width: BATH1_S_WIN_W,
        sill: 1.3,
        head: 2.0,
        refId: 'win-bath1-S',
      },
      // Bath2 ventilation window (reference render/video: a small vent
      // between the bath1/bath2 partition and the SY wall, opening out over
      // the ledge area). Landscape vent 0.6 × 0.4 m (wider than tall); top
      // aligned with the bath1 window head (2.0). Window x=[3.965, 4.565] →
      // offset 2.5.
      {
        kind: 'window',
        offset: 2.5,
        width: BATH2_S_WIN_W,
        sill: 1.6,
        head: 2.0,
        refId: 'win-bath2-S',
      },
    ],
  },
  // Bath2 south wall stub over the service yard (up to the HS west boundary).
  // Plan: hollow double lines (normal partition).
  {
    id: 'wall-int-mid-S',
    start: [4.655, 6.825],
    end: [5.765, 6.825],
    thickness: 'internal',
    structure: 'brick-partition',
    cutouts: [],
  },
  // Household shelter south wall (RC ring, solid black on the plan) over the
  // service-yard + kitchen band — split from the bath2 stub for the same
  // reason as `wall-int-hs-N`. Thickened to 300 mm RC; HS south face moves
  // 6.775 → 6.675 (depth 1.85 → 1.65), and the kitchen's north face (the
  // only adjoining room whose rect actually meets this wall — serviceYard
  // borders the unaffected `wall-int-mid-S` stub instead) moves
  // 6.875 → 6.975.
  {
    id: 'wall-int-hs-S',
    start: [5.765, 6.825],
    end: [8.215, 6.825],
    thickness: 'internal',
    thicknessM: 0.3,
    structure: 'load-bearing',
    cutouts: [],
  },
  // Service yard east wall = kitchen west wall. Plan: hollow double lines.
  {
    id: 'wall-int-shelter-E',
    start: [6.175, 6.825],
    end: [6.175, 9.225],
    thickness: 'internal',
    structure: 'brick-partition',
    cutouts: [
      // Service yard access door — gap cz=[7.60, 8.40] → offset 0.775.
      {
        kind: 'door',
        offset: 0.775,
        width: DOOR_W,
        sill: 0,
        head: DOOR_HEAD,
        refId: 'door-serviceYard',
      },
    ],
  },
]

// Door leaf styles/materials follow the "Serangoon North Vista" HDB spec
// (assets/guidelines/specs.png + assets/ocs door photos):
//  - Entrance: laminated TIMBER door (flush slab, warm grain) + an HDB metal
//    security gate hinged at the same jamb, outside the leaf (`gate: true`).
//  - Bedrooms: laminated UPVC flush doors, timber-look grain (flush slab, not
//    panelled — the OCS photos show a plain laminate face).
//  - Bathrooms: laminated UPVC FOLDING (bifold) doors, vinyl finish.
//  - Household shelter: metal blast door (kept as-is — Door.tsx already
//    special-cases its id for the reinforced-slab look; `material: 'metal'`
//    now also drives that from the spec field).
//  - Service yard: aluminium-framed door with a glazed panel.
export const DOORS: DoorSpec[] = [
  {
    id: 'door-main',
    wallId: 'wall-ext-SE-step',
    offset: 0.7,
    width: MAIN_DOOR_W,
    hinge: 'start',
    swing: 'right',
    defaultOpen: false,
    style: 'flush',
    material: 'wood',
    color: '#8a6a4a',
    gate: true,
  },
  {
    id: 'door-mainBedroom',
    wallId: 'wall-int-mb-foyer-E',
    offset: 0.15,
    width: DOOR_W,
    hinge: 'start',
    swing: 'right',
    defaultOpen: false,
    style: 'flush',
    material: 'wood',
    color: '#a9825c',
  },
  {
    id: 'door-bedroom2',
    wallId: 'wall-int-bedroom-S',
    offset: 1.66,
    width: DOOR_W,
    hinge: 'start',
    swing: 'left',
    defaultOpen: false,
    style: 'flush',
    material: 'wood',
    color: '#a9825c',
  },
  {
    id: 'door-bedroom3',
    wallId: 'wall-int-bedroom-S',
    offset: 3.05,
    width: DOOR_W,
    hinge: 'end',
    swing: 'right',
    defaultOpen: false,
    style: 'flush',
    material: 'wood',
    color: '#a9825c',
  },
  {
    id: 'door-bath1',
    wallId: 'wall-int-corridor-S',
    offset: 1.125,
    width: DOOR_W,
    hinge: 'start',
    swing: 'right',
    defaultOpen: false,
    style: 'bifold',
    material: 'vinyl',
    color: '#cfc8bd',
  },
  {
    // Folds INTO the bath (south of `wall-int-corridor-S`), not out into the
    // corridor: the leaf's physical side is `swing` × the hinge jamb (see
    // `doorSwing.ts:swingForPhysicalSide`), so an END-hinged door needs
    // `swing: 'left'` to land on the same +Z side `door-bath1` reaches with
    // start-hinged `'right'`. It read `'right'` and folded out over the walkway.
    id: 'door-bath2',
    wallId: 'wall-int-corridor-S',
    offset: 3.35,
    width: DOOR_W,
    hinge: 'end',
    swing: 'left',
    defaultOpen: false,
    style: 'bifold',
    material: 'vinyl',
    color: '#cfc8bd',
  },
  {
    id: 'door-householdShelter',
    wallId: 'wall-int-hs-N',
    offset: 0.35,
    width: DOOR_W,
    hinge: 'start',
    swing: 'left',
    defaultOpen: false,
    material: 'metal',
  },
  {
    id: 'door-serviceYard',
    wallId: 'wall-int-shelter-E',
    offset: 0.775,
    width: DOOR_W,
    hinge: 'start',
    swing: 'right',
    defaultOpen: false,
    style: 'glazed',
    material: 'metal',
    color: '#9aa0a6',
  },
]

export const WINDOWS: WindowSpec[] = [
  {
    id: 'win-mainBedroom-N',
    wallId: 'wall-ext-N-west',
    offset: 0.7,
    width: MB_N_WIN_W,
    sill: WIN_SILL,
    head: N_WIN_HEAD,
    style: 'grille',
  },
  {
    id: 'win-bedroom2-N',
    wallId: 'wall-ext-N-west',
    offset: 3.65,
    width: B2_N_WIN_W,
    sill: WIN_SILL,
    head: N_WIN_HEAD,
    style: 'grille',
  },
  {
    id: 'win-bedroom3-N',
    wallId: 'wall-ext-N-east',
    offset: 0.04,
    width: B3_N_WIN_W,
    sill: WIN_SILL,
    head: N_WIN_HEAD,
    style: 'grille',
  },
  {
    id: 'win-livingDining-N',
    wallId: 'wall-ext-NE-jog-S',
    offset: 0.42,
    width: LD_NORTH_WIN_W,
    sill: WIN_SILL,
    head: N_WIN_HEAD,
    style: 'grille',
  },
  {
    id: 'win-bath1-S',
    wallId: 'wall-int-bath1-acLedge',
    offset: 0.885,
    width: BATH1_S_WIN_W,
    sill: 1.3,
    head: 2.0,
    // Bathroom ventilation window: a grille-less frosted awning vent,
    // landscape (wider than tall).
    style: 'awning',
    glass: 'frosted',
  },
  {
    id: 'win-bath2-S',
    wallId: 'wall-int-bath1-acLedge',
    offset: 2.5,
    width: BATH2_S_WIN_W,
    sill: 1.6,
    head: 2.0,
    // Bathroom ventilation window: a grille-less frosted awning vent,
    // landscape (wider than tall), top aligned with the bath1 window head.
    style: 'awning',
    glass: 'frosted',
  },
]

// Total interior area, summing each room's main rectangle plus any extension.
// The plan states 90 m² internal (centre-line computed); the rect sum landed
// at ≈ 90.1 m² through v0.23.1.7 (wall-thickness insets offset by the
// livingDining rect's deliberate overlap slivers; the south wall's 300 mm
// thickening trimmed ~0.27 m² off the kitchen + service yard vs. the flat's
// usual 200 mm gauge). v0.23.1.8 thickened every OTHER full-black-run wall
// (the household-shelter RC ring, wall-int-b3-LD-col, wall-ext-bath1-W,
// wall-ext-SE-jog-W, wall-ext-SE-step, wall-ext-W) to the same real 300 mm
// RC/gable-end gauge — a legitimate further loss of ≈2.37 m² (the household
// shelter alone, now correctly modeled at 300 mm RC on all four sides
// instead of the old 100 mm partition gauge, drops from 4.35 to 3.55 m²),
// landing the rect sum at ≈ 87.8 m², enforced by the constants test (updated
// to match — see its comment). The AC ledge (external) is on top, toward
// the 93 m² gross figure.
// v0.30.3.2: `roomArea` is now the shoelace over the room's OUTLINE
// (`roomGeometry.ts:roomFloorArea`) rather than a naive sum of its parts, so a
// multi-part room counts a shared/overlapping edge once. With livingDining's
// declared parts no longer overlapping bedroom3 + the corridor, this constant
// is a true non-overlapping interior total for the first time.
export function roomArea(r: RoomDef): number {
  return roomFloorArea(r)
}

export const INTERIOR_AREA_M2 = Object.values(ROOMS)
  .filter((r) => !r.external)
  .reduce((acc, r) => acc + roomArea(r), 0)
