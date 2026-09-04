/** Hand-authored HDB flat starter plans. Builders return a complete FloorPlan. */

import type { FloorPlan, PlanUpperLevel } from '../types'
import { door, iwall, perimeter, room, T, window } from './shared'

// ── Representative Singapore HDB flat types ──────────────────────────────────
// Authored from public, synthesised typicals (docs/research/hdb-floor-plans.md):
// rooms are non-overlapping rectangles within a bounding footprint; entrance on
// the south (front) wall, windows on the exterior, ceiling 2.6 m (HDB standard).
// The built-in default flat is the L-shaped Serangoon North Vista 4-room; these
// are generic starters covering the common flat types.

/** HDB 2-Room Flexi (~38 m²). */
export function hdb2Room(): FloorPlan {
  const W = 6.0
  const D = 6.4
  return {
    id: 'tpl-hdb-2room',
    name: 'HDB 2-Room Flexi',
    ceilingHeight: 2.6,
    extent: [W, D],
    walls: [
      ...perimeter('h2', W, D),
      iwall('h2-bed-s', [T, 3.2], [3.3, 3.2]),
      iwall('h2-bed-e', [3.3, T], [3.3, 3.2]),
      iwall('h2-bath-w', [3.7, 4.0], [3.7, D - T]),
      iwall('h2-bath-n', [3.7, 4.0], [W - T, 4.0]),
    ],
    openings: [
      // MAIN-DOOR-ROOM (i): offset 1.2 on `h2-s` put the front door at x 4.7-3.8
      // — inside the BATHROOM. `h2-s` runs east→west from x=5.9 and the living
      // room lines offsets 2.4-5.7 of it. 3.5 (x 2.4-1.5) is the position that
      // also leaves the living its TV console: at 2.6 and 4.6 the door's keep-out
      // took the console wall, measured as 899 -> 898 and 896 items.
      door('h2-main', 'h2-s', 2.6),
      door('h2-bed', 'h2-bed-s', 1.0),
      door('h2-bath', 'h2-bath-n', 0.6, 0.7),
      // West end of the master's north frontage (was 1.2): with the master's
      // SECOND window removed, its wardrobe had only this wall left and stood in
      // front of the glass. At 0.3 the run x 1.9-3.2 stays clear for it.
      window('h2-bed-win', 'h2-n', 0.3, 1.6),
      window('h2-kit-win', 'h2-n', 4.0, 1.2),
      // `h2-w` runs south→north from z=6.3, so offset 4.2 sat at z 2.1-0.7 —
      // inside the MASTER BEDROOM, which already has `h2-bed-win`, leaving the
      // living/dining with no window at all. The living lines offsets 0.1-2.9.
      window('h2-liv-win', 'h2-w', 0.8, 1.4),
    ],
    rooms: [
      room('h2-master', 'Master Bedroom', 0.2, 0.2, 3.1, 3.0, 'floor-wood-walnut', 'masterBedroom'),
      room('h2-kit', 'Kitchen', 3.5, 0.2, 2.3, 2.2, 'floor-tile-grey', 'kitchen'),
      room('h2-shelter', 'Household Shelter', 3.5, 2.4, 1.5, 1.4, 'floor-tile-grey', 'shelter'),
      room('h2-living', 'Living / Dining', 0.2, 3.4, 3.3, 2.8, 'floor-wood-oak', 'living'),
      room('h2-bath', 'Bathroom', 3.8, 4.0, 1.7, 2.2, 'floor-tile-marble', 'bath'),
    ],
  }
}

/** HDB 3-Room (~65 m²). */
export function hdb3Room(): FloorPlan {
  const W = 7.6
  const D = 8.6
  return {
    id: 'tpl-hdb-3room',
    name: 'HDB 3-Room',
    ceilingHeight: 2.6,
    extent: [W, D],
    walls: [
      ...perimeter('h3', W, D),
      iwall('h3-liv-w', [4.0, 2.8], [4.0, D - T]),
      iwall('h3-svc-s', [T, 2.8], [4.0, 2.8]),
      // The wing keeps its original topology: `h3-m-e` fences the master behind a
      // narrow strip that also serves Bedroom 2, and `h3-b2-n` stops at x=3.4 so
      // the strip stays open to it. The plan was simply ONE DOOR short — nothing
      // pierced `h3-liv-w`, so the whole wing had no way in (v0.31.8.31).
      //
      // Exactly one door goes on `h3-liv-w`, deliberately: the living room is
      // only 3.2 m wide, and a SECOND door's swing keep-out on that wall strands
      // the 4th dining chair 2.2 m from its table. Measured both ways — one door
      // passes the tuck test, two do not, and narrowing them to 0.8 m or moving
      // them to the wall ends changed nothing.
      // Extended to MEET `h3-svc-s` (z=2.8) and `h3-b2-n` (z=5.6): it used to
      // stop 0.1 m short at both ends, so the plan shipped with a stray-wall
      // integrity warning. `h3-b2-n` still stops at x=3.4, which is what keeps
      // the strip open to Bedroom 2.
      iwall('h3-m-e', [3.4, 2.8], [3.4, 5.6]),
      iwall('h3-b2-n', [T, 5.6], [3.4, 5.6]),
      // Master Bath was sharing one volume with Bedroom 2 — no wall between.
      iwall('h3-mb-e', [1.9, 5.6], [1.9, D - T]),
      // Common Bath was open to the kitchen and living room.
      // SHELTER-ENCLOSURE (v0.31.8.63). A household shelter is a reinforced-concrete
      // box, and a drawing set has to show its enclosure — but this template
      // authored the room rectangle and only the ONE boundary wall it happened to
      // share with the facade, so `shelterWallIds` returned 1 of 4, the hackability
      // overlay could mark only that one NOT PERMITTED, and the 3D shell rendered
      // the shelter open on three sides. The pattern here is `tpl-hdb-3gen`'s and
      // `tpl-hdb-jumbo`'s, which were already enclosed: side walls plus a south
      // wall carrying the 0.7 m shelter door.
      // Centrelines are offset half a wall thickness OUTWARD from the shelter's
      // room rectangle (4.5 -> 4.45, 2.2 -> 2.25) so the wall FACES land exactly
      // on the room edge. Authoring the centreline on the edge instead — which
      // most of the library does — leaves the rect overlapping the wall body by
      // 0.05 m, which is one of the four populations `roomRectWalls.test.ts`
      // measures. New walls should be flush.
      iwall('h3-hs-w', [4.45, T], [4.45, 2.25]),
      iwall('h3-hs-s', [4.45, 2.25], [6.0, 2.25]),
      iwall('h3-cb-w', [6.0, T], [6.0, 2.4]),
      iwall('h3-cb-s', [6.0, 2.4], [W - T, 2.4]),
    ],
    openings: [
      door('h3-main', 'h3-s', 5.2),
      door('h3-wing', 'h3-liv-w', 0.7),
      door('h3-master', 'h3-m-e', 1.2),
      // The Master Bath opens off the master, making it a real ensuite.
      door('h3-mbath', 'h3-b2-n', 0.5, 0.7),
      door('h3-cbath', 'h3-cb-s', 0.6, 0.7),
      door('h3-hs', 'h3-hs-s', 0.45, 0.7),
      window('h3-kit-win', 'h3-n', 1.2, 1.6),
      window('h3-m-win', 'h3-w', 3.6, 1.5),
      // BEDROOM-WINDOW (h): offset 6.4 on `h3-w` (which runs south→north from
      // z=8.4) sat at z=2.0 — in the KITCHEN. Bedroom 2 does not reach that wall
      // at all; its own external wall is `h3-s`, where offsets 3.4-5.4 line it.
      window('h3-b2-win', 'h3-s', 3.5, 1.4),
      window('h3-liv-win', 'h3-e', 5.0, 1.8),
    ],
    rooms: [
      room('h3-kit', 'Kitchen', 0.2, 0.2, 2.6, 2.4, 'floor-tile-grey', 'kitchen'),
      room('h3-yard', 'Service Yard', 2.9, 0.2, 1.5, 1.6, 'floor-tile-grey', 'serviceYard'),
      room('h3-shelter', 'Household Shelter', 4.5, 0.2, 1.5, 2.0, 'floor-tile-grey', 'shelter'),
      room('h3-cbath', 'Common Bath', 6.1, 0.2, 1.3, 2.1, 'floor-tile-white', 'bath'),
      room('h3-living', 'Living / Dining', 4.2, 2.8, 3.2, 5.6, 'floor-wood-oak', 'living'),
      room('h3-master', 'Master Bedroom', 0.2, 2.8, 3.0, 2.6, 'floor-wood-oak', 'masterBedroom'),
      room('h3-mbath', 'Master Bath', 0.2, 5.7, 1.6, 1.9, 'floor-tile-marble', 'bath'),
      room('h3-bed2', 'Bedroom 2', 2.0, 5.6, 2.0, 2.8, 'floor-wood-walnut', 'bedroom'),
    ],
  }
}

