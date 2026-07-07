import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { canPlace } from './collision/placement'
import { placementWalls } from './collision/placementWalls'
import {
  KEYBINDINGS,
  NUDGE_FINE_SPEED,
  NUDGE_SPEED,
  ROTATE_FINE_STEP,
  ROTATE_STEP,
} from './controls/keybindings'
import { isAnyModalOpen } from './controls/modalGuard'
import { usePlanEditorHotkey } from './controls/planEditorHotkey'
import { isEditableTarget, useKeyboard } from './controls/useKeyboard'
import { isFeatureEnabled } from './features/featureFlags'
import { useFeature } from './features/useFeature'
import { useCatalog } from './furniture/catalog'
import { planDuplicates } from './furniture/duplicatePlacement'
import { tidyHome } from './layout/tidyHome'
import { consumeJustUpdated } from './pwa/swUpdate'
import { cameraForwardXZ } from './scene/cameras/cameraForward'
import { resolveSelectionExtents, selectionBounds } from './scene/cameras/frameSelection'
import { FinishDragOverlay } from './scene/FinishDragOverlay'
import { MobileLongPress } from './scene/MobileLongPress'
import { RoomEditorScene } from './scene/RoomEditorScene'
import { getRoomEditorShell } from './scene/roomEditorShell'
import { Scene } from './scene/Scene'
import { MarqueeSelector } from './scene/selection/MarqueeSelector'
import { installTouchGestureTracker } from './scene/touchGestures'
import { canEditScene, dispatchWalkInteract } from './state/editing'
import { editableRoomIds } from './state/rooms'
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
import { roomScopedItemIds } from './ui/app/roomScopedItemIds'
import { LoginScreen } from './ui/auth/LoginScreen'
import { BudgetHud } from './ui/BudgetHud'
import { resolveBootDecision } from './ui/bootDecision'
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
  const toggleMeasurements = useStore((s) => s.toggleMeasurements)
  const cameraMode = useStore((s) => s.cameraMode)
  const setCameraMode = useStore((s) => s.setCameraMode)
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
  const catalog = useCatalog()
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

  // Global ⌘K / Ctrl-K toggles the command palette from anywhere (including
  // while a text input is focused), so it's added directly rather than through
  // the editor-scoped keyboard handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // No global shortcuts while a modal dialog is open — including ⌘K (don't
      // stack the palette over a dialog; the open palette itself is not a
      // Modal, so its own keyboard handling is unaffected) and Cmd/Ctrl+Z
      // (most apps suppress app-level undo behind a dialog; inputs keep native
      // undo). Each modal owns its Escape-to-close. See controls/modalGuard.ts.
      if (isAnyModalOpen()) return
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        useStore.getState().toggleCmdk()
        return
      }
      // Undo / redo are ALWAYS active — every editing surface tracks edits in the
      // same history (per-room editor, the 2D floor-plan editor, and the
      // overview). Suppressed only while a modal is open (handled above) or while
      // typing in a field (native input undo wins). Cmd/Ctrl+Z = undo,
      // Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y = redo.
      const undoMod = e.metaKey || e.ctrlKey
      if (undoMod && e.code === KEYBINDINGS.undo && !isEditableTarget(e)) {
        e.preventDefault()
        if (e.shiftKey) useStore.getState().redo()
        else useStore.getState().undo()
        return
      }
      if (undoMod && e.code === KEYBINDINGS.redo && !isEditableTarget(e)) {
        e.preventDefault()
        useStore.getState().redo()
        return
      }
      // `?` opens the keyboard-shortcuts overlay (the universal convention) when
      // that feature is on; otherwise it falls back to toggling the Appearance
      // panel (which hosts the user guide + tour), preserving the old behaviour.
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditableTarget(e)) {
        e.preventDefault()
        const s = useStore.getState()
        if (isFeatureEnabled('shortcutsHelp')) s.setShortcutsHelpOpen(true)
        else s.setAppearanceOpen(!s.appearanceOpen)
        return
      }
      // `B` toggles the Budget / shopping panel (an orbit-view .aux panel) when
      // the budget feature is enabled — quick access to spend tracking. Not while
      // typing / for modifier combos / in walk.
      if (
        (e.key === 'b' || e.key === 'B') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isEditableTarget(e) &&
        useStore.getState().cameraMode === 'orbit' &&
        isFeatureEnabled('budget')
      ) {
        e.preventDefault()
        useStore.getState().toggleBudget()
        return
      }
      // Ctrl/⌘+A selects every item in the room being edited (editing is
      // room-editor-only now; the overview/walk are view-only). Not while typing.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A') && !isEditableTarget(e)) {
        const s = useStore.getState()
        const ids = roomScopedItemIds(s)
        if (canEditScene(s) && ids.length > 0) {
          e.preventDefault()
          s.setSelectedItemIds(ids)
        }
      }
      // `[` / `]` cycle the selection through the room's items (prev / next,
      // wrapping) — keyboard access without a mouse. Room editor only.
      if (
        (e.key === '[' || e.key === ']') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isEditableTarget(e)
      ) {
        const s = useStore.getState()
        const ids = roomScopedItemIds(s)
        if (canEditScene(s) && ids.length > 0) {
          e.preventDefault()
          const cur = ids.indexOf(s.selectedItemId ?? '')
          const step = e.key === ']' ? 1 : -1
          // From no selection, ']' starts at the first item and '[' at the last.
          const next =
            cur === -1 ? (step === 1 ? 0 : ids.length - 1) : (cur + step + ids.length) % ids.length
          s.selectItem(ids[next])
          return
        }
      }
      // `,` / `.` cycle the room being edited (prev / next) — a quick way to work
      // room-by-room without the dropdown. Room editor only; skipped while typing.
      if (
        (e.key === ',' || e.key === '.') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isEditableTarget(e)
      ) {
        const s = useStore.getState()
        if (canEditScene(s)) {
          const ids = editableRoomIds(s.floorPlan)
          if (ids.length > 0) {
            e.preventDefault()
            const cur = ids.indexOf(s.roomEditor.roomId ?? '')
            const step = e.key === '.' ? 1 : -1
            const next = ((cur < 0 ? 0 : cur + step) + ids.length) % ids.length
            s.enterRoomEditor(ids[next])
            return
          }
        }
      }
      // `/` jumps to the catalog search (opening the drawer if needed), a
      // quick-find shortcut. The catalog lives in the room editor now, so this
      // is editor-only. Skipped while typing / for modifier combos.
      if (
        e.key === '/' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isEditableTarget(e) &&
        canEditScene(useStore.getState())
      ) {
        e.preventDefault()
        // Force the Catalog tab (not Layers) so the search box is the catalog's,
        // then ensure the drawer is open.
        useStore.getState().setLeftMode('catalog')
        if (!useStore.getState().catalogOpen) useStore.getState().setCatalogOpen(true)
        // The drawer (and Layers filter) reuse `.cat-search input`; focus it once
        // the panel has mounted/painted.
        requestAnimationFrame(() => {
          const input = document.querySelector<HTMLInputElement>('.panel.catalog .cat-search input')
          input?.focus()
          input?.select()
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Toggle the `mobile` body class at the ≤640px breakpoint so the responsive
  // layer (bottom-sheet panels, hidden nav cluster, viewport-fit modals) kicks
  // in. The prototype's vanilla app set this; the React port mirrors it.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
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

  const pasteClipboard = useCallback(() => {
    const state = useStore.getState()
    const entries = state.clipboard
    if (!entries || entries.length === 0) return

    // Multi-item paste: rebuild the copied selection as pseudo-sources at their
    // copy-time positions and reuse `planDuplicates` (shared-offset, arrangement-
    // preserving, collision-skipping) — one undo step (PC2-MULTI-DUP-PASTE).
    if (entries.length > 1) {
      const mkId = (n: number) =>
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `paste-${Date.now()}-${n}`
      const sources = entries
        .filter((e) => catalog[e.defId])
        .map((e, i) => ({
          id: `paste-src-${i}`,
          defId: e.defId,
          position: [e.sourcePosition[0], e.sourcePosition[1]] as [number, number],
          rotation: e.rotation,
          flipX: e.flipX,
          flipZ: e.flipZ,
          label: e.label,
          props: { ...e.props },
        }))
      const copies = planDuplicates(
        sources,
        { others: state.items, defs: catalog, doors: state.doors },
        mkId,
      )
      if (copies.length === 0) return
      state.pushHistory()
      state.setItems([...state.items, ...copies])
      state.setSelectedItemIds(copies.map((c) => c.id))
      return
    }

    const entry = entries[0]
    const def = catalog[entry.defId]
    if (!def) return

    // Anchor the paste near the source — but if we're editing a *different*
    // room than the copy came from, anchor to the current room's centre so
    // "copy here → switch room → paste" lands in the room you're looking at
    // (not back in the source room, where the new item would be off-screen).
    let base = entry.sourcePosition
    if (state.roomEditor.active && state.roomEditor.roomId) {
      const shell = getRoomEditorShell(state.floorPlan, state.roomEditor.roomId)?.shell
      if (shell && !shell.contains(base[0], base[1])) base = shell.center
    }

    // Search a small spiral of XZ offsets starting near the anchor so the
    // paste lands next to it; first non-colliding cell wins.
    const STEP = 0.3
    const MAX_RING = 8
    const candidatePositions: [number, number][] = []
    for (let r = 1; r <= MAX_RING; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
          candidatePositions.push([base[0] + dx * STEP, base[1] + dz * STEP])
        }
      }
    }

    for (const pos of candidatePositions) {
      const candidate = {
        id: 'paste-probe',
        defId: entry.defId,
        position: pos,
        rotation: entry.rotation,
        flipX: entry.flipX,
        flipZ: entry.flipZ,
        props: entry.props,
      } as const
      const ok = canPlace(candidate, def, {
        others: state.items,
        defs: catalog,
        doors: state.doors,
        walls: placementWalls(state),
      })
      if (ok) {
        state.addItem({
          defId: entry.defId,
          position: pos,
          rotation: entry.rotation,
          flipX: entry.flipX,
          flipZ: entry.flipZ,
          label: entry.label,
          props: { ...entry.props },
        })
        return
      }
    }
  }, [catalog])

  // Duplicate the current selection. A single item reuses the clipboard/paste
  // spiral; a multi-selection is offset by one shared delta (preserving the
  // arrangement), collision-skipping blocked members, in ONE undo step. Copies
  // inherit a fresh shared group only when every source shared one group.
  const duplicateSelection = useCallback(() => {
    const st = useStore.getState()
    const ids = st.selectedItemIds
    const single = st.items.find((i) => i.id === st.selectedItemId)
    if (ids.length <= 1) {
      if (!single) return
      st.setClipboard([
        {
          defId: single.defId,
          rotation: single.rotation,
          props: single.props,
          flipX: single.flipX,
          flipZ: single.flipZ,
          label: single.label,
          sourcePosition: single.position,
        },
      ])
      pasteClipboard()
      return
    }
    const sources = st.items.filter((i) => ids.includes(i.id))
    const groupIds = new Set(sources.map((s) => s.groupId))
    const sharedGroup = groupIds.size === 1 && !groupIds.has(undefined)
    const gid =
      sharedGroup && typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : undefined
    const copies = planDuplicates(
      sources,
      { others: st.items, defs: catalog, doors: st.doors },
      (n) =>
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `id-${Date.now()}-${n}`,
      gid,
    )
    if (copies.length === 0) return
    st.pushHistory()
    st.setItems([...st.items, ...copies])
    st.setSelectedItemIds(copies.map((i) => i.id))
  }, [catalog, pasteClipboard])

  const onKey = useCallback(
    (code: string, e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey

      // --- View / global keys (work in any mode) ---
      if (!mod && code === KEYBINDINGS.toggleCameraMode) {
        setCameraMode(cameraMode === 'orbit' ? 'firstPerson' : 'orbit')
      }
      if (!mod && code === KEYBINDINGS.cyclePresetTime) {
        useStore.getState().cyclePresetTime()
      }
      if (code === KEYBINDINGS.interact) {
        // Walk-mode only (VIEW-EDIT-SPLIT/WINDOW-FIXTURE-INTERACT): orbit
        // mode never toggles a door/fixture/screen/light on E. `nearbyDoorId`/
        // `nearbyFixtureId`/`nearbyScreenId`/`nearbyLightId` are only ever set
        // by FirstPersonCamera's aim loop, but `dispatchWalkInteract` is still
        // the single gate every interact entry point (this, `Door.tsx`,
        // `Furniture.tsx`) shares. Fixed priority order — door, then curtain/
        // blind fixture, then whichever of screen/light the aim loop already
        // picked as nearest (WALK-SCREEN-INTERACT/WALK-LIGHT-INTERACT: the two
        // are mutually exclusive by the time they reach here).
        const state = useStore.getState()
        if (state.nearbyDoorId) {
          dispatchWalkInteract(state, state.nearbyDoorId, state.toggleDoor)
        } else if (state.nearbyFixtureId && isFeatureEnabled('walkWindowFixtures')) {
          dispatchWalkInteract(state, state.nearbyFixtureId, state.toggleWindowFixture)
        } else if (state.nearbyScreenId && isFeatureEnabled('walkScreens')) {
          dispatchWalkInteract(state, state.nearbyScreenId, state.cycleScreenContent)
        } else if (state.nearbyLightId && isFeatureEnabled('walkLights')) {
          dispatchWalkInteract(state, state.nearbyLightId, state.toggleLightPower)
        }
      }
      if (!mod && code === KEYBINDINGS.toggleMeasurements) toggleMeasurements()

      // Escape: cancel an armed catalog placement, then the tape/comment tools,
      // then clear any selection. Escape deliberately does NOT leave the per-room
      // editor — exiting is an explicit action (the Done control), so a stray
      // Escape can't dump the user back to the orbit overview mid-design.
      if (code === KEYBINDINGS.deselect) {
        const st = useStore.getState()
        // A catalog placement in progress owns Escape (cancel the armed ghost);
        // `usePlacementController` performs the actual cancel — bail here so we
        // don't also clear the selection on the same keypress.
        if (st.activeDefId) return
        if (st.tapeMode) {
          st.toggleTapeMode()
          return
        }
        if (st.commentMode) {
          st.toggleCommentMode()
          return
        }
        if (
          st.selectedItemId ||
          st.selectedItemIds.length > 0 ||
          st.selectedRoomId ||
          st.selectedWall
        ) {
          st.selectItem(null)
          return
        }
        return
      }

      // Camera framing is available in any orbit view (whole-flat overview or
      // room editor) — it's navigation, not editing.
      if (cameraMode === 'orbit') {
        if (!mod && code === KEYBINDINGS.topView) useStore.getState().requestTopView()
        if (!mod && code === KEYBINDINGS.resetView) useStore.getState().requestHomeView()
        // FEAT-A: dolly/frame the camera to fit the current selection (Z — see
        // keybindings.ts for why not bare F). No-op with nothing selected;
        // selection only ever exists inside the room editor (canEditScene),
        // which is already orbit-mode, so no extra editing-scope check needed.
        if (!mod && code === KEYBINDINGS.frameSelection && isFeatureEnabled('frameSelection')) {
          const st = useStore.getState()
          if (st.selectedItemIds.length > 0) {
            const extents = resolveSelectionExtents(st.items, st.selectedItemIds, catalog)
            const bounds = selectionBounds(extents)
            if (bounds) st.requestFrameSelection(bounds)
          }
        }
      }

      // --- Editing keys: only inside the per-room editor (orbit camera). The
      // whole-flat orbit overview and walk mode are view-only. ---
      if (!canEditScene(useStore.getState())) return
      const state = useStore.getState()
      // Undo / redo live in the always-active global handler (see the ⌘K effect)
      // so they work in the floor-plan editor + overview too — not just here.
      if (!mod && code === KEYBINDINGS.toggleCatalog) {
        state.toggleCatalogOpen()
      }
      if (!mod && code === KEYBINDINGS.tidyHome) tidyHome()
      if (code === KEYBINDINGS.deleteSelected && state.selectedItemIds.length > 0) {
        // Snapshot ids before deleting — deleteItem mutates the set as it goes.
        // Locked items are skipped (pinned).
        const lockedIds = new Set(state.items.filter((i) => i.locked).map((i) => i.id))
        for (const id of [...state.selectedItemIds]) {
          if (!lockedIds.has(id)) useStore.getState().deleteItem(id)
        }
      }
      if (mod && code === KEYBINDINGS.copySelected && state.selectedItemIds.length > 0) {
        e.preventDefault()
        // Copy the WHOLE selection (each item with its position) so a multi-select
        // pastes back as a group preserving its arrangement (PC2-MULTI-DUP-PASTE).
        const sel = state.items.filter((i) => state.selectedItemIds.includes(i.id))
        if (sel.length > 0) {
          state.setClipboard(
            sel.map((item) => ({
              defId: item.defId,
              rotation: item.rotation,
              props: item.props,
              flipX: item.flipX,
              flipZ: item.flipZ,
              label: item.label,
              sourcePosition: item.position,
            })),
          )
        }
      }
      if (mod && code === KEYBINDINGS.pasteClipboard && state.clipboard?.length) {
        e.preventDefault()
        pasteClipboard()
      }
      if (mod && code === KEYBINDINGS.duplicateSelected && state.selectedItemId) {
        e.preventDefault()
        duplicateSelection()
      }
      if (!mod && code === KEYBINDINGS.flip && state.selectedItemId) {
        // F flips left↔right; Shift+F flips front↔back. Applies to the whole
        // selection. Flipping is a mirror — footprint is unchanged, so no
        // collision check is needed.
        e.preventDefault()
        const axis = e.shiftKey ? 'z' : 'x'
        const ids =
          state.selectedItemIds.length > 0 ? state.selectedItemIds : [state.selectedItemId]
        state.pushHistory()
        for (const id of ids) useStore.getState().flipItem(id, axis)
        return
      }
      // While a catalog placement is armed, R rotates the *ghost*
      // (usePlacementController) — don't also spin the current selection.
      if (!mod && code === KEYBINDINGS.rotate && state.selectedItemId && !state.activeDefId) {
        const step = e.shiftKey ? ROTATE_FINE_STEP : ROTATE_STEP
        const ids =
          state.selectedItemIds.length > 0 ? state.selectedItemIds : [state.selectedItemId]
        const group = state.items.filter((i) => ids.includes(i.id) && !i.locked)
        if (group.length === 0) return

        if (group.length === 1) {
          const item = group[0]
          const def = catalog[item.defId]
          if (!def) return
          const nextRotation = item.rotation + step
          const ok = canPlace({ ...item, rotation: nextRotation }, def, {
            others: state.items,
            defs: catalog,
            doors: state.doors,
            walls: placementWalls(state),
          })
          if (ok) {
            state.pushHistory()
            state.rotateItem(item.id, nextRotation)
          }
          return
        }

        // Group rotate about the centroid (rigid). Pre-check canPlace on the
        // rotated candidates; commit via the store's groupRotate helper if all
        // fit (groupRotate preserves the arrangement + pushes history).
        const cx = group.reduce((a, i) => a + i.position[0], 0) / group.length
        const cz = group.reduce((a, i) => a + i.position[1], 0) / group.length
        const cos = Math.cos(step)
        const sin = Math.sin(step)
        const candidates = group.map((i) => {
          const dx = i.position[0] - cx
          const dz = i.position[1] - cz
          return {
            ...i,
            position: [cx + dx * cos - dz * sin, cz + dx * sin + dz * cos] as [number, number],
            rotation: i.rotation + step,
          }
        })
        const byId = new Map(candidates.map((c) => [c.id, c]))
        const merged = state.items.map((i) => byId.get(i.id) ?? i)
        const allFit = candidates.every((c) => {
          const def = catalog[c.defId]
          return (
            def &&
            canPlace(c, def, {
              others: merged,
              defs: catalog,
              doors: state.doors,
              walls: placementWalls(state),
            })
          )
        })
        if (allFit) {
          // All selected members share one group when this path is reached via
          // a group selection; rotate it about the shared centroid the
          // candidates were computed from. In practice the selection is one
          // group, so rotate it via the helper.
          const gid = group[0].groupId
          if (gid && group.every((i) => i.groupId === gid)) {
            state.groupRotate(gid, step)
          } else {
            // Heterogeneous multi-select (spans groups / ungrouped): keep the
            // historical inline behaviour so a flat marquee still rotates.
            state.pushHistory()
            for (const c of candidates) {
              state.rotateItem(c.id, c.rotation)
              state.moveItem(c.id, c.position)
            }
          }
        }
      }
    },
    [toggleMeasurements, cameraMode, setCameraMode, catalog, pasteClipboard, duplicateSelection],
  )
  useKeyboard(onKey)
  // `P` ⇄ 2D plan editor lives in its own always-mounted hook: the editor is
  // lazy-mounted only while open, so an editor-scoped listener couldn't OPEN it.
  usePlanEditorHotkey()

  // Press-and-hold nudge: arrow keys move the selected item continuously
  // along world-XZ at NUDGE_SPEED m/s (Shift = fine). preventDefault on
  // keydown stops the page from scrolling. Collision-rejected frames
  // simply skip the move so the outline never flashes red.
  const catalogRef = useRef(catalog)
  catalogRef.current = catalog
  useEffect(() => {
    const dirs: Record<string, [number, number]> = {
      [KEYBINDINGS.nudgeUp]: [0, -1],
      [KEYBINDINGS.nudgeDown]: [0, 1],
      [KEYBINDINGS.nudgeLeft]: [-1, 0],
      [KEYBINDINGS.nudgeRight]: [1, 0],
    }
    const held = new Set<string>()
    let shiftHeld = false
    let rafId = 0
    let lastTime = 0

    const stop = () => {
      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = 0
      }
      lastTime = 0
    }

    const tick = (t: number) => {
      const dt = lastTime ? Math.min((t - lastTime) / 1000, 0.05) : 0
      lastTime = t
      rafId = requestAnimationFrame(tick)
      if (held.size === 0) return
      const state = useStore.getState()
      if (!canEditScene(state) || state.selectedItemIds.length === 0) return
      const movingIds = state.selectedItemIds
      const movingItems = state.items.filter((i) => movingIds.includes(i.id) && !i.locked)
      if (movingItems.length === 0) return
      let dx = 0
      let dz = 0
      for (const code of held) {
        const d = dirs[code]
        if (d) {
          dx += d[0]
          dz += d[1]
        }
      }
      if (dx === 0 && dz === 0) return
      // Snap camera-forward to the nearest world-XZ cardinal so movement
      // stays on apartment axes (never diagonal) even when the orbit yaw
      // sits between cardinals. Screen-right is forward rotated +90° on Y
      // in three.js's right-handed/-Z-look convention: R=(-fz,fx).
      const fxRaw = cameraForwardXZ.x
      const fzRaw = cameraForwardXZ.z
      const dominantX = Math.abs(fxRaw) >= Math.abs(fzRaw)
      const fx = dominantX ? Math.sign(fxRaw) || 1 : 0
      const fz = dominantX ? 0 : Math.sign(fzRaw) || 1
      const worldDx = -fz * dx + fx * -dz
      const worldDz = fx * dx + fz * -dz
      const speed = shiftHeld ? NUDGE_FINE_SPEED : NUDGE_SPEED
      const stepX = worldDx * speed * dt
      const stepZ = worldDz * speed * dt
      // Validate the whole group's next pose first; reject if any member
      // would collide. Group members are excluded from each other's
      // collision check since their relative positions don't change.
      const inGroup = new Set(movingIds)
      const others = state.items.filter((it) => !inGroup.has(it.id))
      const candidates = movingItems.map((item) => {
        const def = catalogRef.current[item.defId]
        const next: [number, number] = [item.position[0] + stepX, item.position[1] + stepZ]
        return { item, def, next }
      })
      let ok = true
      for (const c of candidates) {
        if (!c.def) {
          ok = false
          break
        }
        if (
          !canPlace({ ...c.item, position: c.next }, c.def, {
            others,
            defs: catalogRef.current,
            doors: state.doors,
            walls: placementWalls(state),
          })
        ) {
          ok = false
          break
        }
      }
      if (!ok) return
      for (const c of candidates) state.moveItem(c.item.id, c.next)
      // Keep the 'nudge' coalesce window alive while actively moving so a long
      // press-and-hold followed by a quick re-tap stays in the SAME undo step
      // (moveItem itself never touches the coalesce clock). A genuine pause (no
      // movement for > the window) lets the next keydown open a fresh step.
      state.refreshCoalesce('nudge')
    }

    const onDown = (e: KeyboardEvent) => {
      if (isAnyModalOpen()) return
      if (isEditableTarget(e)) return
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        shiftHeld = true
        return
      }
      if (!Object.hasOwn(dirs, e.code)) return
      if (!canEditScene(useStore.getState())) return
      e.preventDefault()
      // First key in a nudge session: snapshot the pre-nudge transform so the
      // whole press-and-hold collapses into a single undo step. Coalesced under a
      // stable 'nudge' key so a *burst* of separate taps (each its own
      // keydown→keyup) within the coalesce window also collapses into one undo
      // step, while a deliberate pause (window elapsed) starts a fresh step. Any
      // other action in between pushes a different key (or resets it), breaking
      // the chain — so a nudge never merges with an array/rotate/drag/etc. Guard
      // on the multi-selection (`selectedItemIds`), not just the single primary
      // id, so a marquee/group nudge is undoable too.
      const st = useStore.getState()
      if (held.size === 0 && st.selectedItemIds.length > 0) {
        st.pushHistoryCoalesced('nudge')
      }
      held.add(e.code)
      if (!rafId) rafId = requestAnimationFrame(tick)
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        shiftHeld = false
        return
      }
      held.delete(e.code)
      if (held.size === 0) stop()
    }
    const onBlur = () => {
      held.clear()
      shiftHeld = false
      stop()
    }

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
      stop()
    }
  }, [])

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
