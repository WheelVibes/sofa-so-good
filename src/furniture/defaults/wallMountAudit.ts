/**
 * wallMountAudit.ts — finds any seeded wall-mounted item whose rendered body
 * overlaps a window opening on its own host wall (WALL-MOUNT-WINDOW-AUDIT).
 *
 * Three fixtures have been found hanging in front of window glass in the
 * default flat by hand (the living room fan-coil, the main-bedroom reading
 * sconces, bath 1's mirror cabinet) — each time because a mount's rendered
 * body (`mountHeight ± h/2`, the same convention `curtainFlush.ts` reads for
 * the curtain-clearance obstacle list) was never checked against the window
 * opening on the same wall. This module makes that check a standing audit
 * instead of a one-off spot fix: `wallMountAudit(items, catalog, plan)` walks
 * every mounted item, resolves its host wall via the same
 * `fittings/wallSnap.ts` maths the MEP fittings use, and reports every
 * window on that wall whose (offset..offset+width) x (sill..head) rectangle
 * overlaps the item's (along-wall x vertical) rectangle.
 *
 * Pure, no three/React/store imports — the same discipline as
 * `curtainFlush.ts` and `wallSnap.ts` it builds on.
 */
import { nearestStraightWall, WALL_SNAP_M, wallFrame } from '../../apartment/fittings/wallSnap'
import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import type { FloorPlan, PlanOpening } from '../../floorplan/types'
import { BUILTIN_CATALOG } from '../builtinCatalog'
import { defaultParamProps, type FurnitureDef, type FurnitureItem } from '../types'
import { worldHalfExtents } from './curtainFlush'

/**
 * Vertical extent (m above floor) of a wall-mounted item's rendered body, or
 * null when it is not a wall mount at all.
 *
 * Unlike `curtainFlush.ts`'s `mountedBodySpan` (which deliberately reads the
 * def's fixed `defaultFootprint.h` — a curtain only needs a CONSERVATIVE
 * obstacle box, and every mount it clears there is a fixed-size aircon/
 * sconce), this audit needs the item's REAL rendered height: `wall-art` and
 * `bathroom-mirror` both expose an editable `height` param the default flat's
 * own seeded entries override (`defaults/livingDining.ts`'s wall art is 0.7 m
 * against a 0.6 m catalogue default — reading the catalogue default there
 * would UNDER-state the body and could hide a real overlap). So this reads
 * `item.props.height` first and only falls back to `def.defaultFootprint.h`
 * when the item didn't override it.
 */
function mountedVerticalSpan(def: FurnitureDef, item: FurnitureItem): [number, number] | null {
  if (def.kind !== 'parametric' || !def.mounted) return null
  const props = { ...defaultParamProps(def), ...item.props }
  const mountHeight = props.mountHeight
  if (typeof mountHeight !== 'number') return null
  const h = typeof props.height === 'number' ? props.height : def.defaultFootprint.h
  return [mountHeight - h / 2, mountHeight + h / 2]
}

export interface WallMountWindowOverlap {
  itemId: string
  defId: string
  wallId: string
  windowId: string
  /** The item's along-wall (x) and vertical (y) extents, world metres. */
  itemX: [number, number]
  itemY: [number, number]
  /** The window opening's along-wall (x) and vertical (y) extents. */
  windowX: [number, number]
  windowY: [number, number]
  /** Overlap width/height, both > 0. */
  overlapX: number
  overlapY: number
  /** overlapX * overlapY, m². */
  overlapArea: number
}

/**
 * Every window-overlap hit for the given seeded items against the given
 * plan's windows. `catalog`/`plan` default to the built-in catalog and the
 * default flat's plan so `wallMountAudit(defaultLayout())` is the common call.
 */
export function wallMountAudit(
  items: readonly FurnitureItem[],
  catalog: Record<string, FurnitureDef> = BUILTIN_CATALOG,
  plan: FloorPlan = buildDefaultPlan(),
): WallMountWindowOverlap[] {
  const windows = plan.openings.filter((o): o is PlanOpening => o.kind === 'window')
  const out: WallMountWindowOverlap[] = []
  for (const item of items) {
    const def = catalog[item.defId]
    if (!def) continue
    const itemY = mountedVerticalSpan(def, item)
    if (!itemY) continue
    const hit = nearestStraightWall(plan.walls, item.position[0], item.position[1])
    if (!hit || hit.dist > WALL_SNAP_M) continue
    const wall = hit.wall
    const frame = wallFrame(wall)
    if (!frame) continue
    const [hx, hz] = worldHalfExtents(def, item)
    const alongWallHalf = hx * Math.abs(frame.ux) + hz * Math.abs(frame.uz)
    const itemX: [number, number] = [hit.offset - alongWallHalf, hit.offset + alongWallHalf]
    for (const win of windows) {
      if (win.wallId !== wall.id) continue
      const windowX: [number, number] = [win.offset, win.offset + win.width]
      const windowY: [number, number] = [win.sill, win.head]
      const overlapX = Math.min(itemX[1], windowX[1]) - Math.max(itemX[0], windowX[0])
      const overlapY = Math.min(itemY[1], windowY[1]) - Math.max(itemY[0], windowY[0])
      if (overlapX <= 0 || overlapY <= 0) continue
      out.push({
        itemId: item.id,
        defId: item.defId,
        wallId: wall.id,
        windowId: win.id,
        itemX,
        itemY,
        windowX,
        windowY,
        overlapX,
        overlapY,
        overlapArea: overlapX * overlapY,
      })
    }
  }
  return out
}
