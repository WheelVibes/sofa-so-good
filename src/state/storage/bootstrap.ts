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

    startAutosave()

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
