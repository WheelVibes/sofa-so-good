/**
 * Pure decision logic for cycling a screen's wallpaper/content from walk mode
 * (WALK-SCREEN-INTERACT) — the furniture-item counterpart to
 * `windowFixtureInteract.ts`. A "screen" is any parametric def whose
 * `paramSchema` exposes a `screenContent` enum field (currently `Monitor` and
 * `FlatscreenTV`, shared by the `monitor` / `flatscreen-tv` / `tv-wall` defs)
 * — eligibility is keyed on that **capability** (the schema field itself),
 * not a hardcoded def-id/primitive list, so any future screen primitive that
 * reuses the same `screenContent` field is automatically covered.
 *
 * Kept render/store-agnostic and unit-tested — `Furniture.tsx` (click),
 * `FirstPersonCamera.tsx` (E-key aim) and `screenInteractSlice.ts` (the store
 * action) all call into this module rather than duplicating the mapping.
 */

import type { AimSegment } from '../collision/aimRay'
import { itemFootprint } from '../collision/placement'
import type { FurnitureDef, FurnitureItem, ParamField, ParamProps } from './types'

/** The def's `screenContent` enum field, or `null` if it doesn't have one
 *  (not a parametric def, or a parametric def with no screen surface). */
function screenContentField(def: FurnitureDef): Extract<ParamField, { kind: 'enum' }> | null {
  if (def.kind !== 'parametric') return null
  // `paramSchema` is required by the type, but this is reached with defs that
  // did not come from the builtin catalogue — a user-imported def is hydrated
  // from JSON, and the walk-mode aim path calls this on every placed item. A
  // missing array threw here (v0.31.8.19), which `analysis/layoutCritique.ts`
  // in particular must not allow: it promises never to throw on a malformed
  // def. Treat an absent schema as "not a screen" rather than crashing.
  if (!Array.isArray(def.paramSchema)) return null
  const field = def.paramSchema.find((f) => f.kind === 'enum' && f.key === 'screenContent')
  return field && field.kind === 'enum' ? field : null
}

/** True for any placed def with a `screenContent` capability — a sofa or a
 *  bookshelf is never eligible, only a def whose schema actually drives a
 *  rendered screen surface. */
export function isInteractableScreen(def: FurnitureDef): boolean {
  return screenContentField(def) !== null
}

/** Props patch a single click/E interact applies — advances `screenContent`
 *  to the next option in the def's own enum list, wrapping around (a cycle,
 *  like a TV remote's "source" button, not a picker). Returns `null` when
 *  `def` isn't a screen or its enum has no options. */
export function nextScreenContentProps(
  def: FurnitureDef,
  props: ParamProps,
): Record<string, string> | null {
  const field = screenContentField(def)
  if (!field || field.options.length === 0) return null
  const current = typeof props.screenContent === 'string' ? props.screenContent : field.default
  const idx = field.options.findIndex((o) => o.value === current)
  const nextIdx = (idx === -1 ? 0 : idx + 1) % field.options.length
  return { screenContent: field.options[nextIdx].value }
}

export interface ScreenLabel {
  /** Verb for the prompt, e.g. "Change". */
  action: string
  /** Noun for the prompt, e.g. "wallpaper". */
  noun: string
}

/** Prompt copy for the interact HUD — mirrors `windowFixtureLabel`'s
 *  "{action} {noun}" shape ("Change wallpaper"). One label for every screen
 *  def since the capability (and its cycle semantics) is identical for all
 *  of them; a future screen kind with genuinely different content (e.g. a
 *  channel list) can branch here on `def.primitive` the way
 *  `windowFixtureLabel` branches on Curtain/RollerBlind. */
export function screenLabel(def: FurnitureDef): ScreenLabel | null {
  return isInteractableScreen(def) ? { action: 'Change', noun: 'wallpaper' } : null
}

/** Build aim segments for every eligible screen among `items`, using each
 *  item's own OBB footprint — same convention as `windowFixtureAimSegments`
 *  (segment runs across the item's local-X/width axis through its center),
 *  recomputed from live `items`/`defs` since a monitor/TV can be placed or
 *  moved like any other item. */
export function screenAimSegments(
  items: readonly FurnitureItem[],
  getDef: (id: FurnitureItem['defId']) => FurnitureDef | undefined,
): AimSegment[] {
  const out: AimSegment[] = []
  for (const item of items) {
    const def = getDef(item.defId)
    if (!def || !isInteractableScreen(def)) continue
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
