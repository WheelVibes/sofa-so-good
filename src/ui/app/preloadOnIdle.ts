import {
  AccessibilityPanel,
  BudgetPanel,
  ClearancePanel,
  CommentsPanel,
  DaylightPanel,
  DesignChatPanel,
  DesignScorePanel,
  DrawingCalloutsPanel,
  ElevationPanel,
  FlagsPanel,
  FloorPlanEditor,
  GlbDesignerDialog,
  HistoryPanel,
  HqRenderModal,
  PanoramaModal,
  PanoTourModal,
  ParametricDialog,
  ProductTour,
  RenderCompareModal,
  ShareModal,
  SmartStartWizard,
  VersionCompareModal,
  VersionsPanel,
} from './lazyComponents'

/** Anything warmable — only the `preload` capability matters here. */
type Preloadable = { preload: () => Promise<void> }

/**
 * Idle preloading of on-demand feature chunks.
 *
 * The PWA service worker already precaches every chunk, so the app works offline
 * after the first full load. But two gaps remain: (1) if the user goes offline
 * while the (~20 MB) precache is still downloading, a not-yet-cached feature
 * chunk would be unavailable; (2) even when cached, the first open pays a fetch +
 * parse delay. Warming the chunks during idle time after boot — while the user
 * is just orbiting the scene — closes both: features become offline-ready
 * without the user having to open each one once, and they open instantly.
 *
 * Warming is low-priority (`requestIdleCallback`) and one chunk at a time, so it
 * never competes with the initial scene paint or interaction.
 */

// Most-likely-opened first, so a brief idle still warms the common features
// (the 2D editor is the one users hit first when reshaping a flat).
const PRELOAD_ORDER: Preloadable[] = [
  FloorPlanEditor,
  SmartStartWizard,
  ShareModal,
  VersionsPanel,
  HistoryPanel,
  ParametricDialog,
  GlbDesignerDialog,
  ElevationPanel,
  PanoramaModal,
  PanoTourModal,
  HqRenderModal,
  RenderCompareModal,
  VersionCompareModal,
  ProductTour,
  // Pro/analysis panels (PERF-004): out of the boot bundle, idle-warmed so they
  // open instantly + are offline-ready, like every other on-demand chunk.
  BudgetPanel,
  ClearancePanel,
  DaylightPanel,
  DesignScorePanel,
  CommentsPanel,
  DesignChatPanel,
  DrawingCalloutsPanel,
  AccessibilityPanel,
  FlagsPanel,
]

type IdleWindow = typeof globalThis & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  cancelIdleCallback?: (id: number) => void
}

/** Run `cb` when the main thread is idle (falls back to a short timer). */
function onIdle(cb: () => void): () => void {
  const w = globalThis as IdleWindow
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(cb, { timeout: 4000 })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = setTimeout(cb, 400) as unknown as number
  return () => clearTimeout(id)
}

/**
 * Wait for one idle period (so we don't compete with the initial scene paint),
 * then warm `tasks` sequentially — each awaited before the next so there's no
 * thundering herd, but without stalling a full idle cycle between every chunk
 * (which can drag to tens of seconds on a busy page). Best-effort: a failed
 * warm is ignored. Returns a cancel function. Exported for unit testing; app
 * code uses {@link preloadFeatureChunks}.
 */
export function scheduleOnIdle(tasks: Array<() => Promise<unknown>>): () => void {
  let cancelled = false
  const cancelIdle = onIdle(async () => {
    for (const task of tasks) {
      if (cancelled) return
      try {
        await task()
      } catch {
        // Warming is best-effort — the real open path handles recovery.
      }
    }
  })
  return () => {
    cancelled = true
    cancelIdle()
  }
}

/**
 * Begin idle-preloading the on-demand feature chunks. Call once after boot.
 * Returns a cancel function.
 */
export function preloadFeatureChunks(): () => void {
  return scheduleOnIdle(PRELOAD_ORDER.map((c) => () => c.preload()))
}
