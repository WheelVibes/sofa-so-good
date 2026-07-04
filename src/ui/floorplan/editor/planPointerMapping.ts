import type React from 'react'
import type { RefObject } from 'react'
import { snapToGuides } from '../../../floorplan/snapToGuides'
import type { PlanGuide, PlanWall } from '../../../floorplan/types'
import { alongWall as alongWallGeo, nearestWall as nearestWallGeo } from './floorPlanGeometry'
import { GRID_MARGIN } from './planConstants'
import { snapToWalls } from './snapToWalls'
import { snapWallAngle } from './snapWallAngle'

/**
 * Screen-pointer → plan-world coordinate mapping for the 2D editor: grid
 * snapping (+ ruler-guide snap), the raw (unsnapped) marquee-tracking
 * projection, wall-magnetism snapping, and the wall-draw angle-then-wall-snap
 * pipeline (grid → 15° angle → wall-snap). Extracted from `FloorPlanEditor`
 * (REFAC-2) — a cohesive "where is the pointer in plan-space" concern the
 * `onDown`/`onMove`/`onUp` dispatcher calls into.
 *
 * NOT a pure module (it reads `svgRef.current`'s live DOM rect), so it isn't
 * unit-tested like `floorPlanGeometry`/`snapToWalls`/`snapWallAngle` — those
 * pure primitives it composes already are. Recreated fresh on every render
 * (same as the inline closures it replaces), so it always sees the current
 * `W`/`H`/`PX`/`snap`/walls without needing memoisation.
 */
export interface PlanPointerMappingDeps {
  svgRef: RefObject<SVGSVGElement | null>
  W: number
  H: number
  PX: number
  /** Grid-snap a metre value (0 = no snapping). */
  snap: (m: number) => number
  fGuides: boolean
  guides: PlanGuide[] | undefined
  walls: PlanWall[]
}

export function createPlanPointerMapping({
  svgRef,
  W,
  H,
  PX,
  snap,
  fGuides,
  guides,
  walls,
}: PlanPointerMappingDeps) {
  // Raw pointer → grid-snapped world point (no wall magnetism). Split out so the
  // wall-draw path can aim the grid point onto an angle increment *before* the
  // wall snap gets the final say (grid → angle → wall-snap).
  const pointerGrid = (e: React.PointerEvent): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const y = ((e.clientY - rect.top) / rect.height) * H
    const gridded: [number, number] = [snap(x / PX - GRID_MARGIN), snap(y / PX - GRID_MARGIN)]
    // Persistent ruler guides take precedence over the grid within a small
    // metric threshold (PARITY-PLAN-GUIDES), so a point lands exactly on a guide.
    if (fGuides && guides?.length) return snapToGuides(gridded, guides, 0.15)
    return gridded
  }

  // Raw (unsnapped) pointer → plan metres. The marquee rect tracks the cursor
  // smoothly without grid quantisation (snapping would make the selection box
  // jump in grid steps).
  const pointerPlanRaw = (e: React.PointerEvent): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const y = ((e.clientY - rect.top) / rect.height) * H
    return [x / PX - GRID_MARGIN, y / PX - GRID_MARGIN]
  }

  const pointerWorld = (
    e: React.PointerEvent,
    excludeWallId?: string,
    snapEdges?: boolean,
  ): [number, number] => {
    // Vertex snap (always) + edge snap (wall drawing only): connect walls cleanly
    // at corners, and let a new wall tee mid-span into an existing one. Skip the
    // wall being vertex-dragged so its own endpoints don't capture the cursor.
    return snapToWalls(pointerGrid(e), walls, { excludeWallId, edges: snapEdges })
  }

  // Wall-draw endpoint: grid → angle-snap (15° increments, hold Shift to bypass)
  // → wall-snap, so freehand walls land on clean directions while a join to a real
  // corner/edge still wins near existing geometry.
  const wallDrawEnd = (e: React.PointerEvent, anchor: [number, number]): [number, number] => {
    const grid = pointerGrid(e)
    const aimed = e.shiftKey ? grid : snapWallAngle(anchor, grid)
    return snapToWalls(aimed, walls, { edges: true })
  }

  /** Nearest active-storey wall to a world point, with the projected offset. */
  const nearestWall = (wx: number, wz: number) => nearestWallGeo(walls, wx, wz)

  // Along-wall distance of a world point: arc-length on a curved wall, chord
  // projection on a straight one. Used to drag an opening along its wall.
  const alongWall = (wall: PlanWall, x: number, z: number): number => alongWallGeo(wall, x, z)

  return { pointerGrid, pointerPlanRaw, pointerWorld, wallDrawEnd, nearestWall, alongWall }
}
