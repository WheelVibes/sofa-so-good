/** Hand-authored condominium / landed starter plans. Builders return a FloorPlan. */

import type { FloorPlan, PlanUpperLevel } from '../types'
import { door, iwall, parapet, perimeter, room, T, window } from './shared'

export function studio(): FloorPlan {
  const W = 6.0
  const D = 4.6
  return {
    id: 'tpl-studio',
    name: 'Studio',
    ceilingHeight: 2.6,
    extent: [W, D],
    walls: [
      ...perimeter('st', W, D),
      // Bathroom partition (SE corner).
      iwall('st-bath-w', [4.2, 2.9], [4.2, D - T]),
      iwall('st-bath-n', [4.2, 2.9], [W - T, 2.9]),
    ],
    openings: [
      door('st-main', 'st-s', 1.0), // entry on the south wall
      door('st-bath', 'st-bath-n', 0.6, 0.7),
      window('st-win', 'st-n', 2.2, 1.8),
    ],
    rooms: [
      {
        id: 'st-living',
        name: 'Living / Sleeping',
        origin: [0.2, 0.2],
        width: 5.6,
        depth: 2.6,
        floor: 'floor-wood-oak',
      },
      {
        id: 'st-kit',
        name: 'Kitchen',
        origin: [0.2, 3.0],
        width: 3.8,
        depth: 1.4,
        floor: 'floor-tile-sand',
      },
      {
        id: 'st-bath',
        name: 'Bathroom',
        origin: [4.3, 3.0],
        width: 1.5,
        depth: 1.4,
        floor: 'floor-tile-white',
      },
    ],
  }
}

export function oneBed(): FloorPlan {
  const W = 7.4
  const D = 5.4
  return {
    id: 'tpl-1bed',
    name: '1-Bedroom',
    ceilingHeight: 2.7,
    extent: [W, D],
    walls: [
      ...perimeter('ob', W, D),
      iwall('ob-bed-e', [3.4, T], [3.4, 3.2]), // bedroom east wall
      iwall('ob-bed-s', [T, 3.2], [3.4, 3.2]), // bedroom south wall
      iwall('ob-bath-w', [3.4, 3.2], [3.4, D - T]),
      iwall('ob-bath-n', [3.4, 3.2], [5.4, 3.2]),
      iwall('ob-bath-e', [5.4, 3.2], [5.4, D - T]),
    ],
    openings: [
      door('ob-main', 'ob-s', 5.6),
      door('ob-bed', 'ob-bed-s', 1.2),
      door('ob-bath', 'ob-bath-n', 0.7, 0.7),
      window('ob-bed-win', 'ob-n', 1.2, 1.6),
      window('ob-liv-win', 'ob-n', 4.8, 1.8),
    ],
    rooms: [
      {
        id: 'ob-bed',
        name: 'Bedroom',
        origin: [0.2, 0.2],
        width: 3.1,
        depth: 2.9,
        floor: 'floor-wood-walnut',
      },
      {
        id: 'ob-living',
        name: 'Living / Dining',
        origin: [3.5, 0.2],
        width: 3.7,
        depth: 3.0,
        floor: 'floor-wood-oak',
      },
      {
        id: 'ob-dining',
        name: 'Dining',
        origin: [5.5, 3.3],
        width: 1.7,
        depth: 1.8,
        floor: 'floor-wood-oak',
      },
      {
        id: 'ob-kit',
        name: 'Kitchen',
        origin: [0.2, 3.3],
        width: 3.1,
        depth: 1.9,
        floor: 'floor-tile-grey',
      },
      {
        id: 'ob-bath',
        name: 'Bathroom',
        origin: [3.5, 3.3],
        width: 1.8,
        depth: 1.9,
        floor: 'floor-tile-marble',
      },
    ],
  }
}

/** Open Loft: double-height living with a real sleeping mezzanine upstairs
 *  (F13 multi-storey). The ground keeps a lounge + bath + an open stair run;
 *  the loft level stacks a sleeping deck + landing over the rear band, with a
 *  parapet guard rail along the open mezzanine edge. */
