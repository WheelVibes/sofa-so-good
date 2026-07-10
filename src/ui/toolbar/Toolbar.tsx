import { useEffect, useRef, useState } from 'react'
import { QUALITY_LABEL } from '../../scene/quality'
import { useStore } from '../../state/store'
import { GraphicsSettings } from '../GraphicsSettings'
import { useIsMobile } from '../useIsMobile'
import { AppearancePopover } from './AppearancePopover'
import { BrandDot } from './BrandDot'
import { IconButton } from './IconButton'
import { MobileToolbar } from './MobileToolbar'
import { ArrangeMenu } from './menus/ArrangeMenu'
import { EditMenu } from './menus/EditMenu'
import { FileMenu } from './menus/FileMenu'
import { SceneMenu } from './menus/SceneMenu'
import { ToolsMenu } from './menus/ToolsMenu'
import { ViewMenu } from './menus/ViewMenu'
import { RoomSwitcher } from './RoomSwitcher'
import { shortcutLabel } from './shortcuts'

function Divider() {
  return <div className="tool-divider" />
}

const LIGHTS_LABEL: Record<'auto' | 'on' | 'off', string> = { auto: 'Auto', on: 'On', off: 'Off' }

/** The icon-island toolbar. Frequent actions are direct icon buttons; busy
 *  clusters collapse into labelled portaled dropdown menus. Editing clusters
 *  show only in orbit mode (Walk keeps the camera essentials). */
