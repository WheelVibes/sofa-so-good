import { useMemo } from 'react'
import { buildAirconSizing } from '../analysis/airconSizing'
import { buildAirconSystemPlan } from '../analysis/airconSystem'
import { buildDaylightReport, DAYLIGHT_MIN_RATIO, VENT_MIN_RATIO } from '../analysis/daylight'
import { useFeature } from '../features/useFeature'
import { useStore } from '../state/store'
import { formatArea } from '../utils/measurement'
import { AuxPanelHead } from './AuxPanelHead'
import { EmptyState } from './EmptyState'
import { Icon } from './toolbar/icons'

/** Compact BTU/hr readout (e.g. "12,000 BTU"). */
const fmtBtu = (v: number) => `${Math.round(v).toLocaleString()} BTU`

/** Daylight & ventilation check: per-room window glazing % vs floor area against
 *  HDB/BCA rule-of-thumb thresholds (daylight ≥ 10%, ventilation ≥ 5%). Reads the
 *  active floor plan from the store and renders a pass/fail row per interior room
 *  plus an overall summary. Pure presentation over `buildDaylightReport`. */
export function DaylightPanel() {
  const open = useStore((s) => s.daylightOpen)
  const setOpen = useStore((s) => s.setDaylightOpen)
  const plan = useStore((s) => s.floorPlan)
  const units = useStore((s) => s.units)
  const orientationDeg = useStore((s) => s.orientationDeg)
  // Cooling (aircon BTU) advisory rides ALONGSIDE the daylight rows — both are
  // pro checks defaulting on. It renders ONLY while this Daylight panel is open
  // (an accepted coupling: there is no standalone cooling panel).
  const coolingOn = useFeature('airconSizing')
  // Aircon SYSTEM planner (BSJ-2) — condenser grouping proposal + place action.
  // Rides in the same Cooling-load area; its own pro flag gates the section.
  const systemOn = useFeature('airconSystem')
  const planAircon = useStore((s) => s.planAircon)
  const notify = useStore((s) => s.notify)

  const report = useMemo(() => (open ? buildDaylightReport(plan) : null), [open, plan])
  const cooling = useMemo(
    () => (open && coolingOn ? buildAirconSizing(plan, orientationDeg) : null),
    [open, coolingOn, plan, orientationDeg],
  )
  const systemPlan = useMemo(
    () => (open && systemOn ? buildAirconSystemPlan(plan, orientationDeg) : null),
    [open, systemOn, plan, orientationDeg],
  )

  if (!open || !report) return null

  const { rooms: rows, daylightPassCount, ventPassCount, allPass } = report
  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`

  return (
    <aside className="panel mini aux aux-360" id="daylightPanel">
      <AuxPanelHead
        title="Daylight & ventilation"
        sub={
          <>
            Glazing ≥ {Math.round(DAYLIGHT_MIN_RATIO * 100)}% · openable ≥{' '}
            {Math.round(VENT_MIN_RATIO * 100)}% of floor
          </>
        }
        docs="daylight"
        onClose={() => setOpen(false)}
      />
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
          <EmptyState
            icon={Icon.Sun}
            title="Nothing to check"
            description="This plan has no interior rooms to assess for daylight."
          />
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
                      {formatArea(r.glazingArea, units)} glazing · {formatArea(r.floorArea, units)}{' '}
                      floor
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

        {cooling && cooling.rooms.length > 0 && (
          <>
            <hr className="hr" />
            <div className="sec-h">Cooling load</div>
            <div
              style={{
                color: 'var(--text-3)',
                fontSize: 'var(--t-2xs)',
                marginBottom: 'var(--s-2)',
              }}
            >
              Recommended aircon size per room (rule of thumb).
            </div>
            <div className="clr-list">
              {cooling.rooms.map((r) => (
                <div key={r.roomId} className="clr-item">
                  <div className="ci-head">
                    <span className="badge neutral">{fmtBtu(r.systemBtu)}</span>
                    <span className="ci-title">{r.roomName}</span>
                  </div>
                  <div className="ci-detail">
                    <div>Recommended {fmtBtu(r.recommendedBtu)}</div>
                    {r.needsMultipleUnits && (
                      <div
                        style={{ marginTop: 4, color: 'var(--text-3)', fontSize: 'var(--t-2xs)' }}
                      >
                        Exceeds a single unit — plan for multiple / larger systems.
                      </div>
                    )}
                    {(r.appliedModifiers.orientation ||
                      r.appliedModifiers.ceiling ||
                      r.appliedModifiers.openKitchen) && (
                      <div
                        style={{ marginTop: 4, color: 'var(--text-3)', fontSize: 'var(--t-2xs)' }}
                      >
                        {[
                          r.appliedModifiers.orientation && 'E/W sun',
                          r.appliedModifiers.ceiling && 'high ceiling',
                          r.appliedModifiers.openKitchen && 'open kitchen',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="ci-fix" style={{ marginTop: 'var(--s-3)' }}>
              <Icon.Check width={14} height={14} />
              Whole home ≈ {fmtBtu(cooling.totalSystemBtu)} installed capacity.
            </div>
          </>
        )}

        {systemPlan && systemPlan.systems.length > 0 && (
          <>
            <hr className="hr" />
            <div className="sec-h">Aircon system</div>
            <div
              style={{
                color: 'var(--text-3)',
                fontSize: 'var(--t-2xs)',
                marginBottom: 'var(--s-2)',
              }}
            >
              Proposed multi-split systems — {systemPlan.condenserCount}{' '}
              {systemPlan.condenserCount === 1 ? 'condenser' : 'condensers'} driving{' '}
              {systemPlan.fcuCount} indoor units.
            </div>
            <div className="clr-list">
              {systemPlan.systems.map((sys) => {
                const pct = Math.round(sys.loadRatio * 100)
                return (
                  <div key={sys.index} className={`clr-item ${sys.overCapacity ? 'err' : ''}`}>
                    <div className="ci-head">
                      <span className={`badge ${sys.overCapacity ? 'err' : 'ok'}`}>{pct}%</span>
                      <span className="ci-title">
                        {sys.label} · {sys.fcus.length} FCU
                      </span>
                    </div>
                    <div className="ci-detail">
                      <div>{sys.fcus.map((f) => f.roomName).join(', ')}</div>
                      <div
                        style={{ marginTop: 4, color: 'var(--text-3)', fontSize: 'var(--t-2xs)' }}
                      >
                        {fmtBtu(sys.connectedBtu)} connected · {fmtBtu(sys.condenserNominalBtu)}{' '}
                        condenser
                      </div>
                      {/* Connection-ratio load bar (100% = full, cap ~130%). */}
                      <div
                        style={{
                          marginTop: 5,
                          height: 6,
                          borderRadius: 'var(--r-1)',
                          background: 'var(--surface-3)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, (sys.loadRatio / 1.3) * 100)}%`,
                            background: sys.overCapacity ? 'var(--danger)' : 'var(--accent)',
                          }}
                        />
                      </div>
                      {sys.overCapacity && (
                        <div
                          style={{ marginTop: 4, color: 'var(--text-3)', fontSize: 'var(--t-2xs)' }}
                        >
                          Over the ~130% connection-ratio cap — specify a higher-capacity condenser
                          or split this system.
                        </div>
                      )}
                      <div
                        style={{ marginTop: 4, color: 'var(--text-3)', fontSize: 'var(--t-2xs)' }}
                      >
                        {sys.trunkingNote}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {systemPlan.ledgeWeightNote && (
              <div className="ci-fix" style={{ marginTop: 'var(--s-3)' }}>
                <Icon.Check width={14} height={14} />
                {systemPlan.ledgeWeightNote}
              </div>
            )}
            <button
              type="button"
              className="btn btn-sm"
              style={{ marginTop: 'var(--s-3)', width: '100%' }}
              onClick={() => {
                const { fcus, condensers } = planAircon()
                if (fcus === 0 && condensers === 0) {
                  notify.start({
                    title: 'Nothing to place',
                    kind: 'info',
                    message: 'No habitable rooms to fit an aircon system.',
                  })
                } else {
                  notify.start({
                    title: `Placed ${fcus} FCU${fcus === 1 ? '' : 's'} + ${condensers} condenser${
                      condensers === 1 ? '' : 's'
                    }`,
                    message:
                      condensers > 0 ? 'Units on walls, condensers on the AC ledge.' : undefined,
                  })
                }
              }}
              title="Place a wall FCU in each served room + the condenser(s) on the AC ledge"
            >
              Plan aircon
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
