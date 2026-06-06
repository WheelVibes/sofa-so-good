import { useEffect, useMemo, useState } from 'react'
import { buildMergedCatalog, useCatalog } from '../../../furniture/catalog'
import { blockedDoorItems } from '../../../layout/clearance'
import { canRecord } from '../../../scene/RecordController'
import { useStore } from '../../../state/store'
import { buildReportHtml } from '../../report'
import { MenuItem, ToolbarMenu } from '../ToolbarMenu'

/** Tools cluster: budget, clearance checks, sun study, walkthrough, report.
 *  Logic lifted from the previous Toolbar's ToolsMenu + its sub-buttons. */
export function ToolsMenu() {
  const budgetOpen = useStore((s) => s.budgetOpen)
  const clearancePanelOpen = useStore((s) => s.clearancePanelOpen)
  const setShareOpen = useStore((s) => s.setShareOpen)
  const versionsOpen = useStore((s) => s.versionsOpen)
  const touring = useStore((s) => s.touring)
  const recording = useStore((s) => s.recording)

  // The budget / clearance / versions panels all dock to the same centred-top
  // `.aux` slot, so they're mutually exclusive — opening one closes the others.
  const closeAux = () => {
    const s = useStore.getState()
    if (s.budgetOpen) s.toggleBudget()
    s.setClearancePanelOpen(false)
    s.setVersionsOpen(false)
  }
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
  const openVersions = () => {
    const wasOpen = useStore.getState().versionsOpen
    closeAux()
    useStore.getState().setVersionsOpen(!wasOpen)
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

  const anyActive =
    budgetOpen || clearancePanelOpen || touring || recording || sunStudy || versionsOpen

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

  const openReport = () => {
    const s = useStore.getState()
    const canvas = document.querySelector('canvas')
    let hero: string | null = null
    try {
      hero = canvas ? canvas.toDataURL('image/png') : null
    } catch {
      hero = null // tainted canvas — skip the image
    }
    const html = buildReportHtml(s.floorPlan, s.items, buildMergedCatalog(s), hero)
    const win = window.open('', '_blank')
    if (!win) {
      // Pop-up blocked — tell the user instead of failing silently.
      s.notify.start({
        title: 'Report blocked',
        kind: 'error',
        message: 'Allow pop-ups for this site, then open the report again.',
      })
      return
    }
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 400)
  }

  return (
    <ToolbarMenu icon="Tools" label="Tools" active={anyActive}>
      <MenuItem
        icon="Budget"
        label="Budget"
        sub="Estimate furniture cost (SGD)"
        active={budgetOpen}
        onClick={openBudget}
      />
      <MenuItem
        icon="Checks"
        label={blockedCount > 0 ? `Checks · ${blockedCount}` : 'Checks'}
        sub="Door-swing + walkway clearance"
        active={clearancePanelOpen}
        onClick={toggleChecks}
      />
      <MenuItem
        icon="Versions"
        label="Versions"
        sub="Save, restore & compare layouts"
        active={versionsOpen}
        onClick={openVersions}
      />
      <MenuItem
        icon="Share"
        label="Share & export"
        sub="Link, PNG snapshot, shoppable PDF"
        onClick={() => setShareOpen(true)}
      />
      <MenuItem
        icon="SunStudy"
        label="Sun study"
        sub="Time-lapse dawn → dusk"
        active={sunStudy}
        onClick={() => setSunStudy((v) => !v)}
      />
      <MenuItem
        icon="Walkthrough"
        label={touring ? 'Stop tour' : 'Walkthrough'}
        sub="Fly a tour through every room"
        active={touring}
        onClick={startWalkthrough}
      />
      <MenuItem icon="Report" label="Report" sub="Printable design report" onClick={openReport} />
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
