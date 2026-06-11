/**
 * Hand-authored starter floor plans, selectable in the editor so the user can
 * begin from a sensible apartment shell instead of a blank box. Each is a
 * complete, self-consistent FloorPlan (perimeter + partitions + rooms +
 * openings) with clean orthogonal walls.
 */
import type { FloorPlan, PlanOpening, PlanUpperLevel, PlanWall } from './types'

const T = 0.1 // inset of walls from the nominal footprint edge

/** Four external perimeter walls around a W×D footprint (inset by T). */
function perimeter(prefix: string, W: number, D: number): PlanWall[] {
  const a: [number, number] = [T, T]
  const b: [number, number] = [W - T, T]
  const c: [number, number] = [W - T, D - T]
  const d: [number, number] = [T, D - T]
  const ext: PlanWall['thickness'] = 'external'
  return [
    { id: `${prefix}-n`, start: a, end: b, thickness: ext },
    { id: `${prefix}-e`, start: b, end: c, thickness: ext },
    { id: `${prefix}-s`, start: c, end: d, thickness: ext },
    { id: `${prefix}-w`, start: d, end: a, thickness: ext },
  ]
}

function iwall(id: string, start: [number, number], end: [number, number]): PlanWall {
  return { id, start, end, thickness: 'internal' }
}

function door(id: string, wallId: string, offset: number, width = 0.9): PlanOpening {
  return { id, kind: 'door', wallId, offset, width, sill: 0, head: 2.1 }
}
function window(id: string, wallId: string, offset: number, width = 1.4): PlanOpening {
  return { id, kind: 'window', wallId, offset, width, sill: 0.95, head: 2.1 }
}

function studio(): FloorPlan {
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

function oneBed(): FloorPlan {
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
function loft(): FloorPlan {
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
      room('lfu-sleep', 'Sleeping Loft', 0.2, 3.6, 4.5, 2.2, 'floor-wood-ebony'),
      // Stacked over the ground 'Stairs' room — the stair void / arrival point.
      room('lfu-landing', 'Stair Landing', 4.9, 3.6, 1.2, 2.2, 'floor-wood-ebony'),
      room('lfu-ward', 'Dressing', 6.3, 3.6, 1.8, 2.2, 'floor-wood-ebony'),
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
function room(
  id: string,
  name: string,
  x: number,
  z: number,
  w: number,
  d: number,
  floor: string,
): FloorPlan['rooms'][number] {
  return { id, name, origin: [x, z], width: w, depth: d, floor }
}

// ── Representative Singapore HDB flat types ──────────────────────────────────
// Authored from public, synthesised typicals (docs/research/hdb-floor-plans.md):
// rooms are non-overlapping rectangles within a bounding footprint; entrance on
// the south (front) wall, windows on the exterior, ceiling 2.6 m (HDB standard).
// The built-in default flat is the L-shaped Serangoon North Vista 4-room; these
// are generic starters covering the common flat types.

/** HDB 2-Room Flexi (~38 m²). */
function hdb2Room(): FloorPlan {
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
      room('h2-master', 'Master Bedroom', 0.2, 0.2, 3.1, 3.0, 'floor-wood-walnut'),
      room('h2-kit', 'Kitchen', 3.5, 0.2, 2.3, 2.2, 'floor-tile-grey'),
      room('h2-shelter', 'Household Shelter', 3.5, 2.4, 1.5, 1.4, 'floor-tile-grey'),
      room('h2-living', 'Living / Dining', 0.2, 3.4, 3.3, 2.8, 'floor-wood-oak'),
      room('h2-bath', 'Bathroom', 3.8, 4.0, 1.7, 2.2, 'floor-tile-marble'),
    ],
  }
}

/** HDB 3-Room (~65 m²). */
function hdb3Room(): FloorPlan {
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
      window('h3-liv-win', 'h3-e', 5.0, 1.8),
    ],
    rooms: [
      room('h3-kit', 'Kitchen', 0.2, 0.2, 2.6, 2.4, 'floor-tile-grey'),
      room('h3-yard', 'Service Yard', 2.9, 0.2, 1.5, 1.6, 'floor-tile-grey'),
      room('h3-shelter', 'Household Shelter', 4.5, 0.2, 1.5, 2.0, 'floor-tile-grey'),
      room('h3-cbath', 'Common Bath', 6.1, 0.2, 1.3, 1.7, 'floor-tile-white'),
      room('h3-living', 'Living / Dining', 4.2, 2.8, 3.2, 5.6, 'floor-wood-oak'),
      room('h3-master', 'Master Bedroom', 0.2, 2.8, 3.0, 2.6, 'floor-wood-oak'),
      room('h3-mbath', 'Master Bath', 0.2, 5.6, 1.6, 1.7, 'floor-tile-marble'),
      room('h3-bed2', 'Bedroom 2', 2.0, 5.6, 2.0, 2.8, 'floor-wood-walnut'),
    ],
  }
}

