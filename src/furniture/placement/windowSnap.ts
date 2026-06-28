/**
 * windowSnap.ts — snap a window-bound fixture (curtains, blinds, grilles) onto
 * the nearest window opening (WINDOW-FIXTURE).
 *
 * `windowBound` defs are statically placed ON a window and never moved/rotated/
 * flipped afterwards. At placement time we therefore ignore the raw floor drop
 * point and instead snap the fixture onto the nearest window opening — landing it
 * flush on the wall, centred on the window, facing the room interior. If the plan
 * has no window the placement is rejected (the caller shows a toast).
 *
 * Pure + render-agnostic (no three/React) so it can be unit-tested headlessly.
 * The window world position + orientation mirror the renderer
 * (`apartment/Window.tsx` / `floorplan/PlanShell` `FadeWindow`): a window centred
 * at `offset + width/2` along its wall, the fixture's local +Z (its facing) set to
 * the wall normal that points toward the drop point (the room side the user aimed
 * at).
 */

import type { PlanOpening, PlanWall } from '../../floorplan/types'

export interface WindowSnapResult {
  /** Snapped world position (XZ, metres) — the window centre on the wall line. */
  position: [number, number]
  /** Yaw (radians) so the fixture faces the room interior (toward `dropPos`). */
  rotation: number
  /** The window opening that was snapped to. */
  openingId: string
}

/** A wall keyed by id, for resolving an opening's host wall. */
function wallById(walls: ReadonlyArray<PlanWall>): Map<string, PlanWall> {
  const m = new Map<string, PlanWall>()
  for (const w of walls) m.set(w.id, w)
  return m
}

/**
 * Snap a window-bound fixture dropped at `dropPos` onto the nearest window.
 *
 * Returns the snapped transform, or `null` when there is no window to snap to
 * (no window openings, or none whose host wall resolves) — the caller then
 * rejects the placement.
 *
 * "Nearest" is by world distance from `dropPos` to each window's centre, so the
 * user naturally lands the fixture on the window they dropped beside (no need to
 * scope by room). `dropPos` also picks which side of the wall the fixture faces:
 * the wall normal pointing toward the drop point is used as the facing (+Z), so a
 * curtain hangs on the room side the user aimed at.
 */
export function snapToNearestWindow(
  walls: ReadonlyArray<PlanWall>,
  openings: ReadonlyArray<PlanOpening>,
  dropPos: [number, number],
): WindowSnapResult | null {
  const byId = wallById(walls)
  let best: WindowSnapResult | null = null
  let bestDist = Number.POSITIVE_INFINITY

  for (const op of openings) {
    if (op.kind !== 'window') continue
    const wall = byId.get(op.wallId)
    if (!wall) continue
    const dx = wall.end[0] - wall.start[0]
    const dz = wall.end[1] - wall.start[1]
    const len = Math.hypot(dx, dz)
    if (len < 1e-6) continue
    const ux = dx / len
    const uz = dz / len
    // Window centre along the wall (offset is the window's start edge).
    const centreDist = op.offset + op.width / 2
    const wx = wall.start[0] + ux * centreDist
    const wz = wall.start[1] + uz * centreDist

    const ddx = dropPos[0] - wx
    const ddz = dropPos[1] - wz
    const dist = Math.hypot(ddx, ddz)
    if (dist >= bestDist) continue

    // Base orientation mirrors the window pane (rotation.y = -atan2(dz, dx)); its
    // local +Z then points along the wall normal (-uz, ux). Flip by π so the
    // facing points toward the drop point (the room side the user aimed at).
    let rotation = -Math.atan2(dz, dx)
    const nx = -uz
    const nz = ux
    if (ddx * nx + ddz * nz < 0) rotation += Math.PI

    bestDist = dist
    best = { position: [wx, wz], rotation, openingId: op.id }
  }

  return best
}
