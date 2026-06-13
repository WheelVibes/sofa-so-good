import { type ReactNode, useEffect, useState } from 'react'
import { useFeature } from '../../features/useFeature'
import { isMultiLevel, planLevels } from '../../floorplan/levels'
import { dropBuiltinSet, dropIkeaSet, dropUserSet } from '../../furniture/arrangeActions'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import { FURNITURE_SETS } from '../../furniture/furnitureSets'
import { ikeaSetRecipes } from '../../furniture/ikeaSets'
import { LAYOUT_PRESETS } from '../../furniture/layoutPresets'
import { tidyHome } from '../../layout/tidyHome'
import { applyStyle, STYLE_PRESETS } from '../../materials/stylePresets'
import { QUALITY_LABEL } from '../../scene/quality'
import { canRecord } from '../../scene/RecordController'
import { applyRenderPreset, RENDER_PRESETS } from '../../scene/renderPresets'
import { type BackdropKind, visibleBackdrops } from '../../scene/SceneBackdrop'
import { EXPORT_EVENT } from '../../scene/ScreenshotController'
import { useSunStudy } from '../../scene/sunStudy'
import { detectVrSupport } from '../../scene/xr/vrSupport'
import { enterVr, getXrStore } from '../../scene/xr/xrStore'
import { firstEditableRoomId } from '../../state/rooms'
import { applySerialized, serialize } from '../../state/schema'
import { PRESET_HOURS } from '../../state/slices/timeSlice'
import { LocalStorageAdapter } from '../../state/storage/LocalStorageAdapter'
import type { SlotMeta } from '../../state/storage/StorageAdapter'
import { captureThumb, deleteThumb, saveThumb } from '../../state/storage/slotThumbs'
import { useStore } from '../../state/store'
import { closeAllAuxPanels } from '../auxPanels'
import { openDocs } from '../docsUrl'
import { GraphicsSettings } from '../GraphicsSettings'
import { BrandMark } from '../Logo'
import { Modal } from '../Modal'
import { downloadFurnitureCsv } from '../openFurnitureCsv'
import { downloadPlanSvg } from '../openPlanSvg'
import { openDesignReport } from '../openReport'
import { openShoppingList } from '../openShoplist'
import { PresentationSetup } from '../presentation/PresentationSetup'
import { TimeOfDaySlider } from '../scene/TimeOfDaySlider'
import { AppearanceControls } from './AppearancePopover'
import { CompassModal } from './CompassModal'
import { Icon, type IconName } from './icons'
import { RoomSwitcher } from './RoomSwitcher'

const LIGHTS_LABEL: Record<'auto' | 'on' | 'off', string> = { auto: 'Auto', on: 'On', off: 'Off' }

/** A tappable row inside an accordion section: icon + label (+ sub) + On badge.
 *  `tourId` tags the row with `data-tour` so the product tour can spotlight it. */
function Item({
  icon,
  label,
  sub,
  on,
  disabled,
  tourId,
  onClick,
}: {
  icon: IconName
  label: string
  sub?: string
  on?: boolean
  disabled?: boolean
  tourId?: string
  onClick: () => void
}) {
  const Glyph = Icon[icon]
  return (
    <button
      type="button"
      className="m-item"
      data-tour={tourId}
      disabled={disabled}
      onClick={onClick}
    >
      <Glyph className="icn" width={18} height={18} />
      <span className="m-item-tx">
        <span className="m-item-l">{label}</span>
        {sub ? <span className="m-item-s">{sub}</span> : null}
      </span>
      {on ? <span className="m-on">On</span> : null}
    </button>
  )
}

/** One section of the mobile menu, rendered in the detail pane. The icon-only
 *  left rail picks the active section (master-detail); the body shows here under
 *  a sticky title only when its section is selected. `icon` is consumed by the
 *  rail, not here. */
function Section({
  id,
  title,
  activeId,
  children,
}: {
  id: string
  title: string
  icon: IconName
  activeId: string
  children: ReactNode
}) {
  if (activeId !== id) return null
  return (
    <div className="m-detail-sec">
      <div className="m-detail-h">{title}</div>
      {children}
    </div>
  )
}

