/** Axis-aligned room rectangle in world metres. */
export interface RoomRect {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

/** Which wall of the room rectangle a point is closest to. */
export type WallEdge = 'N' | 'S' | 'W' | 'E'

/** The room wall nearest to `pos`: N = −Z, S = +Z, W = −X, E = +X. */
export function nearestWallEdge(pos: [number, number], rect: RoomRect): WallEdge {
  const [x, z] = pos
  const dN = z - rect.minZ
  const dS = rect.maxZ - z
  const dW = x - rect.minX
  const dE = rect.maxX - x
  const min = Math.min(dN, dS, dW, dE)
  if (min === dN) return 'N'
  if (min === dS) return 'S'
  if (min === dW) return 'W'
  return 'E'
}

/** The Y-rotation (radians) that turns an item's front to face away from a wall
 *  edge (its back against that wall). Furniture faces local +Z at rotation 0. */
export function rotationForEdge(edge: WallEdge): number {
  switch (edge) {
    case 'N':
      return 0
    case 'S':
      return Math.PI
    case 'W':
      return Math.PI / 2
    default:
      return -Math.PI / 2
  }
}

/**
 * The Y-rotation (radians) that points an item's **front** into the room — i.e.
 * its back against the nearest wall. Furniture faces local **+Z** at rotation 0;
 * a three.js Y-rotation θ turns that front to world (sin θ, cos θ). So:
 *   nearest wall on −Z (north) → face +Z → 0
 *   nearest wall on +Z (south) → face −Z → π
 *   nearest wall on −X (west)  → face +X → π/2
 *   nearest wall on +X (east)  → face −X → −π/2
 * Pure — the caller collision-checks + commits.
 */
export function rotationFacingRoom(pos: [number, number], rect: RoomRect): number {
  return rotationForEdge(nearestWallEdge(pos, rect))
}

/**
 * Position that pulls an item flush against a wall edge, given its axis-aligned
 * footprint half-extents (`halfX`, `halfZ`). The perpendicular coordinate moves
 * so the item's edge touches the room edge; the parallel one is unchanged.
 * Pure — the caller collision-checks + commits.
 */
export function flushToWall(
  pos: [number, number],
  rect: RoomRect,
  edge: WallEdge,
  halfX: number,
  halfZ: number,
): [number, number] {
  const [x, z] = pos
  switch (edge) {
    case 'N':
      return [x, rect.minZ + halfZ]
    case 'S':
      return [x, rect.maxZ - halfZ]
    case 'W':
      return [rect.minX + halfX, z]
    default:
      return [rect.maxX - halfX, z]
  }
}
