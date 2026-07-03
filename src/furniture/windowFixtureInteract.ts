/**
 * Pure decision logic for toggling a window-bound fixture (curtain / roller
 * blind) open or closed from walk mode — the furniture-item counterpart to
 * doors' `toggleDoor` (WINDOW-FIXTURE-INTERACT). Unlike doors (a fixed
 * `DoorSpec`/`PlanOpening` table keyed by id), curtains/blinds are ordinary
 * `PlacedItem`s: eligibility + state live on the item's own `def`/`props`,
 * not a parallel lookup table.
 *
 * Kept render/store-agnostic and unit-tested — `Furniture.tsx` (click),
 * `FirstPersonCamera.tsx` (E-key aim) and `windowFixtureSlice.ts` (the store
 * action) all call into this module rather than duplicating the mapping.
 */

import type { AimSegment } from '../collision/aimRay'
import { itemFootprint } from '../collision/placement'
import type { FurnitureDef, FurnitureItem, ParamProps } from './types'

/** Primitive → the single prop that drives its open/closed animation, per
 *  `furniture/CLAUDE.md` (WINDOW-FIXTURE): Curtain uses `drawAmount` (0 open
 *  → 1 drawn), RollerBlind uses `lower` (0 raised → 1 lowered). */
const TOGGLE_KEY: Partial<Record<string, 'drawAmount' | 'lower'>> = {
  Curtain: 'drawAmount',
  RollerBlind: 'lower',
}

function toggleKey(def: FurnitureDef): 'drawAmount' | 'lower' | null {
  if (def.kind !== 'parametric') return null
  return TOGGLE_KEY[def.primitive] ?? null
}

/** True for any placed def that is a window-bound fixture whose open/closed
 *  state can be toggled — a sofa or a wall-mounted TV is never eligible, only
 *  the curtain/roller-blind primitives that carry a real toggle prop. */
export function isInteractableWindowFixture(def: FurnitureDef): boolean {
  return def.windowBound === true && toggleKey(def) !== null
}

/** Current closed-ness in [0,1] (0 = fully open/raised, 1 = fully
 *  closed/lowered), reading the same defaults the primitive itself falls
 *  back to when the prop is absent (legacy items, CURTAIN-FABRIC). */
export function windowFixtureCloseAmount(def: FurnitureDef, props: ParamProps): number {
  const key = toggleKey(def)
  if (!key) return 0
  const raw = props[key]
  if (typeof raw === 'number') return Math.min(1, Math.max(0, raw))
  if (key === 'drawAmount') return props.style === 'open' ? 0 : 1
  return 1 // RollerBlind legacy default: fully lowered.
}

/** Props patch a single click/E toggle applies — flips fully open/raised
 *  <-> fully closed/lowered (a discrete step, like a door swinging a fixed
 *  90°, not a partial drag). Returns `null` when `def` isn't a toggleable
 *  window fixture. */
export function nextWindowFixtureProps(
  def: FurnitureDef,
  props: ParamProps,
): Record<string, number> | null {
  const key = toggleKey(def)
  if (!key) return null
  const closed = windowFixtureCloseAmount(def, props) >= 0.5
  return { [key]: closed ? 0 : 1 }
}

export interface WindowFixtureLabel {
  /** Verb for the prompt, e.g. "Open" / "Close" / "Raise" / "Lower". */
  action: string
  /** Noun for the prompt, e.g. "curtains" / "blind". */
  noun: string
}

/** Prompt copy for the interact HUD — mirrors `DoorPrompt`'s "{action}
 *  {label}" shape ("Open curtains" / "Lower blind"). */
export function windowFixtureLabel(
  def: FurnitureDef,
  props: ParamProps,
): WindowFixtureLabel | null {
  const key = toggleKey(def)
  if (!key || def.kind !== 'parametric') return null
  const closed = windowFixtureCloseAmount(def, props) >= 0.5
  if (def.primitive === 'Curtain') return { action: closed ? 'Open' : 'Close', noun: 'curtains' }
  if (def.primitive === 'RollerBlind') return { action: closed ? 'Raise' : 'Lower', noun: 'blind' }
  return null
}

/** Build aim segments for every eligible window fixture among `items`, using
 *  each item's own OBB footprint (position + rotation + width) — unlike
 *  doors' fixed wall-derived table, fixtures move with the player's own
 *  placements, so this recomputes from live `items`/`defs` rather than a
 *  precomputed constant. The segment runs across the item's local-X (width)
 *  axis through its center, matching `itemFootprint`'s OBB convention. */
export function windowFixtureAimSegments(
  items: readonly FurnitureItem[],
  getDef: (id: FurnitureItem['defId']) => FurnitureDef | undefined,
): AimSegment[] {
  const out: AimSegment[] = []
  for (const item of items) {
    const def = getDef(item.defId)
    if (!def || !isInteractableWindowFixture(def)) continue
    const obb = itemFootprint(item, def)
    const cos = Math.cos(obb.rot)
    const sin = Math.sin(obb.rot)
    out.push({
      id: item.id,
      sx: obb.cx - cos * obb.hx,
      sz: obb.cz - sin * obb.hx,
      segDx: 2 * cos * obb.hx,
      segDz: 2 * sin * obb.hx,
    })
  }
  return out
}