export function loft(): FloorPlan {
  const W = 8.2
  const D = 6.0
  // Mezzanine floor sits above the ground volume (ceiling 3.0 m + 0.3 m slab).
  const loftLevel: PlanUpperLevel = {
    id: 'lf-up',
    name: 'Loft',
    elevation: 3.3,
    ceilingHeight: 2.2,
    walls: [
      // Open mezzanine edge gets a guard-rail parapet, not a full wall.
      parapet('lfu-rail', [T, 3.4], [W - T, 3.4]),
      { id: 'lfu-e', start: [W - T, 3.4], end: [W - T, D - T], thickness: 'external' },
      { id: 'lfu-s', start: [W - T, D - T], end: [T, D - T], thickness: 'external' },
      { id: 'lfu-w', start: [T, D - T], end: [T, 3.4], thickness: 'external' },
      iwall('lfu-land-w', [4.8, 3.4], [4.8, D - T]),
      iwall('lfu-ward-w', [6.2, 3.4], [6.2, D - T]),
    ],
    openings: [window('lfu-win', 'lfu-s', 3.6, 1.8), window('lfu-e-win', 'lfu-e', 0.6, 1.2)],
    rooms: [
      room('lfu-sleep', 'Sleeping Loft', 0.2, 3.6, 4.5, 2.2, 'floor-wood-ebony', 'bedroom'),
      // Stacked over the ground 'Stairs' room — the stair void / arrival point.
      room('lfu-landing', 'Stair Landing', 4.9, 3.6, 1.2, 2.2, 'floor-wood-ebony', 'foyer'),
      room('lfu-ward', 'Dressing', 6.3, 3.6, 1.8, 2.2, 'floor-wood-ebony', 'other'),
    ],
  }
  return {
    id: 'tpl-loft',
    name: 'Open Loft',
    ceilingHeight: 3.0,
    extent: [W, D],
    walls: [
      ...perimeter('lf', W, D),
      iwall('lf-bath-w', [6.2, 3.6], [6.2, D - T]),
      iwall('lf-bath-n', [6.2, 3.6], [W - T, 3.6]),
      // Stair run edge (open to the living side — no wall on its north).
      iwall('lf-stair-w', [4.8, 3.6], [4.8, D - T]),
    ],
    openings: [
      door('lf-main', 'lf-s', 1.2, 1.0),
      door('lf-bath', 'lf-bath-n', 0.7, 0.7),
      window('lf-w1', 'lf-n', 1.2, 2.2),
      window('lf-w2', 'lf-n', 4.4, 2.2),
      window('lf-e1', 'lf-e', 1.2, 2.0),
    ],
    rooms: [
      {
        id: 'lf-open',
        name: 'Open Living',
        origin: [0.2, 0.2],
        width: 7.8,
        depth: 3.3,
        floor: 'floor-concrete',
      },
      {
        id: 'lf-sleep',
        name: 'Lounge / Study',
        origin: [0.2, 3.6],
        width: 4.5,
        depth: 2.2,
        floor: 'floor-wood-ebony',
      },
      {
        id: 'lf-stair',
        name: 'Stairs',
        origin: [4.9, 3.6],
        width: 1.2,
        depth: 2.2,
        floor: 'floor-concrete',
      },
      {
        id: 'lf-bath',
        name: 'Bathroom',
        origin: [6.3, 3.7],
        width: 1.7,
        depth: 2.1,
        floor: 'floor-terrazzo',
      },
    ],
    upperLevels: [loftLevel],
  }
}

/** Compact room helper (origin + size in metres). */

