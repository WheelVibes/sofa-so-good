/**
 * Walk-mode spawn clearance (WALK-SPAWN-CLEAR). Entering walk mode drops the
 * walker at a hand-picked (default plan) or derived (custom plan / upper storey /
 * room editor) point — none of which knew anything about the furniture standing
 * there. On the furnished default flat that put the eye INSIDE the dining table
 * (spawn 11, 6 vs. the table at 11, 5.8): the first frame of every walkthrough was
 * a tabletop and a pendant shade filling the view at 0.2 m, which reads as a
 * cramped room even though the flat is modeled at true size — and the first step
 * then jerked sideways as the furniture solver shoved the walker out.
 *
 * So the spawn is resolved through the SAME solvers a normal step uses — push out
 * of any furniture footprint (`resolveCircleVsObbs`), then re-resolve against the
 * walls (`resolveMovement`) so a piece can't shove the walker through one — at the
 * same `WALK_PLAYER_RADIUS`. One source of truth: a spawn lands exactly as clear
 * as walking keeps you, like the minimap teleport already does (MINIMAP-JUMP).
 * Pure (no three / no store) so it unit-tests without a frame loop.
 */
import { resolveCircleVsObbs } from '../../collision/furnitureBlock'
import type { OBB } from '../../collision/obb'
import { type CollisionWall, resolveMovement } from '../../collision/walls'
import { WALK_PLAYER_RADIUS } from './walkCameraSettings'

/** Nudge a spawn XZ clear of furniture + walls, at the walker's own radius. */
export function resolveWalkSpawn(
  x: number,
  z: number,
  blockers: OBB[],
  walls: CollisionWall[],
  radius: number = WALK_PLAYER_RADIUS,
): [number, number] {
  if (blockers.length === 0) return [x, z]
  const pushed = resolveCircleVsObbs(x, z, radius, blockers)
  if (pushed[0] === x && pushed[1] === z) return [x, z]
  if (walls.length === 0) return pushed
  // Sweep from the original point so the wall solver sees the push as a move it
  // can clip — landing short of a wall rather than tunnelling through it.
  return resolveMovement([x, z], pushed, radius, walls)
}
