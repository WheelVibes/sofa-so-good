import { Suspense, useEffect, useState } from 'react'
import { usePlanEditorHotkey } from './controls/planEditorHotkey'
import { useAppHotkeys } from './controls/useAppHotkeys'
import { useNudge } from './controls/useNudge'
import { useFeature } from './features/useFeature'
import { consumeJustUpdated } from './pwa/swUpdate'
import { FinishDragOverlay } from './scene/FinishDragOverlay'
import { MobileLongPress } from './scene/MobileLongPress'
import { RoomEditorScene } from './scene/RoomEditorScene'
import { Scene } from './scene/Scene'
import { MarqueeSelector } from './scene/selection/MarqueeSelector'
import { installTouchGestureTracker } from './scene/touchGestures'
import { runBootstrap } from './state/storage/bootstrap'
import { useStore } from './state/store'
import {
  AccessibilityPanel,
  BudgetPanel,
  ClearancePanel,
  CommentsPanel,
  ConfiguratorDialog,
  DaylightPanel,
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
  ShortcutsModal,
  SmartStartWizard,
  StagingRevealModal,
  StyleQuizModal,
  StyleTransferModal,
  TimeCompareModal,
  VersionsPanel,
} from './ui/app/lazyComponents'
import { preloadFeatureChunks } from './ui/app/preloadOnIdle'
import { LoginScreen } from './ui/auth/LoginScreen'
import { BudgetHud } from './ui/BudgetHud'
import { resolveBootDecision } from './ui/bootDecision'
import { MOBILE_MEDIA_QUERY } from './ui/breakpoints'
import { CommandPalette } from './ui/CommandPalette'
import { ConfirmModal } from './ui/ConfirmModal'
import { ContextMenu } from './ui/ContextMenu'
import { CreditsModal } from './ui/CreditsModal'
import { Crosshair } from './ui/Crosshair'
import { CatalogDrawer } from './ui/catalog/CatalogDrawer'
import { ThumbnailHost } from './ui/catalog/thumbnails'
import { usePlacementController } from './ui/catalog/usePlacementController'
import { DoorPrompt } from './ui/DoorPrompt'
import { DragHud } from './ui/DragHud'
import { EditConfirmBar } from './ui/EditConfirmBar'
import { EmptyRoomHint } from './ui/EmptyRoomHint'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { FinishPicker } from './ui/FinishPicker'
import { FixturePrompt } from './ui/FixturePrompt'
import { FpsCounter } from './ui/FpsCounter'
import { InfoCallout } from './ui/InfoCallout'
import { InspectorPanel } from './ui/inspector/InspectorPanel'
import { LightPrompt } from './ui/LightPrompt'
import { LocationPrompt } from './ui/LocationPrompt'
import { LoadingOverlay } from './ui/loading/LoadingOverlay'
import { stopBootPhraseRotator } from './ui/loading/startBootPhraseRotator'
import { scheduleTransitionHide } from './ui/loading/transitionHide'
import { useDeferredSceneSwap } from './ui/loading/useDeferredSceneSwap'
import { NavCluster } from './ui/NavCluster'
import { NotificationContainer } from './ui/notifications/NotificationContainer'
import { Onboarding } from './ui/Onboarding'
import { PresentationMode } from './ui/PresentationMode'
import { PromptModal } from './ui/PromptModal'
import { QuoteTemplateModal } from './ui/QuoteTemplateModal'
import { ResizeHud } from './ui/ResizeHud'
import { RoomEditorCaption } from './ui/RoomEditorCaption'
import { ScreenPrompt } from './ui/ScreenPrompt'
import { SwapModal } from './ui/SwapModal'
import { TapeModeToggle } from './ui/TapeModeToggle'
import { Toolbar } from './ui/toolbar'
import { WalkHud } from './ui/WalkHud'
import { WallAccentPicker } from './ui/WallAccentPicker'
import { WebGLFallback } from './ui/WebGLFallback'
import { WalkJoystick } from './ui/walk/WalkJoystick'
import { APP_VERSION } from './version'

