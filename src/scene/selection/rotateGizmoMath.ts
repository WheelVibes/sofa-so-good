import { ROTATE_FINE_STEP } from '../../controls/keybindings'

/** Default angular snap step (15°). Holding Shift bypasses it for free rotation. */
export const GIZMO_SNAP_STEP = ROTATE_FINE_STEP

/** Ring radius beyond the footprint half-extent, and the floor minimum. */
export const GIZMO_HANDLE_GAP = 0.38
export const GIZMO_MIN_RADIUS = 0.55

/** Floor-ring radius for an item whose footprint half-extents are (hx, hz). */
export function gizmoRadius(hx: number, hz: number): number {
  return Math.max(GIZMO_MIN_RADIUS, Math.max(hx, hz) + GIZMO_HANDLE_GAP)
}

/** Angle (radians) from a centre (cx, cz) to a floor point (px, pz), measured so
 *  that 0 points along +Z (the item's facing) and increases toward +X. Matches
 *  the convention used to place the front knob at local (0, 0, r). */
export function pointerAngle(cx: number, cz: number, px: number, pz: number): number {
  return Math.atan2(px - cx, pz - cz)
}

/**
 * Resolve the new item rotation during a gizmo drag. Rotation is *relative* to
 * the grab so picking up the ring anywhere never snaps the piece — the delta
 * between the live pointer angle and the grab angle is added to the rotation
 * captured at grab. When `snap` is true the result quantises to 15° steps.
 */
export function computeRotation(
  startRot: number,
  grabAngle: number,
  currentAngle: number,
  snap: boolean,
): number {
  const next = startRot + (currentAngle - grabAngle)
  if (!snap) return next
  return Math.round(next / GIZMO_SNAP_STEP) * GIZMO_SNAP_STEP
}

/** Snap a raw angular delta to 15° steps (used for group rotation, where there
 *  is no single absolute rotation to snap). */
export function snapDelta(delta: number, snap: boolean): number {
  return snap ? Math.round(delta / GIZMO_SNAP_STEP) * GIZMO_SNAP_STEP : delta
}

const HALF_PI = Math.PI / 2
const TWO_PI = Math.PI * 2

/**
 * Smart-rotation threshold (radians). When the candidate yaw is within this much
 * of a neighbour's axis (mod 90°), rotation snaps to that axis instead of the
 * coarse 15° grid. 5° is wide enough to "catch" while dragging yet well inside
 * the 15° grid step, so the two snaps never fight over the same target. */
export const NEIGHBOUR_SNAP_THRESHOLD = (Math.PI / 180) * 5

/** Signed shortest angular difference `a - b`, wrapped to (−π, π]. */
function angleDiff(a: number, b: number): number {
  let d = (a - b) % TWO_PI
  if (d > Math.PI) d -= TWO_PI
  if (d <= -Math.PI) d += TWO_PI
  return d
}

/**
 * The signed offset (radians, magnitude ≤ 45°) from `yaw` to the nearest axis
 * that is parallel **or** perpendicular to `ref` — i.e. the nearest multiple of
 * 90° away from `ref`. Snapping mod-90° means a sofa reads as "aligned" to its
 * neighbour whether it sits side-by-side (parallel) or facing it (perpendicular),
 * which is what feels right in practice.
 */
export function offsetToNeighbourAxis(yaw: number, ref: number): number {
  const rel = angleDiff(yaw, ref)
  const k = Math.round(rel / HALF_PI)
  return rel - k * HALF_PI
}

/** The yaw nearest `candidate` that is parallel/perpendicular to `ref`. */
function snapToNeighbourAxis(candidate: number, ref: number): number {
  return candidate - offsetToNeighbourAxis(candidate, ref)
}