/** HDB 4-Room, generic (~90 m²). */
export function hdb4Room(): FloorPlan {
  const W = 9.2
  const D = 9.8
  return {
    id: 'tpl-hdb-4room',
    name: 'HDB 4-Room',
    ceilingHeight: 2.6,
    extent: [W, D],
    walls: [
      ...perimeter('h4', W, D),
      iwall('h4-liv-w', [5.7, 2.2], [5.7, D - T]),
      iwall('h4-svc-s', [T, 2.9], [5.6, 2.9]),
      iwall('h4-b2-e', [3.0, 3.2], [3.0, 6.2]),
      iwall('h4-m-n', [T, 6.5], [3.6, 6.5]),
    ],
    openings: [
      // MAIN-DOOR-ROOM (v0.31.5.115): was 6.4, which put the front door at
      // x=2.25 — inside the MASTER BEDROOM. `h4-s` runs east→west, so the offset
      // is measured from x=9.1; 9.0 - 6.4 - 0.9 = 1.7 is the exact mirror and
      // lands the door at x=6.95, in the Living / Dining room.
      door('h4-main', 'h4-s', 1.7),
      door('h4-master', 'h4-m-n', 1.0),
      // SERVICE-BAND-ACCESS (v0.31.8.83). `h4-svc-s` (z=2.9) carried NO opening,
      // so the kitchen/yard/shelter band and the living room were sealed from the
      // whole bedroom half: `templateConnectivity` counted two groups. The only
      // other candidate wall is `h4-liv-w`, and every offset on it opens straight
      // into a BEDROOM or a BATH, which is the thing item (f) is trying to remove.
      // CORRECTION (v0.31.8.84): the offset lands on undeclared circulation to the
      // NORTH only. To the south it opens into BEDROOM 3 — measured 0.5 m past
      // the leaf. The strip between z=2.9 and bedroom 3's edge at z=3.4 is 0.5 m
      // and is not a corridor.
      //
      // It is kept anyway, and the trade is explicit: before this door the whole
      // bedroom half of the flat could not be reached at all. A corridorless
      // bedroom zone leaves nothing else to open onto — which is exactly the
      // content problem `docs/open-graphics-decisions.md` item (f) defers, and
      // exactly why `bedroomPrivacy.test.ts` exists alongside
      // `templateConnectivity.test.ts`: connected is not the same as private.
      door('h4-svc-door', 'h4-svc-s', 4.0),
      window('h4-kit-win', 'h4-n', 1.4, 1.6),
      window('h4-b2-win', 'h4-w', 4.0, 1.4),
      // BEDROOM-WINDOW (v0.31.5.115): was 7.4, which put the master's window at
      // z=1.5 — in the KITCHEN, leaving the master with four blank walls.
      // `h4-w` runs north→south from z=9.7; 9.6 - 7.4 - 1.6 = 0.6 mirrors it to
      // z=8.3, inside the Master Bedroom.
      window('h4-m-win', 'h4-w', 0.6, 1.6),
      window('h4-liv-win', 'h4-e', 5.0, 2.0),
    ],
    rooms: [
      room('h4-kit', 'Kitchen', 0.2, 0.2, 3.0, 2.6, 'floor-tile-grey', 'kitchen'),
      room('h4-yard', 'Service Yard', 3.3, 0.2, 1.5, 1.6, 'floor-tile-grey', 'serviceYard'),
      room('h4-shelter', 'Household Shelter', 5.0, 0.2, 1.5, 2.0, 'floor-tile-grey', 'shelter'),
      room('h4-living', 'Living / Dining', 5.8, 2.4, 3.2, 7.2, 'floor-wood-oak', 'living'),
      room('h4-bed2', 'Bedroom 2', 0.2, 3.2, 2.8, 3.0, 'floor-wood-walnut', 'bedroom'),
      room('h4-bed3', 'Bedroom 3', 3.2, 3.2, 2.4, 3.0, 'floor-wood-walnut', 'bedroom'),
      room('h4-cbath', 'Common Bath', 3.7, 6.6, 1.6, 1.3, 'floor-tile-white', 'bath'),
      room('h4-master', 'Master Bedroom', 0.2, 6.6, 3.4, 3.0, 'floor-wood-oak', 'masterBedroom'),
      room('h4-mbath', 'Master Bath', 3.7, 8.0, 1.6, 1.6, 'floor-tile-marble', 'bath'),
    ],
  }
}

