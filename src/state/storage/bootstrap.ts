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

import {
  applySharedDesign,
  DesignShareError,
  decodeDesignShareCode,
  parseDesignRoute,
} from '../../features/designShare'
import { decodeCodeToDesign, PlanShareError, parsePlanRoute } from '../../features/planShare'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import { applySerialized } from '../schema'
import { useStore } from '../store'
import { loadAppearancePrefs, watchAppearancePrefs } from './appearancePrefs'
import { startAutosave } from './autosave'
import { loadBudgetPrefs, watchBudgetPrefs } from './budgetPrefs'
import { loadEditorPrefs, watchEditorPrefs } from './editorPrefs'
import { loadFloorPlans, watchFloorPlans } from './floorPlanStore'
import { hydrate } from './hydrate'
import { loadQualityPrefs, watchQualityPrefs } from './qualityPrefs'

let started = false

/** Run one boot step, swallowing + logging any failure so it can't abort the
 *  rest of the bootstrap. Supports sync or async steps. */
async function runStep(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (e) {
    console.error(`[bootstrap] step "${name}" failed (continuing):`, e)
  }
}

/** Run the boot bootstrap exactly once. Safe to call from React StrictMode
 *  double-invocation; the guard makes subsequent calls a no-op. */
export async function runBootstrap(): Promise<void> {
  if (started) return
  started = true
  try {
    // Pull user assets + autosaved layout. Failures are silent; the app falls
    // back to the default layout via the seed below. Each step is independently
    // guarded so a single failing loader (e.g. corrupt IDB, a throwing pref
    // parser) can't abort the rest of boot — most importantly, `startAutosave`
    // below must always run so the user's work is still persisted.
    await runStep('hydrate', async () => {
      await hydrate()
    })
    runStep('appearancePrefs', () => {
      loadAppearancePrefs()
      watchAppearancePrefs()
    })
    runStep('qualityPrefs', () => {
      loadQualityPrefs()
      watchQualityPrefs()
    })
    runStep('editorPrefs', () => {
      loadEditorPrefs()
      watchEditorPrefs()
    })
    runStep('budgetPrefs', () => {
      loadBudgetPrefs()
      watchBudgetPrefs()
    })
    runStep('floorPlans', () => {
      loadFloorPlans()
      watchFloorPlans()
    })
    // Recompute feature flags now that the persisted auth session is loaded, so
    // a returning admin's dev-only features are unlocked on boot.
    runStep('featureFlags', () => useStore.getState().reresolveFeatureFlags())

    // Seed the default layout only when hydration produced nothing — must run
    // AFTER hydrate() so an autosaved layout is never clobbered. Then drop the
    // seed/hydrate snapshot so the first undo doesn't pop back to a blank flat.
    runStep('seed', () => {
      const s = useStore.getState()
      if (s.items.length === 0) s.resetToDefault()
      useStore.getState().clearHistory()
    })

    // A `#/plans/<code>` or `#/design/<code>` share link overrides the seeded/
    // restored design with the shared one (runs after the seed so it wins).
    // No-op without a link; the routes are disjoint so at most one fires.
    await runStep('planShareLink', loadSharedPlanFromUrl)
    await runStep('designShareLink', loadSharedDesignFromUrl)

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

    if (import.meta.env.DEV) await runStep('devHelpers', exposeDevHelpers)
  } finally {
    useStore.getState().setBootReady()
  }
}

/**
 * If the URL hash is a `#/plans/<code>` share link, decode + load that design
 * (overriding the seeded/restored one), then clear the hash so a reload doesn't
 * re-apply the now-edited plan and the URL stays clean. Exported for testing.
 */
export async function loadSharedPlanFromUrl(): Promise<void> {
  const code = parsePlanRoute(globalThis.location?.hash)
  if (!code) return
  const s = useStore.getState()
  try {
    const design = decodeCodeToDesign(code)
    const known = new Set([...Object.keys(BUILTIN_CATALOG), ...s.userFurniture.map((d) => d.id)])
    useStore.setState(applySerialized(design, known))
    useStore.getState().clearHistory?.()
    useStore.getState().requestHomeView?.()
    useStore.getState().notify.start({ title: 'Loaded a shared plan', kind: 'success' })
  } catch (e) {
    useStore.getState().notify.start({
      title: "Couldn't open that shared plan",
      kind: 'error',
      message: e instanceof PlanShareError ? e.message : undefined,
    })
  } finally {
    try {
      const url = new URL(globalThis.location.href)
      url.hash = ''
      globalThis.history?.replaceState(null, '', url.toString())
    } catch {
      /* no history/URL (non-browser) */
    }
  }
}

/**
 * If the URL hash is a `#/design/<code>` 3D-link, decode + load that design
 * (overriding the seeded/restored one) and toast that it's now the viewer's
 * editable copy. Items referencing defs that can't travel in a URL (the
 * sender's uploads/imports) are dropped with a count. Exported for testing.
 */
export async function loadSharedDesignFromUrl(): Promise<void> {
  const code = parseDesignRoute(globalThis.location?.hash)
  if (!code) return
  const s = useStore.getState()
  try {
    const design = decodeDesignShareCode(code)
    const known = new Set([...Object.keys(BUILTIN_CATALOG), ...s.userFurniture.map((d) => d.id)])
    const { patch, droppedCount } = applySharedDesign(design, known)
    useStore.setState(patch)
    useStore.getState().clearHistory?.()
    useStore.getState().requestHomeView?.()
    useStore.getState().notify.start({
      title: "Shared design loaded — it's yours to edit",
      kind: 'success',
      message: droppedCount
        ? `${droppedCount} item${droppedCount === 1 ? '' : 's'} skipped — uploaded models can't travel in a link.`
        : undefined,
    })
  } catch (e) {
    useStore.getState().notify.start({
      title: "Couldn't open that design link",
      kind: 'error',
      message: e instanceof DesignShareError ? e.message : undefined,
    })
  } finally {
    try {
      const url = new URL(globalThis.location.href)
      url.hash = ''
      globalThis.history?.replaceState(null, '', url.toString())
    } catch {
      /* no history/URL (non-browser) */
    }
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
