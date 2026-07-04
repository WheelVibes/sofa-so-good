import { GRID_SIZES } from '../../../state/slices/uiSlice'
import type { UnitSystem } from '../../../utils/measurement'
import { formatLength } from '../../../utils/measurement'
import { Select } from '../../controls/Select'

/**
 * Snap-grid size selector + zoom out/reset/in controls, grouped since both are
 * frequent, low-priority-relative-to-undo/redo toolbar controls. Extracted from
 * `FloorPlanEditor` (REFAC-2); purely presentational.
 */
export function GridZoomControls({
  gridSize,
  onGridSizeChange,
  units,
  zoom,
  onZoomOut,
  onZoomIn,
  onResetView,
}: {
  gridSize: number
  onGridSizeChange: (v: number) => void
  units: UnitSystem
  zoom: number
  onZoomOut: () => void
  onZoomIn: () => void
  onResetView: () => void
}) {
  return (
    <>
      <div className="seg" style={{ alignItems: 'center', gap: 6, paddingLeft: 8 }}>
        <span className="panel-sub" style={{ textTransform: 'none', letterSpacing: 0 }}>
          Grid
        </span>
        <Select
          ariaLabel="Snap grid size"
          className="input"
          value={String(gridSize)}
          onChange={(v) => onGridSizeChange(Number(v))}
          options={GRID_SIZES.map((g) => ({ value: String(g), label: formatLength(g, units) }))}
        />
      </div>
      <div className="seg" style={{ alignItems: 'center' }}>
        <button type="button" title="Zoom out" onClick={onZoomOut}>
          −
        </button>
        <button
          type="button"
          title="Reset zoom & centre"
          onClick={onResetView}
          style={{ minWidth: 44, fontVariantNumeric: 'tabular-nums' }}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" title="Zoom in" onClick={onZoomIn}>
          +
        </button>
      </div>
    </>
  )
}
