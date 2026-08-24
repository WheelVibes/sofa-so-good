import { useMemo } from 'react'
import {
  buildAccessibilityReport,
  isEntryWidth,
  MIN_DOOR_CLEAR,
  TURN_CIRCLE,
} from '../analysis/accessibility'
import { useStore } from '../state/store'
import { formatLength } from '../utils/measurement'
import { AuxPanelHead } from './AuxPanelHead'
import { EmptyState } from './EmptyState'
import { Icon } from './toolbar/icons'

/** Accessibility / universal-design check: per-door clear width (≥ 0.85 m) and a
 *  1.5 m wheelchair turning circle per habitable room (BCA Code on Accessibility
 *  rule of thumb). Reads the active plan from the store. Pure presentation over
 *  `buildAccessibilityReport`; mirrors the Daylight panel. */
export function AccessibilityPanel() {
  const open = useStore((s) => s.accessibilityOpen)
  const setOpen = useStore((s) => s.setAccessibilityOpen)
  const plan = useStore((s) => s.floorPlan)
  const units = useStore((s) => s.units)

  const report = useMemo(() => (open ? buildAccessibilityReport(plan) : null), [open, plan])
  if (!open || !report) return null

  const { doors, rooms, doorPassCount, turnPassCount, allPass } = report

  return (
    <aside className="panel mini aux aux-360" id="accessibilityPanel">
      <AuxPanelHead
        title="Accessibility"
        sub={
          <>
            Doors ≥ {formatLength(MIN_DOOR_CLEAR, units)} · {formatLength(TURN_CIRCLE, units)}{' '}
            turning circle per room
          </>
        }
        docs="accessibility"
        onClose={() => setOpen(false)}
      />
      <hr className="hr" />
      <div className="panel-body">
        <div className="clr-summary">
          <div className={`clr-stat ${doorPassCount === doors.length ? 'ok' : 'err'}`}>
            <div className="n">
              {doorPassCount}/{doors.length}
            </div>
            <div className="l">Doorways</div>
          </div>
          <div className={`clr-stat ${turnPassCount === rooms.length ? 'ok' : 'err'}`}>
            <div className="n">
              {turnPassCount}/{rooms.length}
            </div>
            <div className="l">Turning space</div>
          </div>
        </div>

        {doors.length === 0 && rooms.length === 0 ? (
          <EmptyState
            icon={Icon.Measure}
            title="Nothing to assess"
            description="This plan has no doors or rooms to check for accessibility."
          />
        ) : (
          <div className="clr-list">
            {doors.map((d) => (
              <div
                key={d.id}
                className={`clr-item ${d.pass ? '' : 'err'}`}
                style={d.pass ? { borderLeftColor: 'var(--accent)' } : undefined}
              >
                <div className="ci-head">
                  <span className={`badge ${d.pass ? 'ok' : 'err'}`}>
                    {d.pass ? 'OK' : 'Narrow'}
                  </span>
                  <span className="ci-title">
                    {/* Name the door, so "widen this one" is actionable — a list of
                        identical `Door · 0.80 m` rows told you nothing about which
                        door to widen. Falls back to the generic label only when the
                        plan yields no name at all. */}
                    {d.name ?? (isEntryWidth(d.width) ? 'Main door' : 'Door')} ·{' '}
                    {formatLength(d.width, units)}
                  </span>
                </div>
                {!d.pass && (
                  <div className="ci-detail">
                    Widen to ≥ {formatLength(MIN_DOOR_CLEAR, units)} for an accessible route.
                  </div>
                )}
              </div>
            ))}
            {rooms.map((r) => (
              <div
                key={r.roomId}
                className={`clr-item ${r.pass ? '' : 'err'}`}
                style={r.pass ? { borderLeftColor: 'var(--accent)' } : undefined}
              >
                <div className="ci-head">
                  <span className={`badge ${r.pass ? 'ok' : 'err'}`}>
                    {r.pass ? 'OK' : 'Tight'}
                  </span>
                  <span className="ci-title">{r.roomName}</span>
                </div>
                {!r.pass && (
                  <div className="ci-detail">
                    {formatLength(r.minDim, units)} min span — under the{' '}
                    {formatLength(TURN_CIRCLE, units)} turning circle.
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {(doors.length > 0 || rooms.length > 0) && (
          <div className="ci-fix" style={{ marginTop: 'var(--s-3)' }}>
            <Icon.Check width={14} height={14} />
            {allPass
              ? 'Step-free routes, accessible doors and turning space throughout.'
              : 'Widen flagged doors / rooms for wheelchair + walking-frame access.'}
          </div>
        )}
      </div>
    </aside>
  )
}