/** Condo 1-Bedroom (~50 m²): open kitchen along the living wall, balcony. */
export function condo1Bed(): FloorPlan {
  const W = 7.6
  const D = 6.6
  return {
    id: 'tpl-condo-1bed',
    name: 'Condo 1-Bedroom',
    ceilingHeight: 2.85,
    extent: [W, D],
    walls: [
      ...perimeter('c1', W, D),
      // Bedroom (NE), bath (SE) against the east wall.
      iwall('c1-bed-w', [4.2, T], [4.2, 3.0]),
      iwall('c1-bed-s', [4.2, 3.0], [W - T, 3.0]),
      iwall('c1-bath-w', [4.2, 3.0], [4.2, 4.8]),
      iwall('c1-bath-n', [4.2, 4.8], [W - T, 4.8]),
      // Balcony off the south of the living, parapet on the front wall.
      parapet('c1-bal-n', [2.3, 4.8], [4.2, 4.8]),
    ],
    openings: [
      door('c1-main', 'c1-w', 1.0),
      door('c1-bed', 'c1-bed-s', 1.0),
      door('c1-bath', 'c1-bath-n', 0.8),
      window('c1-bed-win', 'c1-n', 5.0, 1.8),
      window('c1-liv-win', 'c1-n', 1.0, 2.0),
    ],
    rooms: [
      room('c1-living', 'Living / Dining', 0.2, 0.2, 3.9, 4.6, 'floor-wood-oak', 'living'),
      room('c1-kit', 'Open Kitchen', 0.2, 4.8, 2.0, 1.6, 'floor-tile-grey', 'kitchen'),
      room('c1-bed', 'Bedroom', 4.3, 0.2, 3.1, 2.8, 'floor-wood-walnut', 'bedroom'),
      room('c1-bath', 'Bathroom', 4.3, 3.1, 3.1, 1.7, 'floor-tile-marble', 'bath'),
      room('c1-balcony', 'Balcony', 2.3, 4.9, 1.9, 1.5, 'floor-terrazzo', 'balcony'),
    ],
  }
}

/** Condo 1+Study (~60 m²): enclosed study nook, balcony. */
export function condo1Study(): FloorPlan {
  const W = 8.4
  const D = 7.2
  return {
    id: 'tpl-condo-1study',
    name: 'Condo 1+Study',
    ceilingHeight: 2.85,
    extent: [W, D],
    walls: [
      ...perimeter('cs', W, D),
      iwall('cs-bed-w', [4.6, T], [4.6, 3.2]),
      iwall('cs-bed-s', [4.6, 3.2], [W - T, 3.2]),
      iwall('cs-bath-w', [4.6, 3.2], [4.6, 5.0]),
      iwall('cs-bath-n', [4.6, 5.0], [W - T, 5.0]),
      // Study nook tucked behind the kitchen on the west.
      iwall('cs-study-e', [2.4, 4.8], [2.4, D - T]),
      iwall('cs-study-n', [T, 4.8], [2.4, 4.8]),
      parapet('cs-bal-n', [4.7, 5.0], [W - T, 5.0]),
    ],
    openings: [
      door('cs-main', 'cs-w', 1.2),
      door('cs-bed', 'cs-bed-s', 1.0),
      door('cs-bath', 'cs-bath-w', 0.8),
      door('cs-study', 'cs-study-e', 0.8),
      window('cs-bed-win', 'cs-n', 5.4, 1.8),
      window('cs-liv-win', 'cs-n', 1.2, 2.2),
    ],
    rooms: [
      room('cs-living', 'Living / Dining', 0.2, 0.2, 4.2, 4.6, 'floor-wood-oak', 'living'),
      room('cs-kit', 'Open Kitchen', 2.5, 4.8, 2.0, 2.2, 'floor-tile-grey', 'kitchen'),
      room('cs-study', 'Study', 0.2, 4.9, 2.1, 2.1, 'floor-wood-oak', 'study'),
      room('cs-bed', 'Bedroom', 4.7, 0.2, 3.5, 3.0, 'floor-wood-walnut', 'bedroom'),
      room('cs-bath', 'Bathroom', 4.7, 3.3, 3.5, 1.7, 'floor-tile-marble', 'bath'),
      room('cs-balcony', 'Balcony', 4.7, 5.1, 3.5, 1.9, 'floor-terrazzo', 'balcony'),
    ],
  }
}