/** HDB 4-Room, generic (~90 m²). */
function hdb4Room(): FloorPlan {
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
      door('h4-main', 'h4-s', 6.4),
      door('h4-master', 'h4-m-n', 1.0),
      window('h4-kit-win', 'h4-n', 1.4, 1.6),
      window('h4-b2-win', 'h4-w', 4.0, 1.4),
      window('h4-m-win', 'h4-w', 7.4, 1.6),
      window('h4-liv-win', 'h4-e', 5.0, 2.0),
    ],
    rooms: [
      room('h4-kit', 'Kitchen', 0.2, 0.2, 3.0, 2.6, 'floor-tile-grey'),
      room('h4-yard', 'Service Yard', 3.3, 0.2, 1.5, 1.6, 'floor-tile-grey'),
      room('h4-shelter', 'Household Shelter', 5.0, 0.2, 1.5, 2.0, 'floor-tile-grey'),
      room('h4-living', 'Living / Dining', 5.8, 2.4, 3.2, 7.2, 'floor-wood-oak'),
      room('h4-bed2', 'Bedroom 2', 0.2, 3.2, 2.8, 3.0, 'floor-wood-walnut'),
      room('h4-bed3', 'Bedroom 3', 3.2, 3.2, 2.4, 3.0, 'floor-wood-walnut'),
      room('h4-cbath', 'Common Bath', 3.7, 6.6, 1.6, 1.3, 'floor-tile-white'),
      room('h4-master', 'Master Bedroom', 0.2, 6.6, 3.4, 3.0, 'floor-wood-oak'),
      room('h4-mbath', 'Master Bath', 3.7, 8.0, 1.6, 1.6, 'floor-tile-marble'),
    ],
  }
}

/** HDB 5-Room (~115 m²). */
function hdb5Room(): FloorPlan {
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
      window('h5-m-win', 'h5-w', 8.2, 1.6),
      window('h5-liv-win', 'h5-e', 6.0, 2.2),
    ],
    rooms: [
      room('h5-kit', 'Kitchen', 0.2, 0.2, 3.0, 3.0, 'floor-tile-grey'),
      room('h5-yard', 'Service Yard', 3.3, 0.2, 1.5, 1.8, 'floor-tile-grey'),
      room('h5-shelter', 'Household Shelter', 4.9, 0.2, 1.3, 2.0, 'floor-tile-grey'),
      room('h5-living', 'Living / Dining', 6.3, 0.2, 3.9, 8.4, 'floor-wood-oak'),
      room('h5-balcony', 'Balcony', 6.3, 8.8, 3.9, 1.8, 'floor-terrazzo'),
      room('h5-bed2', 'Bedroom 2', 0.2, 3.4, 3.0, 3.3, 'floor-wood-walnut'),
      room('h5-bed3', 'Bedroom 3', 3.4, 3.4, 2.8, 3.2, 'floor-wood-walnut'),
      room('h5-master', 'Master Bedroom', 0.2, 7.0, 3.8, 3.5, 'floor-wood-oak'),
      room('h5-cbath', 'Common Bath', 4.2, 6.9, 1.6, 1.9, 'floor-tile-white'),
      room('h5-mbath', 'Master Bath', 4.2, 9.0, 1.7, 1.5, 'floor-tile-marble'),
    ],
  }
}

/** HDB Executive Apartment (single-floor, ~138 m²): 3 bedrooms + open study,
 *  2 baths, large living/dining, kitchen + service yard + shelter. */
