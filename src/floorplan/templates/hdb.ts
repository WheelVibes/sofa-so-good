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
      door('h2-main', 'h2-s', 1.2),
      door('h2-bed', 'h2-bed-s', 1.0),
      door('h2-bath', 'h2-bath-n', 0.6, 0.7),
      window('h2-bed-win', 'h2-n', 1.2, 1.6),
      window('h2-kit-win', 'h2-n', 4.0, 1.2),
      window('h2-liv-win', 'h2-w', 4.2, 1.4),
    ],
    rooms: [
      room('h2-master', 'Master Bedroom', 0.2, 0.2, 3.1, 3.0, 'floor-wood-walnut', 'masterBedroom'),
      room('h2-kit', 'Kitchen', 3.5, 0.2, 2.3, 2.2, 'floor-tile-grey', 'kitchen'),
      room('h2-shelter', 'Household Shelter', 3.5, 2.4, 1.5, 1.4, 'floor-tile-grey', 'storeroom'),
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
      iwall('h3-m-e', [3.4, 2.9], [3.4, 5.5]),
      iwall('h3-b2-n', [T, 5.6], [3.4, 5.6]),
    ],
    openings: [
      door('h3-main', 'h3-s', 5.2),
      door('h3-master', 'h3-m-e', 1.2),
      window('h3-kit-win', 'h3-n', 1.2, 1.6),
      window('h3-m-win', 'h3-w', 3.6, 1.5),
      window('h3-b2-win', 'h3-w', 6.4, 1.4),
      // (h): `h3-bed2` owned no window. `h3-s` is external and 2.8-3.4 is its only clear span
      // wide enough for 1.5 m of glass, so this is centred in it.
      window('h3-b2s-win', 'h3-s', 3.1, 1.5),
      window('h3-liv-win', 'h3-e', 5.0, 1.8),
    ],
    rooms: [
      room('h3-kit', 'Kitchen', 0.2, 0.2, 2.6, 2.4, 'floor-tile-grey', 'kitchen'),
      room('h3-yard', 'Service Yard', 2.9, 0.2, 1.5, 1.6, 'floor-tile-grey', 'serviceYard'),
      room('h3-shelter', 'Household Shelter', 4.5, 0.2, 1.5, 2.0, 'floor-tile-grey', 'storeroom'),
      room('h3-cbath', 'Common Bath', 6.1, 0.2, 1.3, 1.7, 'floor-tile-white', 'bath'),
      room('h3-living', 'Living / Dining', 4.2, 2.8, 3.2, 5.6, 'floor-wood-oak', 'living'),
      room('h3-master', 'Master Bedroom', 0.2, 2.8, 3.0, 2.6, 'floor-wood-oak', 'masterBedroom'),
      room('h3-mbath', 'Master Bath', 0.2, 5.6, 1.6, 1.7, 'floor-tile-marble', 'bath'),
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
      // (f) TEMPLATE-ROOM-ENCLOSURE: `h4-cbath` and `h4-mbath` owned NO walls of their own — a
      // flood fill with every wall solid put them in the same component as the master bedroom, so
      // two toilets and a basin stood in the open with the bed. `h4-m-n` stopped at x=3.6, just
      // short of where they begin.
      //
      // The baths occupy the column x 3.6-5.7 (master's east edge to the existing `h4-liv-w`),
      // z 6.5-9.7, so three partitions close it: a north wall continuing `h4-m-n` east, a west
      // wall splitting master from baths, and a divider between the two baths at z 7.95.
      iwall('h4-bath-n', [3.6, 6.5], [5.7, 6.5]),
      iwall('h4-bath-w', [3.6, 6.5], [3.6, D - T]),
      iwall('h4-bath-mid', [3.6, 7.95], [5.7, 7.95]),
    ],
    openings: [
      // MAIN-DOOR-ROOM (v0.31.5.115): was 6.4, which put the front door at
      // x=2.25 — inside the MASTER BEDROOM. `h4-s` runs east→west, so the offset
      // is measured from x=9.1; 9.0 - 6.4 - 0.9 = 1.7 is the exact mirror and
      // lands the door at x=6.95, in the Living / Dining room.
      door('h4-main', 'h4-s', 1.7),
      door('h4-master', 'h4-m-n', 1.0),
      // Access follows the conventional HDB arrangement the room NAMES already imply: the common
      // bath opens off the living side, the master bath off the master bedroom. Offsets are
      // measured from each wall's own start — `h4-liv-w` starts at z 2.2, `h4-bath-w` at z 6.5 —
      // and centre the door on its room (cbath z 6.6-7.9, mbath z 8.0-9.6).
      door('h4-cbath-door', 'h4-liv-w', 4.6),
      door('h4-mbath-door', 'h4-bath-w', 1.85),
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
      room('h4-shelter', 'Household Shelter', 5.0, 0.2, 1.5, 2.0, 'floor-tile-grey', 'storeroom'),
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
      door('h5-main', 'h5-s', 7.2),
      door('h5-master', 'h5-m-n', 1.0),
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
      room('h5-shelter', 'Household Shelter', 4.9, 0.2, 1.3, 2.0, 'floor-tile-grey', 'storeroom'),
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
      door('ex-master', 'ex-m-n', 1.0),
      door('ex-b2', 'ex-b2-s', 1.0),
      window('ex-kit-win', 'ex-n', 1.2, 1.8),
      window('ex-b2-win', 'ex-w', 7.2, 1.6),
      // (h) BEDROOM-WINDOW: `ex-bed2b` shipped with no window on any of its own walls.
      // ADDED rather than moved: `ex-b2-win`'s MIRRORED offset (7.2 -> 3.2) lands inside
      // `ex-bed2b`, which is what identified the position -- but flipping it merely swaps the
      // glass from `ex-bed2` to `ex-bed2b` and the windowless count stays at 12 (measured).
      // `ex-w` is a perimeter wall, so it is exterior along its length, and 3.2-4.8 is clear
      // of `ex-m-win` (0.4-2.2) and `ex-b2-win` (7.2-8.8).
      window('ex-b2b-win', 'ex-w', 3.2, 1.6),
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
      room('ex-shelter', 'Household Shelter', 5.3, 0.2, 1.5, 2.0, 'floor-tile-grey', 'storeroom'),
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
      // North service band.
      iwall('g3-svc-s', [T, 3.0], [6.2, 3.0]),
      iwall('g3-kit-e', [3.2, T], [3.2, 3.0]),
      iwall('g3-yard-e', [4.8, T], [4.8, 3.0]),
      // Living on the east.
      iwall('g3-liv-w', [6.2, T], [6.2, D - T]),
      // West bedroom column.
      iwall('g3-b-corr', [3.4, 3.2], [3.4, D - T]),
      iwall('g3-b3-s', [T, 6.0], [3.4, 6.0]),
      iwall('g3-m-n', [T, 8.8], [3.4, 8.8]),
      // Grandparent ensuite at the SE of the living column.
      iwall('g3-g-bath-w', [4.6, 3.2], [4.6, 5.0]),
      iwall('g3-g-bath-s', [4.6, 5.0], [6.2, 5.0]),
    ],
    openings: [
      door('g3-main', 'g3-s', 7.6),
      door('g3-master', 'g3-m-n', 1.0),
      door('g3-b3', 'g3-b3-s', 1.0),
      window('g3-kit-win', 'g3-n', 1.2, 1.6),
      window('g3-b3-win', 'g3-w', 7.0, 1.5),
      // (h): `g3-bed3` owned no window. Position from `g3-b3-win`'s mirrored offset
      // (7.0 -> 2.7); clear of `g3-m-win` (9.6-11.2).
      window('g3-b3b-win', 'g3-w', 2.7, 1.5),
      window('g3-m-win', 'g3-w', 9.6, 1.6),
      window('g3-gen-win', 'g3-e', 3.8, 1.6),
      // (h): `g3-gen` and `g3-master` both owned no window. `g3-s` is external and has room for
      // both, centred in their own clear spans (0.2-3.3 and 3.7-5.9) and 1.5 m apart.
      window('g3-gen-s-win', 'g3-s', 1.8, 1.5),
      window('g3-m-s-win', 'g3-s', 4.8, 1.5),
      window('g3-liv-win', 'g3-e', 7.4, 2.0),
    ],
    rooms: [
      room('g3-kit', 'Kitchen', 0.2, 0.2, 2.8, 2.6, 'floor-tile-grey', 'kitchen'),
      room('g3-yard', 'Service Yard', 3.3, 0.2, 1.5, 2.6, 'floor-tile-grey', 'serviceYard'),
      room('g3-shelter', 'Household Shelter', 4.9, 0.2, 1.3, 2.0, 'floor-tile-grey', 'storeroom'),
      room('g3-living', 'Living / Dining', 6.4, 0.2, 3.9, 8.6, 'floor-wood-oak', 'living'),
      room('g3-gen', 'Grandparent Suite', 6.4, 8.8, 3.9, 2.4, 'floor-wood-oak', 'masterBedroom'),
      room('g3-gbath', 'Grandparent Bath', 4.7, 3.2, 1.5, 1.7, 'floor-tile-marble', 'bath'),
      room('g3-bed2', 'Bedroom 2', 0.2, 3.2, 3.0, 2.6, 'floor-wood-walnut', 'bedroom'),
      room('g3-bed3', 'Bedroom 3', 0.2, 6.2, 3.0, 2.4, 'floor-wood-walnut', 'bedroom'),
      room('g3-cbath', 'Common Bath', 0.2, 8.8, 1.6, 2.4, 'floor-tile-white', 'bath'),
      room('g3-master', 'Master Bedroom', 1.9, 9.0, 4.2, 2.2, 'floor-wood-oak', 'masterBedroom'),
      room('g3-mbath', 'Master Bath', 3.6, 6.8, 2.4, 2.0, 'floor-tile-marble', 'bath'),
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
      // North service band across the rear.
      iwall('jb-svc-s', [T, 3.2], [8.4, 3.2]),
      iwall('jb-kit-e', [4.0, T], [4.0, 3.2]),
      iwall('jb-yard-e', [6.0, T], [6.0, 3.2]),
      // Central living spine divides the two former units.
      iwall('jb-liv-w', [8.4, T], [8.4, D - T]),
      // West bedroom stack.
      iwall('jb-wb-corr', [4.0, 3.2], [4.0, D - T]),
      iwall('jb-b2-s', [T, 6.8], [4.0, 6.8]),
      iwall('jb-m-n', [T, 9.6], [4.0, 9.6]),
      // East column: second living + two more bedrooms toward the south.
      iwall('jb-eliv-s', [8.4, 6.6], [W - T, 6.6]),
      iwall('jb-eb-mid', [11.4, 6.6], [11.4, D - T]),
    ],
    openings: [
      // MAIN-DOOR-ROOM (v0.31.5.119): was 9.2, which put the front door at
      // offsets 9.2-10.1 — inside the MASTER BEDROOM (which lines 8.6-12.2 of
      // this wall). `jb-s` runs east→west (len 14.2); 14.2 - 9.2 - 0.9 = 4.1 is
      // the exact mirror and lands it in jb-family, the Family Room (3.1-5.8),
      // a living-category space. The Living / Dining never touches this wall —
      // it fronts jb-n and jb-e — so the Family Room is the correct target.
      door('jb-main', 'jb-s', 4.1),
      door('jb-master', 'jb-m-n', 1.0),
      door('jb-b2', 'jb-b2-s', 1.0),
      window('jb-kit-win', 'jb-n', 1.6, 1.8),
      window('jb-b2-win', 'jb-w', 7.4, 1.6),
      // (h): `jb-master` owned no window. `jb-s` is external; centred in its clear span
      // (7.8-11.3).
      window('jb-m-s-win', 'jb-s', 9.6, 1.5),
      // (h): `jb-bed3` owned no window. Position from `jb-b2-win`'s mirrored offset
      // (7.4 -> 4.0); clear of `jb-m-win` (10.2-12.0).
      window('jb-b3-win', 'jb-w', 4.0, 1.6),
      window('jb-m-win', 'jb-w', 10.2, 1.8),
      window('jb-liv-win', 'jb-e', 2.0, 2.2),
      window('jb-b4-win', 'jb-e', 8.0, 1.6),
      window('jb-b5-win', 'jb-e', 11.0, 1.6),
    ],
    rooms: [
      room('jb-kit', 'Kitchen', 0.2, 0.2, 3.6, 2.8, 'floor-tile-grey', 'kitchen'),
      room('jb-yard', 'Service Yard', 4.3, 0.2, 1.5, 2.8, 'floor-tile-grey', 'serviceYard'),
      room('jb-shelter', 'Household Shelter', 6.3, 0.2, 1.9, 2.0, 'floor-tile-grey', 'storeroom'),
      room('jb-living', 'Living / Dining', 8.6, 0.2, 5.6, 6.2, 'floor-wood-oak', 'living'),
      room('jb-family', 'Family Room', 8.6, 6.8, 2.6, 6.2, 'floor-wood-oak', 'living'),
      room('jb-bed4', 'Bedroom 4', 11.6, 6.8, 2.6, 3.0, 'floor-wood-walnut', 'bedroom'),
      room('jb-bed5', 'Bedroom 5', 11.6, 10.0, 2.6, 3.0, 'floor-wood-walnut', 'bedroom'),
      room('jb-bed2', 'Bedroom 2', 0.2, 3.4, 3.6, 3.2, 'floor-wood-walnut', 'bedroom'),
      room('jb-bed3', 'Bedroom 3', 0.2, 7.0, 3.6, 2.4, 'floor-wood-walnut', 'bedroom'),
      room('jb-cbath', 'Common Bath', 0.2, 9.6, 1.8, 2.0, 'floor-tile-white', 'bath'),
      room('jb-master', 'Master Bedroom', 2.2, 9.8, 3.6, 3.2, 'floor-wood-oak', 'masterBedroom'),
      room('jb-mbath', 'Master Bath', 0.2, 11.8, 1.8, 1.2, 'floor-tile-marble', 'bath'),
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
      door('em-study', 'em-study-n', 2.0),
      window('em-kit-win', 'em-n', 1.0, 1.6),
      window('em-yard-win', 'em-n', 3.6, 1.0),
      window('em-liv-win', 'em-e', 5.2, 2.2),
      window('em-fam-win', 'em-w', 0.8, 1.4),
    ],
    rooms: [
      room('em-kit', 'Kitchen', 0.2, 0.2, 3.0, 2.6, 'floor-tile-grey', 'kitchen'),
      room('em-yard', 'Service Yard', 3.4, 0.2, 1.5, 1.8, 'floor-tile-grey', 'serviceYard'),
      room('em-shelter', 'Household Shelter', 5.1, 0.2, 1.5, 2.0, 'floor-tile-grey', 'storeroom'),
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