/** HDB 5-Room (~115 m²). */
export function hdb5Room(): FloorPlan {
  const W = 10.4
  const D = 11.0
  return {
    id: 'tpl-hdb-5room',
    name: 'HDB 5-Room',
    ceilingHeight: 2.6,
    extent: [W, D],
    walls: [
      ...perimeter('h5', W, D),
      iwall('h5-liv-w', [6.2, 2.2], [6.2, D - T]),
      iwall('h5-svc-s', [T, 3.2], [6.0, 3.2]),
      iwall('h5-b2-e', [3.2, 3.6], [3.2, 6.9]),
      iwall('h5-m-n', [T, 7.2], [3.8, 7.2]),
    ],
    openings: [
      // MAIN-DOOR-ROOM (i): offset 7.2 on `h5-s` put the front door at x 3.1-2.2
      // — inside the MASTER BEDROOM. That wall is lined ONLY by the master
      // (offsets 6.3-10.1), the master bath (4.4-6.1) and the balcony (0.1-4.0),
      // so there is no correct position on it; the door has to change wall. The
      // living/dining fronts `h5-n` at offsets 6.2-10.1, beside the kitchen and
      // service yard that already front it — the conventional HDB
      // corridor-facing entry. `h5-e` at offset 1.0 measured equally well.
      door('h5-main', 'h5-n', 7.0),
      door('h5-master', 'h5-m-n', 1.0),
      // SERVICE-BAND-ACCESS (v0.31.8.83), same shape as `h4-svc-door`.
      // `h5-svc-s` (z=3.2) carried no opening, sealing the kitchen/yard/shelter
      // band and the living room off from the whole bedroom half.
      //
      // CORRECTION (v0.31.8.84): undeclared circulation to the NORTH only; to the
      // south this opens into BEDROOM 3. See the `h4-svc-door` note for the trade.
      door('h5-svc-door', 'h5-svc-s', 4.2),
      window('h5-kit-win', 'h5-n', 1.6, 1.8),
      window('h5-b2-win', 'h5-w', 4.4, 1.5),
      // BEDROOM-WINDOW (v0.31.5.116): was 8.2, which put the master's window at
      // z=1.9 — in the KITCHEN. `h5-w` runs north→south from z=10.9 (len 10.8),
      // and measuring the wall shows the master occupies offsets 0.4-3.9 while
      // the kitchen occupies 7.8-10.8; 10.8 - 8.2 - 1.6 = 1.0 is the exact
      // mirror and lands the glass at z=9.1, inside the Master Bedroom.
      window('h5-m-win', 'h5-w', 1.0, 1.6),
      window('h5-liv-win', 'h5-e', 6.0, 2.2),
    ],
    rooms: [
      room('h5-kit', 'Kitchen', 0.2, 0.2, 3.0, 3.0, 'floor-tile-grey', 'kitchen'),
      room('h5-yard', 'Service Yard', 3.3, 0.2, 1.5, 1.8, 'floor-tile-grey', 'serviceYard'),
      room('h5-shelter', 'Household Shelter', 4.9, 0.2, 1.3, 2.0, 'floor-tile-grey', 'shelter'),
      room('h5-living', 'Living / Dining', 6.3, 0.2, 3.9, 8.4, 'floor-wood-oak', 'living'),
      room('h5-balcony', 'Balcony', 6.3, 8.8, 3.9, 1.8, 'floor-terrazzo', 'balcony'),
      room('h5-bed2', 'Bedroom 2', 0.2, 3.4, 3.0, 3.3, 'floor-wood-walnut', 'bedroom'),
      room('h5-bed3', 'Bedroom 3', 3.4, 3.4, 2.8, 3.2, 'floor-wood-walnut', 'bedroom'),
      room('h5-master', 'Master Bedroom', 0.2, 7.0, 3.8, 3.5, 'floor-wood-oak', 'masterBedroom'),
      room('h5-cbath', 'Common Bath', 4.2, 6.9, 1.6, 1.9, 'floor-tile-white', 'bath'),
      room('h5-mbath', 'Master Bath', 4.2, 9.0, 1.7, 1.5, 'floor-tile-marble', 'bath'),
    ],
  }
}

/** HDB Executive Apartment (single-floor, ~138 m²): 3 bedrooms + open study,
 *  2 baths, large living/dining, kitchen + service yard + shelter. */
