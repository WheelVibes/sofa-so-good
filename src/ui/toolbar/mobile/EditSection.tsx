import { useStore } from '../../../state/store'
import { Item, Section } from './parts'

/** Edit — manual editing controls, only inside the per-room editor. */
export function EditSection({
  activeId,
  act,
}: {
  activeId: string
  act: (fn: () => void, opts?: { keep?: boolean }) => () => void
}) {
  const s = useStore
  const showMeasurements = useStore((st) => st.showMeasurements)
  const snapEnabled = useStore((st) => st.snapEnabled)
  const gridSize = useStore((st) => st.gridSize)
  const canUndo = useStore((st) => st.past.length > 0)
  const canRedo = useStore((st) => st.future.length > 0)

  const gridLabel = gridSize >= 1 ? `${gridSize} m` : `${Math.round(gridSize * 100)} cm`

  return (
    <Section id="edit" title="Edit" icon="Select" activeId={activeId}>
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
  )
}
