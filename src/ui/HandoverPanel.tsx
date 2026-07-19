import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { buildHandoverChecklist } from '../analysis/handoverChecklist'
import {
  buildHandoverDates,
  daysUntil,
  formatHandoverDate,
  parseKeyDate,
} from '../analysis/handoverDates'
import { buildMergedCatalog } from '../furniture/catalog'
import { useStore } from '../state/store'
import { AuxPanelHead } from './AuxPanelHead'

/** Human countdown for a target date relative to today. */
function countdownLabel(days: number): string {
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} left`
  if (days === 0) return 'today'
  return `${Math.abs(days)} day${days === -1 ? '' : 's'} ago`
}

/**
 * Move-in / handover checklist + DLP / warranty date tracker (R4-8). Surfaces
 * the derived handover checklist (`analysis/handoverChecklist`) live in-app, and
 * — given a key-collection / TOP date — computes the concrete Defects Liability
 * Period end + HDB warranty-window deadline dates with a countdown. The date
 * persists with the design. Rides the `report` pro flag at the mount site.
 */
export function HandoverPanel() {
  const open = useStore((s) => s.handoverOpen)
  const setOpen = useStore((s) => s.setHandoverOpen)
  const plan = useStore((s) => s.floorPlan)
  const items = useStore((s) => s.items)
  const keyDate = useStore((s) => s.keyCollectionDate)
  const setKeyDate = useStore((s) => s.setKeyCollectionDate)
  const checked = useStore((s) => s.handoverChecked)
  const toggleCheck = useStore((s) => s.toggleHandoverCheck)
  const catalogInputs = useStore(
    useShallow((s) => ({
      userFurniture: s.userFurniture,
      resolvedRemoteFurniture: s.resolvedRemoteFurniture,
      packFurniture: s.packFurniture,
    })),
  )

  const checklist = useMemo(() => {
    if (!open) return null
    const catalog = buildMergedCatalog(catalogInputs)
    return buildHandoverChecklist(plan, items, catalog, keyDate)
  }, [open, plan, items, keyDate, catalogInputs])

  const dates = useMemo(() => (open ? buildHandoverDates(keyDate) : null), [open, keyDate])

  if (!open || !checklist) return null

  const now = new Date()

  return (
    <aside className="panel mini aux aux-360" id="handoverPanel">
      <AuxPanelHead
        title="Handover & DLP"
        sub="Move-in checklist + warranty dates"
        docs="handover"
        onClose={() => setOpen(false)}
      />
      <hr className="hr" />
      <div className="panel-body">
        <label
          className="label"
          htmlFor="ho-key-date"
          style={{ display: 'block', marginBottom: 'var(--s-1)' }}
        >
          Key collection / TOP date
        </label>
        <input
          id="ho-key-date"
          type="date"
          className="input"
          value={keyDate ?? ''}
          onChange={(e) => setKeyDate(e.target.value || null)}
          style={{ width: '100%' }}
        />
        {/* SG-readable confirmation of the picked date (the native control
            renders in the browser's own locale, which may show US m/d/y —
            UXW-P3-6). `12 Jul 2027` (en-GB) is unambiguous either way. */}
        <div className="ho-date-note">
          {(() => {
            const d = parseKeyDate(keyDate)
            return d ? `Collection day: ${formatHandoverDate(d)}` : 'Format: day / month / year'
          })()}
        </div>

        {dates ? (
          <>
            <div className="sec-h" style={{ marginTop: 'var(--s-3)' }}>
              Warranty & defect dates
            </div>
            <div className="clr-list">
              {dates.entries.map((e) => {
                const days = daysUntil(e.date, now)
                const past = days < 0
                return (
                  <div
                    key={e.id}
                    className={`clr-item ${past ? 'warn' : ''}`}
                    style={{ display: 'block' }}
                  >
                    <div className="ci-head">
                      <span className={`badge ${past ? 'warn' : 'ok'}`}>
                        {countdownLabel(days)}
                      </span>
                      <span className="ci-title">{e.label}</span>
                    </div>
                    <div className="ci-detail">
                      <div style={{ fontWeight: 600, marginBottom: 'var(--s-1)' }}>
                        {formatHandoverDate(e.date)}
                      </div>
                      {e.description}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div
            style={{
              marginTop: 'var(--s-2)',
              color: 'var(--text-3)',
              fontSize: 'var(--t-2xs)',
              lineHeight: 'var(--lh-body)',
            }}
          >
            Set your key-collection date to compute the Defects Liability Period end and HDB
            warranty windows.
          </div>
        )}

        <div className="sec-h" style={{ marginTop: 'var(--s-4)' }}>
          Move-in checklist
        </div>
        <div
          style={{ color: 'var(--text-3)', fontSize: 'var(--t-2xs)', marginBottom: 'var(--s-2)' }}
        >
          {(() => {
            const done = checklist.groups.reduce(
              (n, g) => n + g.items.filter((i) => checked[i.id]).length,
              0,
            )
            return `${done} of ${checklist.totalItems} checked — tick items off on collection day.`
          })()}
        </div>
        {checklist.groups.map((g) => (
          <div key={g.title} style={{ marginBottom: 'var(--s-3)' }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--t-sm)', marginBottom: 'var(--s-1)' }}>
              {g.title}
            </div>
            <ul className="ho-checklist">
              {g.items.map((i) => (
                <li key={i.id}>
                  <label className="ho-check">
                    <input
                      type="checkbox"
                      checked={!!checked[i.id]}
                      onChange={() => toggleCheck(i.id)}
                    />
                    <span className={checked[i.id] ? 'done' : undefined}>{i.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  )
}