export function hdbExecutive(): FloorPlan {
  const W = 11.6
  const D = 12.2
  return {
    id: 'tpl-hdb-exec',
    name: 'HDB Executive Apartment',
    ceilingHeight: 2.6,
    extent: [W, D],
    walls: [
      ...perimeter('ex', W, D),
      // North service band (kitchen / yard / shelter) divider.
      iwall('ex-svc-s', [T, 3.2], [7.0, 3.2]),
      iwall('ex-kit-e', [3.4, T], [3.4, 3.2]),
      iwall('ex-yard-e', [5.2, T], [5.2, 3.2]),
      // Living / dining occupies the east side; partition from service+beds.
      // SHELTER-ENCLOSURE (v0.31.8.66) — south wall, the fourth side.
      iwall('ex-hs-s', [5.3, 2.25], [6.8, 2.25]),
      iwall('ex-liv-w', [7.0, T], [7.0, D - T]),
      // Bedroom column on the west, below the service band.
      iwall('ex-b-corr', [3.6, 6.6], [3.6, D - T]),
      iwall('ex-b2-s', [T, 6.6], [3.6, 6.6]),
      iwall('ex-m-n', [T, 9.2], [3.6, 9.2]),
      // Study nook off the living's north-east.
      iwall('ex-study-s', [7.0, 2.6], [W - T, 2.6]),
    ],
    openings: [
      // MAIN-DOOR-ROOM (v0.31.5.118): was 8.4, which put the front door at
      // offsets 8.4-9.3 — inside the MASTER BEDROOM (which lines 8.0-11.4 of
      // this wall). `ex-s` runs east→west (len 11.4); 11.4 - 8.4 - 0.9 = 2.1 is
      // the exact mirror and lands it in ex-living, which lines 0.1-4.3.
      door('ex-main', 'ex-s', 2.1),
      // v0.31.8.38: the last rooms in the library with NO door. Wall + offset
      // from the same scan, placed at a wall END — mid-wall offsets cost a queen
      // bed, a kitchen counter and a washing machine in earlier batches.
      door('ex-liv-door', 'ex-liv-w', 3.3),
      // STUDY-ACCESS (v0.31.8.82). `ex-study-s` carried NO opening, so the study's
      // only way in was `ex-liv-w`'s z 1.1-2.0 door — which opens WEST into the
      // kitchen/yard band, not into the living room. So the study was grouped with
      // the service band and `templateConnectivity` counted two sealed groups for
      // this flat: {kitchen, yard, shelter, study} and {living, bedrooms}. A study
      // you reach through the kitchen is also just wrong for the room.
      //
      // One door mid-wall connects study to living, and because the study already
      // touches the service band, it becomes the bridge that joins both groups.
      door('ex-study-door', 'ex-study-s', 1.8),
      // EAST end of the kitchen's run: at 0.15 the door's keep-out took the
      // stove wall and the room lost its RANGE HOOD.
      // Service band reached from the LIVING column, not through a bedroom.
      // v0.31.8.38 put these three on `ex-svc-s`, whose south side is entirely
      // bedroom 3 — so the kitchen, yard and shelter were entered by crossing
      // somebody's bedroom. `ex-liv-w` is the only wall the band shares with
      // circulation; from there the band chains west through its own dividers.
      door('ex-svc-door', 'ex-liv-w', 1.0),
      // 1.0, not lower down: the shelter ROOM ends at z=2.2 while the wall runs
      // to 3.2, so a door further south touches only the undeclared strip.
      door('ex-hs-door', 'ex-yard-e', 1.0),
      door('ex-hs-s-door', 'ex-hs-s', 0.4, 0.7),
      door('ex-kit-door', 'ex-kit-e', 2.0),
      door('ex-master', 'ex-m-n', 1.0),
      door('ex-b2', 'ex-b2-s', 1.0),
      window('ex-kit-win', 'ex-n', 1.2, 1.8),
      // 5.9, not 7.2: bedroom 2 lines offsets 5.7-8.7 of `ex-w`, so a 1.6 m pane
      // at 7.2 ran to 8.8 — past the room's own edge — and left its wardrobe the
      // only wall it could take, in front of the glass (item (j)).
      window('ex-b2-win', 'ex-w', 5.9, 1.6),
      // BEDROOM-WINDOW (h): `ex-bed2b` had none. It lines offsets 3.1-5.5 of
      // `ex-w`, which is clear between `ex-m-win` (0.4-2.2) and `ex-b2-win`
      // (7.2-8.8).
      window('ex-b2b-win', 'ex-w', 3.6, 1.4),
      // BEDROOM-WINDOW (v0.31.5.118): was 9.8, which put the master's window at
      // offsets 9.8-11.6 — in the KITCHEN (9.2-12.0 of this wall). `ex-w` runs
      // north→south (len 12.0); 12.0 - 9.8 - 1.8 = 0.4 mirrors it into
      // ex-master, which lines 0.1-2.7.
      window('ex-m-win', 'ex-w', 0.4, 1.8),
      window('ex-liv-win', 'ex-e', 5.0, 2.4),
      window('ex-study-win', 'ex-e', 1.0, 1.4),
    ],
    rooms: [
      room('ex-kit', 'Kitchen', 0.2, 0.2, 3.0, 2.8, 'floor-tile-grey', 'kitchen'),
      room('ex-yard', 'Service Yard', 3.5, 0.2, 1.5, 2.8, 'floor-tile-grey', 'serviceYard'),
      room('ex-shelter', 'Household Shelter', 5.3, 0.2, 1.5, 2.0, 'floor-tile-grey', 'shelter'),
      room('ex-study', 'Study', 7.2, 0.2, 4.2, 2.2, 'floor-wood-oak', 'study'),
      room('ex-living', 'Living / Dining', 7.2, 2.8, 4.2, 9.2, 'floor-wood-oak', 'living'),
      room('ex-bed2', 'Bedroom 2', 0.2, 3.4, 3.0, 3.0, 'floor-wood-walnut', 'bedroom'),
      room('ex-bed3', 'Bedroom 3', 3.4, 3.4, 3.4, 3.0, 'floor-wood-walnut', 'bedroom'),
      room('ex-cbath', 'Common Bath', 3.8, 6.6, 2.0, 2.4, 'floor-tile-white', 'bath'),
      room('ex-bed2b', 'Bedroom 2 Hall', 0.2, 6.6, 3.2, 2.4, 'floor-wood-walnut', 'bedroom'),
      room('ex-master', 'Master Bedroom', 0.2, 9.4, 3.4, 2.6, 'floor-wood-oak', 'masterBedroom'),
      room('ex-mbath', 'Master Bath', 3.8, 9.2, 1.9, 2.8, 'floor-tile-marble', 'bath'),
    ],
  }
}