function hdbExecutive(): FloorPlan {
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
      door('ex-main', 'ex-s', 8.4),
      door('ex-master', 'ex-m-n', 1.0),
      door('ex-b2', 'ex-b2-s', 1.0),
      window('ex-kit-win', 'ex-n', 1.2, 1.8),
      window('ex-b2-win', 'ex-w', 7.2, 1.6),
      window('ex-m-win', 'ex-w', 9.8, 1.8),
      window('ex-liv-win', 'ex-e', 5.0, 2.4),
      window('ex-study-win', 'ex-e', 1.0, 1.4),
    ],
    rooms: [
      room('ex-kit', 'Kitchen', 0.2, 0.2, 3.0, 2.8, 'floor-tile-grey'),
      room('ex-yard', 'Service Yard', 3.5, 0.2, 1.5, 2.8, 'floor-tile-grey'),
      room('ex-shelter', 'Household Shelter', 5.3, 0.2, 1.5, 2.0, 'floor-tile-grey'),
      room('ex-study', 'Study', 7.2, 0.2, 4.2, 2.2, 'floor-wood-oak'),
      room('ex-living', 'Living / Dining', 7.2, 2.8, 4.2, 9.2, 'floor-wood-oak'),
      room('ex-bed2', 'Bedroom 2', 0.2, 3.4, 3.0, 3.0, 'floor-wood-walnut'),
      room('ex-bed3', 'Bedroom 3', 3.4, 3.4, 3.4, 3.0, 'floor-wood-walnut'),
      room('ex-cbath', 'Common Bath', 3.8, 6.6, 2.0, 2.4, 'floor-tile-white'),
      room('ex-bed2b', 'Bedroom 2 Hall', 0.2, 6.6, 3.2, 2.4, 'floor-wood-walnut'),
      room('ex-master', 'Master Bedroom', 0.2, 9.4, 3.4, 2.6, 'floor-wood-oak'),
      room('ex-mbath', 'Master Bath', 3.8, 9.2, 1.9, 2.8, 'floor-tile-marble'),
    ],
  }
}

/** HDB 3Gen (~118 m²): 4 bedrooms incl. 2 ensuite, 3 baths, for multi-gen. */
function hdb3Gen(): FloorPlan {
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
      iwall('g3-b3-s', [T, 6.4], [3.4, 6.4]),
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
      window('g3-m-win', 'g3-w', 9.6, 1.6),
      window('g3-gen-win', 'g3-e', 3.8, 1.6),
      window('g3-liv-win', 'g3-e', 7.4, 2.0),
    ],
    rooms: [
      room('g3-kit', 'Kitchen', 0.2, 0.2, 2.8, 2.6, 'floor-tile-grey'),
      room('g3-yard', 'Service Yard', 3.3, 0.2, 1.5, 2.6, 'floor-tile-grey'),
      room('g3-shelter', 'Household Shelter', 4.9, 0.2, 1.3, 2.0, 'floor-tile-grey'),
      room('g3-living', 'Living / Dining', 6.4, 0.2, 3.9, 8.6, 'floor-wood-oak'),
      room('g3-gen', 'Grandparent Suite', 6.4, 8.8, 3.9, 2.4, 'floor-wood-oak'),
      room('g3-gbath', 'Grandparent Bath', 4.7, 3.2, 1.5, 1.7, 'floor-tile-marble'),
      room('g3-bed2', 'Bedroom 2', 0.2, 3.2, 3.0, 3.0, 'floor-wood-walnut'),
      room('g3-bed3', 'Bedroom 3', 0.2, 6.6, 3.0, 2.0, 'floor-wood-walnut'),
      room('g3-cbath', 'Common Bath', 0.2, 8.8, 1.6, 2.4, 'floor-tile-white'),
      room('g3-master', 'Master Bedroom', 1.9, 9.0, 4.2, 2.2, 'floor-wood-oak'),
      room('g3-mbath', 'Master Bath', 3.6, 6.8, 2.4, 2.0, 'floor-tile-marble'),
    ],
  }
}

/** HDB Jumbo (~190 m²): two combined units — very large, 5 bedrooms, 3 baths,
 *  two living zones, big kitchen + utility. */
