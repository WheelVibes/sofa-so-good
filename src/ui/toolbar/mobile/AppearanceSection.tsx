import { runUpdateCheck } from '../../../pwa/swUpdate'
import { QUALITY_LABEL } from '../../../scene/quality'
import { useStore } from '../../../state/store'
import { openDocs } from '../../docsUrl'
import { Item, Section } from './parts'

/** Appearance & help — theme, graphics, user guide, tour, update check. */
export function AppearanceSection({
  activeId,
  act,
  onOpenGraphics,
}: {
  activeId: string
  act: (fn: () => void, opts?: { keep?: boolean }) => () => void
  onOpenGraphics: () => void
}) {
  const qualityTier = useStore((st) => st.qualityTier)
  const startTour = useStore((st) => st.startTour)
  const setAppearanceOpen = useStore((st) => st.setAppearanceOpen)

  return (
    <Section id="appearance" title="Appearance & help" icon="Palette" activeId={activeId}>
      <Item
        icon="Palette"
        label="Theme & appearance"
        sub="Colour theme, light / dark"
        onClick={act(() => setAppearanceOpen(true), { keep: true })}
      />
      <Item
        icon="Quality"
        label={`Graphics · ${QUALITY_LABEL[qualityTier]}`}
        sub="Render & asset quality"
        onClick={act(() => onOpenGraphics(), { keep: true })}
      />
      <Item icon="Book" label="User guide ↗" onClick={act(openDocs)} />
      <Item icon="Help" label="Replay guided tour" onClick={act(startTour)} />
      <Item
        icon="Download"
        label="Check for updates"
        sub="Fetch the latest version"
        onClick={act(() => void runUpdateCheck())}
      />
    </Section>
  )
}