/** HDB 3Gen (~118 m²): 4 bedrooms incl. 2 ensuite, 3 baths, for multi-gen. */
export function hdb3Gen(): FloorPlan {
  const W = 10.6
  const D = 11.4
  return {
    id: 'tpl-hdb-3gen',
    name: 'HDB 3Gen',
    ceilingHeight: 2.6,
    extent: [W, D],
    walls: [
      ...perimeter('g3', W, D),
      // North service band: kitchen | service yard | utility lobby, the lobby
      // holding the household-shelter door (v0.31.8.30).
      iwall('g3-svc-s', [T, 3.0], [6.2, 3.0]),
      iwall('g3-kit-e', [3.2, T], [3.2, 3.0]),
      iwall('g3-yard-e', [4.8, T], [4.8, 3.0]),
      // z=2.0, not 2.2: the utility lobby below it must be deep enough for the
      // living-side door to sit clear of BOTH this wall and the service band at
      // z=3.0. At 2.2 the door straddled this junction.
      iwall('g3-hs-s', [4.8, 2.0], [6.2, 2.0]),
      // Living on the east, running the depth of the flat.
      iwall('g3-liv-w', [6.2, T], [6.2, D - T]),
      // West bedroom column: bedrooms 2 and 3, each off the corridor. It now
      // STOPS at the south wing (was z=D-T, running through the master).
      iwall('g3-b-corr', [3.4, 3.2], [3.4, 8.4]),
      iwall('g3-b3-s', [T, 5.8], [3.4, 5.8]),
      // Common bath, off the corridor. Its west wall used to start at z=3.2
      // while the service band sits at z=3.0, leaving a 0.2 m gap in the
      // enclosure; it now meets it.
      iwall('g3-cb-w', [4.6, 3.0], [4.6, 5.0]),
      iwall('g3-cb-s', [4.6, 5.0], [6.2, 5.0]),
      // Second common bath, also off the corridor, in what was dead corridor
      // floor. The 3Gen type carries three baths; the east wing cannot hold an
      // ensuite (see below), so the third one lives here.
      iwall('g3-b2b-n', [4.6, 6.2], [6.2, 6.2]),
      iwall('g3-b2b-w', [4.6, 6.2], [4.6, 8.4]),
      // South wing, full width: master suite + ensuite (west) and the
      // grandparent suite (east). Before this the "Grandparent Bath" sat 6 m
      // from the grandparent suite, at the opposite end of the flat, and the
      // "Master Bath" floated in the corridor with no walls of its own.
      //
      // The 3Gen type is 4 bedrooms and 3 baths, TWO of them en-suite
      // (docs/research/hdb-floor-plans.md). This plan delivers 4 bedrooms but
      // only ONE ensuite, and that is a MEASURED limit of the envelope, not an
      // oversight: the west wing is 6.1 m wide and hosts a bedroom plus ensuite
      // comfortably, while the east wing is 4.1 m. A `masterBedroom`-kit room
      // needs roughly 9-10 m² before the kit stops being dropped — at 6.2 m²
      // the grandparent suite lost its QUEEN BED and five other pieces — so a
      // furnishable bedroom there leaves at most ~1.1 m for a bath, below any
      // usable width. Both arrangements were built and measured before choosing.
      iwall('g3-s-wing-n', [T, 8.4], [6.2, 8.4]),
      iwall('g3-mb-e', [2.25, 8.4], [2.25, D - T]),
      // Kept at z=8.8 while the WEST wing wall sits at 8.4: pulling this one north
      // too shortened the living room to 8.1 m and stranded a dining chair 7.2 m
      // from its table (the 4th chair no longer fit inside the room).
      iwall('g3-gen-n', [6.2, 8.8], [W - T, 8.8]),
    ],
    openings: [
      // MAIN-DOOR-ROOM (i): offset 7.6 on `g3-s` put the front door at x 2.7-1.8
      // — inside the MASTER BEDROOM. The south wall is now entirely master /
      // ensuite / grandparent suite, so the entry moves to the living room's own
      // external wall on the east, clear of both windows on it.
      door('g3-main', 'g3-e', 1.0),
      // Service line: living → utility lobby → service yard → kitchen, shelter
      // off the lobby. None of these three rooms had a door before.
      // Reaches the service band from the CORRIDOR, not the living room: a door
      // on the living's west wall sat beside its dining zone and stranded a
      // chair there. `g3-svc-s` at x 3.6-4.5 joins the corridor to the yard.
      door('g3-svc-door', 'g3-svc-s', 3.5),
      door('g3-hs', 'g3-hs-s', 0.4, 0.7),
      door('g3-yard-door', 'g3-yard-e', 1.9),
      door('g3-kit-door', 'g3-kit-e', 1.9),
      // Bedroom corridor off the living hall, one door per room.
      // Must clear the common-bath box (z 3.0-5.0) AND the Bathroom 2 box
      // (z 6.2-8.4) on the same side: offset 3.4 opened this door straight into
      // the common bath, which measurably cost the plan furniture.
      door('g3-corr', 'g3-liv-w', 5.0),
      door('g3-bed2', 'g3-b-corr', 1.0),
      door('g3-bed3', 'g3-b-corr', 3.4),
      door('g3-cbath', 'g3-cb-w', 0.8, 0.7),
      door('g3-bath2', 'g3-b2b-w', 0.9, 0.7),
      // Master suite: entered from the corridor, ensuite entered from the room.
      door('g3-master', 'g3-s-wing-n', 4.2),
      door('g3-mbath', 'g3-mb-e', 0.5, 0.8),
      // Grandparent suite: entered from the living, its ensuite from the room.
      // 1.6 until v0.31.9.17, which put the door at x 7.80-8.70 — the MIDDLE of
      // the Grandparent Suite's 3.56 m north wall. Its 0.90 m swing keep-out
      // split that wall into runs of 1.28 m and 1.38 m, and a `bed-queen` is
      // 1.52 m wide: BOTH short by exactly 0.14 m, in every orientation (the
      // depth clear of the keep-out is 1.38 m against a 1.90 m bed, or 1.52 m
      // rotated — the same 0.14 m). So `dropDoorBlockers` deleted the bed and an
      // 8.7 m² suite shipped with two nightstands flanking nothing.
      // At 0.3 the door sits near the west jamb and the clear run is 2.68 m.
      // The room was never too small; the door was centred. Same defect and same
      // remedy as v0.31.8.57's `tpl-condo-2bed` front door.
      door('g3-gen', 'g3-gen-n', 0.3),
      window('g3-kit-win', 'g3-n', 1.2, 1.6),
      // BEDROOM-WINDOW (h): `g3-w` runs SOUTH→NORTH from [0.1, 11.3], so an
      // offset o sits at z = 11.3 − o. `g3-m-win` was at offset 9.6, i.e.
      // z = 1.7 — inside the KITCHEN — and `g3-b3-win` at 7.0 sat at z = 4.3,
      // inside BEDROOM 2. Both bedroom windows are now on their own rooms, and
      // the master takes one on the south wall it actually owns.
      window('g3-b2-win', 'g3-w', 5.9, 1.5),
      window('g3-b3-win', 'g3-w', 3.3, 1.5),
      window('g3-m-win', 'g3-s', 5.0, 1.6),
      window('g3-gen-win', 'g3-e', 9.2, 1.5),
      window('g3-liv-win', 'g3-e', 6.0, 2.0),
    ],
    rooms: [
      room('g3-kit', 'Kitchen', 0.2, 0.2, 2.8, 2.6, 'floor-tile-grey', 'kitchen'),
      room('g3-yard', 'Service Yard', 3.3, 0.2, 1.5, 2.6, 'floor-tile-grey', 'serviceYard'),
      room('g3-shelter', 'Household Shelter', 4.9, 0.2, 1.3, 1.7, 'floor-tile-grey', 'shelter'),
      room('g3-living', 'Living / Dining', 6.4, 0.2, 3.8, 8.5, 'floor-wood-oak', 'living'),
      room('g3-cbath', 'Common Bath', 4.7, 3.1, 1.4, 1.8, 'floor-tile-white', 'bath'),
      room('g3-bath2', 'Bathroom 2', 4.7, 6.3, 1.4, 2.0, 'floor-tile-white', 'bath'),
      room('g3-bed2', 'Bedroom 2', 0.2, 3.3, 3.1, 2.4, 'floor-wood-walnut', 'bedroom'),
      room('g3-bed3', 'Bedroom 3', 0.2, 5.9, 3.1, 2.4, 'floor-wood-walnut', 'bedroom'),
      room('g3-mbath', 'Master Bath', 0.2, 8.5, 2.0, 2.7, 'floor-tile-marble', 'bath'),
      room('g3-master', 'Master Bedroom', 2.3, 8.5, 3.8, 2.7, 'floor-wood-oak', 'masterBedroom'),
      room('g3-gen', 'Grandparent Suite', 6.4, 8.9, 3.8, 2.3, 'floor-wood-oak', 'masterBedroom'),
    ],
  }
}

