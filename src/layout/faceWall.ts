/** Axis-aligned room rectangle in world metres. */
export interface RoomRect {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
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
  const [x, z] = pos
  const dN = z - rect.minZ
  const dS = rect.maxZ - z
  const dW = x - rect.minX
  const dE = rect.maxX - x
  const min = Math.min(dN, dS, dW, dE)
  if (min === dN) return 0
  if (min === dS) return Math.PI
  if (min === dW) return Math.PI / 2
  return -Math.PI / 2
}
