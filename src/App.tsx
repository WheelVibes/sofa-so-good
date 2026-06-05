import { useCallback, useEffect, useRef } from 'react'
import { canPlace } from './collision/placement'
import {
  KEYBINDINGS,
  NUDGE_FINE_SPEED,
  NUDGE_SPEED,
  ROTATE_FINE_STEP,
  ROTATE_STEP,
} from './controls/keybindings'
import { isEditableTarget, useKeyboard } from './controls/useKeyboard'
import { useCatalog } from './furniture/catalog'
import { tidyHome } from './layout/tidyHome'
import { cameraForwardXZ } from './scene/cameras/cameraForward'
import { MobileLongPress } from './scene/MobileLongPress'
import { RoomEditorScene } from './scene/RoomEditorScene'
import { Scene } from './scene/Scene'
import { MarqueeSelector } from './scene/selection/MarqueeSelector'
import { runBootstrap } from './state/storage/bootstrap'
import { useStore } from './state/store'
import { BudgetPanel } from './ui/BudgetPanel'
import { ClearancePanel } from './ui/ClearancePanel'
import { CommandPalette } from './ui/CommandPalette'
import { ContextMenu } from './ui/ContextMenu'
import { Crosshair } from './ui/Crosshair'
import { CatalogDrawer } from './ui/catalog/CatalogDrawer'
import { usePlacementController } from './ui/catalog/usePlacementController'
import { DoorPrompt } from './ui/DoorPrompt'
import { DragHud } from './ui/DragHud'
import { FinishPicker } from './ui/FinishPicker'
import { FpsCounter } from './ui/FpsCounter'
import { FloorPlanEditor } from './ui/floorplan/FloorPlanEditor'
import { InspectorPanel } from './ui/inspector/InspectorPanel'
import { LocationPrompt } from './ui/LocationPrompt'
import { LoadingOverlay } from './ui/loading/LoadingOverlay'
import { NavCluster } from './ui/NavCluster'
import { NotificationContainer } from './ui/notifications/NotificationContainer'
import { hasOnboarded, Onboarding } from './ui/Onboarding'
import { ShareModal } from './ui/ShareModal'
import { SwapModal } from './ui/SwapModal'
import { Toolbar } from './ui/Toolbar'
import { VersionsPanel } from './ui/VersionsPanel'
import { WalkHud } from './ui/WalkHud'
import { WallAccentPicker } from './ui/WallAccentPicker'
import { WebGLFallback } from './ui/WebGLFallback'
import { WalkJoystick } from './ui/walk/WalkJoystick'
import { SmartStartWizard } from './ui/wizard/SmartStartWizard'

