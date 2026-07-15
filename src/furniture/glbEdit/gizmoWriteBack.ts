/**
 * GLB Asset Designer — pure mapping from a drag-gizmo's end-of-drag object
 * transform (drei `TransformControls` mutates the preview mesh directly) back
 * onto the part's serialisable spec fields (`ShapePart.position/rotation/size`).
 * One patch is computed per drag END (not per frame) and routed through the
 * same `updatePart` the numeric inputs use, so the gizmo is just a fast way of
 * typing numbers: values are snapped to sensible precision and clamped to the
 * numeric inputs' bounds. Pure of three/react — unit-testable.
 */

import type { ShapeKind, ShapePart } from './editSpec'

export type GizmoMode = 'translate' | 'rotate' | 'scale'

/** Segmented-control order + labels + the in-dialog hotkey (Blender-style G/R/S). */
export const GIZMO_MODES: { mode: GizmoMode; label: string; hotkey: string }[] = [
  { mode: 'translate', label: 'Move', hotkey: 'g' },
  { mode: 'rotate', label: 'Rotate', hotkey: 'r' },
  { mode: 'scale', label: 'Scale', hotkey: 's' },
]

/** Gizmo modes available for a part kind. A combined `mesh` part's triangles
 *  are baked (its `size` is informational, no field drives the geometry), so
 *  scale is hidden for it — translate/rotate still move the whole result. */
export function gizmoModesFor(kind: ShapeKind): GizmoMode[] {
  return kind === 'mesh' ? ['translate', 'rotate'] : ['translate', 'rotate', 'scale']
}

/** Snap precision: 5 mm for lengths (the numeric inputs step 0.05 m but accept
 *  finer), 1° for rotations. Coarse enough to read clean in the inputs, fine
 *  enough not to fight the drag. */
const POSITION_SNAP_M = 0.005
const SIZE_SNAP_M = 0.005
const ROTATION_SNAP_DEG = 1

/** Bounds mirroring the numeric inputs: position min −3 m (kept symmetric at
 *  +3 m — the preview grid is 6 m), size min 0.02 m. */
const POSITION_LIMIT_M = 3
const MIN_SIZE_M = 0.02

/** Round `v` to a multiple of `step`, normalising `-0` to `0`. */
export function snapValue(v: number, step: number): number {
  const r = Math.round(v / step) * step
  // Re-round to kill float dust (0.30000000000000004) and -0.
  return r === 0 ? 0 : Number(r.toFixed(6))
}

/** Normalise an angle in degrees to [-180, 180) (the inputs' range). */
export function normalizeDeg(deg: number): number {
  const n = ((((deg + 180) % 360) + 360) % 360) - 180
  return n === 0 ? 0 : n
}

/** The preview object's transform at drag end (rotation = Euler XYZ radians,
 *  matching both three's default order and the mesh's declarative props). */
export interface GizmoSnapshot {
  position: [number, number, number]
  /** Euler XYZ, radians. */
  rotation: [number, number, number]
  scale: [number, number, number]
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const same = (a: readonly number[], b: readonly number[]) => a.every((v, i) => v === b[i])

/**
 * Compute the `updatePart` patch for one finished gizmo drag, or `null` when
 * the snapped result equals the part's current fields (no spec churn).
 * - `translate` → `position`, snapped to 5 mm, clamped to ±3 m.
 * - `rotate` → `rotation` in degrees, snapped to 1°, normalised to [-180, 180);
 *   an all-zero result clears the field (absent = no rotation, like the spec).
 * - `scale` → multiplies `size` per axis, snapped to 5 mm, min 0.02 m. Returns
 *   `null` for a `mesh` part (geometry is baked — no size field to scale).
 */
export function gizmoPatch(
  part: ShapePart,
  mode: GizmoMode,
  snap: GizmoSnapshot,
): Partial<ShapePart> | null {
  switch (mode) {
    case 'translate': {
      const position = snap.position.map((v) =>
        clamp(snapValue(v, POSITION_SNAP_M), -POSITION_LIMIT_M, POSITION_LIMIT_M),
      ) as [number, number, number]
      return same(position, part.position) ? null : { position }
    }
    case 'rotate': {
      const deg = snap.rotation.map((rad) =>
        normalizeDeg(snapValue((rad * 180) / Math.PI, ROTATION_SNAP_DEG)),
      ) as [number, number, number]
      const cleared = deg.every((v) => v === 0)
      const current = part.rotation ?? [0, 0, 0]
      if (same(deg, current)) return null
      return cleared ? { rotation: undefined } : { rotation: deg }
    }
    case 'scale': {
      if (part.kind === 'mesh') return null
      const size = part.size.map((s, i) =>
        Math.max(MIN_SIZE_M, snapValue(s * snap.scale[i], SIZE_SNAP_M)),
      ) as [number, number, number]
      // Radially-symmetric kinds (lathe revolve, sweep) read their diameter from a
      // single axis and must stay round. Whichever of X/Z the user actually dragged
      // — the one with the larger |scale−1| — drives the diameter, mirrored onto the
      // other; Y stays independent. (Mirroring X→Z unconditionally made a Z-only drag
      // a no-op that returned null. extrude keeps its own W/H/depth.)
      if (part.kind === 'lathe' || part.kind === 'sweep') {
        const driveX = Math.abs(snap.scale[0] - 1) >= Math.abs(snap.scale[2] - 1)
        const driven = driveX ? size[0] : size[2]
        size[0] = driven
        size[2] = driven
      }
      return same(size, part.size) ? null : { size }
    }
  }
}