/** Condo 2-Bedroom (~75 m²): master ensuite + common bath, balcony. */
export function condo2Bed(): FloorPlan {
  const W = 9.2
  const D = 8.4
  return {
    id: 'tpl-condo-2bed',
    name: 'Condo 2-Bedroom',
    ceilingHeight: 2.85,
    extent: [W, D],
    walls: [
      ...perimeter('c2', W, D),
      // Bedroom column on the east.
      iwall('c2-bed-w', [5.4, T], [5.4, D - T]),
      iwall('c2-bed-mid', [5.4, 4.0], [W - T, 4.0]),
      // Master ensuite (NE) + common bath (SE) on the far east strip.
      iwall('c2-mbath-w', [7.3, T], [7.3, 1.8]),
      iwall('c2-mbath-s', [7.3, 1.8], [W - T, 1.8]),
      iwall('c2-cbath-w', [7.3, 6.4], [7.3, D - T]),
      iwall('c2-cbath-n', [7.3, 6.4], [W - T, 6.4]),
      // Open kitchen run + balcony off the living.
      iwall('c2-kit-e', [2.6, 5.4], [2.6, D - T]),
      iwall('c2-kit-n', [T, 5.4], [2.6, 5.4]),
      parapet('c2-bal-n', [2.7, 6.4], [5.4, 6.4]),
    ],
    openings: [
      door('c2-main', 'c2-w', 1.0),
      door('c2-mbath', 'c2-mbath-s', 0.8),
      door('c2-cbath', 'c2-cbath-n', 0.8),
      window('c2-m-win', 'c2-n', 6.2, 1.8),
      window('c2-b2-win', 'c2-e', 5.0, 1.6),
      window('c2-liv-win', 'c2-n', 1.2, 2.4),
    ],
    rooms: [
      room('c2-living', 'Living / Dining', 0.2, 0.2, 5.0, 5.2, 'floor-wood-oak', 'living'),
      room('c2-kit', 'Open Kitchen', 0.2, 5.4, 2.4, 2.8, 'floor-tile-grey', 'kitchen'),
      room('c2-master', 'Master Bedroom', 5.5, 0.2, 1.7, 3.8, 'floor-wood-oak', 'masterBedroom'),
      room('c2-mbath', 'Master Bath', 7.4, 0.2, 1.6, 1.6, 'floor-tile-marble', 'bath'),
      room('c2-mcloset', 'Master Closet', 7.4, 1.9, 1.6, 2.1, 'floor-wood-oak', 'other'),
      room('c2-bed2', 'Bedroom 2', 5.5, 4.1, 3.5, 2.1, 'floor-wood-walnut', 'bedroom'),
      room('c2-cbath', 'Common Bath', 7.4, 6.5, 1.6, 1.7, 'floor-tile-white', 'bath'),
      room('c2-corr', 'Hall', 5.5, 6.5, 1.7, 1.7, 'floor-wood-oak', 'living'),
      room('c2-balcony', 'Balcony', 2.7, 6.5, 2.7, 1.7, 'floor-terrazzo', 'balcony'),
    ],
  }
}

