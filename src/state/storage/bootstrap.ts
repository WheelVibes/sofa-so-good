/**
 * Post-paint boot bootstrap.
 *
 * Historically all of this was awaited in `main.tsx` *before* the first React
 * render, leaving the page blank until IndexedDB + localStorage resolved.
 * Now React paints immediately (showing the loading overlay) and this runs
 * once from `<BootHydrator>`, flipping `bootPhase` to `'ready'` when done.
 *
 * The decoder registration stays in `main.tsx` (synchronous, must precede any
 * GLB load). This function owns the async, IO-bound work + the first-layout
 * seed (so defaults never clobber a layout the autosave is about to restore).
 */

import { useStore } from '../store'
import { loadAppearancePrefs, watchAppearancePrefs } from './appearancePrefs'
import { startAutosave } from './autosave'
import { loadEditorPrefs, watchEditorPrefs } from './editorPrefs'
import { loadFloorPlans, watchFloorPlans } from './floorPlanStore'
import { hydrate } from './hydrate'
import { loadQualityPrefs, watchQualityPrefs } from './qualityPrefs'

let started = false

/** Run the boot bootstrap exactly once. Safe to call from React StrictMode
 *  double-invocation; the guard makes subsequent calls a no-op. */
export async function runBootstrap(): Promise<void> {
  if (started) return
  started = true
  try {
    // Pull user assets + autosaved layout. Failures are silent; the app falls
    // back to the default layout via the seed below.
    await hydrate()
    loadAppearancePrefs()
    watchAppearancePrefs()
    loadQualityPrefs()
    watchQualityPrefs()
    loadEditorPrefs()
    watchEditorPrefs()
    loadFloorPlans()
    watchFloorPlans()

    // Seed the default layout only when hydration produced nothing — must run
    // AFTER hydrate() so an autosaved layout is never clobbered. Then drop the
    // seed/hydrate snapshot so the first undo doesn't pop back to a blank flat.
    const s = useStore.getState()
    if (s.items.length === 0) s.resetToDefault()
    useStore.getState().clearHistory()

    // Surface autosave failures (the common one is localStorage quota) so the
    // user knows their work isn't being persisted, instead of silently losing
    // it. Dedup to a single notification that auto-clears when saving resumes.
    let saveErrorId: string | null = null
    startAutosave({
      onError: (e) => {
        if (saveErrorId) return
        const message =
          e.kind === 'quota'
            ? "Your browser's storage is full, so changes can't be auto-saved. Free up space, or save to a slot and export your design."
            : `Auto-save failed (${e.kind}). Your latest changes may not be persisted.`
        saveErrorId = useStore.getState().notify.start({
          title: "Couldn't auto-save",
          kind: 'error',
          message,
          autoDismissMs: null,
        })
      },
      onRecover: () => {
        if (saveErrorId) {
          useStore.getState().notify.dismiss(saveErrorId)
          saveErrorId = null
        }
      },
    })

    if (import.meta.env.DEV) await exposeDevHelpers()
  } finally {
    useStore.getState().setBootReady()
  }
}

/** Dev-only: expose the store + auto-arranger for the screenshot harness. */
async function exposeDevHelpers(): Promise<void> {
  ;(window as unknown as { __store?: typeof useStore }).__store = useStore
  const { arrangeRoom, arrangeAllRooms, arrangeAllRoomsForPlan } = await import(
    '../../layout/autoArrange'
  )
  const { isDefaultPlan } = await import('../../floorplan/planGeometry')
  const { BUILTIN_CATALOG } = await import('../../furniture/builtinCatalog')
  ;(window as unknown as { __arrangeRoom?: unknown }).__arrangeRoom = (roomId: string) => {
    const s = useStore.getState()
    s.setItems(arrangeRoom(roomId as never, s.items, BUILTIN_CATALOG as never, s.doors))
  }
  ;(window as unknown as { __tidyHome?: unknown }).__tidyHome = () => {
    const s = useStore.getState()
    const next = isDefaultPlan(s.floorPlan)
      ? arrangeAllRooms(s.items, BUILTIN_CATALOG as never, s.doors)
      : arrangeAllRoomsForPlan(s.floorPlan, s.items, BUILTIN_CATALOG as never, s.doors)
    s.setItems(next)
  }
  const { PLAN_TEMPLATES } = await import('../../floorplan/templates')
  ;(window as unknown as { __loadTemplate?: unknown }).__loadTemplate = (id: string) => {
    const tpl = PLAN_TEMPLATES.find((t) => t.id === id)
    if (tpl) useStore.getState().setFloorPlan(JSON.parse(JSON.stringify(tpl)))
  }
}
