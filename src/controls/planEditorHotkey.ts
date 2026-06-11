/**
 * `P` ⇄ the 2D floor-plan editor — the ALWAYS-MOUNTED binding.
 *
 * The FloorPlanEditor component is lazy-mounted only while `floorPlanEditing`
 * is true (PERF5/C181), so a listener inside it can close the editor but can
 * never OPEN it from the 3D view. The open/close toggle therefore lives here,
 * registered from App via {@link usePlanEditorHotkey}; the editor keeps only
 * its editor-scoped keys (Enter/Escape/Delete).
 *
 * Guards: `useKeyboard` already drops repeats, editable targets (typing) and
 * any keydown while a modal dialog is open (`controls/modalGuard.ts`); this
 * handler additionally ignores modifier combos, walk mode (P means nothing at
 * eye level) and a disabled `floorPlanEditor` feature flag.
 */
import { isFeatureEnabled } from '../features/featureFlags'
import { useStore } from '../state/store'
import { KEYBINDINGS } from './keybindings'
import { useKeyboard } from './useKeyboard'

/**
 * Close the 2D plan editor back to the 3D scene, framing the selected
 * furniture (if any) so toggling 2D→3D lands on whatever you were working on
 * (the seamless-toggle payoff). Shared by the global `P` toggle and the
 * editor's own Escape/Done paths.
 */
export function exitPlanEditorToScene(): void {
  const st = useStore.getState()
  st.setFloorPlanEditing(false)
  if (st.selectedItemId) {
    const it = st.items.find((i) => i.id === st.selectedItemId)
    if (it) st.focusOn(it.position)
  }
}

/** The raw `P` handler (exported for tests; wired via {@link usePlanEditorHotkey}). */
export function onPlanEditorKey(code: string, e: KeyboardEvent): void {
  if (code !== KEYBINDINGS.togglePlanEditor) return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (!isFeatureEnabled('floorPlanEditor')) return
  const st = useStore.getState()
  if (st.cameraMode === 'firstPerson') return
  if (st.floorPlanEditing) exitPlanEditorToScene()
  else st.setFloorPlanEditing(true)
}

/** Mount the global `P` ⇄ 2D-plan-editor binding (call once, from App). */
export function usePlanEditorHotkey(): void {
  useKeyboard(onPlanEditorKey)
}
