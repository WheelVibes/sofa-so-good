import { useMemo } from 'react'
import { isFeatureEnabled } from '../features/featureFlags'
import { useStore } from '../state/store'
import { AuxPanelHead } from './AuxPanelHead'
import { EmptyState } from './EmptyState'
import {
  assembleRenoAllocation,
  assembleVariationRegister,
  buildRenovationBudgetCsv,
} from './renovationBudget'
import { Icon } from './toolbar/icons'

/**
 * Whole-renovation budget allocator panel (BSJ-1). Reads the live design and
 * shows a full SG trade breakdown (hacking, tiling, flooring, carpentry, ceiling,
 * painting, M&E, aircon, glass, fixtures) with each line's quantity basis + rate,
 * a subtotal, an editable contingency, a grand total, a comparison against the
 * user's budget target, and an indicative SG benchmark band. All figures derive
 * from the design's own quantities — clearly an estimate.
 */
export function RenovationBudgetPanel() {
  const open = useStore((s) => s.renoBudgetOpen)
  const toggle = useStore((s) => s.toggleRenoBudget)
  // Re-derive whenever the inputs the allocation depends on change.
  const items = useStore((s) => s.items)
  const plan = useStore((s) => s.floorPlan)
  const finishes = useStore((s) => s.finishes)
  const priceRules = useStore((s) => s.priceRules)
  const budgetTarget = useStore((s) => s.budgetTarget)
  const baselinePlan = useStore((s) => s.baselinePlan)

  const alloc = useMemo(() => {
    // Reference the subscribed inputs so the allocation recomputes when any of
    // them changes (the assembly itself reads the full store snapshot).
    void [items, plan, finishes, priceRules, budgetTarget, baselinePlan]
    return assembleRenoAllocation(useStore.getState())
  }, [items, plan, finishes, priceRules, budgetTarget, baselinePlan])

  if (!open) return null
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-SG')}`
  const total = alloc.total || 1

  const exportCsv = () => {
    // The variation register rides on the SAME sheet as the price it varies
    // (v0.31.5.307) — a contractor opens the budget CSV, not a separate export.
    const st = useStore.getState()
    const variation = isFeatureEnabled('variationRegister') ? assembleVariationRegister(st) : null
    const csv = buildRenovationBudgetCsv(alloc, variation, st.tenderedSnapshot)
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `renovation-budget-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    useStore.getState().notify.start({ title: 'Renovation budget exported (CSV)', kind: 'success' })
  }

  return (
    <aside className="panel mini aux">
      <AuxPanelHead
        title="Renovation budget"
        sub="Whole-reno cost by trade"
        docs="renoBudget"
        onClose={toggle}
        closeLabel="Close renovation budget"
      />
      <div className="panel-body">
        {alloc.lines.length === 0 ? (
          <EmptyState
            icon={Icon.Budget}
            title="Nothing to price yet"
            description="Set finishes, place carpentry & fittings, and a whole-renovation cost estimate builds up here by trade."
          />
        ) : (
          <>
            <div className="bud-total">
              <span className="big mono">{fmt(alloc.total)}</span>
              <span className="panel-sub">estimated total</span>
            </div>

            {alloc.target != null && alloc.overUnder != null ? (
              <div className={`reno-callout ${alloc.overUnder > 0 ? 'over' : 'under'}`}>
                Budget target {fmt(alloc.target)} —{' '}
                {alloc.overUnder > 0
                  ? `${fmt(alloc.overUnder)} over`
                  : `${fmt(-alloc.overUnder)} under`}
              </div>
            ) : null}

            <div className="bud-breakdown" style={{ margin: 'var(--s-2) 0' }}>
              {alloc.lines.map((l) => {
                const pct = Math.round((l.subtotal / total) * 100)
                return (
                  <div key={l.id} style={{ marginBottom: 'var(--s-2)' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 'var(--t-xs)',
                        color: 'var(--text-2)',
                      }}
                    >
                      <span>{l.label}</span>
                      <span className="mono">{fmt(l.subtotal)}</span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 'var(--t-2xs)',
                        color: 'var(--text-3)',
                      }}
                    >
                      <span>
                        {l.quantity} {l.unit} @ {fmt(l.rate)}/{l.unit} · {l.stage}
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div
                      style={{
                        height: 5,
                        borderRadius: 999,
                        background: 'var(--surface-2)',
                        overflow: 'hidden',
                        marginTop: 'var(--s-0)',
                      }}
                    >
                      <div
                        style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <hr className="hr" />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 'var(--t-xs)',
                color: 'var(--text-2)',
              }}
            >
              <span>Subtotal</span>
              <span className="mono">{fmt(alloc.subtotal)}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 'var(--t-xs)',
                color: 'var(--text-2)',
              }}
            >
              <span>Contingency ({alloc.contingencyPct}%)</span>
              <span className="mono">{fmt(alloc.contingency)}</span>
            </div>

            <div className="bud-breakdown" style={{ marginTop: 'var(--s-3)' }}>
              <div
                className="label"
                style={{
                  fontSize: 'var(--t-2xs)',
                  marginBottom: 'var(--s-1)',
                  color: 'var(--text-3)',
                }}
              >
                Indicative SG reference
              </div>
              {alloc.benchmarks.map((b) => (
                <div
                  key={b.label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 'var(--t-2xs)',
                    color: 'var(--text-3)',
                    marginBottom: 'var(--s-0)',
                  }}
                >
                  <span>{b.label}</span>
                  <span className="mono">
                    {fmt(b.lo)}–{fmt(b.hi)}
                  </span>
                </div>
              ))}
            </div>

            <p className="panel-sub plain" style={{ marginTop: 'var(--s-2)' }}>
              Indicative estimate from your design's quantities at mid-market SG rates — confirm
              with your contractor. Edit rates in Quote template (Pro).
            </p>

            <button
              type="button"
              className="btn btn-sm"
              style={{ marginTop: 'var(--s-2)' }}
              title="Download the renovation budget as a CSV (spreadsheet)"
              onClick={exportCsv}
            >
              Export CSV
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
