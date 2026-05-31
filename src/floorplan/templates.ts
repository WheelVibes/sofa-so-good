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

export const PLAN_TEMPLATES: FloorPlan[] = [studio(), oneBed(), loft()]
