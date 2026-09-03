import { useMemo, useState } from 'react'
import { buildAirconSizing } from '../analysis/airconSizing'
import { AIRCON_SERVED_CATEGORIES, buildAirconSystemPlan } from '../analysis/airconSystem'
import { buildAirconTrunkingPlan, resolveAirconTrunkingInput } from '../analysis/airconTrunking'
import {
  buildDaylightReport,
  DAYLIGHT_MIN_RATIO,
  exemptReason,
  isDaylightExempt,
  VENT_MIN_RATIO,
} from '../analysis/daylight'
import { useFeature } from '../features/useFeature'
import { allPlanRooms } from '../floorplan/levels'
import { roomCategory } from '../floorplan/roomCategory'
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
  // 3D refrigerant-trunking route (BSJ-2 follow-up) — rides alongside the
  // system planner section, its own pro flag.
  const trunkingOn = useFeature('airconTrunking')
  const planAircon = useStore((s) => s.planAircon)
  const notify = useStore((s) => s.notify)
  const items = useStore((s) => s.items)
  // "Show all rooms" toggle for the cooling-load list (non-habitable rooms —
  // shelter / yard / bath — are hidden by default since they aren't cooled).
  const [showAllCooling, setShowAllCooling] = useState(false)

  // Whether the aircon system has already been placed into the scene (P3-2): the
  // planner owns `aircon-unit` / `aircon-condenser` items, so their presence is
  // the "installed as planned" signal.
  const airconPlaced = useMemo(
    () => items.some((it) => it.defId === 'aircon-unit' || it.defId === 'aircon-condenser'),
    [items],
  )
  // Habitable (cooled) room ids — mirrors the FCU-served set that drives the
  // system proposal, so the cooling list can hide non-cooled rooms (P3-3).
  const habitableRoomIds = useMemo(() => {
    const ids = new Set<string>()
    for (const r of allPlanRooms(plan)) {
      if (AIRCON_SERVED_CATEGORIES.has(roomCategory(r))) ids.add(r.id)
    }
    return ids
  }, [plan])

  const report = useMemo(() => (open ? buildDaylightReport(plan) : null), [open, plan])
  const cooling = useMemo(
    () => (open && coolingOn ? buildAirconSizing(plan, orientationDeg) : null),
    [open, coolingOn, plan, orientationDeg],
  )
  const systemPlan = useMemo(
    () => (open && systemOn ? buildAirconSystemPlan(plan, orientationDeg) : null),
    [open, systemOn, plan, orientationDeg],
  )
  // Trunking routes, keyed by served room id, for the "Trunking ~XX m" readout
  // — same placed-items-else-proposal fallback the budget line uses.
  const trunkingByRoom = useMemo(() => {
    if (!open || !trunkingOn || !systemPlan || systemPlan.systems.length === 0) return null
    const input = resolveAirconTrunkingInput(plan, systemPlan, items)
    const trunking = buildAirconTrunkingPlan(plan, systemPlan, input)
    return new Map(trunking.runs.map((r) => [r.roomId, r]))
  }, [open, trunkingOn, systemPlan, plan, items])

  if (!open || !report) return null

  const { rooms: rows } = report
  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`
  // The header counts only rooms whose glazing could actually change, matching
  // `designScore`'s daylight sub-score: an interior room with no façade wall
  // (household shelter) can never hold a window, so counting it would put the
  // panel at a permanent "4/5" no user action can ever clear.
  const assessable = rows.filter((r) => !isDaylightExempt(r))
  const dayPass = assessable.filter((r) => r.daylightPass).length
  const ventPass = assessable.filter((r) => r.ventPass).length
  // Deliberately NOT `report.allPass`, which counts the sealed room and would
  // keep advising "add or widen windows" on a plan where nothing is actionable.
  const assessablePass = dayPass === assessable.length && ventPass === assessable.length

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
          <div className={`clr-stat ${dayPass === assessable.length ? 'ok' : 'err'}`}>
            <div className="n">
              {dayPass}/{assessable.length}
            </div>
            <div className="l">Daylight</div>
          </div>
          <div className={`clr-stat ${ventPass === assessable.length ? 'ok' : 'err'}`}>
            <div className="n">
              {ventPass}/{assessable.length}
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
              // An interior room with no façade wall (household shelter) has
              // nowhere to put a window — it reads as a neutral "N/A", never a
              // red failure the user is expected to act on.
              const sealed = isDaylightExempt(r) && !roomPass
              return (
                <div
                  key={r.roomId}
                  className={`clr-item ${roomPass || sealed ? '' : 'err'}`}
                  style={roomPass ? { borderLeftColor: 'var(--accent)' } : undefined}
                >
                  <div className="ci-head">
                    <span className={`badge ${sealed ? 'neutral' : roomPass ? 'ok' : 'err'}`}>
                      {sealed ? 'N/A' : roomPass ? 'Pass' : 'Fail'}
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
                      <span
                        className={`badge ${sealed ? 'neutral' : r.daylightPass ? 'ok' : 'err'}`}
                      >
                        {sealed ? '—' : r.daylightPass ? 'OK' : 'Low'}
                      </span>
                      <span>Daylight glazing {fmtPct(r.glazingPct)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                      <span className={`badge ${sealed ? 'neutral' : r.ventPass ? 'ok' : 'err'}`}>
                        {sealed ? '—' : r.ventPass ? 'OK' : 'Low'}
                      </span>
                      <span>Ventilation openable {fmtPct(r.ventPct)}</span>
                    </div>
                    <div style={{ marginTop: 5, color: 'var(--text-3)', fontSize: 'var(--t-2xs)' }}>
                      {formatArea(r.glazingArea, units)} glazing · {formatArea(r.floorArea, units)}{' '}
                      floor
                      {sealed ? ` · ${exemptReason(r)}` : ''}
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
            {assessablePass
              ? `Every ${assessable.length < rows.length ? 'assessed ' : ''}room meets the daylight & ventilation rule of thumb.`
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
            {(() => {
              const hiddenCount = cooling.rooms.filter(
                (r) => !habitableRoomIds.has(r.roomId),
              ).length
              const visible = showAllCooling
                ? cooling.rooms
                : cooling.rooms.filter((r) => habitableRoomIds.has(r.roomId))
              return (
                <>
                  <div className="clr-list">
                    {visible.map((r) => (
                      <div key={r.roomId} className="clr-item">
                        <div className="ci-head">
                          <span className="badge neutral">{fmtBtu(r.systemBtu)}</span>
                          <span className="ci-title">{r.roomName}</span>
                        </div>
                        <div className="ci-detail">
                          <div>Recommended {fmtBtu(r.recommendedBtu)}</div>
                          {r.needsMultipleUnits && (
                            <div
                              style={{
                                marginTop: 4,
                                color: 'var(--text-3)',
                                fontSize: 'var(--t-2xs)',
                              }}
                            >
                              Exceeds a single unit — plan for multiple / larger systems.
                            </div>
                          )}
                          {(r.appliedModifiers.orientation ||
                            r.appliedModifiers.ceiling ||
                            r.appliedModifiers.openKitchen) && (
                            <div
                              style={{
                                marginTop: 4,
                                color: 'var(--text-3)',
                                fontSize: 'var(--t-2xs)',
                              }}
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
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ marginTop: 'var(--s-2)' }}
                      onClick={() => setShowAllCooling((v) => !v)}
                    >
                      {showAllCooling
                        ? 'Show cooled rooms only'
                        : `Show all rooms (+${hiddenCount} non-cooled)`}
                    </button>
                  )}
                </>
              )
            })()}
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
              {airconPlaced ? 'Installed as planned' : 'Proposed multi-split systems'} —{' '}
              {systemPlan.condenserCount}{' '}
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
                      {(() => {
                        // Trunking readout (BSJ-2 follow-up): a resolved route
                        // per FCU in this system replaces the generic advisory
                        // with a real "Trunking ~XX m" figure; an unresolved
                        // run (or the flag off) keeps the original one-liner.
                        const runs = sys.fcus
                          .map((f) => trunkingByRoom?.get(f.roomId))
                          .filter((r): r is NonNullable<typeof r> => Boolean(r))
                        const resolvedRuns = runs.filter((r) => r.resolved)
                        if (trunkingOn && resolvedRuns.length === runs.length && runs.length > 0) {
                          const totalM = resolvedRuns.reduce((s, r) => s + r.lengthM, 0)
                          return (
                            <div
                              style={{
                                marginTop: 4,
                                color: 'var(--text-3)',
                                fontSize: 'var(--t-2xs)',
                              }}
                            >
                              Trunking ~{Math.round(totalM)} m from the AC ledge (modeled route —
                              confirm with your installer).
                            </div>
                          )
                        }
                        return (
                          <div
                            style={{
                              marginTop: 4,
                              color: 'var(--text-3)',
                              fontSize: 'var(--t-2xs)',
                            }}
                          >
                            {sys.trunkingNote}
                          </div>
                        )
                      })()}
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
                const { fcus, condensers, advisories } = planAircon()
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
                // Surface any placement advisory (e.g. a condenser the ledge
                // couldn't fit was dropped rather than overlapped, P2-1).
                for (const advisory of advisories) {
                  notify.start({ title: 'Aircon placement', kind: 'info', message: advisory })
                }
              }}
              title="Place a wall FCU in each served room + the condenser(s) on the AC ledge"
            >
              {airconPlaced ? 'Re-plan aircon' : 'Plan aircon'}
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
