import { RENO_RULES, RENO_RULES_AS_OF } from '../floorplan/renoRules'
import { useStore } from '../state/store'
import { AuxPanelHead } from './AuxPanelHead'

/**
 * SG renovation-rules reference pack (R4-6) — a static, cited reference surface
 * bundling the smaller HDB/BCA compliance rules (wet-area 3-year tile rule,
 * window & grille compliance, working-hours/noise limits, permit/DRC checklist).
 * Pure presentation over `floorplan/renoRules.ts`; gated by the `renoRulesPack`
 * pro flag at the mount site. No design state — a read-only reference.
 */
export function RenoRulesPanel() {
  const open = useStore((s) => s.renoRulesOpen)
  const setOpen = useStore((s) => s.setRenoRulesOpen)

  if (!open) return null

  return (
    <aside className="panel mini aux" id="renoRulesPanel" style={{ width: 360 }}>
      <AuxPanelHead
        title="SG renovation rules"
        sub={<>HDB / BCA reference · rules as of {RENO_RULES_AS_OF}</>}
        docs="renoRules"
        onClose={() => setOpen(false)}
      />
      <hr className="hr" />
      <div className="panel-body">
        {RENO_RULES.map((section) => (
          <div key={section.id} style={{ marginBottom: 'var(--s-4)' }}>
            <div className="sec-h">{section.title}</div>
            <ul
              style={{
                margin: 'var(--s-1) 0 0',
                paddingLeft: 'var(--s-4)',
                color: 'var(--text-2)',
                fontSize: 'var(--t-sm)',
                lineHeight: 'var(--lh-body)',
              }}
            >
              {section.points.map((p) => (
                <li key={p} style={{ marginBottom: 'var(--s-1)' }}>
                  {p}
                </li>
              ))}
            </ul>
            <div
              style={{ marginTop: 'var(--s-1)', color: 'var(--text-3)', fontSize: 'var(--t-2xs)' }}
            >
              Source: {section.source}
            </div>
          </div>
        ))}
        <div
          style={{ color: 'var(--text-3)', fontSize: 'var(--t-2xs)', lineHeight: 'var(--lh-body)' }}
        >
          Advisory only — verify against the current HDB / BCA sources before any submission.
        </div>
      </div>
    </aside>
  )
}
