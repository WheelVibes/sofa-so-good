/**
 * Hand-authored starter floor plans, selectable in the editor so the user can
 * begin from a sensible apartment shell instead of a blank box. Each is a
 * complete, self-consistent FloorPlan (perimeter + partitions + rooms +
 * openings) with clean orthogonal walls.
 */
import type { FloorPlan, PlanOpening, PlanWall } from './types'

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
        depth: 4.9,
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

function loft(): FloorPlan {
  const W = 8.2
  const D = 6.0
  return {
    id: 'tpl-loft',
    name: 'Open Loft',
    ceilingHeight: 3.0,
    extent: [W, D],
    walls: [
      ...perimeter('lf', W, D),
      iwall('lf-bath-w', [6.2, 3.6], [6.2, D - T]),
      iwall('lf-bath-n', [6.2, 3.6], [W - T, 3.6]),
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
        name: 'Sleeping',
        origin: [0.2, 3.6],
        width: 5.9,
        depth: 2.2,
        floor: 'floor-wood-ebony',
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

export const PLAN_TEMPLATES: FloorPlan[] = [
  studio(),
  oneBed(),
  loft(),
  hdb2Room(),
  hdb3Room(),
  hdb4Room(),
  hdb5Room(),
]