export function Toolbar() {
  const cameraMode = useStore((s) => s.cameraMode)
  const roomEditorActive = useStore((s) => s.roomEditor.active)
  const proMode = useStore((s) => s.uiMode === 'pro')
  const exitRoomEditor = useStore((s) => s.exitRoomEditor)
  const catalogOpen = useStore((s) => s.catalogOpen)
  const toggleCatalogOpen = useStore((s) => s.toggleCatalogOpen)
  const showMeasurements = useStore((s) => s.showMeasurements)
  const toggleMeasurements = useStore((s) => s.toggleMeasurements)
  const snapEnabled = useStore((s) => s.snapEnabled)
  const toggleSnap = useStore((s) => s.toggleSnap)
  const gridSize = useStore((s) => s.gridSize)
  const cycleGridSize = useStore((s) => s.cycleGridSize)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const lightsMode = useStore((s) => s.lightsMode)
  const cycleLightsMode = useStore((s) => s.cycleLightsMode)
  const qualityTier = useStore((s) => s.qualityTier)
  const floorPlanEditing = useStore((s) => s.floorPlanEditing)

  const [graphicsOpen, setGraphicsOpen] = useState(false)
  const isMobile = useIsMobile()

  const orbit = cameraMode === 'orbit'

  // The toolbar is a horizontally-scrollable island sitting over the R3F
  // canvas. OrbitControls listens for `wheel` natively, so a React onWheel
  // can't reliably stop it zooming the scene out from under the cursor. Attach
  // a non-passive native listener that claims the wheel while the pointer is
  // over the toolbar and turns vertical wheel into horizontal scroll.
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      // Don't hijack the wheel when it's over an open menu/panel that scrolls
      // vertically — only the island row itself.
      e.preventDefault()
      e.stopPropagation()
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      el.scrollLeft += delta
    }
    el.addEventListener('wheel', onWheel, { passive: false })

    // Click-and-drag to scroll: only when the drag starts on the island
    // background (not a button), so clicking controls still works.
    let dragging = false
    let startX = 0
    let startLeft = 0
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('button, a, input, select, [role="menuitem"]')) return
      dragging = true
      startX = e.clientX
      startLeft = el.scrollLeft
      el.setPointerCapture(e.pointerId)
      el.style.cursor = 'grabbing'
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return
      el.scrollLeft = startLeft - (e.clientX - startX)
    }
    const endDrag = () => {
      dragging = false
      el.style.cursor = ''
    }
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
    }
  }, [])
  const gridLabel = gridSize >= 1 ? `${gridSize} m` : `${Math.round(gridSize * 100)} cm`

  // The 2D floor-plan editor is a focused full-screen mode with its own header
  // bar, so the main island would otherwise float over it. Hide it there.
  if (floorPlanEditing) return null

  if (isMobile) {
    return <MobileToolbar />
  }

  return (
    <>
      <div ref={scrollRef} className="toolbar toolbar-scroll">
        {/* Brand mark — doubles as "return to orbit mode" off the overview. */}
        <BrandDot size={22} />
        <Divider />

        {/* Exit + room switcher — leftmost while the room editor is active. */}
        {roomEditorActive && (
          <>
            <IconButton
              icon="ExitRoom"
              label="Exit room"
              shortcut={shortcutLabel('deselect')}
              onClick={exitRoomEditor}
            />
            <RoomSwitcher />
            <Divider />
          </>
        )}

        {/* View — combined camera + framing control, available in every mode so
            you can always switch Orbit/Walk (and frame the overview). */}
        <ViewMenu />

        {/* Scene (time / lighting moods / sun) stays available in Walk too, so
            you can experience the flat at different times of day while walking. */}
        {!roomEditorActive && <SceneMenu />}

        {/* EDIT MODE — inside the per-room editor (orbit): every editing cluster
            lives here now. Selection/placement/finishes only happen in here. */}
        {roomEditorActive && orbit && (
          <>
            <Divider />
            {/* Edit */}
            <IconButton
              icon="Undo"
              label="Undo"
              shortcut={shortcutLabel('undo')}
              active={false}
              disabled={!canUndo}
              disabledReason="Nothing to undo"
              onClick={undo}
            />
            <IconButton
              icon="Redo"
              label="Redo"
              shortcut={shortcutLabel('redo')}
              disabled={!canRedo}
              disabledReason="Nothing to redo"
              onClick={redo}
            />
            <IconButton
              icon="Snap"
              label={`Snap to grid · ${gridLabel}`}
              active={snapEnabled}
              onClick={toggleSnap}
            />
            {snapEnabled ? (
              <button
                type="button"
                onClick={cycleGridSize}
                title="Grid cell size"
                className="tool-btn"
              >
                <span className="cap mono">{gridLabel}</span>
              </button>
            ) : null}
            <IconButton
              icon="Measure"
              label="Measurements"
              shortcut={shortcutLabel('toggleMeasurements')}
              active={showMeasurements}
              onClick={toggleMeasurements}
            />

            <Divider />
            {/* Design */}
            <IconButton
              icon="Catalog"
              label="Catalog"
              shortcut={shortcutLabel('toggleCatalog')}
              active={catalogOpen}
              onClick={toggleCatalogOpen}
            />
            <ArrangeMenu />

            <Divider />
            <FileMenu />
          </>
        )}

        {/* VIEW MODE — orbit over the whole flat (not editing): the Edit menu
            (step into a room / floor-plan editor) plus analysis tools. */}
        {orbit && !roomEditorActive && (
          <>
            <Divider />
            <EditMenu />
            {/* Arrange = whole-apartment Smart Start / theme presets / finish styles
                (applyLayoutPreset / tidyHome / applyStyle all act on the whole flat,
                not a single room). Surfaced here so the style themes (Scandinavian,
                Minimalist, …) are reachable from the overview, not only the per-room
                editor — previously they were only in ⌘K from this mode. */}
            <ArrangeMenu />
            {proMode && <ToolsMenu />}

            <Divider />
            <IconButton
              icon="Lights"
              label={`Lights: ${LIGHTS_LABEL[lightsMode]}`}
              active={lightsMode !== 'auto'}
              onClick={cycleLightsMode}
            />

            <Divider />
            <FileMenu />
          </>
        )}

        {/* Right cluster — graphics, appearance + help live here in every mode. */}
        <Divider />
        <IconButton
          icon="Quality"
          label={`Graphics — ${QUALITY_LABEL[qualityTier]}`}
          onClick={() => setGraphicsOpen(true)}
        />
        <AppearancePopover />
      </div>

      <GraphicsSettings open={graphicsOpen} onClose={() => setGraphicsOpen(false)} />
    </>
  )
}
