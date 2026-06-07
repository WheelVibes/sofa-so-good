import { wallThicknessMetres } from '../apartment/wallSegments'
import type { FloorPlan } from '../floorplan/types'
import { getRoomEditorShell } from '../scene/roomEditorShell'
import type { CollisionWall } from './walls'

// Mirrors planGeometry's EXTERNAL_T / INTERNAL_T (kept local to avoid importing
// the renderer module into the collision layer).
const PLAN_WALL_T = { external: 0.2, internal: 0.1 } as const

/**
 * Solid perimeter collision walls for the room being edited, so dragged/placed
 * furniture is **bounded by the room's own walls** and can't slide past them
 * into adjacent rooms. Unlike the walk-mode room walls (which leave open-door
 * gaps so the player can leave), every clipped wall span is treated as solid —
 * a piece of furniture shouldn't drift out through a doorway. Works for the
 * default flat and custom plans (via the editor room shell). Returns `undefined`
 * when there's no resolvable room (caller falls back to the whole-flat walls).
 */
export function roomEditorPlacementWalls(
  plan: FloorPlan,
  roomId: string,
): CollisionWall[] | undefined {
  const editor = getRoomEditorShell(plan, roomId)
  if (!editor) return undefined
  const walls: CollisionWall[] = []
  if (editor.kind === 'default') {
    for (const clip of editor.shell.walls) {
      walls.push({
        ax: clip.start[0],
        az: clip.start[1],
        bx: clip.end[0],
        bz: clip.end[1],
        thickness: wallThicknessMetres(clip.spec),
      })
    }
  } else {
    for (const clip of editor.shell.walls) {
      walls.push({
        ax: clip.start[0],
        az: clip.start[1],
        bx: clip.end[0],
        bz: clip.end[1],
        thickness: PLAN_WALL_T[clip.thickness],
      })
    }
  }
  return walls
}
