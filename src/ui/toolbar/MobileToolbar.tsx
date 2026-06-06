import { type ReactNode, useEffect, useState } from 'react'
import { ROOMS } from '../../apartment/constants'
import type { RoomId } from '../../apartment/types'
import { dropBuiltinSet, dropIkeaSet } from '../../furniture/arrangeActions'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import { buildMergedCatalog } from '../../furniture/catalog'
import { FURNITURE_SETS } from '../../furniture/furnitureSets'
import { ikeaSetRecipes } from '../../furniture/ikeaSets'
import { LAYOUT_PRESETS } from '../../furniture/layoutPresets'
import { tidyHome } from '../../layout/tidyHome'
import { applyStyle, STYLE_PRESETS } from '../../materials/stylePresets'
import { useEffectiveHour } from '../../scene/lighting/useEffectiveHour'
import { QUALITY_LABEL } from '../../scene/quality'
import { canRecord } from '../../scene/RecordController'
import { EXPORT_EVENT } from '../../scene/ScreenshotController'
import { useSunStudy } from '../../scene/sunStudy'
import { applySerialized, serialize } from '../../state/schema'
import { PRESET_HOURS, type TimePreset } from '../../state/slices/timeSlice'
import { LocalStorageAdapter } from '../../state/storage/LocalStorageAdapter'
import type { SlotMeta } from '../../state/storage/StorageAdapter'
import { captureThumb, deleteThumb, saveThumb } from '../../state/storage/slotThumbs'
import { useStore } from '../../state/store'
import { openDocs } from '../docsUrl'
import { GraphicsSettings } from '../GraphicsSettings'
import { BrandMark } from '../Logo'
import { Modal } from '../Modal'
import { buildReportHtml } from '../report'
import { AppearanceControls } from './AppearancePopover'
import { CompassModal } from './CompassModal'
import { Icon, type IconName } from './icons'

const TIME_PRESETS: TimePreset[] = ['morning', 'noon', 'dusk', 'night']
const LIGHTS_LABEL: Record<'auto' | 'on' | 'off', string> = { auto: 'Auto', on: 'On', off: 'Off' }

function formatClock(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const totalMinutes = Math.round(h * 60) % (24 * 60)
  const hh = Math.floor(totalMinutes / 60)
  const mm = totalMinutes % 60
  const period = hh < 12 ? 'AM' : 'PM'
  const display = hh % 12 === 0 ? 12 : hh % 12
  return `${display}:${String(mm).padStart(2, '0')} ${period}`
}

