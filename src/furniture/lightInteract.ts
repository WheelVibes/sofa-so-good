/**
 * Pure decision logic for toggling a light-emitting furniture item on/off
 * from walk mode (WALK-LIGHT-INTERACT) — the furniture-item counterpart to
 * `windowFixtureInteract.ts`. Eligibility is keyed on the same **capability**
 * `lightEmitters.ts` already tracks (a registered fixture in `LIGHT_EMITTERS`
 * — table/floor lamp, wall sconce, ceiling light/fan, cove light, vanity,
 * aquarium — OR any item the user has flagged as a light source via the
 * `itemAsLight` inspector toggle, `props.lightOn`), not a hardcoded def-id
 * list, so a new registered fixture is automatically covered.
 *
 * The toggle is a **discrete on/off flip** of `props.lightOn` between
 * `'yes'`/absent (on) and `'no'` (off) — mirroring curtains/blinds' binary
 * `drawAmount`/`lower` flip, not a brightness slider. See `lightEmitters.ts`
 * `isItemEmitter`/`resolveEmitterSpec` for how this composes with the
 * scene-wide `lightsMode` ('on'/'off') brightness multiplier: the
 * per-item toggle decides *whether* an item is in the active-lights set at
 * all; `lightsMode` only scales the brightness of whichever items already
 * passed that gate. Per-item wins in every `lightsMode`.
 *
 * Kept render/store-agnostic and unit-tested — `Furniture.tsx` (click),
 * `FirstPersonCamera.tsx` (E-key aim) and `lightInteractSlice.ts` (the store
 * action) all call into this module rather than duplicating the mapping.
 */

import type { AimSegment } from '../collision/aimRay'
import { itemFootprint } from '../collision/placement'
import { isEmitter, isItemEmitter } from './lightEmitters'
import type { FurnitureDef, FurnitureItem, FurnitureType, ParamProps } from './types'

/** True for any placed item with lighting capability — a registered fixture
 *  (`LIGHT_EMITTERS`), or any item already flagged (on or off) as a user
 *  light-source override. A plain sofa with no light history is never
 *  eligible. */
export function isInteractableLight(defId: FurnitureType, props: ParamProps): boolean {
  return isEmitter(defId) || props.lightOn === 'yes' || props.lightOn === 'no'
}

/** Props patch a single click/E interact applies — flips the item's emitting
 *  state between on and off (a discrete step, like a door's fixed swing).
 *  Returns `null` when `defId`/`props` aren't an interactable light. */
export function nextLightPowerProps(
  defId: FurnitureType,
  props: ParamProps,
): Record<string, string> | null {
  if (!isInteractableLight(defId, props)) return null
  return { lightOn: isItemEmitter(defId, props) ? 'no' : 'yes' }
}

export interface LightLabel {
  /** Verb for the prompt, e.g. "Turn on" / "Turn off". */
  action: string
  /** Noun for the prompt — the def's own display name, lowercased (e.g.
   *  "table lamp"), so the copy stays accurate for any registered fixture
   *  without a hand-maintained per-primitive noun table. */
  noun: string
}

/** Prompt copy for the interact HUD — "{action} {noun}" ("Turn off table
 *  lamp"), mirroring `windowFixtureLabel`'s shape. */
export function lightLabel(def: FurnitureDef, props: ParamProps): LightLabel | null {
  if (!isInteractableLight(def.id, props)) return null
  const on = isItemEmitter(def.id, props)
  return { action: on ? 'Turn off' : 'Turn on', noun: def.name.toLowerCase() }
}

/** Build aim segments for every eligible light among `items`, using each
 *  item's own OBB footprint — same convention as `windowFixtureAimSegments`/
 *  `screenAimSegments` (segment runs across the item's local-X/width axis
 *  through its center), recomputed from live `items`/`defs` since a lamp can
 *  be placed or moved like any other item. */
export function lightAimSegments(
  items: readonly FurnitureItem[],
  getDef: (id: FurnitureItem['defId']) => FurnitureDef | undefined,
): AimSegment[] {
  const out: AimSegment[] = []
  for (const item of items) {
    const def = getDef(item.defId)
    if (!def || !isInteractableLight(item.defId, item.props)) continue
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
