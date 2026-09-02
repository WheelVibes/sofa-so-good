import { useMemo, useState } from 'react'
import { buildSchemeOptions, type SchemeCandidate } from '../analysis/schemeOptions'
import { isDefaultPlan } from '../floorplan/planGeometry'
import { parseBrief, parseBriefBudget } from '../furniture/briefParser'
import { buildMergedCatalog } from '../furniture/catalog'
import { buildPresetItems, LAYOUT_PRESETS } from '../furniture/layoutPresets'
import type { FurnitureItem } from '../furniture/types'
import { useStore } from '../state/store'
import { Button } from './controls/Button'
import { EmptyState } from './EmptyState'
import { Modal } from './Modal'
import { confirmApplyScheme } from './planActions'
import { Icon } from './toolbar/icons'

/** How many schemes to generate — what a designer actually puts in front of a
 *  client. More than three stops being a choice and becomes a catalogue. */
const SCHEME_COUNT = 3

/**
 * Scheme comparison modal (G8) — the review-and-pick surface over
 * `analysis/schemeOptions.ts`.
 *
 * A designer takes a brief and a budget and comes back with a small number of
 * genuinely different schemes, argues the trade-offs, and lets the client
 * choose. This shows each scheme's score breakdown, price and item count, the
 * DERIVED trade-off lines (never invented prose), and applies the chosen one
 * through the confirmed `confirmApplyScheme`.
 *
 * The brief box reuses the existing `briefParser` — it already extracts both a
 * preset id and a budget from free text, so "warm scandi, budget $8000" biases
 * the spread and sets the budget in one field rather than two.
 */
