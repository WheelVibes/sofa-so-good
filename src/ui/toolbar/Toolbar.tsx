import { useEffect, useRef, useState } from 'react'
import { QUALITY_LABEL } from '../../scene/quality'
import { GRID_SIZES, type LightsMode } from '../../state/slices/uiSlice'
import { useStore } from '../../state/store'
import { Segmented } from '../controls/Segmented'
import { Select } from '../controls/Select'
import { GraphicsSettings } from '../GraphicsSettings'
import { useIsMobile } from '../useIsMobile'
import { AppearancePopover } from './AppearancePopover'
import { BrandDot } from './BrandDot'
import { formatGridSize } from './gridSizeLabel'
import { IconButton } from './IconButton'
import { Icon } from './icons'
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

/** Lights segmented options (TB-8: all 3 states visible, one click each). */
const LIGHTS_OPTIONS = [
  { value: 'auto', label: 'Auto', title: 'Lights: Auto — follow the time of day' },
  { value: 'on', label: 'On', title: 'Lights: always on' },
  { value: 'off', label: 'Off', title: 'Lights: always off' },
]

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
  const setGridSize = useStore((s) => s.setGridSize)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const lightsMode = useStore((s) => s.lightsMode)
  const setLightsMode = useStore((s) => s.setLightsMode)
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

    // Overflow affordance (TB-6): stamp .can-scroll-left/right so CSS can fade
    // the clipped edge — silent horizontal overflow hid the right cluster
    // (Graphics/Appearance) on narrow desktops with no cue. Scroll + resize +
    // content-size driven (ResizeObserver catches cluster mount/unmount).
    const updateOverflowCues = () => {
      const canLeft = el.scrollLeft > 1
      const canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
      el.classList.toggle('can-scroll-left', canLeft)
      el.classList.toggle('can-scroll-right', canRight)
    }
    updateOverflowCues()
    el.addEventListener('scroll', updateOverflowCues, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateOverflowCues) : null
    ro?.observe(el)

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
      el.removeEventListener('scroll', updateOverflowCues)
      ro?.disconnect()
    }
  }, [])
  const gridLabel = formatGridSize(gridSize)

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

        {/* Scene (time / lighting moods / sun) is available in EVERY mode —
            Walk (experience times of day while walking) AND the room editor
            (TB-6b: RoomEditorScene mounts the full orbit render stack — sun,
            fixture lights, effects — since the graphics-globalization pass, so
            hiding Scene there stranded users who wanted to check lighting while
            furnishing; they had to exit the editor). */}
        <SceneMenu />

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
              // Grid size is a picker over GRID_SIZES, not a cycle (TB-8) — a
              // compact Select since 6 segments would crowd the icon island.
              <Select
                ariaLabel="Grid cell size"
                title="Grid cell size"
                className="input tool-select"
                value={String(gridSize)}
                onChange={(v) => setGridSize(Number(v))}
                options={GRID_SIZES.map((g) => ({
                  value: String(g),
                  label: formatGridSize(g),
                }))}
              />
            ) : null}
            <IconButton
              icon="Measure"
              label="Dimensions"
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
            {/* Lights — segmented, not a cycle button (TB-8): all 3 states are
                visible and one click away, so no next-state tooltip is needed. */}
            <div className="tool-seg" title="Lights">
              <Icon.Lights width={16} height={16} className="icn" />
              <Segmented
                ariaLabel="Lights"
                value={lightsMode}
                onChange={(v) => setLightsMode(v as LightsMode)}
                options={LIGHTS_OPTIONS}
              />
            </div>

            <Divider />
            <FileMenu />
          </>
        )}

        {/* Right cluster — graphics, appearance + help live here in every mode. */}
        <Divider />
        <IconButton
          icon="Quality"
          label={`Graphics · ${QUALITY_LABEL[qualityTier]}`}
          onClick={() => setGraphicsOpen(true)}
        />
        <AppearancePopover />
      </div>

      <GraphicsSettings open={graphicsOpen} onClose={() => setGraphicsOpen(false)} />
    </>
  )
}
