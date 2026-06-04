import { useMemo } from 'react'
import { useCatalog } from '../furniture/catalog'
import { itemPrice } from '../furniture/furniturePrices'
import { FURNITURE_CATEGORIES, type FurnitureCategory } from '../furniture/types'
import { useStore } from '../state/store'
import { CategoryIcon } from './catalog/CategoryIcon'
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

interface Line {
  defId: string
  name: string
  count: number
  each: number
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
  const collections = useStore((s) => s.collections)
  const toggleCollection = useStore((s) => s.toggleCollection)

  const { groups, total, count } = useMemo(() => {
    const byCat = new Map<FurnitureCategory, Map<string, Line>>()
    let total = 0
    let count = 0
    for (const it of items) {
      const def = catalog[it.defId]
      if (!def) continue
      const cat = def.category
      // Per-instance IKEA finish (if any) — so two instances on different,
      // differently-priced finishes price + group as distinct lines.
      const variant = typeof it.props['variant'] === 'string' ? it.props['variant'] : undefined
      const each = itemPrice(def, cat, variant)
      total += each
      count += 1
      if (!byCat.has(cat)) byCat.set(cat, new Map())
      const lines = byCat.get(cat)!
      const lineKey = variant ? `${it.defId}::${variant}` : it.defId
      const existing = lines.get(lineKey)
      if (existing) existing.count += 1
      else lines.set(lineKey, { defId: it.defId, name: def.name, count: 1, each })
    }
    const groups = FURNITURE_CATEGORIES.filter((c) => byCat.has(c)).map((c) => {
      const lines = [...byCat.get(c)!.values()].sort((a, b) => b.each * b.count - a.each * a.count)
      const subtotal = lines.reduce((s, l) => s + l.each * l.count, 0)
      return { cat: c, lines, subtotal }
    })
    return { groups, total, count }
  }, [items, catalog])

  if (!open) return null
  const fmt = (n: number) => `$${n.toLocaleString('en-SG')}`
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
            <p className="empty-mini">
              <span className="em-ic">
                <Icon.Heart width={20} height={20} />
              </span>
              <b>No saved items</b>
              <span>Tap the heart on any catalog card to save it here.</span>
            </p>
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
            <span className="big mono">{fmt(total)}</span>
            <span className="panel-sub">{count} items</span>
          </div>
          <div className="bud-list" style={{ marginTop: 'var(--s-2)' }}>
            {groups.length === 0 ? (
              <p className="empty-mini">
                <span>No furniture placed yet.</span>
              </p>
            ) : (
              groups.map((g) => (
                <div key={g.cat} style={{ marginBottom: 'var(--s-4)' }}>
                  <div className="sec-h">
                    <span>{CATEGORY_LABEL[g.cat]}</span>
                    <span className="mono">{fmt(g.subtotal)}</span>
                  </div>
                  {g.lines.map((l) => (
                    <div className="row" key={l.defId} style={{ padding: '5px 0' }}>
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
                      <span className="amt">{fmt(l.each * l.count)}</span>
                    </div>
                  ))}
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
                  (l) => `${l.name}${l.count > 1 ? ` x${l.count}` : ''}\t${fmt(l.each * l.count)}`,
                ),
              ])
              lines.push('', `TOTAL\t${fmt(total)} (${count} items)`)
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
            Approx. mid-market retail (SGD). Finishes &amp; reno excluded.
          </p>
        </div>
      )}
    </aside>
  )
}
