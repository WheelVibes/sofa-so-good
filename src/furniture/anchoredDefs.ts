/**
 * "Is this def anchored to something other than the floor?"
 *
 * Wall-mounted (`mounted`: wall art, sconces, cove light, range hood, ceiling
 * fan, aircon…) and no-clip (`noClip`: surface decor resting on other furniture —
 * book stacks, vases, cushions, tea sets — plus window/door attachments like
 * curtains and blinds) pieces are positioned against geometry that is NOT the
 * floor. "Outside every room" is a NORMAL state for them, so the re-home pass
 * must never relocate them: moving a `mounted` piece to a room centre floats it
 * in mid-air, and re-homing `noClip` decor rips it off the table it sits on.
 *
 * This lived as an inline copy in BOTH rehome call sites — `state/schema.ts`
 * (a saved design meeting a newer plan) and `floorPlanSlice`'s
 * `replaceFloorPlan` (every in-session plan swap). `rehomeItems.ts`'s header
 * says those two are shared "so the two can't drift", but the SKIP PREDICATE
 * they pass was duplicated, so they could. One definition, used by both — and by
 * `countStrandedAfterRehome`, so the number a confirm dialog quotes is derived
 * from the same rule that decides what actually moves (PLAN-SWAP-STRANDED).
 */
import { BUILTIN_CATALOG } from './builtinCatalog'

export function isAnchoredToNonFloor(defId: string): boolean {
  const def = BUILTIN_CATALOG[defId]
  return !!def?.mounted || !!def?.noClip
}
