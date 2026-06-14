/**
 * Builds an editable FloorPlan from the fixed HDB flat in apartment/constants.
 * This is the seed plan: rendering it produces the same shell the app has
 * always shown, so the data-driven path can be validated against the original.
 */
import {
  APARTMENT_EXT_D,
  APARTMENT_EXT_W,
  DOORS,
  FLAT,
  ROOMS,
  WALLS,
  WINDOWS,
} from '../apartment/constants'
import type { FloorPlan, PlanOpening, PlanRoom, PlanWall } from './types'

export function buildDefaultPlan(): FloorPlan {
  const walls: PlanWall[] = WALLS.map((w) => ({
    id: w.id,
    start: [w.start[0], w.start[1]],
    end: [w.end[0], w.end[1]],
    thickness: w.thickness,
    ...(w.topHeight != null ? { topHeight: w.topHeight } : {}),
  }))

  const openings: PlanOpening[] = [
    ...DOORS.map(
      (d): PlanOpening => ({
        id: d.id,
        kind: 'door',
        wallId: d.wallId,
        offset: d.offset,
        width: d.width,
        sill: 0,
        head: FLAT.doorHeight,
        hinge: d.hinge,
        swing: d.swing,
      }),
    ),
    ...WINDOWS.map(
      (w): PlanOpening => ({
        id: w.id,
        kind: 'window',
        wallId: w.wallId,
        offset: w.offset,
        width: w.width,
        sill: w.sill,
        head: w.head,
      }),
    ),
  ]

  const rooms: PlanRoom[] = Object.values(ROOMS).map((r) => ({
    id: r.id,
    name: r.name,
    origin: [r.origin[0], r.origin[1]],
    width: r.width,
    depth: r.depth,
    ...(r.extension
      ? {
          extension: {
            offset: [r.extension.offset[0], r.extension.offset[1]] as [number, number],
            width: r.extension.width,
            depth: r.extension.depth,
          },
        }
      : {}),
    ...(r.ceilingHeight != null ? { ceilingHeight: r.ceilingHeight } : {}),
  }))

  return {
    id: 'default-hdb-4room',
    name: 'HDB 4-Room (default)',
    // Default categorisation: HDB › Serangoon North Vista › 4-Room.
    category: { housingType: 'HDB', projectName: 'Serangoon North Vista', apartmentType: '4-Room' },
    ceilingHeight: FLAT.ceilingHeight,
    extent: [APARTMENT_EXT_W, APARTMENT_EXT_D],
    walls,
    openings,
    rooms,
  }
}
