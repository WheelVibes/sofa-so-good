import { Fragment, useEffect, useMemo, useState } from 'react'
import { useFeature } from '../../../features/useFeature'
import { useCatalog } from '../../../furniture/catalog'
import { blockedDoorItems } from '../../../layout/clearance'
import { useStore } from '../../../state/store'
import {
  groupToolActions,
  resolveToolLabel,
  type ToolAction,
  visibleToolActions,
} from '../../actions/toolActions'
import { closeAllAuxPanels } from '../../auxPanels'
import { downloadBoqXlsx } from '../../downloadBoqXlsx'
import { DRAWING_LAYERS } from '../../drawingLayers'
import { openBoq } from '../../openBoq'
import { openDrawingSet } from '../../openDrawingSet'
import { downloadPlanDxf } from '../../openDxf'
import { openMoodboard } from '../../openMoodboard'
import { downloadPlanSvg } from '../../openPlanSvg'
import { downloadRenoIcs } from '../../openRenoIcs'
import { openDesignReport } from '../../openReport'
import { exportScene3d } from '../../openSceneExport'
import { viewInAr } from '../../viewInAr'
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
  const drawingCalloutsOpen = useStore((s) => s.drawingCalloutsOpen)
  const drawingCalloutCount = useStore((s) => s.drawingCallouts.length)
  const setShareOpen = useStore((s) => s.setShareOpen)
  const versionsOpen = useStore((s) => s.versionsOpen)
  const historyOpen = useStore((s) => s.historyOpen)
  const touring = useStore((s) => s.touring)
  const recording = useStore((s) => s.recording)

  // The budget / clearance / versions / history / analysis panels all dock to the
  // same centred-top `.aux` slot, so they're mutually exclusive — opening one
  // closes the others (shared helper, also used by mobile + ⌘K).
  // Aux-panel open/close logic for the Analyse + Review rows now lives in the
  // shared tool-action registry (`actions/toolActions`); this menu just renders
  // it. The drawing-callouts toggle below stays bespoke (Export section).
  const closeAux = () => closeAllAuxPanels(useStore.getState())

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

  const toggleDrawingCallouts = () => {
    const wasOpen = useStore.getState().drawingCalloutsOpen
    closeAux()
    useStore.getState().setDrawingCalloutsOpen(!wasOpen)
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
    commentMode ||
    drawingCalloutsOpen

  const openReport = () => openDesignReport()

  // Per-feature gates for the bespoke Export section. The Analyse + Review rows
  // are gated inside the registry (`visibleToolActions`), so they need no flags
  // here — only Sun study (local-state) keeps a flag.
  const fShare = useFeature('shareExport')
  const fSun = useFeature('sunStudy')
  const fReport = useFeature('report')
  const fMoodboard = useFeature('moodboard')
  const fStyleTransfer = useFeature('styleTransfer')
  const fStyleQuiz = useFeature('styleQuiz')
  const fDxf = useFeature('dxfExport')
  const fBoq = useFeature('boq')
  const fQuoteTemplate = useFeature('quoteTemplate')
  const fSceneExport = useFeature('sceneExport3d')
  const fViewInAr = useFeature('viewInAr')
  const fDrawingCallouts = useFeature('drawingCallouts')

  // Analyse + Review rows come from the shared registry so this menu, the mobile
  // sheet and ⌘K can't drift (see actions/toolActions). The Sun-study toggle is
  // injected into the Review group because its on/off lives in local component
  // state (not the store), so it can't be a registry action.
  const flags = useStore((s) => s.featureFlags)
  const groups = groupToolActions(visibleToolActions('desktop', flags))
  const snap = useStore.getState()
  const badgeFor = (id: string) =>
    id === 'clearance' ? blockedCount : id === 'comments' ? commentCount : 0
  const renderAction = (a: ToolAction) => {
    const n = badgeFor(a.id)
    const base = resolveToolLabel(a, snap)
    return (
      <MenuItem
        key={a.id}
        icon={a.icon}
        label={n > 0 ? `${base} · ${n}` : base}
        sub={a.sub}
        docs={a.docs}
        active={a.isActive(snap)}
        onClick={() => a.run(useStore)}
      />
    )
  }

  return (
    <ToolbarMenu icon="Tools" label="Tools" active={Boolean(anyActive)}>
      {groups.map((g) => (
        <Fragment key={g.category}>
          <div className="menu-label">{g.label}</div>
          {g.actions.map(renderAction)}
          {g.category === 'review' && fSun ? (
            <MenuItem
              icon="SunStudy"
              label="Sun study"
              sub="Time-lapse dawn → dusk"
              docs="sunStudy"
              active={sunStudy}
              onClick={() => setSunStudy((v) => !v)}
            />
          ) : null}
        </Fragment>
      ))}
      {(fReport ||
        fBoq ||
        fDxf ||
        fSceneExport ||
        fViewInAr ||
        fDrawingCallouts ||
        fShare ||
        fMoodboard ||
        fStyleTransfer ||
        fStyleQuiz) && <div className="menu-label">Export & document</div>}
      {fStyleQuiz && (
        <MenuItem
          icon="Palette"
          label="Style quiz"
          sub="Find your interior style in a few taps"
          newFlag="styleQuiz"
          onClick={() => useStore.getState().setStyleQuizOpen(true)}
        />
      )}
      {fStyleTransfer && (
        <MenuItem
          icon="Palette"
          label="Style transfer"
          sub="Restyle every room's floors, walls & palette"
          onClick={() => useStore.getState().setStyleTransferOpen(true)}
        />
      )}
      {fShare && (
        <MenuItem
          icon="Share"
          label="Share & export"
          sub="Link, PNG snapshot, shoppable PDF"
          docs="shareExport"
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
      {fReport && (
        <MenuItem
          icon="Report"
          label="Report"
          sub="Printable design report"
          docs="report"
          onClick={openReport}
        />
      )}
      {fReport && (
        <MenuItem
          icon="Export"
          label="Reno timeline (.ics)"
          sub="Renovation phases as calendar events"
          onClick={() => void downloadRenoIcs()}
        />
      )}
      {fBoq && (
        <>
          <MenuItem
            icon="Budget"
            label="Quote (BOQ)"
            sub="Bill of quantities — FF&E, finishes, carpentry"
            onClick={() => openBoq()}
          />
          <MenuItem
            icon="Export"
            label="Quote → Excel (.xlsx)"
            sub="Download the bill of quantities as a spreadsheet"
            onClick={() => void downloadBoqXlsx()}
          />
          {fQuoteTemplate && (
            <MenuItem
              icon="Budget"
              label="Quote template"
              sub="Company branding, notes, GST & markup"
              onClick={() => useStore.getState().setQuoteTemplateOpen(true)}
            />
          )}
        </>
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
      {fSceneExport && (
        <>
          <MenuItem
            icon="Export"
            label="Export 3D model (.glb)"
            sub="Whole furnished scene for Blender / AR / Coohom"
            onClick={() => void exportScene3d('glb')}
          />
          <MenuItem
            icon="Export"
            label="Export 3D model (.obj)"
            sub="Geometry-only Wavefront OBJ"
            onClick={() => void exportScene3d('obj')}
          />
          <MenuItem
            icon="Export"
            label="Export 3D model (.stl)"
            sub="Geometry-only STL for 3D printing / CAD"
            onClick={() => void exportScene3d('stl')}
          />
          <MenuItem
            icon="Export"
            label="Export for AR (.usdz)"
            sub="View in your room — iOS AR Quick Look"
            onClick={() => void exportScene3d('usdz')}
          />
        </>
      )}
      {fViewInAr && (
        <MenuItem
          icon="Walkthrough"
          label="View in your room (AR)"
          sub="Place the design in your room — iOS AR, or an AR-ready GLB"
          onClick={() => void viewInAr()}
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
      {fDrawingCallouts && (
        <MenuItem
          icon="Pin"
          label={
            drawingCalloutCount > 0 ? `Sheet callouts · ${drawingCalloutCount}` : 'Sheet callouts'
          }
          sub="Free-text notes on drawing-set sheets"
          docs="drawingCallouts"
          active={drawingCalloutsOpen}
          onClick={toggleDrawingCallouts}
        />
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
