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
import { shortcutLabel } from '../shortcuts'
import { MenuItem, MenuLabel, ToolbarMenu } from '../ToolbarMenu'

/** Tools cluster — analysis panels and modes ONLY (TB-5): the shared
 *  Analyse/Review registry rows, plus the bespoke Sheet-callouts panel toggle,
 *  Sun-study mode and the Style wizards. Every one-shot export/document action
 *  that used to live here ("Export & document", ~17 rows) moved to the FILE
 *  menu (`FileMenu`), matching the File-owns-output IA of Figma / Sweet Home 3D
 *  / Planner 5D (toolbar UX audit P1-5). */
export function ToolsMenu() {
  const clearancePanelOpen = useStore((s) => s.clearancePanelOpen)
  const elevationsOpen = useStore((s) => s.elevationsOpen)
  const daylightOpen = useStore((s) => s.daylightOpen)
  const designScoreOpen = useStore((s) => s.designScoreOpen)
  const accessibilityOpen = useStore((s) => s.accessibilityOpen)
  const commentsOpen = useStore((s) => s.commentsOpen)
  const designChatOpen = useStore((s) => s.designChatOpen)
  const commentMode = useStore((s) => s.commentMode)
  const commentCount = useStore((s) => s.comments.length)
  const drawingCalloutsOpen = useStore((s) => s.drawingCalloutsOpen)
  const drawingCalloutCount = useStore((s) => s.drawingCallouts.length)
  const versionsOpen = useStore((s) => s.versionsOpen)
  const historyOpen = useStore((s) => s.historyOpen)
  const touring = useStore((s) => s.touring)
  const recording = useStore((s) => s.recording)

  // The clearance / versions / history / analysis panels all dock to the same
  // centred-top `.aux` slot, so they're mutually exclusive — opening one closes
  // the others (shared helper, also used by mobile + ⌘K). Aux-panel open/close
  // logic for the Analyse + Review rows lives in the shared tool-action
  // registry (`actions/toolActions`); this menu just renders it. The
  // drawing-callouts toggle below stays bespoke (local per-feature state).
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
    drawingCalloutsOpen ||
    designChatOpen

  // Per-feature gates for the bespoke rows. The Analyse + Review rows are gated
  // inside the registry (`visibleToolActions`), so they need no flags here.
  const fSun = useFeature('sunStudy')
  const fStyleTransfer = useFeature('styleTransfer')
  const fStyleQuiz = useFeature('styleQuiz')
  const fDrawingCallouts = useFeature('drawingCallouts')

  // Analyse + Review rows come from the shared registry so this menu, the mobile
  // sheet and ⌘K can't drift (see actions/toolActions). Two bespoke injections:
  // Sheet callouts joins the Analyse group (an annotation panel, like Comments,
  // whose open-state lives outside the aux registry), and the Sun-study toggle
  // joins the Review group because its on/off lives in local component state.
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
        kbd={a.kbd ? shortcutLabel(a.kbd) : undefined}
        active={a.isActive(snap)}
        onClick={() => a.run(useStore)}
      />
    )
  }

  return (
    <ToolbarMenu icon="Tools" label="Tools" active={Boolean(anyActive)}>
      {groups.map((g) => (
        <Fragment key={g.category}>
          <MenuLabel>{g.label}</MenuLabel>
          {g.actions.map(renderAction)}
          {g.category === 'analyze' && fDrawingCallouts ? (
            <MenuItem
              icon="Pin"
              label={
                drawingCalloutCount > 0
                  ? `Sheet callouts · ${drawingCalloutCount}`
                  : 'Sheet callouts'
              }
              sub="Free-text notes on drawing-set sheets"
              docs="drawingCallouts"
              active={drawingCalloutsOpen}
              onClick={toggleDrawingCallouts}
            />
          ) : null}
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
      {(fStyleQuiz || fStyleTransfer) && <MenuLabel>Style</MenuLabel>}
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
    </ToolbarMenu>
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