function hdbJumbo(): FloorPlan {
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
      door('jb-main', 'jb-s', 9.2),
      door('jb-master', 'jb-m-n', 1.0),
      door('jb-b2', 'jb-b2-s', 1.0),
      window('jb-kit-win', 'jb-n', 1.6, 1.8),
      window('jb-b2-win', 'jb-w', 7.4, 1.6),
      window('jb-m-win', 'jb-w', 10.2, 1.8),
      window('jb-liv-win', 'jb-e', 2.0, 2.2),
      window('jb-b4-win', 'jb-e', 8.0, 1.6),
      window('jb-b5-win', 'jb-e', 11.0, 1.6),
    ],
    rooms: [
      room('jb-kit', 'Kitchen', 0.2, 0.2, 3.6, 2.8, 'floor-tile-grey'),
      room('jb-yard', 'Service Yard', 4.3, 0.2, 1.5, 2.8, 'floor-tile-grey'),
      room('jb-shelter', 'Household Shelter', 6.3, 0.2, 1.9, 2.0, 'floor-tile-grey'),
      room('jb-living', 'Living / Dining', 8.6, 0.2, 5.6, 6.2, 'floor-wood-oak'),
      room('jb-family', 'Family Room', 8.6, 6.8, 2.6, 6.2, 'floor-wood-oak'),
      room('jb-bed4', 'Bedroom 4', 11.6, 6.8, 2.6, 3.0, 'floor-wood-walnut'),
      room('jb-bed5', 'Bedroom 5', 11.6, 10.0, 2.6, 3.0, 'floor-wood-walnut'),
      room('jb-bed2', 'Bedroom 2', 0.2, 3.4, 3.6, 3.2, 'floor-wood-walnut'),
      room('jb-bed3', 'Bedroom 3', 0.2, 7.0, 3.6, 2.4, 'floor-wood-walnut'),
      room('jb-cbath', 'Common Bath', 0.2, 9.6, 1.8, 2.0, 'floor-tile-white'),
      room('jb-master', 'Master Bedroom', 2.2, 9.8, 3.6, 3.2, 'floor-wood-oak'),
      room('jb-mbath', 'Master Bath', 0.2, 11.8, 1.8, 1.2, 'floor-tile-marble'),
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
function hdbMaisonette(): FloorPlan {
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
      room('emu-bed2', 'Bedroom 2', 0.2, 0.2, 3.2, 2.6, 'floor-wood-walnut'),
      room('emu-bed3', 'Bedroom 3', 3.6, 0.2, 3.0, 2.6, 'floor-wood-walnut'),
      room('emu-cbath', 'Common Bath', 6.8, 0.2, 1.4, 2.2, 'floor-tile-white'),
      // Stacked over the ground-floor 'Stair Hall' (the stair arrival void).
      room('emu-landing', 'Stair Landing', 0.2, 3.0, 1.6, 3.6, 'floor-wood-oak'),
      room('emu-hall', 'Hall', 2.0, 3.0, 2.4, 3.6, 'floor-wood-oak'),
      room('emu-mbath', 'Master Bath', 4.6, 3.6, 2.0, 2.0, 'floor-tile-marble'),
      room('emu-master', 'Master Bedroom', 4.6, 5.8, 3.6, 3.4, 'floor-wood-oak'),
      room('emu-fam', 'Family Area', 0.2, 6.8, 4.2, 2.4, 'floor-wood-oak'),
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
      room('em-kit', 'Kitchen', 0.2, 0.2, 3.0, 2.6, 'floor-tile-grey'),
      room('em-yard', 'Service Yard', 3.4, 0.2, 1.5, 1.8, 'floor-tile-grey'),
      room('em-shelter', 'Household Shelter', 5.1, 0.2, 1.5, 2.0, 'floor-tile-grey'),
      room('em-wc', 'WC', 6.8, 0.2, 1.4, 1.8, 'floor-tile-white'),
      room('em-stair', 'Stair Hall', 0.2, 3.0, 1.6, 3.6, 'floor-wood-oak'),
      room('em-living', 'Living / Dining', 3.4, 3.0, 4.8, 6.2, 'floor-wood-oak'),
      room('em-study', 'Family Area', 0.2, 6.8, 3.0, 2.4, 'floor-wood-oak'),
    ],
    upperLevels: [upper],
  }
}