/**
 * Smart rotation snap. Given a free (un-snapped) candidate yaw and the axes of
 * nearby items / walls (their yaws, in the same +Z-is-0 convention), returns the
 * snapped yaw:
 *
 *   - If `snap` is false (Shift held), the candidate passes through untouched —
 *     Shift bypasses ALL snapping.
 *   - Else if some reference axis is within `NEIGHBOUR_SNAP_THRESHOLD` (mod 90°)
 *     of the candidate, snap to the **nearest** such axis. Neighbour snap takes
 *     strict precedence over the 15° grid (clear precedence, no hysteresis: the
 *     threshold sits well inside one grid step so there is no flicker zone where
 *     both could apply to different targets).
 *   - Otherwise fall back to the existing 15° increment snap.
 *
 * Pure — composes with `computeRotation`/`snapDelta`, so the 3D gizmo and the 2D
 * plan rotate handle share one definition of "smart snap". Returns both the yaw
 * and which reference index won (or −1 for the grid fallback) so callers can draw
 * a faint alignment guide only when a neighbour snap is active.
 */
export function smartSnapRotation(
  candidate: number,
  refs: ReadonlyArray<number>,
  snap: boolean,
): { yaw: number; snappedToRef: number } {
  if (!snap) return { yaw: candidate, snappedToRef: -1 }
  let best = -1
  let bestAbs = NEIGHBOUR_SNAP_THRESHOLD
  for (let i = 0; i < refs.length; i++) {
    const off = Math.abs(offsetToNeighbourAxis(candidate, refs[i]))
    // `<` (not `<=`) keeps a single nearest winner stable when two refs tie.
    if (off < bestAbs) {
      bestAbs = off
      best = i
    }
  }
  if (best >= 0) return { yaw: snapToNeighbourAxis(candidate, refs[best]), snappedToRef: best }
  return { yaw: Math.round(candidate / GIZMO_SNAP_STEP) * GIZMO_SNAP_STEP, snappedToRef: -1 }
}

/**
 * Collect the reference yaws the smart snap should consider for a single rotating
 * item: every *other* item's yaw plus each wall segment's direction (`atan2(dx,
 * dz)`, the same +Z-is-0 convention). De-duplicated mod-90° so the list stays
 * short (the right-angle box of a default plan collapses to one axis). The
 * rotating item itself is excluded by `selfId`.
 */
export function neighbourAxes(
  selfId: string,
  items: ReadonlyArray<{ id: string; rotation: number }>,
  walls: ReadonlyArray<{ ax: number; az: number; bx: number; bz: number }>,
): number[] {
  const seen: number[] = []
  const add = (yaw: number) => {
    // Fold onto [0, 90°) so parallel/perpendicular duplicates collapse.
    let m = yaw % HALF_PI
    if (m < 0) m += HALF_PI
    for (const s of seen) if (Math.abs(s - m) < 1e-4) return
    seen.push(m)
  }
  for (const it of items) {
    if (it.id === selfId) continue
    add(it.rotation)
  }
  for (const w of walls) {
    const dx = w.bx - w.ax
    const dz = w.bz - w.az
    if (dx === 0 && dz === 0) continue
    add(Math.atan2(dx, dz))
  }
  return seen
}

/** Rotate a point (px, pz) about a pivot (cx, cz) by `delta` radians (CCW in the
 *  XZ plane). Used to orbit each member of a multi-selection rigidly around the
 *  group centroid — mirrors the store's `groupRotate` transform. */
export function rotatePointAround(
  px: number,
  pz: number,
  cx: number,
  cz: number,
  delta: number,
): [number, number] {
  const dx = px - cx
  const dz = pz - cz
  const c = Math.cos(delta)
  const s = Math.sin(delta)
  return [cx + dx * c - dz * s, cz + dx * s + dz * c]
}

/** Floor-ring radius enclosing a set of targets (each given as centre + footprint
 *  half-diagonal) measured from a shared pivot. Keeps the ring clear of every
 *  selected piece for a multi-selection. */
export function enclosingRadius(
  pivotX: number,
  pivotZ: number,
  targets: ReadonlyArray<{ cx: number; cz: number; halfDiag: number }>,
): number {
  let r = GIZMO_MIN_RADIUS
  for (const t of targets) {
    const d = Math.hypot(t.cx - pivotX, t.cz - pivotZ) + t.halfDiag + GIZMO_HANDLE_GAP
    if (d > r) r = d
  }
  return r
}

/** Normalise radians to [0, 360) degrees for the on-screen readout. */
export function toDegrees(rad: number): number {
  let deg = (rad * 180) / Math.PI
  deg %= 360
  if (deg < 0) deg += 360
  return Math.round(deg)
}
