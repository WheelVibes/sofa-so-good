import { useMemo } from 'react'
import {
  buildAccessibilityReport,
  isEntryWidth,
  MIN_DOOR_CLEAR,
  TURN_CIRCLE,
} from '../analysis/accessibility'
import { useStore } from '../state/store'
import { Icon } from './toolbar/icons'

/** Accessibility / universal-design check: per-door clear width (≥ 0.85 m) and a
 *  1.5 m wheelchair turning circle per habitable room (BCA Code on Accessibility
 *  rule of thumb). Reads the active plan from the store. Pure presentation over
 *  `buildAccessibilityReport`; mirrors the Daylight panel. */
export function AccessibilityPanel() {
  const open = useStore((s) => s.accessibilityOpen)
  const setOpen = useStore((s) => s.setAccessibilityOpen)
  const plan = useStore((s) => s.floorPlan)

  const report = useMemo(() => (open ? buildAccessibilityReport(plan) : null), [open, plan])
  if (!open || !report) return null

  const { doors, rooms, doorPassCount, turnPassCount, allPass } = report
  const cm = (m: number) => `${Math.round(m * 100)} cm`

  return (
    <aside className="panel mini aux" id="accessibilityPanel" style={{ width: 360 }}>
      <div className="panel-head">
        <div>
          <div className="panel-title">Accessibility</div>
          <div className="panel-sub">
            Doors ≥ {cm(MIN_DOOR_CLEAR)} · {TURN_CIRCLE} m turning circle per room
          </div>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close"
          onClick={() => setOpen(false)}
        >
          <Icon.Close width={16} height={16} />
        </button>
      </div>
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
          <div className="clr-allclear">
            <span style={{ fontSize: 'var(--t-xs)', color: 'var(--text-3)', textAlign: 'center' }}>
              No doors or rooms to assess in this plan.
            </span>
          </div>
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
                    {isEntryWidth(d.width) ? 'Main door' : 'Door'} · {cm(d.width)}
                  </span>
                </div>
                {!d.pass && (
                  <div className="ci-detail">
                    Widen to ≥ {cm(MIN_DOOR_CLEAR)} for an accessible route.
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
                    {r.minDim.toFixed(2)} m min span — under the {TURN_CIRCLE} m turning circle.
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
