import { useEffect, useMemo, useState } from 'react'
import { useFeature } from '../../../features/useFeature'
import { useCatalog } from '../../../furniture/catalog'
import { blockedDoorItems } from '../../../layout/clearance'
import { canRecord } from '../../../scene/RecordController'
import { useStore } from '../../../state/store'
import { closeAllAuxPanels } from '../../auxPanels'
import { DRAWING_LAYERS } from '../../drawingLayers'
import { openBoq } from '../../openBoq'
import { openDrawingSet } from '../../openDrawingSet'
import { downloadPlanDxf } from '../../openDxf'
import { openMoodboard } from '../../openMoodboard'
import { downloadPlanSvg } from '../../openPlanSvg'
import { openDesignReport } from '../../openReport'
import { MenuItem, ToolbarMenu } from '../ToolbarMenu'

/** Tools cluster: budget, clearance checks, sun study, walkthrough, report.
 *  Logic lifted from the previous Toolbar's ToolsMenu + its sub-buttons. */
export function ToolsMenu() {
  const budgetOpen = useStore((s) => s.budgetOpen)
  const clearancePanelOpen = useStore((s) => s.clearancePanelOpen)
  const elevationsOpen = useStore((s) => s.elevationsOpen)
  const daylightOpen = useStore((s) => s.daylightOpen)
  const designScoreOpen = useStore((s) => s.designScoreOpen)
  const accessibilityOpen = useStore((s) => s.accessibilityOpen)
  const commentsOpen = useStore((s) => s.commentsOpen)
  const commentMode = useStore((s) => s.commentMode)
  const commentCount = useStore((s) => s.comments.length)
  const setShareOpen = useStore((s) => s.setShareOpen)
  const versionsOpen = useStore((s) => s.versionsOpen)
  const historyOpen = useStore((s) => s.historyOpen)
  const touring = useStore((s) => s.touring)
  const recording = useStore((s) => s.recording)

  // The budget / clearance / versions / history / analysis panels all dock to the
  // same centred-top `.aux` slot, so they're mutually exclusive — opening one
  // closes the others (shared helper, also used by mobile + ⌘K).
  const closeAux = () => closeAllAuxPanels(useStore.getState())
  const openBudget = () => {
    const wasOpen = useStore.getState().budgetOpen
    closeAux()
    if (!wasOpen) useStore.getState().toggleBudget()
  }
  const toggleChecks = () => {
    const s = useStore.getState()
    const next = !s.clearancePanelOpen
    closeAux()
    s.setClearancePanelOpen(next)
    if (next && !s.clearanceOn) s.toggleClearance()
  }
  const toggleElevations = () => {
    const wasOpen = useStore.getState().elevationsOpen
    closeAux()
    useStore.getState().setElevationsOpen(!wasOpen)
  }
  const toggleDaylight = () => {
    const wasOpen = useStore.getState().daylightOpen
    closeAux()
    useStore.getState().setDaylightOpen(!wasOpen)
  }
  const toggleDesignScore = () => {
    const wasOpen = useStore.getState().designScoreOpen
    closeAux()
    useStore.getState().setDesignScoreOpen(!wasOpen)
  }
  const toggleAccessibility = () => {
    const wasOpen = useStore.getState().accessibilityOpen
    closeAux()
    useStore.getState().setAccessibilityOpen(!wasOpen)
  }
  const openVersions = () => {
    const wasOpen = useStore.getState().versionsOpen
    closeAux()
    useStore.getState().setVersionsOpen(!wasOpen)
  }
  const openHistory = () => {
    const wasOpen = useStore.getState().historyOpen
    closeAux()
    useStore.getState().setHistoryOpen(!wasOpen)
  }
  const toggleComments = () => {
    const wasOpen = useStore.getState().commentsOpen
    closeAux()
    useStore.getState().setCommentsOpen(!wasOpen)
  }

  const items = useStore((s) => s.items)
  const plan = useStore((s) => s.floorPlan)
  const catalog = useCatalog()
  const blockedCount = useMemo(
    () => blockedDoorItems(items, catalog, plan).length,
    [items, catalog, plan],
  )

  const [sunStudy, setSunStudy] = useState(false)
  useSunStudy(sunStudy)

  const tapeMode = useStore((s) => s.tapeMode)
  const toggleTape = () => {
    closeAux()
    useStore.getState().toggleTapeMode()
  }

  const anyActive =
    budgetOpen ||
    clearancePanelOpen ||
    elevationsOpen ||
    daylightOpen ||
    designScoreOpen ||
    accessibilityOpen ||
    touring ||
    recording ||
    sunStudy ||
    versionsOpen ||
    historyOpen ||
    tapeMode ||
    commentsOpen ||
    commentMode

  const startWalkthrough = () => {
    const s = useStore.getState()
    if (s.touring) {
      s.setTouring(false)
      if (s.recording) s.setRecording(false)
      return
    }
    s.setCameraMode('orbit')
    if (canRecord()) s.setRecording(true)
    s.setTouring(true)
  }

  const openReport = () => openDesignReport()

  // Per-feature gates: an item is hidden when its flag is off (see featureFlags).
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
  const fMoodboard = useFeature('moodboard')
  const fDxf = useFeature('dxfExport')
  const fBoq = useFeature('boq')

  return (
    <ToolbarMenu icon="Tools" label="Tools" active={Boolean(anyActive)}>
      {fBudget && (
        <MenuItem
          icon="Budget"
          label="Budget"
          sub="Estimate furniture cost (SGD)"
          active={budgetOpen}
          onClick={openBudget}
        />
      )}
      {fChecks && (
        <MenuItem
          icon="Checks"
          label={blockedCount > 0 ? `Checks · ${blockedCount}` : 'Checks'}
          sub="Door-swing + walkway clearance"
          active={clearancePanelOpen}
          onClick={toggleChecks}
        />
      )}
      {fDrawings && (
        <MenuItem
          icon="FloorPlan"
          label="Drawings"
          sub="Wall elevations + lighting plan"
          active={elevationsOpen}
          onClick={toggleElevations}
        />
      )}
      {fDaylight && (
        <MenuItem
          icon="SunStudy"
          label="Daylight"
          sub="Window glazing & ventilation per room"
          active={daylightOpen}
          onClick={toggleDaylight}
        />
      )}
      {fDesignScore && (
        <MenuItem
          icon="Star"
          label="Design score"
          sub="Overall layout quality + fixes"
          active={designScoreOpen}
          onClick={toggleDesignScore}
        />
      )}
      {fAccessibility && (
        <MenuItem
          icon="Checks"
          label="Accessibility"
          sub="Door widths + wheelchair turning space"
          active={accessibilityOpen}
          onClick={toggleAccessibility}
        />
      )}
      {fMeasure && (
        <MenuItem
          icon="Measure"
          label={tapeMode ? 'Measuring…' : 'Measure'}
          sub="Tap two points for a distance"
          active={tapeMode}
          onClick={toggleTape}
        />
      )}
      {fComments && (
        <MenuItem
          icon="Pin"
          label={commentCount > 0 ? `Comments · ${commentCount}` : 'Comments'}
          sub="Pinned notes — travel with saves & links"
          active={commentsOpen || commentMode}
          onClick={toggleComments}
        />
      )}
      {fHistory && (
        <MenuItem
          icon="Undo"
          label="History"
          sub="Timeline of edits — jump to any step"
          active={historyOpen}
          onClick={openHistory}
        />
      )}
      {fVersions && (
        <MenuItem
          icon="Versions"
          label="Versions"
          sub="Save, restore, compare & export layouts"
          active={versionsOpen}
          onClick={openVersions}
        />
      )}
      {fShare && (
        <MenuItem
          icon="Share"
          label="Share & export"
          sub="Link, PNG snapshot, shoppable PDF"
          onClick={() => setShareOpen(true)}
        />
      )}
      {fMoodboard && (
        <MenuItem
          icon="Palette"
          label="Moodboard"
          sub="Style board: palette + finishes + pieces"
          onClick={() => openMoodboard()}
        />
      )}
      {fSun && (
        <MenuItem
          icon="SunStudy"
          label="Sun study"
          sub="Time-lapse dawn → dusk"
          active={sunStudy}
          onClick={() => setSunStudy((v) => !v)}
        />
      )}
      {fWalk && (
        <MenuItem
          icon="Walkthrough"
          label={touring ? 'Stop tour' : 'Walkthrough'}
          sub="Fly a tour through every room"
          active={Boolean(touring)}
          onClick={startWalkthrough}
        />
      )}
      {fReport && (
        <MenuItem icon="Report" label="Report" sub="Printable design report" onClick={openReport} />
      )}
      {fBoq && (
        <MenuItem
          icon="Budget"
          label="Quote (BOQ)"
          sub="Bill of quantities — FF&E, finishes, carpentry"
          onClick={() => openBoq()}
        />
      )}
      {fDxf && (
        <MenuItem
          icon="Export"
          label="Export DXF (CAD)"
          sub="2D plan for AutoCAD / contractor handoff"
          onClick={() => downloadPlanDxf()}
        />
      )}
      {fDxf && (
        <MenuItem
          icon="Export"
          label="Export SVG (plan)"
          sub="Vector 2D plan for any editor / print"
          onClick={() => void downloadPlanSvg()}
        />
      )}
      {fReport && (
        <>
          <MenuItem
            icon="FloorPlan"
            label="Drawing set"
            sub="Paginated plan + elevations + schedules (PDF)"
            onClick={() => openDrawingSet()}
          />
          <DrawingLayersPicker />
        </>
      )}
    </ToolbarMenu>
  )
}

