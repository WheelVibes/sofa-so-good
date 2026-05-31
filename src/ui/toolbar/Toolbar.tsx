import { useEffect, useRef, useState } from 'react'
import { ROOMS } from '../../apartment/constants'
import { QUALITY_LABEL } from '../../scene/quality'
import { useStore } from '../../state/store'
import { GraphicsSettings } from '../GraphicsSettings'
import { IconButton } from './IconButton'
import { Icon } from './icons'
import { ArrangeMenu } from './menus/ArrangeMenu'
import { FileMenu } from './menus/FileMenu'
import { SceneMenu } from './menus/SceneMenu'
import { ToolsMenu } from './menus/ToolsMenu'
import { ViewMenu } from './menus/ViewMenu'
import { Popover } from './Popover'
import { shortcutLabel } from './shortcuts'
import { MenuItem } from './ToolbarMenu'

function Divider() {
  return <div className="mx-1 h-6 w-px shrink-0 bg-neutral-300/70" />
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
  const exitRoomEditor = useStore((s) => s.exitRoomEditor)
  const editorTool = useStore((s) => s.editorTool)
  const setEditorTool = useStore((s) => s.setEditorTool)
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

  const [graphicsOpen, setGraphicsOpen] = useState(false)

  const orbit = cameraMode === 'orbit'
  const roomName = roomEditorRoomId ? (ROOMS[roomEditorRoomId]?.name ?? 'room') : ''

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

  return (
    <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
      <div
        ref={scrollRef}
        className="toolbar-scroll flex max-w-[96vw] items-center gap-0.5 overflow-x-auto rounded-2xl border border-white/60 bg-white/85 px-2 py-1.5 shadow-xl backdrop-blur"
      >
        {/* Exit per-room editor — leftmost while the room editor is active. */}
        {roomEditorActive && (
          <>
            <IconButton
              icon="ExitRoom"
              label={`Exit room${roomName ? ` · ${roomName}` : ''}`}
              shortcut="Esc"
              onClick={exitRoomEditor}
            />
            <Divider />
          </>
        )}

        {/* Camera */}
        <CameraControl mode={cameraMode} setMode={setCameraMode} />

        {orbit && (
          <>
            <Divider />
            <ViewMenu />
            {!roomEditorActive && <SceneMenu />}

            <Divider />
            {/* Edit */}
            <IconButton
              icon={editorTool === 'select' ? 'Select' : 'Rotate'}
              label={`Tool: ${editorTool === 'select' ? 'Select' : 'Rotate'}`}
              shortcut={shortcutLabel('toggleEditorTool')}
              active={editorTool === 'select'}
              onClick={() => setEditorTool(editorTool === 'select' ? 'orbit' : 'select')}
            />
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
                onClick={cycleGridSize}
                title="Grid cell size"
                className="h-9 rounded-lg px-2 text-xs text-neutral-600 hover:bg-neutral-200/80"
              >
                {gridLabel}
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
            {!roomEditorActive && <ToolsMenu />}

            <Divider />
            {/* Render */}
            <IconButton
              icon="Quality"
              label={`Graphics — ${QUALITY_LABEL[qualityTier]}`}
              onClick={() => setGraphicsOpen(true)}
            />
            {!roomEditorActive && (
              <IconButton
                icon="Lights"
                label={`Lights: ${LIGHTS_LABEL[lightsMode]}`}
                active={lightsMode !== 'auto'}
                onClick={cycleLightsMode}
              />
            )}

            <Divider />
            <FileMenu />
          </>
        )}
      </div>

      <GraphicsSettings open={graphicsOpen} onClose={() => setGraphicsOpen(false)} />
    </div>
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
        className="flex h-9 items-center gap-1 rounded-lg bg-neutral-900 px-2.5 text-white"
      >
        {/* reuse the same icon names via IconButton-free inline render */}
        <span className="inline-flex">{isOrbit ? <OrbitGlyph /> : <WalkGlyph />}</span>
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
  return <Icon.Chevron width={12} height={12} className="opacity-60" />
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
      <div
        role="menu"
        className="w-52 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-2xl"
      >
        {children}
      </div>
    </Popover>
  )
}
