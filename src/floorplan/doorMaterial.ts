/**
 * Pure door-leaf material resolution (`PlanOpening.material`, the
 * `openingStyles` finish axis) — shared by the 3D door leaf (`PlanDoorLeaf`)
 * and the 2D plan inspector (`OpeningInspector`) so the "what finish does this
 * door actually render with" default can never drift between the two.
 */

import type { PlanOpening } from './types'

/** The three door-leaf finishes: `painted` (flat colour, today's default),
 *  `wood` (procedural wood grain tinted by `color`), `vinyl` (smooth PVC
 *  laminate — the standard SG toilet/utility door finish). */
export type DoorLeafMaterialKind = 'painted' | 'wood' | 'vinyl'

/** Resolves a door leaf's surface material kind: the explicit
 *  `opening.material` override, else `vinyl` for a `bifold` door (the
 *  standard SG toilet/utility door finish) and `painted` (flat colour) for
 *  every other style. Windows ignore this field entirely. */
export function resolveDoorLeafMaterialKind(
  opening: Pick<PlanOpening, 'material' | 'style'>,
): DoorLeafMaterialKind {
  const m = opening.material
  if (m === 'wood' || m === 'vinyl' || m === 'painted') return m
  return opening.style === 'bifold' ? 'vinyl' : 'painted'
}