/** Condo 3-Bedroom (~100 m²): master ensuite, balcony, enclosed kitchen + yard. */
export function condo3Bed(): FloorPlan {
  const W = 11.0
  const D = 9.6
  return {
    id: 'tpl-condo-3bed',
    name: 'Condo 3-Bedroom',
    ceilingHeight: 2.85,
    extent: [W, D],
    walls: [
      ...perimeter('c3', W, D),
      // Enclosed kitchen + yard on the west rear.
      iwall('c3-kit-e', [3.0, 4.4], [3.0, D - T]),
      iwall('c3-kit-n', [T, 4.4], [3.0, 4.4]),
      iwall('c3-yard-n', [T, 7.6], [3.0, 7.6]),
      // Bedroom column on the east. Bedrooms tightened toward the north so the
      // master gets a full 2.7 m depth (a queen + walk-around, RM4 template fix).
      iwall('c3-bed-w', [7.0, T], [7.0, D - T]),
      iwall('c3-b2-s', [7.0, 2.6], [W - T, 2.6]),
      iwall('c3-b3-s', [7.0, 5.0], [W - T, 5.0]),
      // Master ensuite split + common bath off the corridor (south-centre).
      iwall('c3-mbath-n', [7.0, 7.9], [W - T, 7.9]),
      iwall('c3-cbath-w', [5.2, 6.0], [5.2, D - T]),
      iwall('c3-cbath-n', [5.2, 6.0], [7.0, 6.0]),
      // Balcony off the living's south.
      parapet('c3-bal-n', [3.1, 7.6], [5.1, 7.6]),
    ],
    openings: [
      door('c3-main', 'c3-w', 1.0),
      door('c3-b2', 'c3-b2-s', 0.9),
      door('c3-b3', 'c3-b3-s', 0.9),
      window('c3-kit-win', 'c3-w', 5.0, 1.4),
      window('c3-b2-win', 'c3-e', 0.8, 1.5),
      window('c3-b3-win', 'c3-e', 3.0, 1.5),
      window('c3-m-win', 'c3-e', 5.6, 1.8),
      window('c3-liv-win', 'c3-n', 3.4, 2.4),
    ],
    rooms: [
      room('c3-living', 'Living / Dining', 0.2, 0.2, 6.6, 4.2, 'floor-wood-oak', 'living'),
      room('c3-kit', 'Kitchen', 0.2, 4.5, 2.7, 3.0, 'floor-tile-grey', 'kitchen'),
      room('c3-yard', 'Service Yard', 0.2, 7.7, 2.7, 1.7, 'floor-tile-grey', 'serviceYard'),
      room('c3-balcony', 'Balcony', 3.1, 7.7, 2.0, 1.7, 'floor-terrazzo', 'balcony'),
      room('c3-bed2', 'Bedroom 2', 7.1, 0.2, 3.7, 2.3, 'floor-wood-walnut', 'bedroom'),
      room('c3-bed3', 'Bedroom 3', 7.1, 2.7, 3.7, 2.2, 'floor-wood-walnut', 'bedroom'),
      room('c3-cbath', 'Common Bath', 5.3, 6.1, 1.6, 3.3, 'floor-tile-white', 'bath'),
      room('c3-master', 'Master Bedroom', 7.1, 5.1, 3.7, 2.7, 'floor-wood-oak', 'masterBedroom'),
      room('c3-mbath', 'Master Bath', 7.1, 8.0, 3.7, 1.4, 'floor-tile-marble', 'bath'),
    ],
  }
}

/** Condo Penthouse (3BR, ~160 m²): dual-aspect living, large balcony, yard,
 *  ensuite master; taller living volume (3.0 m). */
export function condoPenthouse(): FloorPlan {
  const W = 13.0
  const D = 11.6
  return {
    id: 'tpl-condo-penthouse',
    name: 'Condo Penthouse',
    ceilingHeight: 3.0,
    extent: [W, D],
    walls: [
      ...perimeter('cp', W, D),
      // Enclosed kitchen + yard at the NW.
      iwall('cp-kit-e', [3.6, T], [3.6, 3.4]),
      iwall('cp-kit-s', [T, 3.4], [3.6, 3.4]),
      iwall('cp-yard-e', [2.0, 3.4], [2.0, 5.2]),
      iwall('cp-yard-s', [T, 5.2], [2.0, 5.2]),
      // Bedroom wing on the east.
      iwall('cp-bed-w', [8.4, T], [8.4, D - T]),
      iwall('cp-b2-s', [8.4, 3.4], [W - T, 3.4]),
      iwall('cp-b3-s', [8.4, 6.6], [W - T, 6.6]),
      iwall('cp-mbath-w', [10.6, 6.6], [10.6, D - T]),
      // Common bath off the corridor.
      iwall('cp-cbath-w', [6.4, 3.4], [6.4, 5.4]),
      iwall('cp-cbath-s', [6.4, 5.4], [8.4, 5.4]),
      iwall('cp-cbath-n', [6.4, 3.4], [8.4, 3.4]),
      // Large balcony spanning the south, parapet on the south wall.
      parapet('cp-bal-n', [3.8, 8.8], [8.3, 8.8]),
    ],
    openings: [
      door('cp-main', 'cp-w', 6.0),
      door('cp-b2', 'cp-b2-s', 0.9),
      door('cp-b3', 'cp-b3-s', 0.9),
      door('cp-cbath', 'cp-cbath-s', 0.8),
      window('cp-kit-win', 'cp-n', 1.4, 1.8),
      window('cp-b2-win', 'cp-e', 1.2, 1.6),
      window('cp-b3-win', 'cp-e', 4.4, 1.6),
      window('cp-m-win', 'cp-e', 7.6, 2.0),
      window('cp-liv-win', 'cp-n', 5.0, 3.0),
    ],
    rooms: [
      room('cp-kit', 'Kitchen', 0.2, 0.2, 3.4, 3.2, 'floor-tile-grey', 'kitchen'),
      room('cp-yard', 'Service Yard', 0.2, 3.6, 1.8, 1.6, 'floor-tile-grey', 'serviceYard'),
      room('cp-living', 'Living / Dining', 3.8, 0.2, 2.6, 8.4, 'floor-wood-oak', 'living'),
      room('cp-dining', 'Dining', 6.5, 0.2, 1.8, 3.2, 'floor-wood-oak', 'dining'),
      room('cp-lounge', 'Lounge', 6.5, 5.5, 1.8, 3.1, 'floor-wood-oak', 'living'),
      room('cp-foyer', 'Foyer', 0.2, 5.4, 3.4, 3.0, 'floor-wood-oak', 'foyer'),
      room('cp-cbath', 'Common Bath', 6.5, 3.5, 1.8, 1.8, 'floor-tile-white', 'bath'),
      room('cp-balcony', 'Balcony', 3.8, 8.9, 4.5, 2.5, 'floor-terrazzo', 'balcony'),
      room('cp-bed2', 'Bedroom 2', 8.5, 0.2, 4.3, 3.1, 'floor-wood-walnut', 'bedroom'),
      room('cp-bed3', 'Bedroom 3', 8.5, 3.5, 4.3, 2.9, 'floor-wood-walnut', 'bedroom'),
      room('cp-master', 'Master Bedroom', 8.5, 6.7, 2.0, 4.7, 'floor-wood-oak', 'masterBedroom'),
      room('cp-mbath', 'Master Bath', 10.7, 6.7, 2.1, 4.7, 'floor-tile-marble', 'bath'),
    ],
  }
}

