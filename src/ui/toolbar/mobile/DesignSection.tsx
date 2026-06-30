import { useFeature } from '../../../features/useFeature'
import { tidyHome } from '../../../layout/tidyHome'
import { useStore } from '../../../state/store'
import { Item, Section } from './parts'

/** Design — catalog / layers / smart-start / parametric / tidy, only inside the
 *  per-room editor. */
export function DesignSection({
  activeId,
  act,
}: {
  activeId: string
  act: (fn: () => void, opts?: { keep?: boolean }) => () => void
}) {
  const s = useStore
  const catalogOpen = useStore((st) => st.catalogOpen)
  const leftMode = useStore((st) => st.leftMode)
  const fSmartStart = useFeature('smartStart')
  const fParametric = useFeature('parametricFurniture')

  return (
    <Section id="design" title="Design" icon="Catalog" activeId={activeId}>
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
      <Item icon="Tidy" label="Tidy home" sub="Auto-arrange every room" onClick={act(tidyHome)} />
    </Section>
  )
}
