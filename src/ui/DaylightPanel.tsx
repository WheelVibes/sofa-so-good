import { useMemo } from 'react'
import { buildDaylightReport, DAYLIGHT_MIN_RATIO, VENT_MIN_RATIO } from '../analysis/daylight'
import { useStore } from '../state/store'
import { Icon } from './toolbar/icons'

/** Daylight & ventilation check: per-room window glazing % vs floor area against
 *  HDB/BCA rule-of-thumb thresholds (daylight ≥ 10%, ventilation ≥ 5%). Reads the
 *  active floor plan from the store and renders a pass/fail row per interior room
 *  plus an overall summary. Pure presentation over `buildDaylightReport`. */
export function DaylightPanel() {
  const open = useStore((s) => s.daylightOpen)
  const setOpen = useStore((s) => s.setDaylightOpen)
  const plan = useStore((s) => s.floorPlan)

  const report = useMemo(() => (open ? buildDaylightReport(plan) : null), [open, plan])

  if (!open || !report) return null

  const { rooms: rows, daylightPassCount, ventPassCount, allPass } = report
  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`

  return (
    <aside className="panel mini aux aux-360" id="daylightPanel">
      <div className="panel-head">
        <div>
          <div className="panel-title">Daylight & ventilation</div>
          <div className="panel-sub">
            Glazing ≥ {Math.round(DAYLIGHT_MIN_RATIO * 100)}% · openable ≥{' '}
            {Math.round(VENT_MIN_RATIO * 100)}% of floor
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
          <div className={`clr-stat ${daylightPassCount === rows.length ? 'ok' : 'err'}`}>
            <div className="n">
              {daylightPassCount}/{rows.length}
            </div>
            <div className="l">Daylight</div>
          </div>
          <div className={`clr-stat ${ventPassCount === rows.length ? 'ok' : 'err'}`}>
            <div className="n">
              {ventPassCount}/{rows.length}
            </div>
            <div className="l">Ventilation</div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="clr-allclear">
            <span style={{ fontSize: 'var(--t-xs)', color: 'var(--text-3)', textAlign: 'center' }}>
              No interior rooms to check in this plan.
            </span>
          </div>
        ) : (
          <div className="clr-list">
            {rows.map((r) => {
              const roomPass = r.daylightPass && r.ventPass
              return (
                <div
                  key={r.roomId}
                  className={`clr-item ${roomPass ? '' : 'err'}`}
                  style={roomPass ? { borderLeftColor: 'var(--accent)' } : undefined}
                >
                  <div className="ci-head">
                    <span className={`badge ${roomPass ? 'ok' : 'err'}`}>
                      {roomPass ? 'Pass' : 'Fail'}
                    </span>
                    <span className="ci-title">{r.roomName}</span>
                  </div>
                  <div className="ci-detail">
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--s-2)',
                        marginBottom: 4,
                      }}
                    >
                      <span className={`badge ${r.daylightPass ? 'ok' : 'err'}`}>
                        {r.daylightPass ? 'OK' : 'Low'}
                      </span>
                      <span>Daylight glazing {fmtPct(r.glazingPct)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                      <span className={`badge ${r.ventPass ? 'ok' : 'err'}`}>
                        {r.ventPass ? 'OK' : 'Low'}
                      </span>
                      <span>Ventilation openable {fmtPct(r.ventPct)}</span>
                    </div>
                    <div style={{ marginTop: 5, color: 'var(--text-3)', fontSize: 'var(--t-2xs)' }}>
                      {r.glazingArea.toFixed(2)} m² glazing · {r.floorArea.toFixed(1)} m² floor
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {rows.length > 0 && (
          <div className="ci-fix" style={{ marginTop: 'var(--s-3)' }}>
            <Icon.Check width={14} height={14} />
            {allPass
              ? 'Every room meets the daylight & ventilation rule of thumb.'
              : 'Add or widen windows on failing rooms to improve daylight & airflow.'}
          </div>
        )}
      </div>
    </aside>
  )
}
