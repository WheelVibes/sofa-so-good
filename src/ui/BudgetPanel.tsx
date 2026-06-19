import { useEffect, useMemo, useState } from 'react'
import { useLivePrices } from '../catalog/pricing/livePrice'
import { useFeature } from '../features/useFeature'
import { useCatalog } from '../furniture/catalog'
import { itemPrice } from '../furniture/furniturePrices'
import { buildShoppingGroups, type Line } from '../furniture/shoppingGroups'
import { spendByRoom } from '../furniture/spendByRoom'
import type { FurnitureCategory } from '../furniture/types'
import { useStore } from '../state/store'
import { safeUrl } from '../utils/safeUrl'
import { CategoryIcon } from './catalog/CategoryIcon'
import { EmptyState } from './EmptyState'
import { buildShoppingCsv } from './shoppingCsv'
import { Icon } from './toolbar/icons'

const CATEGORY_LABEL: Record<FurnitureCategory, string> = {
  beds: 'Beds',
  seating: 'Seating',
  tables: 'Tables',
  storage: 'Storage',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  appliances: 'Appliances',
  lighting: 'Lighting',
  decor: 'Decor',
  textiles: 'Textiles',
  outdoor: 'Outdoor',
  electronics: 'Electronics',
  kids: 'Baby & Kids',
  laundry: 'Laundry',
  others: 'Others',
}

/**
 * Live budget / shopping list. Groups every placed furniture item by category,
 * tallies counts, and totals an approximate retail cost (SGD). A practical aid
 * for "what would furnishing this cost?" — clearly an estimate.
 */