// ── Singapore condominium (private) layouts ─────────────────────────────────
// Authored from docs/research/condo-floor-plans.md. Condos differ from HDB:
// open kitchens on small units, a balcony on nearly every unit (modelled as a
// terrazzo room with a parapet via topHeight on its exterior wall), master
// ensuites, an enclosed kitchen + yard on larger units. Ceilings 2.85 m
// (3.0 m for the penthouse / landed living volume).

const PARAPET = 1.0 // balcony parapet height (m)

/** Balcony parapet wall (low solid wall via topHeight). */
function parapet(id: string, start: [number, number], end: [number, number]): PlanWall {
  return { id, start, end, thickness: 'internal', topHeight: PARAPET }
}

/** Condo 1-Bedroom (~50 m²): open kitchen along the living wall, balcony. */
function condo1Bed(): FloorPlan {
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
      room('c1-living', 'Living / Dining', 0.2, 0.2, 3.9, 4.6, 'floor-wood-oak'),
      room('c1-kit', 'Open Kitchen', 0.2, 4.8, 2.0, 1.6, 'floor-tile-grey'),
      room('c1-bed', 'Bedroom', 4.3, 0.2, 3.1, 2.8, 'floor-wood-walnut'),
      room('c1-bath', 'Bathroom', 4.3, 3.1, 3.1, 1.7, 'floor-tile-marble'),
      room('c1-balcony', 'Balcony', 2.3, 4.9, 1.9, 1.5, 'floor-terrazzo'),
    ],
  }
}

/** Condo 1+Study (~60 m²): enclosed study nook, balcony. */
function condo1Study(): FloorPlan {
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
      room('cs-living', 'Living / Dining', 0.2, 0.2, 4.2, 4.6, 'floor-wood-oak'),
      room('cs-kit', 'Open Kitchen', 2.5, 4.8, 2.0, 2.2, 'floor-tile-grey'),
      room('cs-study', 'Study', 0.2, 4.9, 2.1, 2.1, 'floor-wood-oak'),
      room('cs-bed', 'Bedroom', 4.7, 0.2, 3.5, 3.0, 'floor-wood-walnut'),
      room('cs-bath', 'Bathroom', 4.7, 3.3, 3.5, 1.7, 'floor-tile-marble'),
      room('cs-balcony', 'Balcony', 4.7, 5.1, 3.5, 1.9, 'floor-terrazzo'),
    ],
  }
}

/** Condo 2-Bedroom (~75 m²): master ensuite + common bath, balcony. */
function condo2Bed(): FloorPlan {
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
      room('c2-living', 'Living / Dining', 0.2, 0.2, 5.0, 5.2, 'floor-wood-oak'),
      room('c2-kit', 'Open Kitchen', 0.2, 5.4, 2.4, 2.8, 'floor-tile-grey'),
      room('c2-master', 'Master Bedroom', 5.5, 0.2, 1.7, 3.8, 'floor-wood-oak'),
      room('c2-mbath', 'Master Bath', 7.4, 0.2, 1.6, 1.6, 'floor-tile-marble'),
      room('c2-mcloset', 'Master Closet', 7.4, 1.9, 1.6, 2.1, 'floor-wood-oak'),
      room('c2-bed2', 'Bedroom 2', 5.5, 4.1, 3.5, 2.1, 'floor-wood-walnut'),
      room('c2-cbath', 'Common Bath', 7.4, 6.5, 1.6, 1.7, 'floor-tile-white'),
      room('c2-corr', 'Hall', 5.5, 6.5, 1.7, 1.7, 'floor-wood-oak'),
      room('c2-balcony', 'Balcony', 2.7, 6.5, 2.7, 1.7, 'floor-terrazzo'),
    ],
  }
}

