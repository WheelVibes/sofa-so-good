import { useEffect, useRef, useState } from 'react'
import { ROOMS } from '../../apartment/constants'
import { isDefaultPlan } from '../../floorplan/planGeometry'
import { QUALITY_LABEL } from '../../scene/quality'
import { useStore } from '../../state/store'
import { openDocs } from '../docsUrl'
import { GraphicsSettings } from '../GraphicsSettings'
import { HelpModal } from '../HelpModal'
import { BrandMark } from '../Logo'
import { useIsMobile } from '../useIsMobile'
import { AppearancePopover } from './AppearancePopover'
import { IconButton } from './IconButton'
import { Icon } from './icons'
import { MobileToolbar } from './MobileToolbar'
import { ArrangeMenu } from './menus/ArrangeMenu'
import { FileMenu } from './menus/FileMenu'
import { SceneMenu } from './menus/SceneMenu'
import { ToolsMenu } from './menus/ToolsMenu'
import { ViewMenu } from './menus/ViewMenu'
import { Popover } from './Popover'
import { shortcutLabel } from './shortcuts'
import { MenuItem } from './ToolbarMenu'

function Divider() {
  return <div className="tool-divider" />
}

const LIGHTS_LABEL: Record<'auto' | 'on' | 'off', string> = { auto: 'Auto', on: 'On', off: 'Off' }

/** The icon-island toolbar. Frequent actions are direct icon buttons; busy
 *  clusters collapse into labelled portaled dropdown menus. Editing clusters
 *  show only in orbit mode (Walk keeps the camera essentials). */
export function Toolbar() {
  const cameraMode = useStore((s) => s.cameraMode)
  const setCameraMode = useStore((s) => s.setCameraMode)
  const roomEditorActive = useStore((s) => s.roomEditor.active)
  const roomEditorRoomId = useStore((s) => s.roomEditor.roomId)
  const proMode = useStore((s) => s.uiMode === 'pro')
  const exitRoomEditor = useStore((s) => s.exitRoomEditor)
  const enterRoomEditor = useStore((s) => s.enterRoomEditor)
  const floorPlan = useStore((s) => s.floorPlan)
  // Room-switcher options follow the active plan (default apartment → built-in
  // rooms minus external ledges; custom plan → its own rooms).
  const roomOptions = isDefaultPlan(floorPlan)
    ? Object.values(ROOMS)
        .filter((r) => !r.external)
        .map((r) => ({ id: r.id as string, name: r.name }))
    : floorPlan.rooms.map((r) => ({ id: r.id, name: r.name }))
  // Default room the prominent "Edit a room" button dives into.
  const editRoomId = roomOptions[0]?.id
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
  const toggleFloorPlanEditing = useStore((s) => s.toggleFloorPlanEditing)

  const [graphicsOpen, setGraphicsOpen] = useState(false)
  const helpOpen = useStore((s) => s.helpOpen)
  const setHelpOpen = useStore((s) => s.setHelpOpen)
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
    return (
      <>
        <MobileToolbar />
        <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      </>
    )
  }

  return (
    <>
      <div ref={scrollRef} className="toolbar toolbar-scroll">
        {/* Brand mark */}
        <div className="brand-dot" title="Sofa So Good">
          <BrandMark size={22} />
        </div>
        <Divider />

        {/* Exit + room switcher — leftmost while the room editor is active. */}
        {roomEditorActive && (
          <>
            <IconButton icon="ExitRoom" label="Exit room" shortcut="Esc" onClick={exitRoomEditor} />
            <select
              className="input toolbar-room-select"
              aria-label="Room to edit"
              value={roomEditorRoomId ?? ''}
              onChange={(e) => enterRoomEditor(e.target.value)}
            >
              {roomOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <Divider />
          </>
        )}

        {/* Camera */}
        <CameraControl mode={cameraMode} setMode={setCameraMode} />

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
              onClick={canUndo ? undo : undefined}
            />
            <IconButton
              icon="Redo"
              label="Redo"
              shortcut={shortcutLabel('redo')}
              onClick={canRedo ? redo : undefined}
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
            <IconButton
              icon="Quality"
              label={`Graphics — ${QUALITY_LABEL[qualityTier]}`}
              onClick={() => setGraphicsOpen(true)}
            />

            <Divider />
            <FileMenu />
          </>
        )}

        {/* VIEW MODE — orbit over the whole flat (not editing): camera/scene
            controls plus the prominent entry into the room editor. */}
        {orbit && !roomEditorActive && (
          <>
            <Divider />
            <ViewMenu />

            <Divider />
            {/* Primary editing entry: dive into a room to furnish + finish it. */}
            <IconButton
              icon="Cube"
              label="Edit a room"
              active={false}
              onClick={() => editRoomId && enterRoomEditor(editRoomId)}
            />
            {/* Structural shell editor (walls/rooms/openings) — a whole-flat,
                non-furniture surface, so it stays reachable from the overview. */}
            <IconButton
              icon="FloorPlan"
              label="Floor plan"
              active={false}
              onClick={toggleFloorPlanEditing}
            />
            {proMode && <ToolsMenu />}

            <Divider />
            {/* Render */}
            <IconButton
              icon="Quality"
              label={`Graphics — ${QUALITY_LABEL[qualityTier]}`}
              onClick={() => setGraphicsOpen(true)}
            />
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

        {/* Appearance + Help live on the right of the island in every mode. */}
        <Divider />
        <AppearancePopover />
        <IconButton icon="Book" label="User guide" onClick={openDocs} />
        <IconButton
          icon="Help"
          label="Help & shortcuts"
          shortcut="?"
          active={helpOpen}
          onClick={() => setHelpOpen(true)}
        />
      </div>

      <GraphicsSettings open={graphicsOpen} onClose={() => setGraphicsOpen(false)} />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  )
}