/** Mobile toolbar: a slim bar with just the brand (top-left) + hamburger
 *  (top-right). The hamburger opens a bottom-anchored sheet — brand + title at
 *  the top, then collapsible accordion sections covering every desktop toolbar
 *  action (incl. appearance, graphics, file), so the two are at feature parity. */
export function MobileToolbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeId, setActiveId] = useState<string>('view')
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
  const viewLevelId = useStore((st) => st.viewLevelId)
  const mobilePlan = useStore((st) => st.floorPlan)
  const catalogOpen = useStore((st) => st.catalogOpen)
  const leftMode = useStore((st) => st.leftMode)
  const showMeasurements = useStore((st) => st.showMeasurements)
  const tapeMode = useStore((st) => st.tapeMode)
  const budgetOpen = useStore((st) => st.budgetOpen)
  const versionsOpen = useStore((st) => st.versionsOpen)
  const historyOpen = useStore((st) => st.historyOpen)
  const clearancePanelOpen = useStore((st) => st.clearancePanelOpen)
  const elevationsOpen = useStore((st) => st.elevationsOpen)
  const daylightOpen = useStore((st) => st.daylightOpen)
  const designScoreOpen = useStore((st) => st.designScoreOpen)
  const accessibilityOpen = useStore((st) => st.accessibilityOpen)
  const commentsOpen = useStore((st) => st.commentsOpen)
  const snapEnabled = useStore((st) => st.snapEnabled)
  const gridSize = useStore((st) => st.gridSize)
  const autoRotate = useStore((st) => st.autoRotate)
  const lightsMode = useStore((st) => st.lightsMode)
  const showCeilingFixtures = useStore((st) => st.showCeilingFixtures)
  const wallRevealMode = useStore((st) => st.wallRevealMode)
  const timeMode = useStore((st) => st.timeMode)
  const manualHour = useStore((st) => st.manualHour)
  const toneMapping = useStore((st) => st.toneMapping)
  const exposure = useStore((st) => st.exposure)
  const backdrop = useStore((st) => st.backdrop)
  const proMode = useStore((st) => st.uiMode === 'pro')
  const canUndo = useStore((st) => st.past.length > 0)
  const canRedo = useStore((st) => st.future.length > 0)
  const recording = useStore((st) => st.recording)
  const touring = useStore((st) => st.touring)
  const qualityTier = useStore((st) => st.qualityTier)
  const userStyles = useStore((st) => st.userStyles)
  const roomEditorActive = useStore((st) => st.roomEditor.active)
  const floorPlanForRooms = useStore((st) => st.floorPlan)
  const savedViews = useStore((st) => st.savedViews)
  const startTour = useStore((st) => st.startTour)
  const appearanceOpen = useStore((st) => st.appearanceOpen)
  const setAppearanceOpen = useStore((st) => st.setAppearanceOpen)
  const currentUser = useStore((st) => st.currentUser)
  const recipes = ikeaSetRecipes()

  // Feature flags — keep the mobile sheet at parity with the desktop menus / ⌘K,
  // so a disabled feature can't be reached from any surface.
  const fSavedViews = useFeature('savedViews')
  const fPresentation = useFeature('presentation')
  const fFloorPlan = useFeature('floorPlanEditor')
  const fBackdrops = useFeature('backdrops')
  const flags = useStore((st) => st.featureFlags)
  const fSmartStart = useFeature('smartStart')
  const fParametric = useFeature('parametricFurniture')
  const fPanorama = useFeature('panorama')
  const fPanoTour = useFeature('panoTour')
  const fRenderPresets = useFeature('renderPresets')
  const fHqRender = useFeature('hqRender')
  const fRenderCompare = useFeature('renderCompare')
  const fVr = useFeature('vrWalkthrough')
  const [vrSupported, setVrSupported] = useState(false)
  useEffect(() => {
    if (!fVr) return
    let on = true
    void detectVrSupport().then((ok) => {
      if (!on || !ok) return
      setVrSupported(true)
      void getXrStore()
    })
    return () => {
      on = false
    }
  }, [fVr])
  const fBudget = useFeature('budget')
  const fChecks = useFeature('clearanceChecks')
  const fMeasure = useFeature('measure')
  const fHistory = useFeature('history')
  const fVersions = useFeature('versions')
  const fShare = useFeature('shareExport')
  const fSun = useFeature('sunStudy')
  const fWalk = useFeature('walkthrough')
  const fReport = useFeature('report')
  const fDrawings = useFeature('drawings')
  const fDaylight = useFeature('daylight')
  const fDesignScore = useFeature('designScore')
  const fAccessibility = useFeature('accessibility')
  const fComments = useFeature('comments')
  const fUserSets = useFeature('userSets')
  const fShopExport = useFeature('shopExport')
  const fDxf = useFeature('dxfExport')
  const userSets = useStore((st) => st.userSets)

  // Detect which render preset (if any) matches current state for the dropdown.
  const activePresetId = (() => {
    if (timeMode !== 'manual') return 'none'
    for (const p of RENDER_PRESETS) {
      if (
        Math.abs(manualHour - PRESET_HOURS[p.time]) < 0.01 &&
        lightsMode === p.lights &&
        toneMapping === p.toneMapping &&
        Math.abs(exposure - p.exposure) < 0.01
      ) {
        return p.id
      }
    }
    return 'none'
  })()

  const close = () => setMenuOpen(false)
  // Most actions dismiss the sheet; pass {keep:true} for in-place toggles.
  const act = (fn: () => void, opts?: { keep?: boolean }) => () => {
    fn()
    if (!opts?.keep) close()
  }

  const gridLabel = gridSize >= 1 ? `${gridSize} m` : `${Math.round(gridSize * 100)} cm`
  // The room the "Edit a room" entry dives into — first editable room of the
  // active plan (default apartment or a custom plan's own rooms).
  const defaultEditRoomId = firstEditableRoomId(floorPlanForRooms)

  // Mutually-exclusive .aux panels — shared helper (covers budget / checks /
  // elevations / daylight / design-score / accessibility / versions / history).
  const closeAux = () => closeAllAuxPanels(s.getState())
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
  // Analysis / drawing panels — same mutual-exclusion as desktop (B3 parity).
  const toggleElevations = () => {
    const wasOpen = s.getState().elevationsOpen
    closeAux()
    s.getState().setElevationsOpen(!wasOpen)
  }
  const toggleDaylight = () => {
    const wasOpen = s.getState().daylightOpen
    closeAux()
    s.getState().setDaylightOpen(!wasOpen)
  }
  const toggleDesignScore = () => {
    const wasOpen = s.getState().designScoreOpen
    closeAux()
    s.getState().setDesignScoreOpen(!wasOpen)
  }
  const toggleAccessibility = () => {
    const wasOpen = s.getState().accessibilityOpen
    closeAux()
    s.getState().setAccessibilityOpen(!wasOpen)
  }
  const openHistory = () => {
    const wasOpen = s.getState().historyOpen
    closeAux()
    s.getState().setHistoryOpen(!wasOpen)
  }
  const toggleComments = () => {
    const wasOpen = s.getState().commentsOpen
    closeAux()
    s.getState().setCommentsOpen(!wasOpen)
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

  const openReport = () => openDesignReport()

  const refreshSlots = () => void LocalStorageAdapter.list().then(setSlots)
  const saveLayout = async () => {
    const name = await s.getState().promptText({
      title: 'Save layout',
      label: 'Name this layout',
      placeholder: 'e.g. Living room v2',
      submitLabel: 'Save',
    })
    if (!name) return
    const slot = name.trim().replace(/\s+/g, '-').toLowerCase()
    if (!slot) return
    try {
      await LocalStorageAdapter.save(slot, serialize(s.getState()))
      saveThumb(slot, captureThumb())
      refreshSlots()
      s.getState().notify.start({ title: `Saved layout “${slot}”`, kind: 'success' })
    } catch (e) {
      s.getState().notify.start({ title: `Could not save: ${(e as Error).message}`, kind: 'error' })
    }
  }
  const loadLayout = async (slot: string) => {
    const data = await LocalStorageAdapter.load(slot).catch(() => null)
    if (!data) {
      s.getState().notify.start({ title: `Could not load slot ${slot}`, kind: 'error' })
      return
    }
    const userIds = s.getState().userFurniture.map((d) => d.id)
    const known = new Set([...Object.keys(BUILTIN_CATALOG), ...userIds])
    s.setState(applySerialized(data, known))
    // Loading replaces the world; clear undo history so Ctrl+Z can't cross into
    // the previous design (consistent with import / version restore).
    s.getState().clearHistory?.()
    s.getState().requestHomeView()
    s.getState().notify.start({ title: `Loaded “${slot}”`, kind: 'success' })
  }
  const deleteLayout = async (slot: string) => {
    await LocalStorageAdapter.delete(slot)
    deleteThumb(slot)
    refreshSlots()
  }

  // Left-rail sections for the current mode (icon-only master rail; the matching
  // <Section> renders its body in the detail pane). The ids/icons/titles must
  // stay in lockstep with the <Section> blocks below.
  const railItems: { id: string; icon: IconName; title: string }[] = [
    { id: 'view', icon: 'Orbit', title: 'View' },
    ...(roomEditorActive
      ? ([
          { id: 'edit', icon: 'Select', title: 'Edit' },
          { id: 'design', icon: 'Catalog', title: 'Design' },
          { id: 'arrange', icon: 'Sets', title: 'Arrange' },
        ] as { id: string; icon: IconName; title: string }[])
      : ([
          { id: 'edit-home', icon: 'Cube', title: 'Edit' },
          { id: 'scene', icon: 'Time', title: 'Scene' },
        ] as { id: string; icon: IconName; title: string }[])),
    ...(proMode
      ? ([{ id: 'tools', icon: 'Tools', title: 'Tools' }] as {
          id: string
          icon: IconName
          title: string
        }[])
      : []),
    { id: 'file', icon: 'Save', title: 'File' },
    { id: 'appearance', icon: 'Palette', title: 'Appearance & help' },
  ]
  // Resolve the shown section: keep the user's pick if it still exists in this
  // mode, else fall back to the first (View) — so switching mode never blanks the
  // detail pane.
  const shownId = railItems.some((r) => r.id === activeId) ? activeId : railItems[0].id
  const sectionProps = { activeId: shownId }

  return (
    <>
      <div className={`toolbar mobilebar${roomEditorActive ? ' editing-room' : ''}`}>
        <div className="brand-dot" title="Sofa So Good">
          <BrandMark size={20} />
        </div>
        {roomEditorActive ? (
          <>
            <RoomSwitcher className="input m-room-select" />
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
            <div className="m-sheet-panes">
              {/* Icon-only master rail: pick a section; its items show in the
                  detail pane on the right. */}
              <div className="m-rail" role="tablist" aria-label="Menu sections">
                {railItems.map((r) => {
                  const Glyph = Icon[r.icon]
                  const on = shownId === r.id
                  return (
                    <button
                      type="button"
                      key={r.id}
                      className={`m-rail-btn${on ? ' on' : ''}`}
                      data-tour-section={r.id}
                      role="tab"
                      aria-selected={on}
                      aria-current={on ? 'true' : undefined}
                      aria-label={r.title}
                      onClick={() => setActiveId(r.id)}
                    >
                      <Glyph className="icn" width={22} height={22} />
                    </button>
                  )
                })}
              </div>
              <div className="m-detail">
                {/* View — combined camera + framing (mirrors the desktop View menu).
                  Orbit/Walk always; top/reset/turntable/saved only in the
                  overview (the room editor frames its own room). */}
                <Section id="view" title="View" icon="Orbit" {...sectionProps}>
                  <div className="m-sub-h">Camera</div>
                  <Item
                    icon="Orbit"
                    label="Orbit"
                    sub="Look around the model"
                    on={cameraMode === 'orbit'}
                    onClick={act(() => s.getState().setCameraMode('orbit'))}
                  />
                  <Item
                    icon="Walk"
                    label="Walk through"
                    sub="First-person walkthrough"
                    on={cameraMode === 'firstPerson'}
                    onClick={act(() => s.getState().setCameraMode('firstPerson'))}
                  />
                  {fVr && vrSupported ? (
                    <Item
                      icon="Walk"
                      label="Enter VR"
                      sub="Immersive walkthrough on your headset"
                      onClick={act(() => {
                        s.getState().setVrActive(true)
                        void enterVr()
                      })}
                    />
                  ) : null}
                  {isMultiLevel(mobilePlan) ? (
                    <>
                      <div className="m-sub-h">Levels</div>
                      <Item
                        icon="Orbit"
                        label="All levels"
                        on={viewLevelId === 'all'}
                        onClick={act(() => s.getState().setViewLevel('all'), { keep: true })}
                      />
                      {planLevels(mobilePlan).map((l) => (
                        <Item
                          key={l.id}
                          icon="Orbit"
                          label={l.name}
                          // Walk mode: picking a storey teleports the walker (ML6c).
                          sub={cameraMode === 'firstPerson' ? 'Walk this storey' : undefined}
                          on={viewLevelId === l.id}
                          onClick={act(() => s.getState().setViewLevel(l.id), { keep: true })}
                        />
                      ))}
                    </>
                  ) : null}
                  {!roomEditorActive ? (
                    <>
                      <div className="m-sub-h">Framing</div>
                      <Item
                        icon="TopView"
                        label="Top view"
                        sub="Fit the whole flat, top-down"
                        onClick={act(() => s.getState().requestTopView())}
                      />
                      <Item
                        icon="Home"
                        label="Reset view"
                        sub="Fit the 3D overview"
                        onClick={act(() => s.getState().requestHomeView())}
                      />
                      <Item
                        icon="Turntable"
                        label="Turntable"
                        sub="Slowly auto-orbit"
                        on={autoRotate}
                        onClick={act(() => s.getState().toggleAutoRotate(), { keep: true })}
                      />
                      {fSavedViews ? (
                        <Item
                          icon="Plus"
                          label="Save current view"
                          sub="Bookmark this camera angle"
                          onClick={act(async () => {
                            const thumb = captureThumb()
                            const name = await s.getState().promptText({
                              title: 'Save camera view',
                              label: 'Name this view',
                              defaultValue: `View ${savedViews.length + 1}`,
                              submitLabel: 'Save',
                            })
                            if (name) s.getState().saveCurrentView(name, thumb)
                          })}
                        />
                      ) : null}
                      {fSavedViews && savedViews.length > 0 ? (
                        fPresentation && fPanoTour ? (
                          <PresentationSetup />
                        ) : fPresentation ? (
                          <Item
                            icon="Walkthrough"
                            label="Present"
                            sub="Full-screen saved-views slideshow"
                            onClick={act(() => s.getState().setPresenting(true))}
                          />
                        ) : null
                      ) : null}
                      {fSavedViews && savedViews.length > 1 ? (
                        <Item
                          icon="Walkthrough"
                          label="Cinematic tour"
                          sub="Fly through your saved views"
                          onClick={act(() => s.getState().setTouring('views'))}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {!roomEditorActive &&
                    fSavedViews &&
                    savedViews.map((v) => (
                      <div key={v.id} className="m-saved-view">
                        <button
                          type="button"
                          className="m-item m-saved-view-go"
                          onClick={act(() => s.getState().applyView(v.id))}
                        >
                          {v.thumb ? (
                            <img src={v.thumb} alt="" className="saved-view-thumb" />
                          ) : (
                            <Icon.Eye className="icn" width={18} height={18} />
                          )}
                          <span className="m-item-tx">
                            <span className="m-item-l">{v.name}</span>
                          </span>
                        </button>
                        {fPresentation ? (
                          <button
                            type="button"
                            className="m-saved-view-del"
                            aria-label={`Present ${v.name} as a 360° slide`}
                            aria-pressed={!!v.pano}
                            style={v.pano ? { color: 'var(--accent)' } : undefined}
                            onClick={() => s.getState().setViewPano(v.id, !v.pano)}
                          >
                            <span style={{ fontSize: 10, fontWeight: 700 }}>360°</span>
                          </button>
                        ) : null}
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

                {/* Edit — step into a room / reshape the floor plan (overview only). */}
                {!roomEditorActive ? (
                  <Section id="edit-home" title="Edit" icon="Cube" {...sectionProps}>
                    {defaultEditRoomId ? (
                      <Item
                        icon="Cube"
                        label="Edit a room"
                        sub="Furnish + finish a room — pick which from the header"
                        tourId="edit-room"
                        onClick={act(() => s.getState().enterRoomEditor(defaultEditRoomId))}
                      />
                    ) : null}
                    {fFloorPlan ? (
                      <Item
                        icon="FloorPlan"
                        label="Floor plan editor"
                        sub="Edit walls, rooms, doors & windows"
                        onClick={act(() => s.getState().setFloorPlanEditing(true))}
                      />
                    ) : null}
                  </Section>
                ) : null}

                {/* Scene */}
                {!roomEditorActive ? (
                  <Section id="scene" title="Scene" icon="Time" {...sectionProps}>
                    {/* Time of day: slider + snap-to icon checkpoints (shared with
                        desktop). The System toggle inside shows the real clock. */}
                    <TimeOfDaySlider />
                    <Item
                      icon="Lights"
                      label={`Lights: ${LIGHTS_LABEL[lightsMode]}`}
                      sub="Independent of the time of day"
                      on={lightsMode !== 'auto'}
                      onClick={act(() => s.getState().cycleLightsMode(), { keep: true })}
                    />
                    <Item
                      icon="Lights"
                      label={`Ceiling fixtures: ${showCeilingFixtures ? 'Visible' : 'Hidden'}`}
                      sub="3D geometry; illumination stays on"
                      on={showCeilingFixtures}
                      onClick={act(
                        () => s.getState().setShowCeilingFixtures(!showCeilingFixtures),
                        { keep: true },
                      )}
                    />
                    {fRenderPresets && (
                      <label className="scene-field" onClick={(e) => e.stopPropagation()}>
                        <span>Render preset</span>
                        <select
                          className="input scene-select"
                          value={activePresetId}
                          aria-label="Render preset"
                          onChange={(e) => {
                            const p = RENDER_PRESETS.find((x) => x.id === e.target.value)
                            if (p) applyRenderPreset(s.getState(), p)
                          }}
                        >
                          <option value="none">None</option>
                          {RENDER_PRESETS.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <Item
                      icon="Sun"
                      label="Sun direction"
                      onClick={act(() => setCompassOpen(true), { keep: true })}
                    />
                    <label className="scene-field" onClick={(e) => e.stopPropagation()}>
                      <span>Wall reveal</span>
                      <select
                        className="input scene-select"
                        value={wallRevealMode}
                        aria-label="Wall reveal mode"
                        onChange={(e) =>
                          s
                            .getState()
                            .setWallRevealMode(
                              e.target.value as 'auto-hide' | 'translucent' | 'opaque',
                            )
                        }
                      >
                        <option value="translucent">Translucent</option>
                        <option value="auto-hide">Auto hide</option>
                        <option value="opaque">Opaque</option>
                      </select>
                    </label>
                    {fBackdrops ? (
                      <label className="scene-field" onClick={(e) => e.stopPropagation()}>
                        <span>Backdrop</span>
                        <select
                          className="input scene-select"
                          value={backdrop}
                          aria-label="Backdrop"
                          onChange={(e) => s.getState().setBackdrop(e.target.value as BackdropKind)}
                        >
                          {visibleBackdrops((f) => flags[f]).map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.label} — {b.sub}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </Section>
                ) : null}

                {/* Edit / Design / Arrange — manual + bulk editing, only inside the
                  per-room editor (the overview is view-only). */}
                {roomEditorActive ? (
                  <>
                    <Section id="edit" title="Edit" icon="Select" {...sectionProps}>
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
                        tourId="catalog"
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
                      {fSmartStart ? (
                        <Item
                          icon="Presets"
                          label="Smart Start…"
                          sub="Furnish every room"
                          onClick={act(() => s.getState().setSmartStartOpen(true))}
                        />
                      ) : null}
                      {fParametric ? (
                        <Item
                          icon="Measure"
                          label="Custom-size furniture…"
                          sub="Shelf / wardrobe / sideboard to size"
                          onClick={act(() => s.getState().setParametricOpen(true))}
                        />
                      ) : null}
                      <Item
                        icon="Tidy"
                        label="Tidy home"
                        sub="Auto-arrange every room"
                        onClick={act(tidyHome)}
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
                      {fUserSets ? (
                        <>
                          <div className="m-sub-h">My sets</div>
                          <Item
                            icon="Sets"
                            label="Save selection as set…"
                            onClick={act(async () => {
                              if (s.getState().selectedItemIds.length === 0) {
                                s.getState().notify.start({
                                  title: 'Select items to save as a set',
                                  kind: 'info',
                                })
                                return
                              }
                              const name = await s.getState().promptText({
                                title: 'Save set',
                                label: 'Name this set',
                                defaultValue: `My set ${userSets.length + 1}`,
                                submitLabel: 'Save',
                              })
                              if (name) s.getState().saveSelectionAsSet(name)
                            })}
                          />
                          {userSets.map((u) => (
                            <Item
                              key={u.id}
                              icon="Sets"
                              label={u.name}
                              sub={`${u.items.length} items`}
                              onClick={act(() => dropUserSet(u.id))}
                            />
                          ))}
                        </>
                      ) : null}
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
                        onClick={act(async () => {
                          const name = await s.getState().promptText({
                            title: 'Save style',
                            label: "Name this style (captures every room's finishes)",
                            defaultValue: `My style ${userStyles.length + 1}`,
                            submitLabel: 'Save',
                          })
                          if (name) s.getState().saveCurrentStyle(name)
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
                  </>
                ) : null}

                {/* Tools (advanced — hidden in Simple mode) */}
                {proMode ? (
                  <Section id="tools" title="Tools" icon="Tools" {...sectionProps}>
                    {fBudget ? (
                      <Item
                        icon="Budget"
                        label="Budget / shopping"
                        on={budgetOpen}
                        onClick={act(openBudget)}
                      />
                    ) : null}
                    {fChecks ? (
                      <Item
                        icon="Checks"
                        label="Clearance checks"
                        on={clearancePanelOpen}
                        onClick={act(toggleChecks)}
                      />
                    ) : null}
                    {fDrawings ? (
                      <Item
                        icon="FloorPlan"
                        label="Drawings"
                        on={elevationsOpen}
                        onClick={act(toggleElevations)}
                      />
                    ) : null}
                    {fDaylight ? (
                      <Item
                        icon="SunStudy"
                        label="Daylight"
                        on={daylightOpen}
                        onClick={act(toggleDaylight)}
                      />
                    ) : null}
                    {fDesignScore ? (
                      <Item
                        icon="Star"
                        label="Design score"
                        on={designScoreOpen}
                        onClick={act(toggleDesignScore)}
                      />
                    ) : null}
                    {fAccessibility ? (
                      <Item
                        icon="Checks"
                        label="Accessibility"
                        on={accessibilityOpen}
                        onClick={act(toggleAccessibility)}
                      />
                    ) : null}
                    {fMeasure ? (
                      <Item
                        icon="Measure"
                        label="Measure distance"
                        on={tapeMode}
                        onClick={act(() => s.getState().toggleTapeMode())}
                      />
                    ) : null}
                    {fComments ? (
                      <Item
                        icon="Pin"
                        label="Comments"
                        sub="Pinned notes on the design"
                        on={commentsOpen}
                        onClick={act(toggleComments)}
                      />
                    ) : null}
                    {fHistory ? (
                      <Item
                        icon="Undo"
                        label="History"
                        on={historyOpen}
                        onClick={act(openHistory)}
                      />
                    ) : null}
                    {fVersions ? (
                      <Item
                        icon="Versions"
                        label="Versions"
                        on={versionsOpen}
                        onClick={act(openVersions)}
                      />
                    ) : null}
                    {fShare ? (
                      <Item
                        icon="Share"
                        label="Share & export"
                        onClick={act(() => s.getState().setShareOpen(true))}
                      />
                    ) : null}
                    {!roomEditorActive ? (
                      <>
                        {fSun ? (
                          <Item
                            icon="SunStudy"
                            label="Sun study"
                            sub="Time-lapse dawn → dusk"
                            on={sunStudy}
                            onClick={act(() => setSunStudy((v) => !v), { keep: true })}
                          />
                        ) : null}
                        {fWalk ? (
                          <Item
                            icon="Walkthrough"
                            label={touring ? 'Stop tour' : 'Walkthrough'}
                            on={Boolean(touring)}
                            onClick={act(startWalkthrough)}
                          />
                        ) : null}
                        {fReport ? (
                          <Item
                            icon="Report"
                            label="Report"
                            sub="Printable design report"
                            onClick={act(openReport)}
                          />
                        ) : null}
                        {fDxf ? (
                          <Item
                            icon="Export"
                            label="Export SVG (plan)"
                            sub="Vector 2D plan for any editor / print"
                            onClick={act(() => void downloadPlanSvg())}
                          />
                        ) : null}
                      </>
                    ) : null}
                  </Section>
                ) : null}

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
                  {fPanorama ? (
                    <Item
                      icon="Export"
                      label="360° panorama"
                      sub="Capture a look-around panorama"
                      onClick={act(() => s.getState().setPanoramaOpen(true))}
                    />
                  ) : null}
                  {fPanoTour ? (
                    <Item
                      icon="Walkthrough"
                      label="360° tour"
                      sub="Linked panoramas — jump room to room"
                      onClick={act(() => s.getState().setPanoTourOpen(true))}
                    />
                  ) : null}
                  {fHqRender ? (
                    <Item
                      icon="Export"
                      label="HQ render"
                      sub="Path-traced photoreal still"
                      onClick={act(() => s.getState().setHqRenderOpen(true))}
                    />
                  ) : null}
                  {fRenderCompare ? (
                    <Item
                      icon="Export"
                      label="Render compare"
                      sub="A/B compare two render presets"
                      onClick={act(() => s.getState().setRenderCompareOpen(true))}
                    />
                  ) : null}
                  {fShopExport ? (
                    <Item
                      icon="Budget"
                      label="Shopping list"
                      sub="Buy-list with prices, grouped by retailer"
                      onClick={act(() => openShoppingList())}
                    />
                  ) : null}
                  {fShopExport ? (
                    <Item
                      icon="Export"
                      label="Furniture list (CSV)"
                      sub="Spreadsheet of every item — dims, qty, prices"
                      onClick={act(() => void downloadFurnitureCsv())}
                    />
                  ) : null}
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
                    onClick={act(async () => {
                      const ok = await s.getState().confirmAction({
                        title: 'Reset to default',
                        message:
                          'Reset to the floor-plan default? You can undo this with Ctrl/⌘+Z.',
                        confirmLabel: 'Reset',
                      })
                      if (ok) s.getState().resetToDefault()
                    })}
                  />
                  <Item
                    icon="Reset"
                    label="Clear all furniture"
                    onClick={act(async () => {
                      const ok = await s.getState().confirmAction({
                        title: 'Clear all furniture',
                        message: 'Remove every placed item? You can undo this with Ctrl/⌘+Z.',
                        confirmLabel: 'Clear all',
                        danger: true,
                      })
                      if (ok) s.getState().resetToEmpty()
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
                    onClick={act(() => setAppearanceOpen(true), { keep: true })}
                  />
                  <Item
                    icon="Quality"
                    label={`Graphics — ${QUALITY_LABEL[qualityTier]}`}
                    sub="Render & asset quality"
                    onClick={act(() => setGraphicsOpen(true), { keep: true })}
                  />
                  <Item icon="Book" label="User guide ↗" onClick={act(openDocs)} />
                  <Item icon="Help" label="Replay guided tour" onClick={act(startTour)} />
                </Section>
              </div>
            </div>
            {/* Persistent footer: sign in / account, always at the bottom of the
                main menu regardless of the selected section. */}
            <div className="m-sheet-foot">
              <button
                type="button"
                className="m-foot-btn"
                onClick={act(() => s.getState().setLoginOpen(true))}
              >
                <Icon.Eye className="icn" width={18} height={18} />
                <span className="m-foot-tx">
                  {currentUser ? `Account · ${currentUser.name}` : 'Sign in'}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <GraphicsSettings
        open={graphicsOpen}
        onClose={() => setGraphicsOpen(false)}
        showBack={menuOpen}
      />
      <CompassModal open={compassOpen} onClose={() => setCompassOpen(false)} showBack={menuOpen} />
      <Modal
        open={appearanceOpen}
        onClose={() => setAppearanceOpen(false)}
        title="Appearance"
        width={320}
        showBack={menuOpen}
      >
        <AppearanceControls />
      </Modal>
    </>
  )
}