/** HDB Jumbo (~190 m²): two combined units — very large, 5 bedrooms, 3 baths,
 *  two living zones, big kitchen + utility. */
export function hdbJumbo(): FloorPlan {
  const W = 14.4
  const D = 13.2
  return {
    id: 'tpl-hdb-jumbo',
    name: 'HDB Jumbo',
    ceilingHeight: 2.6,
    extent: [W, D],
    walls: [
      ...perimeter('jb', W, D),
      // North service band across the rear: kitchen | service yard | utility
      // lobby, the lobby holding the household-shelter door (v0.31.8.29).
      iwall('jb-svc-s', [T, 3.2], [8.4, 3.2]),
      iwall('jb-kit-e', [4.0, T], [4.0, 3.2]),
      iwall('jb-yard-e', [6.0, T], [6.0, 3.2]),
      // Shelter's own south wall, so the RC box is enclosed and the strip below
      // it becomes the utility lobby rather than being part of the shelter.
      iwall('jb-hs-s', [6.0, 2.0], [8.4, 2.0]),
      // Central living spine divides the two former units.
      iwall('jb-liv-w', [8.4, T], [8.4, D - T]),
      // West bedroom stack, entered from the corridor (x 4.0-8.4) rather than
      // through the neighbouring bedroom.
      iwall('jb-wb-corr', [4.0, 3.2], [4.0, D - T]),
      iwall('jb-b2-s', [T, 6.8], [4.0, 6.8]),
      iwall('jb-m-n', [T, 9.6], [4.0, 9.6]),
      // Master ensuite: the bath takes a full-depth strip on the west and the
      // master the rest, instead of three rooms sharing one volume.
      //
      // An L-shaped master was tried first and was WRONG: the enclosure is only
      // 3.5 m deep, so no leg of the L was deeper than 1.8 m and a 2.0 m queen
      // bed could not be placed at all — measured as `bed-queen` 2 → 1 across
      // the template, i.e. a master bedroom shipping with no bed. A 2.1 × 3.3 m
      // master takes the bed along its long axis with a 0.6 m side walkway.
      iwall('jb-mb-e', [1.75, 9.6], [1.75, D - T]),
      // Common Bath, moved OUT of the master enclosure to open off the corridor
      // (the decision recorded for item (f)) — its name says common, so it must
      // be reachable without entering the master bedroom.
      iwall('jb-cb-n', [6.3, 9.6], [8.4, 9.6]),
      iwall('jb-cb-w', [6.3, 9.6], [6.3, 11.8]),
      iwall('jb-cb-s', [6.3, 11.8], [8.4, 11.8]),
      // East column: second living + two more bedrooms toward the south.
      iwall('jb-eliv-s', [8.4, 6.6], [W - T, 6.6]),
      iwall('jb-eb-mid', [11.4, 6.6], [11.4, D - T]),
      // Bedrooms 4 and 5 were one undivided volume.
      iwall('jb-b45', [11.4, 9.9], [W - T, 9.9]),
    ],
    openings: [
      // MAIN-DOOR-ROOM (v0.31.5.119): was 9.2, which put the front door at
      // offsets 9.2-10.1 — inside the MASTER BEDROOM (which lines 8.6-12.2 of
      // this wall). `jb-s` runs east→west (len 14.2); 14.2 - 9.2 - 0.9 = 4.1 is
      // the exact mirror and lands it in jb-family, the Family Room (3.1-5.8),
      // a living-category space. The Living / Dining never touches this wall —
      // it fronts jb-n and jb-e — so the Family Room is the correct target.
      door('jb-main', 'jb-s', 4.1),
      // Service line: living → utility lobby → service yard → kitchen, with the
      // shelter opening off the lobby. Before v0.31.8.29 the kitchen, yard and
      // shelter had NO doors at all and were sealed off from the flat.
      door('jb-lobby', 'jb-liv-w', 2.6),
      door('jb-hs', 'jb-hs-s', 0.6, 0.7),
      // Both walls are 3.1 m long (z 0.1-3.2), so a 0.9 m door cannot start
      // later than 2.2. These sit at z 2.2-3.1, i.e. SOUTH of the shelter's own
      // south wall (z=2.0) — a door higher up would cross that junction and
      // breach the shelter enclosure.
      door('jb-yard-door', 'jb-yard-e', 2.1),
      door('jb-kit-door', 'jb-kit-e', 2.1),
      // Bedroom corridor off the living hall, then one door per room. The old
      // plan chained bed2 → bed3 → master through internal walls with no way in
      // from the rest of the flat.
      door('jb-corr', 'jb-liv-w', 4.4),
      door('jb-bed2', 'jb-wb-corr', 1.6),
      door('jb-bed3', 'jb-wb-corr', 4.7),
      door('jb-master', 'jb-wb-corr', 7.1),
      door('jb-mbath', 'jb-mb-e', 0.9, 0.8),
      door('jb-cbath', 'jb-cb-w', 1.0, 0.8),
      // East column.
      door('jb-family', 'jb-eliv-s', 1.1),
      door('jb-bed4', 'jb-eb-mid', 1.4),
      door('jb-bed5', 'jb-eb-mid', 4.9),
      window('jb-kit-win', 'jb-n', 1.6, 1.8),
      window('jb-b2-win', 'jb-w', 7.4, 1.6),
      // BEDROOM-WINDOW (h): `jb-m-win` was at offset 10.2 on `jb-w`, which runs
      // SOUTH→NORTH from [0.1, 13.1] — so it sat at z = 13.1 − 10.2 = 2.9, i.e.
      // in the KITCHEN, giving that room a second window and the master none.
      // The master no longer reaches `jb-w` (the ensuite strip does), so its own
      // external wall is the south perimeter: `jb-s` runs east→west from x=14.3,
      // and offset 10.8 spans x 3.5→2.1, inside the master's 1.8-3.9.
      window('jb-m-win', 'jb-s', 10.8, 1.4),
      // Bedroom 3 owned no window either (z 7.0-9.4 → offsets 3.7-6.1).
      window('jb-b3-win', 'jb-w', 4.6, 1.4),
      window('jb-liv-win', 'jb-e', 2.0, 2.2),
      // 6.9, not 8.0: bedroom 4 lines offsets 6.7-9.6 of `jb-e`, and at the far
      // end of its span the wardrobe had nowhere but the glass wall (item (j)).
      window('jb-b4-win', 'jb-e', 6.9, 1.6),
      window('jb-b5-win', 'jb-e', 11.0, 1.6),
    ],
    rooms: [
      // The central strip between the bedroom wing and the living column. It was
      // undeclared — 55 m², THIRTY-ONE PERCENT of this flat's interior floor,
      // belonging to no room, so the area readout, floor finish and socket counts
      // all ignored it (measured v0.31.8.45; the hand-authored default flat is
      // 4%). A jumbo is two merged units, so a hall this generous is characteristic
      // rather than wasted. L-shaped: the extension is the leg west of the Common
      // Bath, which sits in the strip's south-east corner.
      {
        id: 'jb-hall',
        name: 'Hall',
        origin: [4.1, 3.3],
        width: 4.2,
        depth: 6.2,
        extension: { offset: [0, 6.3], width: 2.1, depth: 3.4 },
        floor: 'floor-tile-grey',
        category: 'foyer',
      },
      room('jb-kit', 'Kitchen', 0.2, 0.2, 3.6, 2.8, 'floor-tile-grey', 'kitchen'),
      room('jb-yard', 'Service Yard', 4.2, 0.2, 1.6, 2.8, 'floor-tile-grey', 'serviceYard'),
      room('jb-shelter', 'Household Shelter', 6.2, 0.2, 2.0, 1.7, 'floor-tile-grey', 'shelter'),
      room('jb-living', 'Living / Dining', 8.6, 0.2, 5.6, 6.2, 'floor-wood-oak', 'living'),
      room('jb-family', 'Family Room', 8.6, 6.8, 2.6, 6.2, 'floor-wood-oak', 'living'),
      room('jb-bed4', 'Bedroom 4', 11.6, 6.8, 2.6, 2.9, 'floor-wood-walnut', 'bedroom'),
      room('jb-bed5', 'Bedroom 5', 11.6, 10.1, 2.6, 2.9, 'floor-wood-walnut', 'bedroom'),
      room('jb-bed2', 'Bedroom 2', 0.2, 3.4, 3.6, 3.2, 'floor-wood-walnut', 'bedroom'),
      room('jb-bed3', 'Bedroom 3', 0.2, 7.0, 3.6, 2.4, 'floor-wood-walnut', 'bedroom'),
      // Now in the corridor, not inside the master enclosure.
      room('jb-cbath', 'Common Bath', 6.4, 9.7, 1.9, 2.0, 'floor-tile-white', 'bath'),
      // 2.1 x 3.3 = 6.9 m², where the old rectangle claimed 11.5 m² by
      // overrunning the corridor wall at x=4.0 AND both baths.
      room('jb-master', 'Master Bedroom', 1.8, 9.7, 2.1, 3.3, 'floor-wood-oak', 'masterBedroom'),
      room('jb-mbath', 'Master Bath', 0.2, 9.7, 1.5, 3.3, 'floor-tile-marble', 'bath'),
    ],
  }
}

