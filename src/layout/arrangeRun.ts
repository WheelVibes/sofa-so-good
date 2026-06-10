/**
 * Wall-aware "arrange as a run": lay a set of cabinet-like pieces in a single
 * row flush against one wall of a room, backs to the wall, butted edge-to-edge
 * in their current left-to-right order — the kitchen-run / wardrobe-wall move.
 *
 * Pure + render-agnostic: the caller supplies each piece's unrotated footprint
 * (width × depth) and the room rectangle; this returns the new world position +
 * Y-rotation per id. The caller collision-checks + commits.
 */
import { type RoomRect, rotationForEdge, type WallEdge } from './faceWall'

export interface RunItem {
  id: string
  /** Footprint width (along the run) and depth (front-to-back), unrotated metres. */
  w: number
  d: number
  /** Current centre, used only to order the pieces along the wall. */
  pos: [number, number]
}

export interface RunPlacement {
  id: string
  position: [number, number]
  rotation: number
}

/** Is this wall edge horizontal (run goes along X) or vertical (along Z)? */
function alongAxis(edge: WallEdge): 0 | 1 {
  return edge === 'N' || edge === 'S' ? 0 : 1
}

/**
 * Arrange `items` flush against `edge`, butted together and centred on the
 * midpoint of their current span along the wall (so the run stays where the user
 * roughly had it rather than jumping to a corner). Depth sets the flush offset;
 * width sets each piece's slot along the wall.
 */
export function arrangeRun(items: RunItem[], edge: WallEdge, rect: RoomRect): RunPlacement[] {
  if (items.length === 0) return []
  const axis = alongAxis(edge)
  const perp: 0 | 1 = axis === 0 ? 1 : 0
  const rotation = rotationForEdge(edge)

  // Order along the wall by current coordinate on the run axis.
  const ordered = [...items].sort((a, b) => a.pos[axis] - b.pos[axis])
  const totalW = ordered.reduce((s, it) => s + it.w, 0)

  // Centre the run on the midpoint of the current along-span.
  const mid = ordered.reduce((s, it) => s + it.pos[axis], 0) / ordered.length
  let cursor = mid - totalW / 2

  // Flush coordinate on the perpendicular axis (back against the wall face).
  const perpMin = perp === 0 ? rect.minX : rect.minZ
  const perpMax = perp === 0 ? rect.maxX : rect.maxZ

  return ordered.map((it) => {
    const along = cursor + it.w / 2
    cursor += it.w
    const half = it.d / 2
    const perpValue = edge === 'N' || edge === 'W' ? perpMin + half : perpMax - half
    const position: [number, number] = axis === 0 ? [along, perpValue] : [perpValue, along]
    return { id: it.id, position, rotation }
  })
}