export function SchemeCompareModal() {
  const open = useStore((s) => s.schemeOptionsOpen)
  const setOpen = useStore((s) => s.setSchemeOptionsOpen)
  const plan = useStore((s) => s.floorPlan)
  const doors = useStore((s) => s.doors)

  const [brief, setBrief] = useState('')
  const [generated, setGenerated] = useState(false)

  const comparison = useMemo(() => {
    if (!open || !generated) return null
    const state = useStore.getState()
    const defs = buildMergedCatalog(state)
    // A brief that names a style puts that preset first; the rest of the spread
    // is filled from the gallery so the options stay genuinely different.
    const match = brief.trim()
      ? parseBrief(
          brief,
          LAYOUT_PRESETS.map((p) => ({ id: p.id, name: p.name, description: p.description })),
        )
      : null
    const led = match ? LAYOUT_PRESETS.filter((p) => p.id === match.presetId) : []
    // Fill the rest from the `layout` GROUP first. Measured: those presets
    // author their own living/dining, so they differ in WHAT is placed (a bar
    // cart, angled armchairs, a study nook); `theme`-group presets author no
    // layout, so on the default flat three of them furnish identically and
    // score identically — a restyle, not a set of alternatives. A brief-named
    // preset still leads regardless of its group.
    const others = LAYOUT_PRESETS.filter((p) => !led.some((l) => l.id === p.id))
    const byLayoutFirst = [
      ...others.filter((p) => p.group === 'layout'),
      ...others.filter((p) => p.group !== 'layout'),
    ]
    const presets = [...led, ...byLayoutFirst].slice(0, SCHEME_COUNT)
    // On the curated default flat, use each preset's hand-authored, researched
    // living/dining layout (`buildPresetItems`) rather than a generic kit
    // reseed — that is where the schemes genuinely differ in WHAT is placed
    // (the entertainer's bar cart, the social lounge's angled armchairs). A
    // custom or template plan has no authored overrides, so it falls through to
    // `furnishPlanItems` + the layout seed.
    const authored = isDefaultPlan(plan)
      ? (preset: (typeof LAYOUT_PRESETS)[number]) =>
          buildPresetItems(preset) as unknown as FurnitureItem[]
      : undefined
    return buildSchemeOptions({
      plan,
      defs,
      presets,
      doors,
      budget: brief.trim() ? parseBriefBudget(brief) : null,
      ...(authored ? { itemsFor: authored } : {}),
    })
  }, [open, generated, brief, plan, doors])

  const apply = async (c: SchemeCandidate) => {
    const preset = LAYOUT_PRESETS.find((p) => p.id === c.presetId)
    if (!preset) return
    const ok = await confirmApplyScheme({
      name: c.name,
      itemCount: c.itemCount,
      totalPrice: c.totalPrice,
      floorFinishId: preset.dryFloor,
      wallFinishId: preset.wall,
      items: c.items,
    })
    if (ok) close()
  }

  const close = () => {
    setOpen(false)
    setGenerated(false)
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Compare design schemes"
      width="var(--modal-lg)"
      footer={
        <Button variant="soft" onClick={close}>
          Close
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-1)' }}>
          <span style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            Brief (optional) — a style and a budget, in your own words
          </span>
          <input
            className="input"
            type="text"
            value={brief}
            placeholder="e.g. warm scandi for a young family, budget $8000"
            onChange={(e) => setBrief(e.target.value)}
          />
        </label>

        <Button variant="accent" onClick={() => setGenerated(true)}>
          {generated ? 'Regenerate schemes' : `Generate ${SCHEME_COUNT} schemes`}
        </Button>

        {comparison && comparison.candidates.length === 0 && (
          <EmptyState
            icon={Icon.Presets}
            title="No schemes could be generated"
            description="This plan has no rooms the furnishing kits cover yet. Add or name a room, then try again."
          />
        )}

        {comparison && comparison.candidates.length > 0 && (
          <>
            {comparison.recommendation && (
              <div className="note" style={{ fontSize: 'var(--t-sm)' }}>
                {comparison.recommendation}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {comparison.candidates.map((c, i) => (
                <div key={c.presetId} className="sec">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: 'var(--s-2)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 'var(--t-lg)', fontWeight: 800 }}>
                        {i === 0 ? `${c.name} · recommended` : c.name}
                      </div>
                      <div style={{ fontSize: 'var(--t-xs)', color: 'var(--text-3)' }}>
                        {c.description}
                      </div>
                    </div>
                    <div className="tabular-nums" style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 'var(--t-lg)', fontWeight: 800 }}>
                        {c.score.overall}
                      </div>
                      <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
                        {c.score.grade}
                      </div>
                    </div>
                  </div>

                  <div
                    className="tabular-nums"
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 'var(--s-2)',
                      marginTop: 'var(--s-2)',
                      fontSize: 'var(--t-xs)',
                      color: 'var(--text-2)',
                    }}
                  >
                    {c.score.categories.map((cat) => (
                      <span key={cat.id}>
                        {cat.label} {cat.score}
                      </span>
                    ))}
                    {c.critique.applied > 0 && (
                      <span style={{ fontWeight: 700 }}>Layout quality {c.critique.score}</span>
                    )}
                  </div>

                  <div
                    className="tabular-nums"
                    style={{
                      display: 'flex',
                      gap: 'var(--s-3)',
                      marginTop: 'var(--s-2)',
                      fontSize: 'var(--t-sm)',
                    }}
                  >
                    <span>${c.totalPrice.toLocaleString()}</span>
                    <span style={{ color: 'var(--text-3)' }}>{c.itemCount} items</span>
                    {c.budget && (
                      <span style={{ color: c.budget.pass ? 'var(--ok)' : 'var(--danger)' }}>
                        {c.budget.pass
                          ? 'within budget'
                          : `over by $${c.budget.overBy.toLocaleString()}`}
                      </span>
                    )}
                  </div>

                  {c.critique.findings.filter((f) => f.verdict === 'fail' || f.verdict === 'warn')
                    .length > 0 && (
                    <ul
                      style={{
                        margin: 'var(--s-2) 0 0',
                        paddingLeft: 'var(--s-4)',
                        fontSize: 'var(--t-xs)',
                        color: 'var(--text-3)',
                        lineHeight: 'var(--lh-body)',
                      }}
                    >
                      {c.critique.findings
                        .filter((f) => f.verdict === 'fail' || f.verdict === 'warn')
                        .slice(0, 3)
                        .map((f) => (
                          <li key={`${f.id}-${f.roomName ?? ''}-${f.detail}`}>
                            {f.roomName ? `${f.roomName} — ` : ''}
                            {f.label}: {f.detail}
                          </li>
                        ))}
                    </ul>
                  )}

                  <div style={{ marginTop: 'var(--s-3)' }}>
                    <Button
                      variant={i === 0 ? 'accent' : 'soft'}
                      size="sm"
                      onClick={() => apply(c)}
                    >
                      Use this scheme
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {comparison.tradeoffs.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 'var(--t-2xs)',
                    fontWeight: 700,
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                    color: 'var(--text-3)',
                  }}
                >
                  Trade-offs
                </div>
                <ul
                  style={{
                    margin: 'var(--s-1) 0 0',
                    paddingLeft: 'var(--s-4)',
                    fontSize: 'var(--t-xs)',
                    color: 'var(--text-2)',
                    lineHeight: 'var(--lh-body)',
                  }}
                >
                  {comparison.tradeoffs.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="note" style={{ fontSize: 'var(--t-2xs)' }}>
              Schemes differ in finish, styling and layout. The design score weights clearance and
              furnishing most heavily, so it favours a workable room over a bold one. "Layout
              quality" is a separate measurement against published spacing standards — TV viewing
              distance, conversation range, coffee-table reach and sofa proportion — and it is what
              breaks a tie on the design score. Both are geometry, not taste: the per-check figures
              are shown so you can overrule either.
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
