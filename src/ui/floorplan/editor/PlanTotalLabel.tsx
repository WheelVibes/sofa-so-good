import type { UnitSystem } from '../../../utils/measurement'
import { formatArea } from '../../../utils/measurement'

/**
 * "Total <area> · N rooms" readout for the active storey, plus an optional
 * stray-element warning badge (`planIntegrity` pro flag). Extracted from
 * `FloorPlanEditor` (REFAC-2); purely presentational.
 */
export function PlanTotalLabel({
  total,
  units,
  roomCount,
  showStrayWarning,
  strayCount,
}: {
  total: number
  units: UnitSystem
  roomCount: number
  showStrayWarning: boolean
  strayCount: number
}) {
  return (
    <span className="panel-sub plain" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
      Total{' '}
      <b className="mono" style={{ color: 'var(--text)' }}>
        {formatArea(total, units)}
      </b>{' '}
      · {roomCount} rooms
      {showStrayWarning && strayCount > 0 ? (
        <b
          style={{ color: 'var(--danger)', marginLeft: 6, whiteSpace: 'nowrap' }}
          title="Stray elements (in red): a wall joined to no other wall, a room touching no other room, or a door/window off any wall. Connect them to make the apartment whole."
        >
          ⚠ {strayCount} stray
        </b>
      ) : null}
    </span>
  )
}