/** HDB Executive Maisonette (~150 m² over two storeys): the classic two-floor
 *  HDB type (phased out 1995, resale only). Lower storey = living/dining,
 *  kitchen + service yard + shelter, WC and a stair hall; upper storey =
 *  3 bedrooms (master ensuite) + 2 baths off a landing. Representative layout
 *  per docs/research/hdb-floor-plans.md (Executive Maisonette section); the
 *  upper storey sits at ceiling (2.6 m) + 0.3 m slab. The 'Stair Hall' room
 *  and the upper 'Stair Landing' are stacked at the same footprint so a
 *  staircase item placed in the hall arrives on the landing. */
export function hdbMaisonette(): FloorPlan {
  const W = 8.4
  const D = 9.4
  const upper: PlanUpperLevel = {
    id: 'em-up',
    name: 'Upper storey',
    elevation: 2.9, // 2.6 m ground ceiling + 0.3 m floor slab
    ceilingHeight: 2.6,
    walls: [
      ...perimeter('emu', W, D),
      // North bedroom band (bedrooms 2/3 + common bath).
      iwall('emu-bed-s', [T, 2.8], [6.6, 2.8]),
      iwall('emu-b23', [3.5, T], [3.5, 2.8]),
      iwall('emu-cbath-w', [6.7, T], [6.7, 2.4]),
      iwall('emu-cbath-s', [6.7, 2.4], [W - T, 2.4]),
      // Master suite on the south-east; ensuite bath north of the bedroom.
      iwall('emu-m-w', [4.5, 3.6], [4.5, D - T]),
      iwall('emu-mb-s', [4.5, 5.7], [W - T, 5.7]),
      // Stair void east edge (landing stacked over the ground stair hall).
      iwall('emu-land-e', [1.9, 3.0], [1.9, 6.6]),
    ],
    openings: [
      door('emu-bed2-door', 'emu-bed-s', 2.2),
      door('emu-bed3-door', 'emu-bed-s', 4.4),
      door('emu-cbath-door', 'emu-cbath-s', 0.4, 0.7),
      door('emu-master-door', 'emu-m-w', 2.6),
      door('emu-mbath-door', 'emu-mb-s', 1.2, 0.8),
      window('emu-b2-win', 'emu-n', 1.0, 1.6),
      window('emu-b3-win', 'emu-n', 4.2, 1.6),
      window('emu-m-win', 'emu-e', 6.4, 1.8),
      window('emu-fam-win', 'emu-w', 0.8, 1.4),
    ],
    rooms: [
      room('emu-bed2', 'Bedroom 2', 0.2, 0.2, 3.2, 2.6, 'floor-wood-walnut', 'bedroom'),
      room('emu-bed3', 'Bedroom 3', 3.6, 0.2, 3.0, 2.6, 'floor-wood-walnut', 'bedroom'),
      room('emu-cbath', 'Common Bath', 6.8, 0.2, 1.4, 2.2, 'floor-tile-white', 'bath'),
      // Stacked over the ground-floor 'Stair Hall' (the stair arrival void).
      room('emu-landing', 'Stair Landing', 0.2, 3.0, 1.6, 3.6, 'floor-wood-oak', 'foyer'),
      room('emu-hall', 'Hall', 2.0, 3.0, 2.4, 3.6, 'floor-wood-oak', 'living'),
      room('emu-mbath', 'Master Bath', 4.6, 3.6, 2.0, 2.0, 'floor-tile-marble', 'bath'),
      room('emu-master', 'Master Bedroom', 4.6, 5.8, 3.6, 3.4, 'floor-wood-oak', 'masterBedroom'),
      room('emu-fam', 'Family Area', 0.2, 6.8, 4.2, 2.4, 'floor-wood-oak', 'living'),
    ],
  }
  return {
    id: 'tpl-hdb-maisonette',
    name: 'HDB Executive Maisonette',
    ceilingHeight: 2.6,
    extent: [W, D],
    walls: [
      ...perimeter('em', W, D),
      // North service band: kitchen / yard / shelter / WC.
      iwall('em-svc-s', [T, 2.8], [6.6, 2.8]),
      iwall('em-kit-e', [3.3, T], [3.3, 2.8]),
      iwall('em-yard-e', [5.0, T], [5.0, 2.8]),
      iwall('em-wc-w', [6.7, T], [6.7, 2.2]),
      // SHELTER-ENCLOSURE (v0.31.8.66), same as `tpl-hdb-3room` in .63. This
      // shelter had three of its four RC walls — `em-n`, `em-yard-e`, `em-wc-w`
      // — and no south wall, so `shelterWallIds` returned 3, the hackability
      // overlay could not mark the fourth side, and the shell rendered it open.
      // The centreline sits 0.05 m south of the room's own edge (2.2 -> 2.25) so
      // the wall FACE lands on the edge; authoring it ON the edge would leave the
      // rect overlapping the wall body, which `roomRectWalls.test.ts` counts.
      iwall('em-hs-s', [5.1, 2.25], [6.6, 2.25]),
      iwall('em-wc-s', [6.7, 2.2], [W - T, 2.2]),
      // Stair hall on the west wall, off the entry corridor.
      iwall('em-stair-n', [T, 3.0], [1.9, 3.0]),
      iwall('em-stair-e', [1.9, 3.0], [1.9, 6.6]),
      // Living/dining occupies the east; family area opens off it (SW).
      iwall('em-liv-w', [3.3, 2.8], [3.3, 6.8]),
      iwall('em-study-n', [T, 6.8], [3.3, 6.8]),
    ],
    openings: [
      door('em-main', 'em-s', 0.6, 1.0),
      door('em-wc', 'em-wc-s', 0.4, 0.7),
      door('em-hs', 'em-hs-s', 0.4, 0.7),
      door('em-study', 'em-study-n', 2.0),
      // v0.31.8.33: the kitchen, service yard and stair hall had no doors — on
      // the maisonette the stair hall is how you reach the upper storey at all,
      // so it was a flat you could not walk through. Offsets from a wall scan.
      door('em-kit-door', 'em-svc-s', 2.07),
      // On the service band's SOUTH wall rather than the yard's east wall: on
      // the east wall its keep-out crowded the yard's own window and pushed the
      // utility cabinet in front of it.
      // Named for the service band, not the yard: it opens onto the band's
      // undeclared strip, from which the yard is reached.
      door('em-svc-door', 'em-svc-s', 3.6),
      door('em-stair-door', 'em-stair-e', 1.4),
      window('em-kit-win', 'em-n', 1.0, 1.6),
      window('em-yard-win', 'em-n', 3.6, 1.0),
      window('em-liv-win', 'em-e', 5.2, 2.2),
      window('em-fam-win', 'em-w', 0.8, 1.4),
    ],
    rooms: [
      room('em-kit', 'Kitchen', 0.2, 0.2, 3.0, 2.6, 'floor-tile-grey', 'kitchen'),
      room('em-yard', 'Service Yard', 3.4, 0.2, 1.5, 1.8, 'floor-tile-grey', 'serviceYard'),
      room('em-shelter', 'Household Shelter', 5.1, 0.2, 1.5, 2.0, 'floor-tile-grey', 'shelter'),
      room('em-wc', 'WC', 6.8, 0.2, 1.4, 1.8, 'floor-tile-white', 'powder'),
      room('em-stair', 'Stair Hall', 0.2, 3.0, 1.6, 3.6, 'floor-wood-oak', 'foyer'),
      room('em-living', 'Living / Dining', 3.4, 3.0, 4.8, 6.2, 'floor-wood-oak', 'living'),
      room('em-study', 'Family Area', 0.2, 6.8, 3.0, 2.4, 'floor-wood-oak', 'living'),
    ],
    upperLevels: [upper],
    // Default pitched roof so the parametric-roof feature is visible out of the
    // box on this multi-storey template (UX research round 3). Additive — a
    // gable at a typical ~30° pitch with a modest eave overhang.
    roof: { style: 'gable', pitchDeg: 30, overhang: 0.4, ridgeAxis: 'auto' },
  }
}

// ── Singapore condominium (private) layouts ─────────────────────────────────
// Authored from docs/research/condo-floor-plans.md. Condos differ from HDB:
// open kitchens on small units, a balcony on nearly every unit (modelled as a
// terrazzo room with a parapet via topHeight on its exterior wall), master
// ensuites, an enclosed kitchen + yard on larger units. Ceilings 2.85 m
// (3.0 m for the penthouse / landed living volume).