/** Compact checklist of which drawing-set sheet groups to include in the export
 *  (the floor plan is always included). Lives under the "Drawing set" entry;
 *  clicks don't close the menu so several layers can be toggled in one go. */
function DrawingLayersPicker() {
  const layers = useStore((s) => s.drawingLayers)
  const setDrawingLayer = useStore((s) => s.setDrawingLayer)
  return (
    <div
      className="px-3 py-1"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-1)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="label" style={{ fontSize: 'var(--t-xs)', color: 'var(--text-3)' }}>
        Include sheets
      </span>
      {DRAWING_LAYERS.map((l) => (
        <label
          key={l.key}
          className="flex items-center gap-2"
          style={{ fontSize: 'var(--t-xs)', cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={layers[l.key] !== false}
            aria-label={l.label}
            onChange={(e) => setDrawingLayer(l.key, e.target.checked)}
          />
          <span>{l.label}</span>
        </label>
      ))}
    </div>
  )
}

/** Time-lapses the sun dawn→dusk while active; restores the previous time when
 *  stopped. Lifted verbatim from the old SunStudyToggle. */
function useSunStudy(active: boolean) {
  const setTimeMode = useStore((s) => s.setTimeMode)
  const setManualHour = useStore((s) => s.setManualHour)
  useEffect(() => {
    if (!active) return
    const prev = { mode: useStore.getState().timeMode, hour: useStore.getState().manualHour }
    setTimeMode('manual')
    let raf = 0
    let last = performance.now()
    let hour = 6
    const tick = (t: number) => {
      hour += ((t - last) / 1000) * 1.4 // ~1.4 sim-hours / real-second
      last = t
      if (hour >= 20) hour = 6
      setManualHour(hour)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      setTimeMode(prev.mode)
      setManualHour(prev.hour)
    }
  }, [active, setTimeMode, setManualHour])
}