/** Terrace house (landed, two storeys, ~90 m² footprint): ground = car porch,
 *  open living + dining, kitchen + yard, powder room, stair hall; upper =
 *  3 bedrooms (master ensuite) + 2 baths + family area off the stair landing.
 *  The upper storey sits at the 3.0 m ground ceiling + 0.3 m slab; its 'Stair
 *  Landing' is stacked over the ground 'Stair Hall'. */
export function condoTerrace(): FloorPlan {
  const W = 6.4
  const D = 14.0
  const upper: PlanUpperLevel = {
    id: 'ct-up',
    name: 'Upper storey',
    elevation: 3.3, // 3.0 m ground ceiling + 0.3 m floor slab
    ceilingHeight: 2.6,
    walls: [
      ...perimeter('ctu', W, D),
      // East column: master bath / corridor / stair landing / common bath.
      iwall('ctu-col', [4.5, T], [4.5, 11.8]),
      iwall('ctu-mb-s', [4.5, 2.6], [W - T, 2.6]),
      iwall('ctu-cb-n', [4.5, 9.5], [W - T, 9.5]),
      iwall('ctu-cb-s', [4.5, 11.8], [W - T, 11.8]),
      // Bedroom stack dividers on the west.
      iwall('ctu-m-s', [T, 4.0], [4.5, 4.0]),
      iwall('ctu-b2-s', [T, 7.7], [4.5, 7.7]),
      iwall('ctu-b3-s', [T, 11.0], [4.5, 11.0]),
    ],
    openings: [
      door('ctu-m-door', 'ctu-col', 3.0),
      door('ctu-b2-door', 'ctu-col', 5.4),
      door('ctu-b3-door', 'ctu-col', 8.2),
      door('ctu-mb-door', 'ctu-mb-s', 0.5, 0.8),
      door('ctu-cb-door', 'ctu-cb-n', 0.5, 0.8),
      window('ctu-m-win', 'ctu-n', 1.2, 1.8),
      window('ctu-b2-win', 'ctu-w', 6.6, 1.5),
      window('ctu-b3-win', 'ctu-w', 3.2, 1.5),
      window('ctu-fam-win', 'ctu-s', 2.0, 2.0),
    ],
    rooms: [
      room('ctu-master', 'Master Bedroom', 0.2, 0.2, 4.3, 3.8, 'floor-wood-oak', 'masterBedroom'),
      room('ctu-mbath', 'Master Bath', 4.7, 0.2, 1.5, 2.4, 'floor-tile-marble', 'bath'),
      room('ctu-bed2', 'Bedroom 2', 0.2, 4.2, 4.3, 3.4, 'floor-wood-walnut', 'bedroom'),
      // Stacked over the ground-floor 'Stair Hall' (stair void + arrival).
      room('ctu-landing', 'Stair Landing', 4.7, 4.5, 1.5, 4.9, 'floor-wood-oak', 'foyer'),
      room('ctu-bed3', 'Bedroom 3', 0.2, 7.8, 4.3, 3.2, 'floor-wood-walnut', 'bedroom'),
      room('ctu-cbath', 'Common Bath', 4.7, 9.6, 1.5, 2.2, 'floor-tile-white', 'bath'),
      room('ctu-family', 'Family Area', 0.2, 11.2, 4.3, 2.6, 'floor-wood-oak', 'living'),
    ],
  }
  return {
    id: 'tpl-terrace-ground',
    name: 'Terrace House',
    ceilingHeight: 3.0,
    extent: [W, D],
    walls: [
      ...perimeter('ct', W, D),
      // Car-porch parapet at the south (front).
      parapet('ct-porch-n', [T, 2.6], [W - T, 2.6]),
      // Living / dining mid-block, kitchen + yard at the rear (north).
      iwall('ct-din-n', [T, 9.4], [W - T, 9.4]),
      iwall('ct-kit-e', [3.2, 9.4], [3.2, 12.0]),
      iwall('ct-yard-n', [T, 12.0], [W - T, 12.0]),
      // Powder room + stair hall off the living.
      iwall('ct-pwd-w', [4.6, 2.6], [4.6, 4.4]),
      iwall('ct-pwd-s', [4.6, 4.4], [W - T, 4.4]),
    ],
    openings: [
      door('ct-main', 'ct-s', 2.4),
      door('ct-pwd', 'ct-pwd-w', 0.8),
      window('ct-liv-win', 'ct-w', 4.0, 2.0),
      window('ct-din-win', 'ct-e', 6.0, 2.0),
      window('ct-kit-win', 'ct-n', 1.0, 1.6),
    ],
    rooms: [
      room('ct-porch', 'Car Porch', 0.2, 0.2, 6.0, 2.4, 'floor-terrazzo', 'other'),
      room('ct-living', 'Living', 0.2, 2.6, 4.4, 6.8, 'floor-wood-oak', 'living'),
      room('ct-powder', 'Powder Room', 4.7, 2.6, 1.5, 1.8, 'floor-tile-white', 'powder'),
      room('ct-stair', 'Stair Hall', 4.7, 4.5, 1.5, 4.9, 'floor-wood-oak', 'foyer'),
      room('ct-dining', 'Dining', 0.2, 9.5, 2.9, 2.5, 'floor-wood-oak', 'dining'),
      room('ct-kit', 'Kitchen', 3.3, 9.5, 2.9, 2.5, 'floor-tile-grey', 'kitchen'),
      room('ct-yard', 'Service Yard', 0.2, 12.1, 6.0, 1.7, 'floor-tile-grey', 'serviceYard'),
    ],
    upperLevels: [upper],
  }
}

