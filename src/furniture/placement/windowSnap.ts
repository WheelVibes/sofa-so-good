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
import type { ParamProps } from '../types'

/** The dimensions of a window opening a fixture is sizing itself to. */
export interface SnapWindow {
  width: number
  /** Bottom edge above floor (m). */
  sill: number
  /** Top edge above floor (m). */
  head: number
}

export interface WindowSnapResult {
  /** Snapped world position (XZ, metres) — the window centre on the wall line. */
  position: [number, number]
  /** Yaw (radians) so the fixture faces the room interior (toward `dropPos`). */
  rotation: number
  /** The window opening that was snapped to. */
  openingId: string
  /** The snapped window's dimensions, for `windowFixtureProps` sizing. */
  window: SnapWindow
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
    best = {
      position: [wx, wz],
      rotation,
      openingId: op.id,
      window: { width: op.width, sill: op.sill, head: op.head },
    }
  }

  return best
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Curtain overhang past each side of the glass (m) so it covers the window. */
const CURTAIN_OVERHANG = 0.18
/** Blind overhang past each side of the glass (m) — slightly bigger than the window. */
const BLIND_OVERHANG = 0.06

/**
 * Window-aware sizing for a window-bound fixture, merged over its default props
 * at placement so it fits the window it snaps to (rather than a fixed catalog
 * size). Pure + unit-tested; clamped to each def's param ranges.
 *
 *  - **Curtains** size **wider than the glass** (`CURTAIN_OVERHANG` each side) and
 *    hang **floor-to-ceiling** (`height` = ceiling drop).
 *  - **Roller blinds** size **slightly wider than the window** (`BLIND_OVERHANG`),
 *    mount just above the head, and get a `drop` that covers the glass.
 *
 * Returns `{}` for any other def (no resizing).
 */
export function windowFixtureProps(
  defId: string,
  win: SnapWindow,
  ceilingHeight: number,
): ParamProps {
  if (defId === 'curtains') {
    return {
      width: clamp(win.width + 2 * CURTAIN_OVERHANG, 1.0, 3.4),
      // Rod near the ceiling; both length modes hang from here.
      height: clamp(ceilingHeight - 0.05, 1.8, 3.2),
      // Stored so the `length: 'sill'` mode can drop the hem to just below the
      // sill without re-deriving the window.
      sillY: win.sill,
    }
  }
  if (defId === 'window-mesh-screen') {
    // Cover the whole opening (+ a small overhang each side so there is no gap
    // for a cat to slip through), from the sill to the head. Internal mounting.
    return {
      width: clamp(win.width + 0.06, 0.4, 3.4),
      sillY: clamp(win.sill, 0, 2.4),
      topY: clamp(win.head, 0.3, 3.2),
    }
  }
  if (defId === 'cat-window-perch') {
    // A sill-level lounging shelf: fit the perch WIDTH to the opening (a small
    // inset so it sits within the reveal) and anchor it AT the sill so it never
    // covers the glass. `sillY` is read by the primitive to lift the perch.
    return {
      width: clamp(win.width - 0.08, 0.4, 1.4),
      sillY: clamp(win.sill, 0.1, 2.4),
    }
  }
  if (defId === 'roller-blind') {
    const top = clamp(win.head + 0.12, 1.8, 2.7)
    // Cover from just above the head down to just below the sill.
    const drop = clamp(win.head - win.sill + 0.24, 0.4, 2.4)
    return { width: clamp(win.width + 2 * BLIND_OVERHANG, 0.6, 2.8), height: top, drop }
  }
  return {}
}
