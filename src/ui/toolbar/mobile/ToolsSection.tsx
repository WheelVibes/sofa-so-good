import { Fragment } from 'react'
import { useFeature } from '../../../features/useFeature'
import { useStore } from '../../../state/store'
import {
  groupToolActions,
  resolveToolLabel,
  type ToolAction,
  visibleToolActions,
} from '../../actions/toolActions'
import { Item, Section, SubHeader } from './parts'

/** Tools (advanced — hidden in Simple mode): analysis panels and modes ONLY
 *  (TB-5) — the shared Analyse/Review tool registry plus the bespoke Sun study
 *  and Style wizards. Every export/document row moved to the File section
 *  (`FileSection`), mirroring the desktop File-owns-output reorganisation. */
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
  const versionsOpen = useStore((st) => st.versionsOpen)
  const historyOpen = useStore((st) => st.historyOpen)
  const clearancePanelOpen = useStore((st) => st.clearancePanelOpen)
  const elevationsOpen = useStore((st) => st.elevationsOpen)
  const daylightOpen = useStore((st) => st.daylightOpen)
  const designScoreOpen = useStore((st) => st.designScoreOpen)
  const accessibilityOpen = useStore((st) => st.accessibilityOpen)
  const commentsOpen = useStore((st) => st.commentsOpen)
  const designChatOpen = useStore((st) => st.designChatOpen)
  const tapeMode = useStore((st) => st.tapeMode)
  const touring = useStore((st) => st.touring)

  const fStyleTransfer = useFeature('styleTransfer')
  const fStyleQuiz = useFeature('styleQuiz')
  const fSchemeOptions = useFeature('schemeOptions')
  const fSun = useFeature('sunStudy')

  // The Analyse + Review tool rows render from the shared registry (parity with
  // desktop + ⌘K). Active highlighting reads the already-subscribed open-flags
  // (so the sheet re-renders when a panel toggles); labels resolve dynamically
  // (Measure → Measuring…, Walkthrough → Stop tour).
  const toolActive: Record<string, boolean> = {
    clearance: clearancePanelOpen,
    drawings: elevationsOpen,
    daylight: daylightOpen,
    'design-score': designScoreOpen,
    accessibility: accessibilityOpen,
    measure: tapeMode,
    comments: commentsOpen,
    'ai-design-chat': designChatOpen,
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
      {fStyleQuiz || fStyleTransfer ? <SubHeader>Style</SubHeader> : null}
      {fStyleQuiz ? (
        <Item
          icon="Palette"
          label="Style quiz"
          onClick={act(() => s.getState().setStyleQuizOpen(true))}
        />
      ) : null}
      {fSchemeOptions ? (
        <Item
          icon="Presets"
          label="Compare schemes"
          onClick={act(() => s.getState().setSchemeOptionsOpen(true))}
        />
      ) : null}
      {fStyleTransfer ? (
        <Item
          icon="Palette"
          label="Style transfer"
          onClick={act(() => s.getState().setStyleTransferOpen(true))}
        />
      ) : null}
    </Section>
  )
}
