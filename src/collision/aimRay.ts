/**
 * Shared 2D ray/segment aim math for walk-mode "interact" targets (doors,
 * window fixtures) — `FirstPersonCamera` throws one forward ray per
 * `AIM_CHECK_INTERVAL` against a set of line segments (each interactable's
 * width, projected onto the floor plane) and reports the nearest unblocked
 * hit within range. Kept pure + render-agnostic so both the door aim and the
 * curtain/blind aim (WINDOW-FIXTURE-INTERACT) share one implementation
 * instead of two copies of the same intersection math.
 */

export interface AimSegment {
  id: string
  sx: number
  sz: number
  segDx: number
  segDz: number
}

/** Nearest segment (by id) that the ray from `(ox,oz)` along the normalized
 *  direction `(dirX,dirZ)` crosses within `maxDist`, skipping any hit for
 *  which `isBlocked(hitX,hitZ)` is true (e.g. a wall between player and
 *  target). Returns `null` when nothing in range is hit. */
export function nearestAimedSegment(
  ox: number,
  oz: number,
  dirX: number,
  dirZ: number,
  segments: readonly AimSegment[],
  maxDist: number,
  isBlocked: (hitX: number, hitZ: number) => boolean,
): string | null {
  let aimedId: string | null = null
  let bestHitDist = maxDist
  for (const seg of segments) {
    const denom = dirX * seg.segDz - dirZ * seg.segDx
    if (Math.abs(denom) < 1e-6) continue
    const relX = seg.sx - ox
    const relZ = seg.sz - oz
    const t = (relX * seg.segDz - relZ * seg.segDx) / denom
    const u = (relX * dirZ - relZ * dirX) / denom
    if (t <= 0 || t > bestHitDist) continue
    if (u < 0 || u > 1) continue
    const hitX = ox + dirX * t
    const hitZ = oz + dirZ * t
    if (isBlocked(hitX, hitZ)) continue
    bestHitDist = t
    aimedId = seg.id
  }
  return aimedId
}
