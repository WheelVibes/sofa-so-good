import { Fragment } from 'react'
import { useFeature } from '../../../features/useFeature'
import { useStore } from '../../../state/store'
import {
  groupToolActions,
  resolveToolLabel,
  type ToolAction,
  visibleToolActions,
} from '../../actions/toolActions'
import { downloadPlanSvg } from '../../openPlanSvg'
import { downloadRenoIcs } from '../../openRenoIcs'
import { openDesignReport } from '../../openReport'
import { Item, Section, SubHeader } from './parts'

/** Tools (advanced — hidden in Simple mode): the shared Analyse/Review tool
 *  registry plus the bespoke Sun study + Export & document group. */
export function ToolsSection({
  activeId,
  act,
  sunStudy,
  setSunStudy,
}: {
  activeId: string
  act: (fn: () => void, opts?: { keep?: boolean }) => () => void
  sunStudy: boolean
  setSunStudy: React.Dispatch<React.SetStateAction<boolean>>
}) {
  const s = useStore
  const featureFlags = useStore((st) => st.featureFlags)
  const roomEditorActive = useStore((st) => st.roomEditor.active)
  const budgetOpen = useStore((st) => st.budgetOpen)
  const versionsOpen = useStore((st) => st.versionsOpen)
  const historyOpen = useStore((st) => st.historyOpen)
  const clearancePanelOpen = useStore((st) => st.clearancePanelOpen)
  const elevationsOpen = useStore((st) => st.elevationsOpen)
  const daylightOpen = useStore((st) => st.daylightOpen)
  const designScoreOpen = useStore((st) => st.designScoreOpen)
  const accessibilityOpen = useStore((st) => st.accessibilityOpen)
  const commentsOpen = useStore((st) => st.commentsOpen)
  const tapeMode = useStore((st) => st.tapeMode)
  const touring = useStore((st) => st.touring)

  const fShare = useFeature('shareExport')
  const fSun = useFeature('sunStudy')
  const fReport = useFeature('report')
  const fDxf = useFeature('dxfExport')

  const openReport = () => openDesignReport()

  // The Analyse + Review tool rows render from the shared registry (parity with
  // desktop + ⌘K). Active highlighting reads the already-subscribed open-flags
  // (so the sheet re-renders when a panel toggles); labels resolve dynamically
  // (Measure → Measuring…, Walkthrough → Stop tour).
  const toolActive: Record<string, boolean> = {
    budget: budgetOpen,
    clearance: clearancePanelOpen,
    drawings: elevationsOpen,
    daylight: daylightOpen,
    'design-score': designScoreOpen,
    accessibility: accessibilityOpen,
    measure: tapeMode,
    comments: commentsOpen,
    history: historyOpen,
    versions: versionsOpen,
    walkthrough: Boolean(touring),
  }
  const renderToolItem = (a: ToolAction) => (
    <Item
      key={a.id}
      icon={a.icon}
      label={resolveToolLabel(a, s.getState())}
      sub={a.sub}
      on={toolActive[a.id]}
      docs={a.docs}
      onClick={act(() => a.run(s))}
    />
  )

  return (
    <Section id="tools" title="Tools" icon="Tools" activeId={activeId}>
      {groupToolActions(visibleToolActions('mobile', featureFlags, { roomEditorActive })).map(
        (g) => (
          <Fragment key={g.category}>
            <SubHeader>{g.label}</SubHeader>
            {g.actions.map(renderToolItem)}
            {g.category === 'review' && !roomEditorActive && fSun ? (
              <Item
                icon="SunStudy"
                label="Sun study"
                sub="Time-lapse dawn → dusk"
                on={sunStudy}
                docs="sunStudy"
                onClick={act(() => setSunStudy((v) => !v), { keep: true })}
              />
            ) : null}
          </Fragment>
        ),
      )}
      {fShare || (!roomEditorActive && fReport) || (!roomEditorActive && fDxf) ? (
        <SubHeader>Export &amp; document</SubHeader>
      ) : null}
      {fShare ? (
        <Item
          icon="Share"
          label="Share & export"
          docs="shareExport"
          onClick={act(() => s.getState().setShareOpen(true))}
        />
      ) : null}
      {!roomEditorActive ? (
        <>
          {fReport ? (
            <Item
              icon="Report"
              label="Report"
              sub="Printable design report"
              docs="report"
              onClick={act(openReport)}
            />
          ) : null}
          {fReport ? (
            <Item
              icon="Export"
              label="Reno timeline (.ics)"
              sub="Renovation phases as calendar events"
              onClick={act(() => void downloadRenoIcs())}
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
  )
}