/** Orbit/Walk camera toggle as an icon + chevron opening a tiny popover. */
function CameraControl({
  mode,
  setMode,
}: {
  mode: 'orbit' | 'firstPerson'
  setMode: (m: 'orbit' | 'firstPerson') => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const isOrbit = mode === 'orbit'
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label="Camera mode"
        onClick={() => setOpen((v) => !v)}
        className={`tool-btn${open ? ' active' : ''}`}
      >
        <span className="inline-flex">{isOrbit ? <OrbitGlyph /> : <WalkGlyph />}</span>
        <span className="cap">{isOrbit ? 'Orbit' : 'Walk'}</span>
        <ChevronGlyph />
      </button>
      <ToolbarMenuLite open={open} anchorRef={ref} onClose={() => setOpen(false)}>
        <MenuItem
          icon="Orbit"
          label="Orbit"
          sub="Look around the model"
          active={isOrbit}
          onClick={() => {
            setMode('orbit')
            setOpen(false)
          }}
        />
        <MenuItem
          icon="Walk"
          label="Walk"
          sub="First-person walkthrough"
          active={!isOrbit}
          onClick={() => {
            setMode('firstPerson')
            setOpen(false)
          }}
        />
      </ToolbarMenuLite>
    </>
  )
}

// Minimal inline glyphs for the camera pill (full set lives in icons.tsx).
function OrbitGlyph() {
  return <Icon.Orbit />
}
function WalkGlyph() {
  return <Icon.Walk />
}
function ChevronGlyph() {
  return <Icon.Chevron width={12} height={12} className="chev" />
}

/** A bare popover panel (no trigger) for the camera control. */
function ToolbarMenuLite({
  open,
  anchorRef,
  onClose,
  children,
}: {
  open: boolean
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <Popover open={open} anchorRef={anchorRef} onClose={onClose}>
      <div role="menu" className="pop-panel" style={{ width: 220 }}>
        {children}
      </div>
    </Popover>
  )
}