/** A tappable row inside an accordion section: icon + label (+ sub) + On badge. */
function Item({
  icon,
  label,
  sub,
  on,
  disabled,
  onClick,
}: {
  icon: IconName
  label: string
  sub?: string
  on?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const Glyph = Icon[icon]
  return (
    <button type="button" className="m-item" disabled={disabled} onClick={onClick}>
      <Glyph className="icn" width={18} height={18} />
      <span className="m-item-tx">
        <span className="m-item-l">{label}</span>
        {sub ? <span className="m-item-s">{sub}</span> : null}
      </span>
      {on ? <span className="m-on">On</span> : null}
    </button>
  )
}

/** A collapsible accordion section. Only the open section shows its body, so the
 *  sheet stays short — tap a header to expand, tap again (or another) to swap. */
function Section({
  id,
  title,
  icon,
  openId,
  setOpenId,
  children,
}: {
  id: string
  title: string
  icon: IconName
  openId: string | null
  setOpenId: (id: string | null) => void
  children: ReactNode
}) {
  const open = openId === id
  const Glyph = Icon[icon]
  return (
    <div className={`m-acc${open ? ' open' : ''}`}>
      <button
        type="button"
        className="m-acc-h"
        aria-expanded={open}
        onClick={() => setOpenId(open ? null : id)}
      >
        <Glyph className="icn" width={18} height={18} />
        <span className="m-acc-t">{title}</span>
        <Icon.Chevron className="m-acc-chev" width={14} height={14} />
      </button>
      {open ? <div className="m-acc-body">{children}</div> : null}
    </div>
  )
}

/** Mobile toolbar: a slim bar with just the brand (top-left) + hamburger
 *  (top-right). The hamburger opens a bottom-anchored sheet — brand + title at
 *  the top, then collapsible accordion sections covering every desktop toolbar
 *  action (incl. appearance, graphics, file), so the two are at feature parity. */
export function MobileToolbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [graphicsOpen, setGraphicsOpen] = useState(false)
  const [compassOpen, setCompassOpen] = useState(false)
  const [sunStudy, setSunStudy] = useState(false)
  const [slots, setSlots] = useState<SlotMeta[]>([])
  useSunStudy(sunStudy)

  // Refresh the saved-layout list whenever the sheet opens.
  useEffect(() => {
    if (menuOpen) void LocalStorageAdapter.list().then(setSlots)
  }, [menuOpen])

  const s = useStore
  const cameraMode = useStore((st) => st.cameraMode)
  const catalogOpen = useStore((st) => st.catalogOpen)
  const leftMode = useStore((st) => st.leftMode)
  const showMeasurements = useStore((st) => st.showMeasurements)
  const budgetOpen = useStore((st) => st.budgetOpen)
  const versionsOpen = useStore((st) => st.versionsOpen)
  const clearancePanelOpen = useStore((st) => st.clearancePanelOpen)
  const editorTool = useStore((st) => st.editorTool)
  const snapEnabled = useStore((st) => st.snapEnabled)
  const gridSize = useStore((st) => st.gridSize)
  const autoRotate = useStore((st) => st.autoRotate)
  const timeMode = useStore((st) => st.timeMode)
  const manualHour = useStore((st) => st.manualHour)
  const lightsMode = useStore((st) => st.lightsMode)
  const canUndo = useStore((st) => st.past.length > 0)
  const canRedo = useStore((st) => st.future.length > 0)
  const recording = useStore((st) => st.recording)
  const touring = useStore((st) => st.touring)
  const qualityTier = useStore((st) => st.qualityTier)
  const userStyles = useStore((st) => st.userStyles)
  const roomEditorActive = useStore((st) => st.roomEditor.active)
  const roomEditorRoomId = useStore((st) => st.roomEditor.roomId)
  const savedViews = useStore((st) => st.savedViews)
  const setHelpOpen = useStore((st) => st.setHelpOpen)
  const appearanceOpen = useStore((st) => st.appearanceOpen)
  const setAppearanceOpen = useStore((st) => st.setAppearanceOpen)
  const effectiveHour = useEffectiveHour()
  const recipes = ikeaSetRecipes()

  const close = () => setMenuOpen(false)
  // Most actions dismiss the sheet; pass {keep:true} for in-place toggles.
  const act = (fn: () => void, opts?: { keep?: boolean }) => () => {
    fn()
    if (!opts?.keep) close()
  }

  const gridLabel = gridSize >= 1 ? `${gridSize} m` : `${Math.round(gridSize * 100)} cm`
  const editableRooms = Object.values(ROOMS).filter((r) => !r.external)
  const defaultEditRoomId = editableRooms[0]?.id

  // Mutually-exclusive .aux panels (budget / checks / versions).
  const closeAux = () => {
    const st = s.getState()
    if (st.budgetOpen) st.toggleBudget()
    st.setClearancePanelOpen(false)
    st.setVersionsOpen(false)
  }
  const openBudget = () => {
    const wasOpen = s.getState().budgetOpen
    closeAux()
    if (!wasOpen) s.getState().toggleBudget()
  }
  const toggleChecks = () => {
    const st = s.getState()
    const next = !st.clearancePanelOpen
    closeAux()
    st.setClearancePanelOpen(next)
    if (next && !st.clearanceOn) st.toggleClearance()
  }
  const openVersions = () => {
    const wasOpen = s.getState().versionsOpen
    closeAux()
    s.getState().setVersionsOpen(!wasOpen)
  }

  const startWalkthrough = () => {
    const st = s.getState()
    if (st.touring) {
      st.setTouring(false)
      if (st.recording) st.setRecording(false)
      return
    }
    st.setCameraMode('orbit')
    if (canRecord()) st.setRecording(true)
    st.setTouring(true)
  }

  const openReport = () => {
    const st = s.getState()
    const canvas = document.querySelector('canvas')
    let hero: string | null = null
    try {
      hero = canvas ? canvas.toDataURL('image/png') : null
    } catch {
      hero = null
    }
    const html = buildReportHtml(st.floorPlan, st.items, buildMergedCatalog(st), hero)
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 400)
  }

  const refreshSlots = () => void LocalStorageAdapter.list().then(setSlots)
  const saveLayout = async () => {
    const name = prompt('Save layout as…')
    if (!name) return
    const slot = name.trim().replace(/\s+/g, '-').toLowerCase()
    if (!slot) return
    try {
      await LocalStorageAdapter.save(slot, serialize(s.getState()))
      saveThumb(slot, captureThumb())
      refreshSlots()
    } catch (e) {
      alert(`Could not save: ${(e as Error).message}`)
    }
  }
  const loadLayout = async (slot: string) => {
    const data = await LocalStorageAdapter.load(slot).catch(() => null)
    if (!data) {
      alert(`Could not load slot ${slot}`)
      return
    }
    const userIds = s.getState().userFurniture.map((d) => d.id)
    const known = new Set([...Object.keys(BUILTIN_CATALOG), ...userIds])
    s.setState(applySerialized(data, known))
  }
  const deleteLayout = async (slot: string) => {
    await LocalStorageAdapter.delete(slot)
    deleteThumb(slot)
    refreshSlots()
  }

  const sectionProps = { openId, setOpenId }

  return (
    <>
      <div className={`toolbar mobilebar${roomEditorActive ? ' editing-room' : ''}`}>
        <div className="brand-dot" title="Sofa So Good">
          <BrandMark size={20} />
        </div>
        {roomEditorActive ? (
          <>
            <select
              className="input m-room-select"
              aria-label="Room to edit"
              value={roomEditorRoomId ?? ''}
              onChange={(e) => s.getState().enterRoomEditor(e.target.value as RoomId)}
            >
              {editableRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="tool-btn"
              aria-label="Exit room editor"
              onClick={() => s.getState().exitRoomEditor()}
            >
              <Icon.Close width={18} height={18} />
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="tool-btn m-menu-btn"
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <Icon.Menu />
        </button>
      </div>

      {menuOpen ? (
        <div className="m-menu-overlay" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="m-sheet">
            <div className="m-sheet-grab" />
            <div className="m-sheet-head">
              <div className="m-sheet-brand">
                <span className="brand-dot" title="Sofa So Good">
                  <BrandMark size={20} />
                </span>
                <span className="panel-title">Sofa So Good</span>
              </div>
              <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
                <Icon.Close width={16} height={16} />
              </button>
            </div>
            <div className="m-sheet-body">
              {/* Camera */}
              <Section id="camera" title="Camera" icon="Orbit" {...sectionProps}>
                <Item
                  icon="Orbit"
                  label="Orbit"
                  on={cameraMode === 'orbit'}
                  onClick={act(() => s.getState().setCameraMode('orbit'))}
                />
                <Item
                  icon="Walk"
                  label="Walk through"
                  on={cameraMode === 'firstPerson'}
                  onClick={act(() => s.getState().setCameraMode('firstPerson'))}
                />
              </Section>

              {/* View */}
              <Section id="view" title="View" icon="TopView" {...sectionProps}>
                <Item
                  icon="TopView"
                  label="Top view"
                  onClick={act(() => s.getState().requestTopView())}
                />
                <Item
                  icon="Home"
                  label="Reset view"
                  onClick={act(() => s.getState().requestHomeView())}
                />
                <Item
                  icon="Turntable"
                  label="Turntable"
                  sub="Slowly auto-orbit"
                  on={autoRotate}
                  onClick={act(() => s.getState().toggleAutoRotate(), { keep: true })}
                />
                {!roomEditorActive && defaultEditRoomId ? (
                  <Item
                    icon="FloorPlan"
                    label="Edit a room"
                    sub="Isolate a room to plan — pick which from the header"
                    onClick={act(() => s.getState().enterRoomEditor(defaultEditRoomId))}
                  />
                ) : null}
                <Item
                  icon="Plus"
                  label="Save current view"
                  sub="Bookmark this camera angle"
                  onClick={act(() => {
                    const name = window.prompt('Name this view', `View ${savedViews.length + 1}`)
                    if (name !== null) s.getState().saveCurrentView(name)
                  })}
                />
                {savedViews.map((v) => (
                  <div key={v.id} className="m-saved-view">
                    <button
                      type="button"
                      className="m-item m-saved-view-go"
                      onClick={act(() => s.getState().applyView(v.id))}
                    >
                      <Icon.Eye className="icn" width={18} height={18} />
                      <span className="m-item-tx">
                        <span className="m-item-l">{v.name}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="m-saved-view-del"
                      aria-label={`Delete view ${v.name}`}
                      onClick={() => s.getState().deleteView(v.id)}
                    >
                      <Icon.Trash width={16} height={16} />
                    </button>
                  </div>
                ))}
              </Section>

              {/* Scene */}
              {!roomEditorActive ? (
                <Section id="scene" title="Scene" icon="Time" {...sectionProps}>
                  <Item
                    icon="Time"
                    label="System time"
                    sub={formatClock(effectiveHour)}
                    on={timeMode === 'system'}
                    onClick={act(() => s.getState().setTimeMode('system'), { keep: true })}
                  />
                  {TIME_PRESETS.map((p) => (
                    <Item
                      key={p}
                      icon="Sun"
                      label={p[0].toUpperCase() + p.slice(1)}
                      sub={formatClock(PRESET_HOURS[p])}
                      on={timeMode === 'manual' && manualHour === PRESET_HOURS[p]}
                      onClick={act(() => s.getState().setPresetTime(p), { keep: true })}
                    />
                  ))}
                  <Item
                    icon="Sun"
                    label="Sun direction"
                    onClick={act(() => setCompassOpen(true))}
                  />
                  <Item
                    icon="Lights"
                    label={`Lights: ${LIGHTS_LABEL[lightsMode]}`}
                    on={lightsMode !== 'auto'}
                    onClick={act(() => s.getState().cycleLightsMode(), { keep: true })}
                  />
                </Section>
              ) : null}

              {/* Edit */}
              <Section id="edit" title="Edit" icon="Select" {...sectionProps}>
                <Item
                  icon={editorTool === 'select' ? 'Select' : 'Rotate'}
                  label={`Tool: ${editorTool === 'select' ? 'Select' : 'Rotate'}`}
                  on={editorTool === 'select'}
                  onClick={act(
                    () => s.getState().setEditorTool(editorTool === 'select' ? 'orbit' : 'select'),
                    { keep: true },
                  )}
                />
                <Item
                  icon="Undo"
                  label="Undo"
                  disabled={!canUndo}
                  onClick={act(() => s.getState().undo(), { keep: true })}
                />
                <Item
                  icon="Redo"
                  label="Redo"
                  disabled={!canRedo}
                  onClick={act(() => s.getState().redo(), { keep: true })}
                />
                <Item
                  icon="Snap"
                  label={`Snap to grid · ${gridLabel}`}
                  on={snapEnabled}
                  onClick={act(() => s.getState().toggleSnap(), { keep: true })}
                />
                {snapEnabled ? (
                  <Item
                    icon="Snap"
                    label={`Grid size · ${gridLabel}`}
                    sub="Tap to cycle"
                    onClick={act(() => s.getState().cycleGridSize(), { keep: true })}
                  />
                ) : null}
                <Item
                  icon="Measure"
                  label="Measurements"
                  on={showMeasurements}
                  onClick={act(() => s.getState().toggleMeasurements(), { keep: true })}
                />
              </Section>

              {/* Design */}
              <Section id="design" title="Design" icon="Catalog" {...sectionProps}>
                <Item
                  icon="Catalog"
                  label="Catalog"
                  on={catalogOpen && leftMode === 'catalog'}
                  onClick={act(() => {
                    s.getState().setLeftMode('catalog')
                    s.getState().setCatalogOpen(true)
                  })}
                />
                <Item
                  icon="Layers"
                  label="Objects / Layers"
                  on={catalogOpen && leftMode === 'layers'}
                  onClick={act(() => {
                    s.getState().setLeftMode('layers')
                    s.getState().setCatalogOpen(true)
                  })}
                />
                <Item
                  icon="Presets"
                  label="Smart Start…"
                  sub="Furnish every room"
                  onClick={act(() => s.getState().setSmartStartOpen(true))}
                />
                <Item
                  icon="Tidy"
                  label="Tidy home"
                  sub="Auto-arrange every room"
                  onClick={act(tidyHome)}
                />
                <Item
                  icon="FloorPlan"
                  label="Floor plan editor"
                  onClick={act(() => s.getState().setFloorPlanEditing(true))}
                />
              </Section>

              {/* Arrange — sets / presets / styles */}
              <Section id="arrange" title="Arrange" icon="Sets" {...sectionProps}>
                <div className="m-sub-h">Sets</div>
                {FURNITURE_SETS.map((set) => (
                  <Item
                    key={set.id}
                    icon="Sets"
                    label={set.name}
                    onClick={act(() => dropBuiltinSet(set.id))}
                  />
                ))}
                {recipes.map((r) => (
                  <Item
                    key={r.setKey}
                    icon="Sets"
                    label={r.setName}
                    sub="IKEA set"
                    onClick={act(() => dropIkeaSet(r.setKey))}
                  />
                ))}
                <div className="m-sub-h">Presets</div>
                {LAYOUT_PRESETS.map((p) => (
                  <Item
                    key={p.id}
                    icon="Presets"
                    label={p.name}
                    sub={p.description}
                    onClick={act(() => s.getState().applyLayoutPreset(p.id))}
                  />
                ))}
                <div className="m-sub-h">Style</div>
                {STYLE_PRESETS.map((p) => (
                  <Item
                    key={p.id}
                    icon="Style"
                    label={p.name}
                    onClick={act(() =>
                      applyStyle(p, s.getState().setFloorFinish, s.getState().setWallFinish),
                    )}
                  />
                ))}
                <div className="m-sub-h">My styles</div>
                <Item
                  icon="Style"
                  label="Save current style…"
                  onClick={act(() => {
                    const name = window.prompt(
                      'Name this style:',
                      `My style ${userStyles.length + 1}`,
                    )
                    if (name !== null) s.getState().saveCurrentStyle(name)
                  })}
                />
                {userStyles.map((st) => (
                  <Item
                    key={st.id}
                    icon="Style"
                    label={st.name}
                    onClick={act(() => s.getState().applyUserStyle(st.id))}
                  />
                ))}
              </Section>

              {/* Tools */}
              <Section id="tools" title="Tools" icon="Tools" {...sectionProps}>
                <Item
                  icon="Budget"
                  label="Budget / shopping"
                  on={budgetOpen}
                  onClick={act(openBudget)}
                />
                <Item
                  icon="Checks"
                  label="Clearance checks"
                  on={clearancePanelOpen}
                  onClick={act(toggleChecks)}
                />
                <Item
                  icon="Versions"
                  label="Versions"
                  on={versionsOpen}
                  onClick={act(openVersions)}
                />
                <Item
                  icon="Share"
                  label="Share & export"
                  onClick={act(() => s.getState().setShareOpen(true))}
                />
                {!roomEditorActive ? (
                  <>
                    <Item
                      icon="SunStudy"
                      label="Sun study"
                      sub="Time-lapse dawn → dusk"
                      on={sunStudy}
                      onClick={act(() => setSunStudy((v) => !v), { keep: true })}
                    />
                    <Item
                      icon="Walkthrough"
                      label={touring ? 'Stop tour' : 'Walkthrough'}
                      on={touring}
                      onClick={act(startWalkthrough)}
                    />
                    <Item
                      icon="Report"
                      label="Report"
                      sub="Printable design report"
                      onClick={act(openReport)}
                    />
                  </>
                ) : null}
              </Section>

              {/* Graphics */}
              <Section id="graphics" title="Graphics" icon="Quality" {...sectionProps}>
                <Item
                  icon="Quality"
                  label={`Graphics — ${QUALITY_LABEL[qualityTier]}`}
                  sub="Render & asset quality"
                  onClick={act(() => setGraphicsOpen(true))}
                />
              </Section>

              {/* File */}
              <Section id="file" title="File" icon="Save" {...sectionProps}>
                <Item
                  icon="Save"
                  label="Save…"
                  sub="Store the current layout"
                  onClick={act(saveLayout)}
                />
                <Item
                  icon="Export"
                  label="Export PNG"
                  onClick={act(() => window.dispatchEvent(new Event(EXPORT_EVENT)))}
                />
                {canRecord() ? (
                  <Item
                    icon="Record"
                    label={recording ? 'Stop recording' : 'Record clip'}
                    on={recording}
                    onClick={act(() => s.getState().setRecording(!recording), { keep: true })}
                  />
                ) : null}
                <Item
                  icon="Reset"
                  label="Reset to default"
                  onClick={act(() => {
                    if (confirm('Reset to floor-plan default? Your current layout will be lost.'))
                      s.getState().resetToDefault()
                  })}
                />
                <Item
                  icon="Reset"
                  label="Clear all furniture"
                  onClick={act(() => {
                    if (confirm('Clear all furniture? This cannot be undone.'))
                      s.getState().resetToEmpty()
                  })}
                />
                <div className="m-sub-h">Saved layouts</div>
                {slots.length === 0 ? (
                  <div className="m-empty">No saved layouts.</div>
                ) : (
                  slots
                    .slice()
                    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
                    .map((slot) => (
                      <div className="m-slot" key={slot.slot}>
                        <button
                          type="button"
                          className="m-slot-load"
                          onClick={act(() => void loadLayout(slot.slot))}
                        >
                          <Icon.Load className="icn" width={18} height={18} />
                          <span className="m-item-tx">
                            <span className="m-item-l">{slot.slot}</span>
                            <span className="m-item-s">
                              {new Date(slot.savedAt).toLocaleString()}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="m-slot-del"
                          aria-label={`Delete ${slot.slot}`}
                          onClick={() => void deleteLayout(slot.slot)}
                        >
                          <Icon.Trash width={15} height={15} />
                        </button>
                      </div>
                    ))
                )}
              </Section>

              {/* Appearance & help */}
              <Section id="appearance" title="Appearance & help" icon="Palette" {...sectionProps}>
                <Item
                  icon="Palette"
                  label="Theme & appearance"
                  sub="Colour theme, light / dark"
                  onClick={act(() => setAppearanceOpen(true))}
                />
                <Item icon="Book" label="User guide" onClick={act(openDocs)} />
                <Item icon="Help" label="Help" onClick={act(() => setHelpOpen(true))} />
              </Section>
            </div>
          </div>
        </div>
      ) : null}

      <GraphicsSettings open={graphicsOpen} onClose={() => setGraphicsOpen(false)} />
      <CompassModal open={compassOpen} onClose={() => setCompassOpen(false)} />
      <Modal
        open={appearanceOpen}
        onClose={() => setAppearanceOpen(false)}
        title="Appearance"
        width={320}
      >
        <AppearanceControls />
      </Modal>
    </>
  )
}
