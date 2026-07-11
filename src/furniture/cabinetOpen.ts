/**
 * Cabinet open/close interaction (CABINET-OPEN) — pure, render-agnostic helpers.
 *
 * Cabinet-family primitives (kitchen cabinets, wardrobes, sideboards, dressers)
 * can have their doors swing and drawers slide open. The open/closed value lives
 * on the placed item's own `props.open` (`'yes'` | `'no'`, default closed) — like
 * a curtain's `drawAmount` it round-trips through the existing `items`
 * persistence with **no new schema field**. The inspector gains an Open/Close
 * toggle only for items whose primitive supports it (`supportsCabinetOpen`).
 *
 * This module owns the two testable, three.js-free pieces: the eased open
 * fraction (fixed-duration ease-in-out) and the door-hinge pivot math. The
 * primitives/renderer map those onto meshes (`primitives/openable.tsx`).
 */

import type { FurnitureDef, ParamProps, PrimitiveKind } from './types'

/** Primitives that model visible, animatable fronts. Keyed on `PrimitiveKind`
 *  (a capability), so any def built on one of these primitives is openable. */
export const OPENABLE_CABINET_PRIMITIVES: ReadonlySet<PrimitiveKind> = new Set<PrimitiveKind>([
  'CabinetBase',
  'CabinetWall',
  'CabinetTall',
  'Wardrobe',
  'Sideboard',
  'Dresser',
])

/** True when this def is a parametric cabinet-family primitive whose doors/drawers
 *  can open. GLB/IKEA/pack defs are never openable (their fronts are baked). */
export function supportsCabinetOpen(def: FurnitureDef): boolean {
  return def.kind === 'parametric' && OPENABLE_CABINET_PRIMITIVES.has(def.primitive)
}

/** Read the persisted open state off an item's props. Absent = closed. */
export function isCabinetOpen(props: ParamProps): boolean {
  return props['open'] === 'yes'
}

/** Seconds for a full open (or close) sweep — matches the ~0.4 s eased door feel. */
export const OPEN_SECONDS = 0.4
/** How far a door leaf swings when fully open (radians). Just shy of 90° so it
 *  reads as ajar and never clips a neighbouring column head-on. */
export const DOOR_OPEN_ANGLE = (Math.PI / 2) * 0.9

/** Cubic ease-in-out (C¹, zero velocity at both ends). Clamped to [0, 1]. */
export function easeInOut(t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2
}

/**
 * Advance a raw (un-eased) open progress in [0, 1] toward `target` (0 or 1) at a
 * constant rate of `1 / seconds` per second, so the sweep always takes the same
 * wall-clock time regardless of frame rate. Snaps to the target once within one
 * step. Feed the result through {@link easeInOut} for the displayed fraction.
 */
export function advanceOpen(
  current: number,
  target: number,
  dt: number,
  seconds = OPEN_SECONDS,
): number {
  if (seconds <= 0 || dt <= 0) return target
  const step = dt / seconds
  const delta = target - current
  if (Math.abs(delta) <= step) return target
  return current + Math.sign(delta) * step
}

/**
 * Where a door leaf hinges. Given the leaf's centre-X (`cx`), its width
 * (`panelW`) and which vertical edge is hinged, return the pivot X (the hinge
 * edge, so the leaf stays attached to the carcass) and the Y-rotation sign that
 * swings the leaf's free edge **outward** toward +Z (into the room). A left-hinged
 * leaf pivots on its −X edge and opens with a negative rotation; a right-hinged
 * one pivots on its +X edge and opens positive.
 */
export function doorHingePivot(
  cx: number,
  panelW: number,
  hinge: 'left' | 'right',
): { pivotX: number; swingSign: number } {
  const outer = hinge === 'left' ? -1 : 1
  return { pivotX: cx + outer * (panelW / 2), swingSign: hinge === 'left' ? -1 : 1 }
}