export function BudgetPanel() {
  const open = useStore((s) => s.budgetOpen)
  const toggle = useStore((s) => s.toggleBudget)
  const items = useStore((s) => s.items)
  const catalog = useCatalog()
  const shopTab = useStore((s) => s.shopTab)
  const setShopTab = useStore((s) => s.setShopTab)
  const collections = useStore((s) => s.favouriteDefIds)
  const toggleCollection = useStore((s) => s.toggleFavourite)
  const budgetTarget = useStore((s) => s.budgetTarget)
  const setBudgetTarget = useStore((s) => s.setBudgetTarget)
  const plan = useStore((s) => s.floorPlan)

  const { groups, total, count } = useMemo(
    () => buildShoppingGroups(items, catalog),
    [items, catalog],
  )

  // Per-room spend (estimate-based, so room subtotals always sum to `total`).
  // Complements "by category": which *room* is the budget going into.
  const byRoom = useMemo(() => spendByRoom(items, catalog, plan.rooms), [items, catalog, plan])

  // Live SG retailer prices (dev-only, via the `npm run price-server` sidecar:
  // IKEA SG / Courts / HipVan / Castlery). Off by default; when on, each line
  // shows every retailer's top-match price + buy link cheapest-first, totals
  // use the cheapest offer, and anything the sidecar can't resolve falls back
  // to the bundled estimate.
  const [liveOn, setLiveOn] = useState(false)
  // Gated through the (devOnly) feature flag, not the raw build env, so the
  // flag registry is the single source of truth (admins/QA can toggle it).
  const livePricesEnabled = useFeature('livePrices')
  const liveEntries = useMemo(
    () => groups.flatMap((g) => g.lines.map((l) => ({ id: l.name, query: l.name }))),
    [groups],
  )
  const livePrices = useLivePrices(liveEntries, livePricesEnabled && liveOn && open)

  if (!open) return null
  const fmt = (n: number) => `$${n.toLocaleString('en-SG')}`
  // Offers arrive cheapest-first; the cheapest one drives line/total pricing.
  const eachOf = (l: Line) => livePrices[l.name]?.[0]?.price ?? l.each
  const liveTotal = groups.reduce(
    (s, g) => s + g.lines.reduce((t, l) => t + eachOf(l) * l.count, 0),
    0,
  )
  const shownTotal = liveOn ? liveTotal : total
  const saved = collections.map((id) => catalog[id]).filter((d): d is NonNullable<typeof d> => !!d)

  return (
    <aside className="panel mini aux">
      <div className="panel-head">
        <div>
          <div className="panel-title">Shopping</div>
          <div className="panel-sub">Budget &amp; collections</div>
        </div>
        <button type="button" onClick={toggle} className="icon-btn" aria-label="Close budget">
          <Icon.Close width={16} height={16} />
        </button>
      </div>
      <div className="shop-tabs" style={{ padding: '0 var(--s-4)' }}>
        <button
          type="button"
          className={`tab${shopTab === 'list' ? ' on' : ''}`}
          onClick={() => setShopTab('list')}
        >
          List · {count}
        </button>
        <button
          type="button"
          className={`tab${shopTab === 'saved' ? ' on' : ''}`}
          onClick={() => setShopTab('saved')}
        >
          Saved · {saved.length}
        </button>
      </div>
      <hr className="hr" />
      {shopTab === 'saved' ? (
        <div className="panel-body">
          {saved.length === 0 ? (
            <EmptyState
              icon={Icon.Heart}
              title="No saved items"
              description="Tap the heart on any catalog card to save it here for later."
            />
          ) : (
            <div className="coll-grid">
              {saved.map((d) => (
                <div className="coll-card" key={d.id}>
                  <button
                    type="button"
                    className="coll-x"
                    aria-label="Remove from saved"
                    onClick={() => toggleCollection(d.id)}
                  >
                    <Icon.Close width={12} height={12} />
                  </button>
                  <div className="card-thumb">
                    <CategoryIcon category={d.category} width={24} height={24} />
                  </div>
                  <span className="nm">{d.name}</span>
                  <span className="pr">{fmt(itemPrice(d, d.category))}</span>
                  <button
                    type="button"
                    className="btn btn-soft btn-sm add"
                    onClick={() => {
                      const s = useStore.getState()
                      s.setActiveDefId(d.id)
                    }}
                  >
                    <Icon.Plus width={12} height={12} />
                    Add to room
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="panel-body">
          <div className="bud-total">
            <span className="big mono">{fmt(shownTotal)}</span>
            <span className="panel-sub">{count} items</span>
          </div>
          <BudgetTarget
            target={budgetTarget}
            spent={shownTotal}
            fmt={fmt}
            onChange={setBudgetTarget}
          />
          {groups.length > 1 && shownTotal > 0 ? (
            <div className="bud-breakdown" style={{ margin: 'var(--s-2) 0 var(--s-1)' }}>
              <div
                className="label"
                style={{ fontSize: 'var(--t-2xs)', marginBottom: 4, color: 'var(--text-3)' }}
              >
                Spend by category
              </div>
              {groups
                .map((g) => ({
                  cat: g.cat,
                  amt: g.lines.reduce((s, l) => s + eachOf(l) * l.count, 0),
                  n: g.lines.reduce((s, l) => s + l.count, 0),
                }))
                .sort((a, b) => b.amt - a.amt)
                .map(({ cat, amt, n }) => {
                  const pct = Math.round((amt / shownTotal) * 100)
                  return (
                    <div key={cat} style={{ marginBottom: 5 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 'var(--t-2xs)',
                          color: 'var(--text-2)',
                        }}
                      >
                        <span>
                          {CATEGORY_LABEL[cat]} · {n} · {pct}%
                        </span>
                        <span className="mono">{fmt(amt)}</span>
                      </div>
                      <div
                        style={{
                          height: 5,
                          borderRadius: 999,
                          background: 'var(--surface-2)',
                          overflow: 'hidden',
                          marginTop: 2,
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
          ) : null}
          {byRoom.rows.length > 1 && byRoom.sum > 0 ? (
            <div className="bud-breakdown" style={{ margin: 'var(--s-2) 0 var(--s-1)' }}>
              <div
                className="label"
                style={{ fontSize: 'var(--t-2xs)', marginBottom: 4, color: 'var(--text-3)' }}
              >
                Spend by room
              </div>
              {byRoom.rows.map(({ name, amt, count }) => {
                const pct = Math.round((amt / byRoom.sum) * 100)
                return (
                  <div key={name} style={{ marginBottom: 5 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 'var(--t-2xs)',
                        color: 'var(--text-2)',
                      }}
                    >
                      <span>
                        {name} · {count} · {pct}%
                      </span>
                      <span className="mono">{fmt(amt)}</span>
                    </div>
                    <div
                      style={{
                        height: 5,
                        borderRadius: 999,
                        background: 'var(--surface-2)',
                        overflow: 'hidden',
                        marginTop: 2,
                      }}
                    >
                      <div
                        style={{ width: `${pct}%`, height: '100%', background: 'var(--accent-2)' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}
          {groups.length > 0 ? (
            <button
              type="button"
              className="btn ghost sm"
              style={{ marginTop: 'var(--s-2)' }}
              title="Download the shopping list as a CSV (for a spreadsheet or supplier)"
              onClick={() => {
                const lines = groups.flatMap((g) =>
                  g.lines.map((l) => ({
                    category: CATEGORY_LABEL[g.cat],
                    item: l.name,
                    qty: l.count,
                    unit: eachOf(l),
                    total: eachOf(l) * l.count,
                  })),
                )
                const csv = buildShoppingCsv(lines, shownTotal)
                const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
                const a = document.createElement('a')
                a.href = url
                a.download = `shopping-list-${new Date().toISOString().slice(0, 10)}.csv`
                document.body.appendChild(a)
                a.click()
                a.remove()
                setTimeout(() => URL.revokeObjectURL(url), 0)
                useStore
                  .getState()
                  .notify.start({ title: 'Shopping list exported (CSV)', kind: 'success' })
              }}
            >
              Export CSV
            </button>
          ) : null}
          {livePricesEnabled && (
            <label
              className="panel-sub"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                textTransform: 'none',
                letterSpacing: 0,
                cursor: 'pointer',
                marginTop: 4,
              }}
              title="Fetch real SG retailer prices (IKEA, Courts, HipVan, Castlery) via the local price-server sidecar"
            >
              <input
                type="checkbox"
                checked={liveOn}
                onChange={(e) => setLiveOn(e.target.checked)}
              />
              Live SG retailer prices
            </label>
          )}
          <div className="bud-list" style={{ marginTop: 'var(--s-2)' }}>
            {groups.length === 0 ? (
              <EmptyState
                icon={Icon.Budget}
                title="No furniture placed yet"
                description="Add items from the catalog and a running cost estimate will build up here."
              />
            ) : (
              groups.map((g) => (
                <div key={g.cat} style={{ marginBottom: 'var(--s-4)' }}>
                  <div className="sec-h">
                    <span>{CATEGORY_LABEL[g.cat]}</span>
                    <span className="mono">
                      {fmt(g.lines.reduce((t, l) => t + eachOf(l) * l.count, 0))}
                    </span>
                  </div>
                  {g.lines.map((l) => {
                    const offers = (liveOn ? livePrices[l.name] : undefined) ?? []
                    return (
                      <div key={l.defId} style={{ padding: '5px 0' }}>
                        <div className="row">
                          <span
                            className="rk"
                            style={{
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {l.name}
                            {l.count > 1 ? ` ×${l.count}` : ''}
                          </span>
                          <span className="amt">{fmt(eachOf(l) * l.count)}</span>
                        </div>
                        {offers.length > 0 && (
                          // Cheapest-first retailer offers; wraps on narrow widths.
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '2px 8px',
                              fontSize: 'var(--t-2xs)',
                            }}
                          >
                            {offers.map((o) => {
                              const href = safeUrl(o.url)
                              return href ? (
                                <a
                                  key={o.retailer}
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={`${o.title} · ${o.retailerLabel ?? o.retailer}`}
                                  style={{ color: 'var(--accent)', whiteSpace: 'nowrap' }}
                                >
                                  {o.retailerLabel ?? o.retailer} {fmt(o.price)}↗
                                </a>
                              ) : (
                                <span
                                  key={o.retailer}
                                  title={o.title}
                                  style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}
                                >
                                  {o.retailerLabel ?? o.retailer} {fmt(o.price)}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            className="btn btn-soft btn-block"
            style={{ marginTop: 'var(--s-3)' }}
            onClick={() => {
              const lines = groups.flatMap((g) => [
                `# ${CATEGORY_LABEL[g.cat]}`,
                ...g.lines.map(
                  (l) =>
                    `${l.name}${l.count > 1 ? ` x${l.count}` : ''}\t${fmt(eachOf(l) * l.count)}`,
                ),
              ])
              lines.push('', `TOTAL\t${fmt(shownTotal)} (${count} items)`)
              void navigator.clipboard?.writeText(lines.join('\n'))
            }}
          >
            <Icon.Download width={14} height={14} />
            Copy shopping list
          </button>
          <p
            className="panel-sub"
            style={{
              marginTop: 'var(--s-3)',
              textTransform: 'none',
              letterSpacing: 0,
              fontWeight: 500,
              lineHeight: 1.4,
            }}
          >
            {liveOn
              ? 'Live SG retailer top-match prices (cheapest used) where found, else estimate. Finishes & reno excluded.'
              : 'Approx. mid-market retail (SGD). Finishes & reno excluded.'}
          </p>
        </div>
      )}
    </aside>
  )
}

/** Optional spending target with a progress bar + remaining/over read-out.
 *  Editing the field updates the persisted store target (cleared when blank). */
function BudgetTarget({
  target,
  spent,
  fmt,
  onChange,
}: {
  target: number | null
  spent: number
  fmt: (n: number) => string
  onChange: (t: number | null) => void
}) {
  const [draft, setDraft] = useState(target != null ? String(target) : '')
  // Keep the field in sync if the target is changed elsewhere (e.g. on load).
  useEffect(() => {
    setDraft(target != null ? String(target) : '')
  }, [target])

  const has = target != null && target > 0
  const pct = has ? Math.min(1, spent / target) : 0
  const over = has && spent > target
  const remaining = has ? target - spent : 0

  return (
    <div style={{ margin: 'var(--s-2) 0 var(--s-1)' }}>
      <label className="row" style={{ gap: 8, fontSize: 'var(--t-xs)' }}>
        <span className="label" style={{ whiteSpace: 'nowrap' }}>
          Budget target
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          <span style={{ color: 'var(--text-3)' }}>$</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={draft}
            placeholder="none"
            aria-label="Budget target (SGD)"
            onChange={(e) => {
              setDraft(e.target.value)
              const n = parseFloat(e.target.value)
              onChange(Number.isFinite(n) && n > 0 ? n : null)
            }}
            className="input mono"
            style={{ width: 90, textAlign: 'right' }}
          />
        </span>
      </label>
      {!has && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          {[10000, 25000, 50000, 100000].map((v) => (
            <button
              key={v}
              type="button"
              className="btn btn-soft"
              style={{ flex: 1, fontSize: 'var(--t-2xs)', padding: '3px 0' }}
              onClick={() => {
                setDraft(String(v))
                onChange(v)
              }}
            >
              ${v / 1000}k
            </button>
          ))}
        </div>
      )}
      {has && (
        <>
          <div
            style={{
              height: 6,
              borderRadius: 999,
              background: 'var(--surface-2)',
              overflow: 'hidden',
              marginTop: 6,
            }}
          >
            <div
              style={{
                width: `${pct * 100}%`,
                height: '100%',
                background: over ? 'var(--danger)' : 'var(--accent)',
                transition: 'width .2s',
              }}
            />
          </div>
          <div
            style={{
              fontSize: 'var(--t-2xs)',
              marginTop: 4,
              fontWeight: 600,
              color: over ? 'var(--danger)' : 'var(--text-2)',
            }}
          >
            {over
              ? `Over by ${fmt(spent - target)}`
              : `${fmt(remaining)} left · ${Math.round(pct * 100)}% of ${fmt(target)}`}
          </div>
        </>
      )}
    </div>
  )
}