/** Condo 3-Bedroom (~100 m²): master ensuite, balcony, enclosed kitchen + yard. */
function condo3Bed(): FloorPlan {
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
      // Bedroom column on the east.
      iwall('c3-bed-w', [7.0, T], [7.0, D - T]),
      iwall('c3-b2-s', [7.0, 3.0], [W - T, 3.0]),
      iwall('c3-b3-s', [7.0, 6.0], [W - T, 6.0]),
      // Master ensuite split + common bath off the corridor (south-centre).
      iwall('c3-mbath-n', [7.0, 7.8], [W - T, 7.8]),
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
      window('c3-b2-win', 'c3-e', 1.0, 1.6),
      window('c3-b3-win', 'c3-e', 3.6, 1.6),
      window('c3-m-win', 'c3-e', 6.6, 1.8),
      window('c3-liv-win', 'c3-n', 3.4, 2.4),
    ],
    rooms: [
      room('c3-living', 'Living / Dining', 0.2, 0.2, 6.6, 4.2, 'floor-wood-oak'),
      room('c3-kit', 'Kitchen', 0.2, 4.5, 2.7, 3.0, 'floor-tile-grey'),
      room('c3-yard', 'Service Yard', 0.2, 7.7, 2.7, 1.7, 'floor-tile-grey'),
      room('c3-balcony', 'Balcony', 3.1, 7.7, 2.0, 1.7, 'floor-terrazzo'),
      room('c3-bed2', 'Bedroom 2', 7.1, 0.2, 3.7, 2.7, 'floor-wood-walnut'),
      room('c3-bed3', 'Bedroom 3', 7.1, 3.1, 3.7, 2.8, 'floor-wood-walnut'),
      room('c3-cbath', 'Common Bath', 5.3, 6.1, 1.6, 3.3, 'floor-tile-white'),
      room('c3-master', 'Master Bedroom', 7.1, 6.1, 3.7, 1.6, 'floor-wood-oak'),
      room('c3-mbath', 'Master Bath', 7.1, 7.9, 3.7, 1.5, 'floor-tile-marble'),
    ],
  }
}

/** Condo Penthouse (3BR, ~160 m²): dual-aspect living, large balcony, yard,
 *  ensuite master; taller living volume (3.0 m). */
function condoPenthouse(): FloorPlan {
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
      room('cp-kit', 'Kitchen', 0.2, 0.2, 3.4, 3.2, 'floor-tile-grey'),
      room('cp-yard', 'Service Yard', 0.2, 3.6, 1.8, 1.6, 'floor-tile-grey'),
      room('cp-living', 'Living / Dining', 3.8, 0.2, 2.6, 8.4, 'floor-wood-oak'),
      room('cp-dining', 'Dining', 6.5, 0.2, 1.8, 3.2, 'floor-wood-oak'),
      room('cp-lounge', 'Lounge', 6.5, 5.5, 1.8, 3.1, 'floor-wood-oak'),
      room('cp-foyer', 'Foyer', 0.2, 5.4, 3.4, 3.0, 'floor-wood-oak'),
      room('cp-cbath', 'Common Bath', 6.5, 3.5, 1.8, 1.8, 'floor-tile-white'),
      room('cp-balcony', 'Balcony', 3.8, 8.9, 4.5, 2.5, 'floor-terrazzo'),
      room('cp-bed2', 'Bedroom 2', 8.5, 0.2, 4.3, 3.1, 'floor-wood-walnut'),
      room('cp-bed3', 'Bedroom 3', 8.5, 3.5, 4.3, 2.9, 'floor-wood-walnut'),
      room('cp-master', 'Master Bedroom', 8.5, 6.7, 2.0, 4.7, 'floor-wood-oak'),
      room('cp-mbath', 'Master Bath', 10.7, 6.7, 2.1, 4.7, 'floor-tile-marble'),
    ],
  }
}

/** Terrace house (landed, two storeys, ~90 m² footprint): ground = car porch,
 *  open living + dining, kitchen + yard, powder room, stair hall; upper =
 *  3 bedrooms (master ensuite) + 2 baths + family area off the stair landing.
 *  The upper storey sits at the 3.0 m ground ceiling + 0.3 m slab; its 'Stair
 *  Landing' is stacked over the ground 'Stair Hall'. */