export default function App() {
  const cameraMode = useStore((s) => s.cameraMode)
  const roomEditorActive = useStore((s) => s.roomEditor.active)
  const floorPlanEditing = useStore((s) => s.floorPlanEditing)
  const glbDesignerOpen = useStore((s) => s.glbDesignerOpen)
  const parametricOpen = useStore((s) => s.parametricOpen)
  const configuratorOpen = useStore((s) => s.configuratorOpen)
  const bootPhase = useStore((s) => s.bootPhase)
  const sceneReady = useStore((s) => s.sceneReady)
  const creditsOpen = useStore((s) => s.creditsOpen)
  const loading = useStore((s) => s.loading)
  const hideLoading = useStore((s) => s.hideLoading)
  // Open flags for the lazy-loaded panels (PERF5) — gate their mount so each
  // chunk loads only when the panel is opened.
  const lazyPanels = {
    shareOpen: useStore((s) => s.shareOpen),
    panoramaOpen: useStore((s) => s.panoramaOpen),
    panoTourOpen: useStore((s) => s.panoTourOpen),
    hqRenderOpen: useStore((s) => s.hqRenderOpen),
    renderCompareOpen: useStore((s) => s.renderCompareOpen),
    stagingRevealOpen: useStore((s) => s.stagingRevealOpen),
    timeCompareOpen: useStore((s) => s.timeCompareOpen),
    styleTransferOpen: useStore((s) => s.styleTransferOpen),
    styleQuizOpen: useStore((s) => s.styleQuizOpen),
    shortcutsHelpOpen: useStore((s) => s.shortcutsHelpOpen),
    elevationsOpen: useStore((s) => s.elevationsOpen),
    versionsOpen: useStore((s) => s.versionsOpen),
    historyOpen: useStore((s) => s.historyOpen),
    smartStartOpen: useStore((s) => s.smartStartOpen),
    tourOpen: useStore((s) => s.tourOpen),
    // Pro/analysis panels — lazy-loaded + gated so their chunks stay out of the
    // Simple-tier boot bundle (PERF-004). Each self-gated on the same flag before.
    budgetOpen: useStore((s) => s.budgetOpen),
    clearanceOpen: useStore((s) => s.clearancePanelOpen),
    daylightOpen: useStore((s) => s.daylightOpen),
    designScoreOpen: useStore((s) => s.designScoreOpen),
    commentsOpen: useStore((s) => s.commentsOpen),
    drawingCalloutsOpen: useStore((s) => s.drawingCalloutsOpen),
    accessibilityOpen: useStore((s) => s.accessibilityOpen),
    flagsOpen: useStore((s) => s.flagsPanelOpen),
  }
  usePlacementController()

  // Dev-only: expose window.__profiler so a detached profiler window (a
  // separate module realm) can reach this window's singletons. Dynamic import
  // keeps the profiler modules out of the prod bundle.
  const profilerOn = useFeature('profiler')
  useEffect(() => {
    if (!import.meta.env.DEV || !profilerOn) return
    void import('./dev/profiler/installProfiler').then((m) => m.installProfilerApi())
  }, [profilerOn])

  // Three-phase boot breaks the animation-vs-ready tradeoff:
  //  1. Animated static loader + hydration (no Canvas) — smooth loop.
  //  2. Canvas mounts + warms behind the opaque cover; the art keeps animating
  //     (compositor-driven HTML layers — see index.html), only the cycling
  //     phrase pins to "Almost ready…" (text swaps need the main thread).
  //  3. Fade the cover once sceneReady — furnished view already painted.
  const booting = bootPhase !== 'ready' || !sceneReady
  const visualScene = useDeferredSceneSwap(loading.active, roomEditorActive, floorPlanEditing)
  const [sceneCanvasReady, setSceneCanvasReady] = useState(false)

  // Kick off the async boot bootstrap (hydration + default-layout seed) once.
  useEffect(() => {
    void runBootstrap()
  }, [])

  // Track active touch pointers so scene handlers can distinguish a single-finger
  // tap/drag from a multi-finger pinch/pan (bugs #11/#12). Installed once.
  useEffect(() => installTouchGestureTracker(), [])

  // Phase 1→2: hydration done — pin the phrase, then mount Canvas. The loader
  // art keeps animating (compositor layers survive main-thread warm-up work).
  useEffect(() => {
    if (bootPhase !== 'ready') {
      setSceneCanvasReady(false)
      return
    }
    stopBootPhraseRotator('Almost ready…')
    let id2 = 0
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setSceneCanvasReady(true))
    })
    return () => {
      cancelAnimationFrame(id1)
      if (id2) cancelAnimationFrame(id2)
    }
  }, [bootPhase])

  // After an update reload: once the scene is on screen (boot finished), confirm
  // the new version with a success toast. `consumeJustUpdated` self-clears so it
  // fires exactly once per update.
  useEffect(() => {
    if (booting) return
    if (!consumeJustUpdated()) return
    useStore.getState().notify.start({
      kind: 'success',
      title: `Updated to v${APP_VERSION}`,
      autoDismissMs: 6000,
    })
  }, [booting])

  // Phase 3: scene warmed — fade the static cover out, then remove it.
  useEffect(() => {
    if (booting) return
    const el = document.getElementById('boot-loader')
    if (!el) return
    el.classList.add('bl-fade-out')
    const id = window.setTimeout(() => el.remove(), 260)
    return () => window.clearTimeout(id)
  }, [booting])

  // `#/login` opens the sign-in screen (a shareable/bookmarkable entry), then
  // clears the hash. `#/plans/<code>` is handled by the boot bootstrap.
  useEffect(() => {
    const check = () => {
      if (window.location.hash === '#/login') {
        useStore.getState().setLoginOpen(true)
        history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }
    check()
    window.addEventListener('hashchange', check)
    return () => window.removeEventListener('hashchange', check)
  }, [])

  // Toggle the `mobile` body class at the ≤640px breakpoint so the responsive
  // layer (bottom-sheet panels, hidden nav cluster, viewport-fit modals) kicks
  // in. The prototype's vanilla app set this; the React port mirrors it.
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MEDIA_QUERY)
    const apply = () => document.body.classList.toggle('mobile', mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Once the front-facing scene is up, warm non-front-facing assets in the
  // background during idle time so panels behind modals/drawers (e.g. the
  // catalog's Browse CC0 index) are ready when summoned — without ever
  // competing with the initial scene paint or gating the loading screen.
  useEffect(() => {
    if (!booting) {
      // Idle-preload the on-demand feature chunks (2D editor, dialogs, panels)
      // so they're cached + instant without the user opening each one once —
      // and offline-ready even if they disconnect mid-precache.
      const cancelChunkPreload = preloadFeatureChunks()
      const warm = () => {
        const s = useStore.getState()
        if (s.remoteIndexes.polyhaven.status === 'idle') void s.bootstrapRemoteCatalog()
        // Dev-only: pull GLBs from the local-assets/ folder into the catalog
        // (no-op in prod — flag is devOnly + the plugin routes don't exist).
        if (s.localAssetsStatus === 'idle') void s.bootstrapLocalAssets()
      }
      const w = window as typeof window & {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number
        cancelIdleCallback?: (id: number) => void
      }
      if (w.requestIdleCallback) {
        const id = w.requestIdleCallback(warm, { timeout: 4000 })
        return () => {
          w.cancelIdleCallback?.(id)
          cancelChunkPreload()
        }
      }
      const id = window.setTimeout(warm, 2000)
      return () => {
        window.clearTimeout(id)
        cancelChunkPreload()
      }
    }
  }, [booting])

  // First run: once boot is ready, show the onboarding carousel. The carousel's
  // "Take the guided tour" choice is the ONLY automatic entry point for the product
  // tour — the tour never auto-fires on a clean profile. Replay is available from
  // Help (?) + ⌘K for all users at any time.
  //
  // Migration edges:
  //   hdb_onboarded='1'           → skip entirely (already onboarded, regardless
  //                                  of tour state)
  //   hdb_tour_done='1', no onboarded → show carousel once (old users who saw the
  //                                  pre-C268 auto-starting tour before this change)
  //   clean profile               → show carousel (new users)
  useEffect(() => {
    if (booting) return
    const decision = resolveBootDecision()
    if (decision === 'carousel') {
      useStore.getState().setOnboardingOpen(true)
    }
  }, [booting])

  // Transition overlays (orbit↔walk, room editor enter/exit, floor plan editor
  // open/close) set loading.active true synchronously; hide on READINESS, not
  // a timer: wait for the deferred swap to commit, then for real WebGL frames
  // from the swapped-in scene (RenderPump warms it at ~10fps behind the
  // overlay), with a safety timeout so the overlay can never strand. The
  // overlay's own min-time + fade still shapes the visible duration. Keying
  // the effect on the changed state means each transition re-triggers the
  // hide — the extra deps are intentional re-trigger keys, not effect inputs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: loading.label/cameraMode/roomEditorActive/floorPlanEditing re-trigger the hide per transition
  useEffect(() => {
    if (!loading.active) return
    return scheduleTransitionHide(hideLoading)
  }, [loading.active, loading.label, cameraMode, roomEditorActive, floorPlanEditing, hideLoading])

  // App-wide keyboard orchestration (global ⌘K/undo layer + the editor-scoped
  // dispatch) — extracted to controls/useAppHotkeys.ts (R3-REFAC-1). Order
  // matters: global listener first, then editor, then P-toggle, then nudge.
  useAppHotkeys()
  // `P` ⇄ 2D plan editor lives in its own always-mounted hook: the editor is
  // lazy-mounted only while open, so an editor-scoped listener couldn't OPEN it.
  usePlanEditorHotkey()

  useNudge()

  return (
    <WebGLFallback>
      <div className="app-shell relative h-[100dvh] w-screen overflow-hidden">
        {/* Stage area: the 3D canvas + its canvas-relative HUD overlays + the
            toolbar. On desktop it shrinks to the left of a docked right panel
            (`--right-rail`, driven by `:has(.dock-panel)`), so the canvas takes
            the remaining space and the toolbar re-centres over it. */}
        <div className="stage-area">
          <Toolbar />
          <ErrorBoundary scope="3D scene">
            {sceneCanvasReady ? visualScene.roomEditor ? <RoomEditorScene /> : <Scene /> : null}
          </ErrorBoundary>
          {/* Drop-target ring: shown while a finish drag is over the canvas
              (DOM overlay, outside R3F — works under frameloop="demand"). */}
          <FinishDragOverlay />
          <FpsCounter />
          <RoomEditorCaption />
          {roomEditorActive && (
            <div
              className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2"
              style={{ top: 'calc(env(safe-area-inset-top, 0px) + 104px)' }}
            >
              <div className="pointer-events-auto">
                <InfoCallout id="room-editor" title="Designing one room">
                  Click a piece to select it, then drag to move. Open the catalog to add more.
                </InfoCallout>
              </div>
            </div>
          )}
          <EmptyRoomHint />
          <MobileLongPress />
          <MarqueeSelector />
          <NavCluster />
          <DragHud />
          <ResizeHud />
          <BudgetHud />
          <TapeModeToggle />
          <Crosshair />
          <WalkJoystick />
          <WalkHud />
          <DoorPrompt />
          <FixturePrompt />
          <ScreenPrompt />
          <LightPrompt />
        </div>
        {/* Catalog docks as a persistent LEFT sidebar on desktop (mirrors the
            right-docked inspector): a sibling of `.stage-area` so `--left-rail`
            shrinks the canvas and the centred toolbar re-centres over it. On
            mobile it stays a bottom sheet. */}
        <CatalogDrawer />
        {/* Off-screen thumbnail render queue — mounted app-wide (not inside the
            catalog) so the inspector's item thumbnail (bug #3) resolves even
            when the catalog is closed/minimized. Gated to the editing surfaces
            (the only place catalog + inspector appear) so it costs nothing in
            the overview/walk. A single host owns the shared queue. */}
        {roomEditorActive || floorPlanEditing ? <ThumbnailHost /> : null}
        <EditConfirmBar />
        <InspectorPanel />
        <FinishPicker />
        <WallAccentPicker />
        <NotificationContainer />
        <CommandPalette />
        <ContextMenu />
        <SwapModal />
        <CreditsModal
          open={creditsOpen}
          onClose={() => useStore.getState().setCreditsOpen(false)}
        />
        {/* Pro/analysis panels: chunk is idle-preloaded then mounts when opened (PERF-004). */}
        {lazyPanels.budgetOpen ? (
          <Suspense fallback={null}>
            <BudgetPanel />
          </Suspense>
        ) : null}
        {lazyPanels.clearanceOpen ? (
          <Suspense fallback={null}>
            <ClearancePanel />
          </Suspense>
        ) : null}
        {lazyPanels.daylightOpen ? (
          <Suspense fallback={null}>
            <DaylightPanel />
          </Suspense>
        ) : null}
        {lazyPanels.designScoreOpen ? (
          <Suspense fallback={null}>
            <DesignScorePanel />
          </Suspense>
        ) : null}
        {lazyPanels.commentsOpen ? (
          <Suspense fallback={null}>
            <CommentsPanel />
          </Suspense>
        ) : null}
        {lazyPanels.drawingCalloutsOpen ? (
          <Suspense fallback={null}>
            <DrawingCalloutsPanel />
          </Suspense>
        ) : null}
        {lazyPanels.accessibilityOpen ? (
          <Suspense fallback={null}>
            <AccessibilityPanel />
          </Suspense>
        ) : null}
        <PresentationMode />
        {/* Lazy + flag-gated: chunk loads only when the panel is opened (PERF5). */}
        {lazyPanels.shareOpen ? (
          <Suspense fallback={null}>
            <ShareModal />
          </Suspense>
        ) : null}
        {lazyPanels.panoramaOpen ? (
          <Suspense fallback={null}>
            <PanoramaModal />
          </Suspense>
        ) : null}
        {lazyPanels.panoTourOpen ? (
          <Suspense fallback={null}>
            <PanoTourModal />
          </Suspense>
        ) : null}
        {lazyPanels.hqRenderOpen ? (
          <Suspense fallback={null}>
            <HqRenderModal />
          </Suspense>
        ) : null}
        {lazyPanels.renderCompareOpen ? (
          <Suspense fallback={null}>
            <RenderCompareModal />
          </Suspense>
        ) : null}
        {lazyPanels.stagingRevealOpen ? (
          <Suspense fallback={null}>
            <StagingRevealModal />
          </Suspense>
        ) : null}
        {lazyPanels.timeCompareOpen ? (
          <Suspense fallback={null}>
            <TimeCompareModal />
          </Suspense>
        ) : null}
        {lazyPanels.styleTransferOpen ? (
          <Suspense fallback={null}>
            <StyleTransferModal />
          </Suspense>
        ) : null}
        {lazyPanels.styleQuizOpen ? (
          <Suspense fallback={null}>
            <StyleQuizModal />
          </Suspense>
        ) : null}
        {lazyPanels.shortcutsHelpOpen ? (
          <Suspense fallback={null}>
            <ShortcutsModal />
          </Suspense>
        ) : null}
        {lazyPanels.elevationsOpen ? (
          <Suspense fallback={null}>
            <ElevationPanel />
          </Suspense>
        ) : null}
        {lazyPanels.versionsOpen ? (
          <Suspense fallback={null}>
            <VersionsPanel />
          </Suspense>
        ) : null}
        {lazyPanels.historyOpen ? (
          <Suspense fallback={null}>
            <HistoryPanel />
          </Suspense>
        ) : null}
        {lazyPanels.smartStartOpen ? (
          <Suspense fallback={null}>
            <SmartStartWizard />
          </Suspense>
        ) : null}
        {glbDesignerOpen ? (
          <Suspense fallback={null}>
            <GlbDesignerDialog />
          </Suspense>
        ) : null}
        {parametricOpen ? (
          <Suspense fallback={null}>
            <ParametricDialog />
          </Suspense>
        ) : null}
        {configuratorOpen ? (
          <Suspense fallback={null}>
            <ConfiguratorDialog />
          </Suspense>
        ) : null}
        <QuoteTemplateModal />
        <LoginScreen />
        {lazyPanels.flagsOpen ? (
          <Suspense fallback={null}>
            <FlagsPanel />
          </Suspense>
        ) : null}
        <Onboarding />
        {lazyPanels.tourOpen ? (
          <Suspense fallback={null}>
            <ProductTour />
          </Suspense>
        ) : null}
        <LocationPrompt />
        <PromptModal />
        <ConfirmModal />
        {visualScene.floorPlan ? (
          <Suspense fallback={null}>
            <FloorPlanEditor />
          </Suspense>
        ) : null}
        <LoadingOverlay active={loading.active} label={loading.label} />
      </div>
    </WebGLFallback>
  )
}
