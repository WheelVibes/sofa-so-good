import { DEFAULT_PLAN_WALL_COLOR } from '../../../floorplan/types'
import { ColorPicker } from '../../controls/ColorPicker'

/**
 * Plan-wide defaults — ceiling height + wall colour — surfaced in the mobile
 * Tools sheet (desktop shows the same fields in `PlanInspector`). Extracted
 * from `FloorPlanEditor` (REFAC-2); purely presentational.
 */
export function PlanDefaultsFields({
  ceilingHeight,
  wallColor,
  onCeilingHeightChange,
  onWallColorChange,
}: {
  ceilingHeight: number
  wallColor: string | undefined
  onCeilingHeightChange: (v: number) => void
  onWallColorChange: (hex: string) => void
}) {
  return (
    <>
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="label">Ceiling height (m)</span>
        <input
          type="number"
          step={0.05}
          min={2.2}
          value={ceilingHeight}
          onChange={(e) => {
            const v = Number.parseFloat(e.target.value)
            if (Number.isFinite(v)) onCeilingHeightChange(Math.min(4, Math.max(2.2, v)))
          }}
          className="input mono"
          style={{ width: 96, textAlign: 'right' }}
        />
      </label>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="label">Wall colour</span>
        <ColorPicker
          ariaLabel="Wall colour"
          value={wallColor ?? DEFAULT_PLAN_WALL_COLOR}
          onChange={onWallColorChange}
          paletteRoomId={null}
        />
      </div>
    </>
  )
}