/** Condo Studio / "shoebox" (~37 m²): one open living/sleeping space, a
 *  kitchenette niche, a bath and a small balcony. */
export function condoStudio(): FloorPlan {
  const W = 6.0
  const D = 6.2
  return {
    id: 'tpl-condo-studio',
    name: 'Condo Studio',
    ceilingHeight: 2.85,
    extent: [W, D],
    walls: [
      ...perimeter('su', W, D),
      // East service column: bath / kitchenette / balcony stacked top→bottom.
      iwall('su-col', [3.7, T], [3.7, D - T]),
      iwall('su-bk', [3.7, 2.7], [W - T, 2.7]),
      parapet('su-kb', [3.7, 4.5], [W - T, 4.5]),
    ],
    openings: [
      door('su-main', 'su-w', 2.4),
      door('su-bath', 'su-col', 0.8, 0.7),
      window('su-liv-win', 'su-n', 0.6, 2.0),
      window('su-bath-win', 'su-e', 0.4, 1.0),
    ],
    rooms: [
      room('su-living', 'Living / Sleeping', 0.2, 0.2, 3.4, 5.8, 'floor-wood-oak', 'living'),
      room('su-bath', 'Bathroom', 3.8, 0.2, 2.0, 2.4, 'floor-tile-marble', 'bath'),
      room('su-kit', 'Kitchenette', 3.8, 2.8, 2.0, 1.6, 'floor-tile-grey', 'kitchen'),
      room('su-balcony', 'Balcony', 3.8, 4.6, 2.0, 1.4, 'floor-terrazzo', 'balcony'),
    ],
  }
}

