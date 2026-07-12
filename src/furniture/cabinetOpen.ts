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

import { isFeatureEnabled } from '../features/featureFlags'
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

/**
 * True when this def — at its effective `props` — is a parametric cabinet-family
 * primitive with something to animate: a hinged door OR a drawer. GLB/IKEA/pack
 * defs are never openable (their fronts are baked), and neither is a
 * configuration with no moving front: a **sliding** or **open** (doorless)
 * wardrobe, or an **open**-front (shelving) cabinet. Dressers and sideboards
 * always carry drawers/doors, so they're always openable.
 *
 * `props` is the item's effective props (schema defaults merged with overrides);
 * when omitted the primitive defaults apply (wardrobe → hinged, cabinet → slab),
 * so a capability probe with no props stays permissive for the openable kinds.
 */
export function supportsCabinetOpen(def: FurnitureDef, props?: ParamProps): boolean {
  if (def.kind !== 'parametric' || !OPENABLE_CABINET_PRIMITIVES.has(def.primitive)) return false
  const p = props ?? {}
  switch (def.primitive) {
    case 'Wardrobe':
      // Sliding panels bypass on a track and open-style wardrobes have no doors —
      // neither has a hinged leaf or drawer to swing/slide. Default is 'hinged'.
      return (p['doorStyle'] ?? 'hinged') === 'hinged'
    case 'CabinetBase':
    case 'CabinetWall':
    case 'CabinetTall':
      // An open-front cabinet is exposed shelving — no door or drawer front.
      // Every other front (slab/shaker/drawers/glass) animates. Default 'slab'.
      return (p['front'] ?? 'slab') !== 'open'
    default:
      // Dresser (always drawers) + Sideboard (always doors/drawers).
      return true
  }
}

/**
 * Read the persisted open state off an item's props. Absent = closed. Gated on
 * the `cabinetOpen` feature flag so the kill-switch actually closes doors on the
 * render side — a persisted `open: 'yes'` reads as closed when the flag is off
 * (import the non-React helper since this runs in the render/scene path too).
 */
export function isCabinetOpen(props: ParamProps): boolean {
  if (!isFeatureEnabled('cabinetOpen')) return false
  return props['open'] === 'yes'
}

/** Seconds for a full open (or close) sweep — matches the ~0.4 s eased door feel. */
export const OPEN_SECONDS = 0.4
/** How far a door leaf swings when fully open (radians). Just shy of 90° so it
 *  reads as ajar and never clips a neighbouring column head-on. */
export const DOOR_OPEN_ANGLE = (Math.PI / 2) * 0.9

/**
 * How far a drawer slides out when open (m), given the cabinet's `depth`. One
 * shared formula for every drawer primitive (CabinetModule / Dresser /
 * Sideboard) so the pull-out distance can't drift per-primitive. Scales with
 * depth but is clamped so it reads as an open drawer without an absurdly deep
 * pull-out (drawers extend forward into the room, never into a wall).
 */
export function drawerSlideDistance(depth: number): number {
  return Math.min(0.45, depth * 0.6)
}

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
