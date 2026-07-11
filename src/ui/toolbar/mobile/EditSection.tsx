import { GRID_SIZES } from '../../../state/slices/uiSlice'
import { useStore } from '../../../state/store'
import { Segmented } from '../../controls/Segmented'
import { formatGridSize } from '../gridSizeLabel'
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

  const gridLabel = formatGridSize(gridSize)

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
        // Grid size — segmented, not a tap-to-cycle row (TB-8): every size is
        // visible and one tap away.
        <label className="scene-field" onClick={(e) => e.stopPropagation()}>
          <span>Grid size</span>
          <Segmented
            fit
            ariaLabel="Grid size"
            value={String(gridSize)}
            onChange={(v) => s.getState().setGridSize(Number(v))}
            options={GRID_SIZES.map((g) => ({ value: String(g), label: formatGridSize(g) }))}
          />
        </label>
      ) : null}
      <Item
        icon="Measure"
        label="Dimensions"
        on={showMeasurements}
        onClick={act(() => s.getState().toggleMeasurements(), { keep: true })}
      />
    </Section>
  )
}