function condoTerrace(): FloorPlan {
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
      room('ctu-master', 'Master Bedroom', 0.2, 0.2, 4.3, 3.8, 'floor-wood-oak'),
      room('ctu-mbath', 'Master Bath', 4.7, 0.2, 1.5, 2.4, 'floor-tile-marble'),
      room('ctu-bed2', 'Bedroom 2', 0.2, 4.2, 4.3, 3.4, 'floor-wood-walnut'),
      // Stacked over the ground-floor 'Stair Hall' (stair void + arrival).
      room('ctu-landing', 'Stair Landing', 4.7, 4.5, 1.5, 4.9, 'floor-wood-oak'),
      room('ctu-bed3', 'Bedroom 3', 0.2, 7.8, 4.3, 3.2, 'floor-wood-walnut'),
      room('ctu-cbath', 'Common Bath', 4.7, 9.6, 1.5, 2.2, 'floor-tile-white'),
      room('ctu-family', 'Family Area', 0.2, 11.2, 4.3, 2.6, 'floor-wood-oak'),
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
      room('ct-porch', 'Car Porch', 0.2, 0.2, 6.0, 2.4, 'floor-terrazzo'),
      room('ct-living', 'Living', 0.2, 2.6, 4.4, 6.8, 'floor-wood-oak'),
      room('ct-powder', 'Powder Room', 4.7, 2.6, 1.5, 1.8, 'floor-tile-white'),
      room('ct-stair', 'Stair Hall', 4.7, 4.5, 1.5, 4.9, 'floor-wood-oak'),
      room('ct-dining', 'Dining', 0.2, 9.5, 2.9, 2.5, 'floor-wood-oak'),
      room('ct-kit', 'Kitchen', 3.3, 9.5, 2.9, 2.5, 'floor-tile-grey'),
      room('ct-yard', 'Service Yard', 0.2, 12.1, 6.0, 1.7, 'floor-tile-grey'),
    ],
    upperLevels: [upper],
  }
}

/** Condo Studio / "shoebox" (~37 m²): one open living/sleeping space, a
 *  kitchenette niche, a bath and a small balcony. */
function condoStudio(): FloorPlan {
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
      room('su-living', 'Living / Sleeping', 0.2, 0.2, 3.4, 5.8, 'floor-wood-oak'),
      room('su-bath', 'Bathroom', 3.8, 0.2, 2.0, 2.4, 'floor-tile-marble'),
      room('su-kit', 'Kitchenette', 3.8, 2.8, 2.0, 1.6, 'floor-tile-grey'),
      room('su-balcony', 'Balcony', 3.8, 4.6, 2.0, 1.4, 'floor-terrazzo'),
    ],
  }
}

/** Condo 4-Bedroom (~140 m²): four bedrooms + master ensuite across the north,
 *  a common + shared bath, open living/dining, kitchen + yard and a wide
 *  balcony to the south. */
function condo4Bed(): FloorPlan {
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
      room('c4-bed2', 'Bedroom 2', 0.2, 0.2, 2.8, 3.8, 'floor-wood-walnut'),
      room('c4-bed3', 'Bedroom 3', 3.2, 0.2, 2.8, 3.8, 'floor-wood-walnut'),
      room('c4-bed4', 'Bedroom 4', 6.2, 0.2, 2.6, 3.8, 'floor-wood-walnut'),
      room('c4-master', 'Master Bedroom', 9.0, 0.2, 2.8, 3.8, 'floor-wood-oak'),
      room('c4-cbath', 'Common Bath', 0.2, 4.2, 2.0, 1.8, 'floor-tile-white'),
      room('c4-bath2', 'Bathroom 2', 2.4, 4.2, 2.0, 1.8, 'floor-tile-white'),
      room('c4-mbath', 'Master Bath', 9.0, 4.2, 2.8, 1.8, 'floor-tile-marble'),
      room('c4-living', 'Living / Dining', 0.2, 6.2, 6.0, 5.0, 'floor-wood-oak'),
      room('c4-kit', 'Kitchen', 6.4, 6.2, 3.0, 3.0, 'floor-tile-grey'),
      room('c4-yard', 'Service Yard', 9.6, 6.2, 2.2, 1.6, 'floor-tile-grey'),
      room('c4-balcony', 'Balcony', 6.4, 9.4, 5.4, 1.6, 'floor-terrazzo'),
    ],
  }
}

export const PLAN_TEMPLATES: FloorPlan[] = [
  studio(),
  oneBed(),
  loft(),
  hdb2Room(),
  hdb3Room(),
  hdb4Room(),
  hdb5Room(),
  hdbExecutive(),
  hdb3Gen(),
  hdbJumbo(),
  hdbMaisonette(),
  condo1Bed(),
  condo1Study(),
  condo2Bed(),
  condo3Bed(),
  condoPenthouse(),
  condoTerrace(),
  condoStudio(),
  condo4Bed(),
]
