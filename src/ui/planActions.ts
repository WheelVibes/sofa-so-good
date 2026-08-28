/**
 * Every destructive "replace the plan / clear the design" action, with its
 * confirmation, in ONE place.
 *
 * These used to be inline handlers scattered across the 2D editor's Plan menu,
 * its mobile sheet, the template picker, the plan library, the File menu and its
 * mobile sheet — so the same operation was worded differently in each, and
 * whether it even asked before destroying your work depended on which button you
 * happened to press ("Clear all furniture" confirmed; "New", which wiped the
 * plan AND the furniture, did not). Routing them all through here means a single
 * definition of what each action does, says and destroys.
 *
 * Every one of these is a single undo step — the confirm copy says so, and
 * `replaceFloorPlan` guarantees it by snapshotting once for plan + furniture.
 */
import type { FloorPlan } from '../floorplan/types'
import { useStore } from '../state/store'

/** How many placed items the action is about to remove, phrased for a sentence. */
function itemsClause(): string {
  const n = useStore.getState().items.length
  if (n === 0) return ''
  return ` and ${n === 1 ? 'the 1 placed item' : `all ${n} placed items`}`
}

const UNDO_HINT = 'You can undo this with Ctrl/⌘+Z.'

/** Open the guarded "Start a new apartment" chooser (`NewPlanModal`), which owns
 *  the confirmation — it has two outcomes, so a yes/no confirm can't express it. */
export function openNewPlan(): void {
  useStore.getState().setNewPlanOpen(true)
}

/** Reset the plan geometry back to the built-in HDB 4-room flat. Furniture is
 *  KEPT and re-homed, so this is a geometry reset, not a wipe — the copy says
 *  which, because the old unguarded "Reset to HDB" left people guessing. */
export async function confirmResetPlanToDefault(): Promise<boolean> {
  const s = useStore.getState()
  const ok = await s.confirmAction({
    title: 'Reset the apartment',
    message: `Replace the current floor plan with the default HDB 4-room flat? Your furniture is kept — anything left outside a room is moved back inside. ${UNDO_HINT}`,
    confirmLabel: 'Reset plan',
    danger: true,
  })
  if (ok) useStore.getState().resetFloorPlan()
  return ok
}

/** Apply a built-in starter apartment. Clears furniture: the incoming plan is a
 *  different home, so the old layout has nothing to stand in. */
export async function confirmApplyTemplate(tpl: FloorPlan): Promise<boolean> {
  const s = useStore.getState()
  const ok = await s.confirmAction({
    title: `Load “${tpl.name}”`,
    message: `Replace the current floor plan${itemsClause()} with this starter apartment? ${UNDO_HINT}`,
    confirmLabel: 'Load template',
    danger: true,
  })
  if (ok) {
    useStore.getState().replaceFloorPlan(structuredClone(tpl), { furniture: 'clear' })
  }
  return ok
}

/** Load a saved apartment from the library. Furniture is kept + re-homed (it is
 *  the user's own home coming back, not a different one). */
export async function confirmLoadSavedPlan(id: string, name: string): Promise<boolean> {
  const s = useStore.getState()
  const ok = await s.confirmAction({
    title: `Load “${name}”`,
    message: `Replace the current floor plan with this saved apartment? Your furniture is kept — anything left outside a room is moved back inside. ${UNDO_HINT}`,
    confirmLabel: 'Load',
    danger: true,
  })
  if (ok) useStore.getState().loadSavedPlan(id)
  return ok
}

/** Delete a saved apartment from the library. NOT undoable — the library is not
 *  part of the design history — so the copy has to be explicit about that. */
export async function confirmDeleteSavedPlan(id: string, name: string): Promise<boolean> {
  const s = useStore.getState()
  const ok = await s.confirmAction({
    title: `Delete “${name}”`,
    message:
      'Remove this apartment from your library? This cannot be undone. The plan you are working on is not affected.',
    confirmLabel: 'Delete',
    danger: true,
  })
  if (ok) useStore.getState().deleteSavedPlan(id)
  return ok
}

/** Draft a plan from a text brief with an LLM. Replaces the plan and clears the
 *  furniture (via `newFloorPlan`), so it is guarded like the rest. */
export async function confirmGeneratePlan(): Promise<boolean> {
  const s = useStore.getState()
  return s.confirmAction({
    title: 'Generate a plan with AI',
    message: `The drafted plan replaces the current floor plan${itemsClause()}. ${UNDO_HINT}`,
    confirmLabel: 'Continue',
    danger: true,
  })
}

/** Remove every placed item, leaving the plan alone. */
export async function confirmClearFurniture(): Promise<boolean> {
  const s = useStore.getState()
  if (s.items.length === 0) return false
  const ok = await s.confirmAction({
    title: 'Clear the furniture',
    message: `Remove all ${s.items.length} placed items? The floor plan and finishes are kept. ${UNDO_HINT}`,
    confirmLabel: 'Clear furniture',
    danger: true,
  })
  if (ok) useStore.getState().resetToEmpty()
  return ok
}

/** Put the move-in demo layout back, replacing whatever furniture is placed. */
export async function confirmRestoreDemoFurniture(): Promise<boolean> {
  const s = useStore.getState()
  const ok = await s.confirmAction({
    title: 'Restore the demo furniture',
    message: `Replace the current furniture with the move-in layout? The floor plan is not changed. ${UNDO_HINT}`,
    confirmLabel: 'Restore',
    danger: true,
  })
  if (ok) useStore.getState().resetToDefault()
  return ok
}
