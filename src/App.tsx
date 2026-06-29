import { Suspense, useCallback, useEffect, useRef } from 'react'
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
import { useCatalog } from './furniture/catalog'
import { planDuplicates } from './furniture/duplicatePlacement'
import { tidyHome } from './layout/tidyHome'
import { cameraForwardXZ } from './scene/cameras/cameraForward'
import { FinishDragOverlay } from './scene/FinishDragOverlay'
import { MobileLongPress } from './scene/MobileLongPress'
import { RoomEditorScene } from './scene/RoomEditorScene'
import { getRoomEditorShell } from './scene/roomEditorShell'
import { Scene } from './scene/Scene'
import { MarqueeSelector } from './scene/selection/MarqueeSelector'
import { canEditScene } from './state/editing'
import { editableRoomIds } from './state/rooms'
import { runBootstrap } from './state/storage/bootstrap'
import { useStore } from './state/store'
import {
  AccessibilityPanel,
  BudgetPanel,
  ClearancePanel,
  CommentsPanel,
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
  SmartStartWizard,
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
import { Crosshair } from './ui/Crosshair'
import { CatalogDrawer } from './ui/catalog/CatalogDrawer'
import { usePlacementController } from './ui/catalog/usePlacementController'
import { DoorPrompt } from './ui/DoorPrompt'
import { DragHud } from './ui/DragHud'
import { EditConfirmBar } from './ui/EditConfirmBar'
import { EmptyRoomHint } from './ui/EmptyRoomHint'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { FinishPicker } from './ui/FinishPicker'
import { FpsCounter } from './ui/FpsCounter'
import { InspectorPanel } from './ui/inspector/InspectorPanel'
import { LocationPrompt } from './ui/LocationPrompt'
import { LoadingOverlay } from './ui/loading/LoadingOverlay'
import { NavCluster } from './ui/NavCluster'
import { NotificationContainer } from './ui/notifications/NotificationContainer'
import { Onboarding } from './ui/Onboarding'
import { PresentationMode } from './ui/PresentationMode'
import { PromptModal } from './ui/PromptModal'
import { QuoteTemplateModal } from './ui/QuoteTemplateModal'
import { RoomEditorCaption } from './ui/RoomEditorCaption'
import { SwapModal } from './ui/SwapModal'
import { TapeModeToggle } from './ui/TapeModeToggle'
import { Toolbar } from './ui/Toolbar'
import { WalkHud } from './ui/WalkHud'
import { WallAccentPicker } from './ui/WallAccentPicker'
import { WebGLFallback } from './ui/WebGLFallback'
import { WalkJoystick } from './ui/walk/WalkJoystick'

export default function App() {
  const toggleMeasurements = useStore((s) => s.toggleMeasurements)
  const cameraMode = useStore((s) => s.cameraMode)
  const setCameraMode = useStore((s) => s.setCameraMode)
  const roomEditorActive = useStore((s) => s.roomEditor.active)
  const floorPlanEditing = useStore((s) => s.floorPlanEditing)
  const glbDesignerOpen = useStore((s) => s.glbDesignerOpen)
  const parametricOpen = useStore((s) => s.parametricOpen)
  const bootPhase = useStore((s) => s.bootPhase)
  const sceneReady = useStore((s) => s.sceneReady)
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

  // The boot loading screen is held until the bootstrap has resolved AND the
  // scene has painted its first solid frames — so the front-facing 3D view is
  // already nice when revealed. Non-front-facing UI (catalog, browse, packs)
  // loads lazily/in the background and never gates this.
  const booting = bootPhase !== 'ready' || !sceneReady

  // Kick off the async boot bootstrap (hydration + default-layout seed) once.
  // Runs after the first paint, so the loading overlay shows immediately
  // instead of a blank screen. Flips bootPhase → 'ready' when done.
  useEffect(() => {
    void runBootstrap()
  }, [])

  // Remove the static boot loader (baked into index.html so it paints before
  // the JS bundle even loads) now that React has committed its first frame —
  // the identical <LoadingOverlay> is on screen, so the handoff is seamless and
  // there's no blank gap on a cold load.
  useEffect(() => {
    document.getElementById('boot-loader')?.remove()
  }, [])

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
      // `?` toggles the Appearance panel (which now hosts the user guide + tour).
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditableTarget(e)) {
        e.preventDefault()
        const s = useStore.getState()
        s.setAppearanceOpen(!s.appearanceOpen)
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

  // Transition overlays (orbit↔walk, room editor enter/exit) set loading.active
  // true synchronously; clear it on the next frame after the swap commits, so
  // the overlay's own min-time + fade handles the visible duration. Keying the
  // effect on the changed state means each transition re-triggers the hide —
  // the extra deps are intentional re-trigger keys, not effect inputs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: loading.label/cameraMode/roomEditorActive re-trigger the hide per transition
  useEffect(() => {
    if (!loading.active) return
    const id = requestAnimationFrame(() => hideLoading())
    return () => cancelAnimationFrame(id)
  }, [loading.active, loading.label, cameraMode, roomEditorActive, hideLoading])

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
        const { nearbyDoorId, toggleDoor } = useStore.getState()
        if (nearbyDoorId) toggleDoor(nearbyDoorId)
      }
      if (!mod && code === KEYBINDINGS.toggleMeasurements) toggleMeasurements()

      // Escape: cancel the tape/comment tools, then clear any selection, then
      // leave the per-room editor — one key walks all the way back out.
      if (code === KEYBINDINGS.deselect) {
        const st = useStore.getState()
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
        if (st.roomEditor.active) st.exitRoomEditor()
        return
      }

      // Camera framing is available in any orbit view (whole-flat overview or
      // room editor) — it's navigation, not editing.
      if (cameraMode === 'orbit') {
        if (!mod && code === KEYBINDINGS.topView) useStore.getState().requestTopView()
        if (!mod && code === KEYBINDINGS.resetView) useStore.getState().requestHomeView()
      }

      // --- Editing keys: only inside the per-room editor (orbit camera). The
      // whole-flat orbit overview and walk mode are view-only. ---
      if (!canEditScene(useStore.getState())) return
      const state = useStore.getState()
      if (mod && code === KEYBINDINGS.undo) {
        e.preventDefault()
        if (e.shiftKey) state.redo()
        else state.undo()
        return
      }
      if (mod && code === KEYBINDINGS.redo) {
        e.preventDefault()
        state.redo()
        return
      }
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
            {roomEditorActive ? <RoomEditorScene /> : <Scene />}
          </ErrorBoundary>
          {/* Drop-target ring: shown while a finish drag is over the canvas
              (DOM overlay, outside R3F — works under frameloop="demand"). */}
          <FinishDragOverlay />
          <FpsCounter />
          <RoomEditorCaption />
          <EmptyRoomHint />
          <MobileLongPress />
          <MarqueeSelector />
          <NavCluster />
          <DragHud />
          <BudgetHud />
          <TapeModeToggle />
          <Crosshair />
          <WalkJoystick />
          <WalkHud />
          <DoorPrompt />
        </div>
        {/* Catalog docks as a persistent LEFT sidebar on desktop (mirrors the
            right-docked inspector): a sibling of `.stage-area` so `--left-rail`
            shrinks the canvas and the centred toolbar re-centres over it. On
            mobile it stays a bottom sheet. */}
        <CatalogDrawer />
        <EditConfirmBar />
        <InspectorPanel />
        <FinishPicker />
        <WallAccentPicker />
        <NotificationContainer />
        <CommandPalette />
        <ContextMenu />
        <SwapModal />
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
        {floorPlanEditing ? (
          <Suspense fallback={null}>
            <FloorPlanEditor />
          </Suspense>
        ) : null}
        <LoadingOverlay
          active={booting || loading.active}
          label={booting ? 'Furnishing your flat…' : loading.label}
        />
      </div>
    </WebGLFallback>
  )
}