/** Condo 4-Bedroom (~140 m²): four bedrooms + master ensuite across the north,
 *  a common + shared bath, open living/dining, kitchen + yard and a wide
 *  balcony to the south. */
export function condo4Bed(): FloorPlan {
  const W = 12.0
  const D = 11.4
  return {
    id: 'tpl-condo-4bed',
    name: 'Condo 4-Bedroom',
    ceilingHeight: 2.85,
    extent: [W, D],
    walls: [
      ...perimeter('c4', W, D),
      // North bedroom row dividers + the row's south wall.
      iwall('c4-b23', [3.1, T], [3.1, 4.0]),
      iwall('c4-b34', [6.1, T], [6.1, 4.0]),
      iwall('c4-bm', [8.9, T], [8.9, 4.0]),
      iwall('c4-bednorth', [T, 4.0], [W - T, 4.0]),
      // North/south split, living/kitchen/yard dividers, balcony parapet.
      iwall('c4-mid', [T, 6.1], [W - T, 6.1]),
      iwall('c4-livk', [6.3, 6.1], [6.3, D - T]),
      iwall('c4-ky', [9.5, 6.1], [9.5, 7.9]),
      parapet('c4-bal', [6.3, 9.3], [W - T, 9.3]),
    ],
    openings: [
      door('c4-main', 'c4-s', 5.0, 1.1),
      door('c4-master', 'c4-bednorth', 9.5, 1.0),
      window('c4-b2win', 'c4-n', 0.8, 1.6),
      window('c4-b3win', 'c4-n', 3.6, 1.6),
      window('c4-mwin', 'c4-n', 9.4, 1.8),
      window('c4-livwin', 'c4-w', 1.0, 2.4),
      window('c4-balwin', 'c4-e', 9.2, 1.6),
    ],
    rooms: [
      room('c4-bed2', 'Bedroom 2', 0.2, 0.2, 2.8, 3.8, 'floor-wood-walnut', 'bedroom'),
      room('c4-bed3', 'Bedroom 3', 3.2, 0.2, 2.8, 3.8, 'floor-wood-walnut', 'bedroom'),
      room('c4-bed4', 'Bedroom 4', 6.2, 0.2, 2.6, 3.8, 'floor-wood-walnut', 'bedroom'),
      room('c4-master', 'Master Bedroom', 9.0, 0.2, 2.8, 3.8, 'floor-wood-oak', 'masterBedroom'),
      room('c4-cbath', 'Common Bath', 0.2, 4.2, 2.0, 1.8, 'floor-tile-white', 'bath'),
      room('c4-bath2', 'Bathroom 2', 2.4, 4.2, 2.0, 1.8, 'floor-tile-white', 'bath'),
      room('c4-mbath', 'Master Bath', 9.0, 4.2, 2.8, 1.8, 'floor-tile-marble', 'bath'),
      room('c4-living', 'Living / Dining', 0.2, 6.2, 6.0, 5.0, 'floor-wood-oak', 'living'),
      room('c4-kit', 'Kitchen', 6.4, 6.2, 3.0, 3.0, 'floor-tile-grey', 'kitchen'),
      room('c4-yard', 'Service Yard', 9.6, 6.2, 2.2, 1.6, 'floor-tile-grey', 'serviceYard'),
      room('c4-balcony', 'Balcony', 6.4, 9.4, 5.4, 1.6, 'floor-terrazzo', 'balcony'),
    ],
  }
}

/** Attach a template's category (housing type → project → apartment type). Kept
 *  out of the shape builders so the geometry stays focused; the picker groups by
 *  these three levels. Singapore-flavoured project names group related unit
 *  types under a believable development. */