export default function App() {
  const toggleMeasurements = useStore((s) => s.toggleMeasurements)
  const cameraMode = useStore((s) => s.cameraMode)
  const setCameraMode = useStore((s) => s.setCameraMode)
  const roomEditorActive = useStore((s) => s.roomEditor.active)
  const bootPhase = useStore((s) => s.bootPhase)
  const sceneReady = useStore((s) => s.sceneReady)
  const loading = useStore((s) => s.loading)
  const hideLoading = useStore((s) => s.hideLoading)
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

  // Global ⌘K / Ctrl-K toggles the command palette from anywhere (including
  // while a text input is focused), so it's added directly rather than through
  // the editor-scoped keyboard handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        useStore.getState().toggleCmdk()
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
        return () => w.cancelIdleCallback?.(id)
      }
      const id = window.setTimeout(warm, 2000)
      return () => window.clearTimeout(id)
    }
  }, [booting])

  // Show the first-run onboarding once boot is ready (so it sits above the
  // furnished flat, not the loading overlay). Suppressed after completion.
  useEffect(() => {
    if (!booting && !hasOnboarded()) {
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
    const entry = state.clipboard
    if (!entry) return
    const def = catalog[entry.defId]
    if (!def) return

    // Search a small spiral of XZ offsets starting near the source so the
    // paste lands next to the original; first non-colliding cell wins.
    const STEP = 0.3
    const MAX_RING = 8
    const candidatePositions: [number, number][] = []
    for (let r = 1; r <= MAX_RING; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
          candidatePositions.push([
            entry.sourcePosition[0] + dx * STEP,
            entry.sourcePosition[1] + dz * STEP,
          ])
        }
      }
    }

    for (const pos of candidatePositions) {
      const candidate = {
        id: 'paste-probe',
        defId: entry.defId,
        position: pos,
        rotation: entry.rotation,
        props: entry.props,
      } as const
      const ok = canPlace(candidate, def, {
        others: state.items,
        defs: catalog,
        doors: state.doors,
      })
      if (ok) {
        state.addItem({
          defId: entry.defId,
          position: pos,
          rotation: entry.rotation,
          props: { ...entry.props },
        })
        return
      }
    }
  }, [catalog])

  const onKey = useCallback(
    (code: string, e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      // Undo/redo: handle before any other mod-key path so they work
      // regardless of camera mode and selection state.
      if (mod && code === KEYBINDINGS.undo) {
        e.preventDefault()
        if (e.shiftKey) useStore.getState().redo()
        else useStore.getState().undo()
        return
      }
      if (mod && code === KEYBINDINGS.redo) {
        e.preventDefault()
        useStore.getState().redo()
        return
      }
      // Escape leaves the per-room editor first (before it clears selection).
      if (code === KEYBINDINGS.deselect && useStore.getState().roomEditor.active) {
        useStore.getState().exitRoomEditor()
        return
      }
      if (!mod && code === KEYBINDINGS.toggleMeasurements) toggleMeasurements()
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

      // Editor-only keys: scoped to orbit mode so first-person walking
      // doesn't accidentally delete or rotate the player's selection.
      if (cameraMode !== 'orbit') return
      const state = useStore.getState()
      if (!mod && code === KEYBINDINGS.toggleCatalog) {
        state.toggleCatalogOpen()
      }
      if (!mod && code === KEYBINDINGS.topView) state.requestTopView()
      if (!mod && code === KEYBINDINGS.resetView) state.requestHomeView()
      if (!mod && code === KEYBINDINGS.tidyHome) tidyHome()
      if (code === KEYBINDINGS.deselect) {
        state.selectItem(null)
      }
      if (code === KEYBINDINGS.deleteSelected && state.selectedItemIds.length > 0) {
        // Snapshot ids before deleting — deleteItem mutates the set as it goes.
        // Locked items are skipped (pinned).
        const lockedIds = new Set(state.items.filter((i) => i.locked).map((i) => i.id))
        for (const id of [...state.selectedItemIds]) {
          if (!lockedIds.has(id)) useStore.getState().deleteItem(id)
        }
      }
      if (mod && code === KEYBINDINGS.copySelected && state.selectedItemId) {
        e.preventDefault()
        const item = state.items.find((i) => i.id === state.selectedItemId)
        if (item) {
          state.setClipboard({
            defId: item.defId,
            rotation: item.rotation,
            props: item.props,
            sourcePosition: item.position,
          })
        }
      }
      if (mod && code === KEYBINDINGS.pasteClipboard && state.clipboard) {
        e.preventDefault()
        pasteClipboard()
      }
      if (mod && code === KEYBINDINGS.duplicateSelected && state.selectedItemId) {
        e.preventDefault()
        const item = state.items.find((i) => i.id === state.selectedItemId)
        if (item) {
          state.setClipboard({
            defId: item.defId,
            rotation: item.rotation,
            props: item.props,
            sourcePosition: item.position,
          })
          pasteClipboard()
        }
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
      if (!mod && code === KEYBINDINGS.rotate && state.selectedItemId) {
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
          return def && canPlace(c, def, { others: merged, defs: catalog, doors: state.doors })
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
      if (code === KEYBINDINGS.toggleEditorTool) {
        state.toggleEditorTool()
      }
    },
    [toggleMeasurements, cameraMode, setCameraMode, catalog, pasteClipboard],
  )
  useKeyboard(onKey)

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
      if (state.cameraMode !== 'orbit' || state.selectedItemIds.length === 0) return
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
          })
        ) {
          ok = false
          break
        }
      }
      if (!ok) return
      for (const c of candidates) state.moveItem(c.item.id, c.next)
    }

    const onDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e)) return
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        shiftHeld = true
        return
      }
      if (!Object.hasOwn(dirs, e.code)) return
      if (useStore.getState().cameraMode !== 'orbit') return
      e.preventDefault()
      // First key in a nudge session: snapshot the pre-nudge transform so
      // the entire press-and-hold collapses into a single undo step.
      if (held.size === 0 && useStore.getState().selectedItemId) {
        useStore.getState().pushHistory()
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
      <div className="relative h-[100dvh] w-screen overflow-hidden">
        <Toolbar />
        {roomEditorActive ? <RoomEditorScene /> : <Scene />}
        <FpsCounter />
        <MobileLongPress />
        <MarqueeSelector />
        <NavCluster />
        <DragHud />
        <Crosshair />
        <WalkJoystick />
        <WalkHud />
        <DoorPrompt />
        <CatalogDrawer />
        <InspectorPanel />
        <BudgetPanel />
        <FinishPicker />
        <WallAccentPicker />
        <NotificationContainer />
        <CommandPalette />
        <ContextMenu />
        <SwapModal />
        <ShareModal />
        <ClearancePanel />
        <VersionsPanel />
        <SmartStartWizard />
        <Onboarding />
        <LocationPrompt />
        <FloorPlanEditor />
        <LoadingOverlay
          active={booting || loading.active}
          label={booting ? 'Furnishing your flat…' : loading.label}
        />
      </div>
    </WebGLFallback>
  )
}
