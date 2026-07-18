// Shoppable design export (feature F20, flag `shopExport`).
//
// Pure module — no store/DOM access. `buildShopList` assembles the buy-list data
// (grouping identical defId+variant per room, retailer attribution, per-retailer
// + grand totals) from the placed items + merged catalog, reusing the same price
// resolution as the Budget panel / FF&E schedule (`itemPrice`). `buildShopListHtml`
// renders it as a polished, self-contained HTML document (inline <style>, every
// user string 5-char escaped via the moodboard helper) meant to be opened in a
// new window by `openShoplist.ts` and shared/printed.
//
// Licensing rule: product links are attached only when the caller allows them
// (`includeRetailerLinks`) — the opener gates that behind the dev-only `ikeaLive`
// flag, so brand-specific linking never ships in prod while the generic export does.
import { type FloorPlan, pointInRoom } from '../floorplan/types'
import { itemPrice } from '../furniture/furniturePrices'
import type { FurnitureDef, FurnitureItem, IkeaGltfDef } from '../furniture/types'
import { escapeHtml } from './moodboard'

/** Group label for everything without retailer info (estimated prices). */
export const GENERIC_RETAILER = 'Unpriced / generic'

/** One buy-list line: an item type (def + variant) within one room. */
export interface ShopLine {
  name: string
  room: string
  /** Retailer SKU / article number where known (IKEA), else ''. */
  sku: string
  qty: number
  /** Unit price (SGD). */
  unit: number
  /** Line total (SGD) = unit × qty. */
  total: number
  /** Product page (validated http/https); only set when links are allowed. */
  url?: string
}

export interface ShopRetailerGroup {
  retailer: string
  /** True for the generic group — its prices are in-app estimates. */
  estimated: boolean
  lines: ShopLine[]
  /** Group total (SGD). */
  total: number
}

export interface ShopList {
  groups: ShopRetailerGroup[]
  grandTotal: number
  /** Total number of physical pieces (sum of quantities). */
  itemCount: number
}

export interface ShopListOptions {
  /** Attach retailer product links (dev-gated by the caller — see header note). */
  includeRetailerLinks?: boolean
}

/** Accept only absolute http/https URLs before they can land in an href. */
export function sanitizeUrl(raw: string | undefined | null): string | null {
  if (!raw) return null
  const value = raw.trim()
  return /^https?:\/\//i.test(value) ? value : null
}

/** The IKEA variant a placed item resolves to (mirrors `itemPrice`'s pick). */
function ikeaVariant(def: IkeaGltfDef, variant?: string) {
  return (
    def.variants.find((v) => v.finish === variant) ??
    def.variants.find((v) => v.finish === def.activeVariant) ??
    def.variants[0]
  )
}

/**
 * Assemble the buy-list: identical defId+variant items are grouped (per room)
 * with a quantity, lines are bucketed per retailer (IKEA where the def carries
 * retailer info, everything else under {@link GENERIC_RETAILER}), and totals are
 * computed per retailer + overall. Named retailers sort alphabetically with the
 * generic bucket last; within a group, lines follow the plan's room order
 * (Unassigned last) then descending line value then name.
 */
export function buildShopList(
  plan: FloorPlan,
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  opts: ShopListOptions = {},
): ShopList {
  // retailer → line-key → line (+ a room-order rank per line for sorting).
  const buckets = new Map<string, Map<string, ShopLine & { roomRank: number }>>()
  const roomRank = new Map(plan.rooms.map((r, i) => [r.id, i]))
  let itemCount = 0

  for (const it of items) {
    const def = defs[it.defId]
    if (!def) continue
    itemCount += 1
    const variant = typeof it.props['variant'] === 'string' ? it.props['variant'] : undefined
    const isIkea = def.kind === 'gltf' && def.source === 'ikea'
    const retailer = isIkea ? 'IKEA' : GENERIC_RETAILER
    const room = plan.rooms.find((r) => pointInRoom(r, it.position[0], it.position[1]))
    // A custom URL (ITEM-META) is part of the grouping key too — two placed
    // copies of the same def with different custom links must stay separate
    // lines rather than silently collapsing into one (losing one of the links).
    const customUrl = sanitizeUrl(it.meta?.url) ?? undefined
    // A custom price override (ITEM-META) is part of the key too, for the
    // same reason — two instances priced differently can't share one line.
    const customPrice = it.meta?.price
    const key = `${it.defId}::${variant ?? ''}::${room?.id ?? ''}::${customUrl ?? ''}::${customPrice ?? ''}`

    let lines = buckets.get(retailer)
    if (!lines) {
      lines = new Map()
      buckets.set(retailer, lines)
    }
    const existing = lines.get(key)
    if (existing) {
      existing.qty += 1
      existing.total = existing.qty * existing.unit
      continue
    }

    const unit = itemPrice(def, def.category, variant, customPrice)
    let sku = ''
    let url: string | undefined
    if (isIkea) {
      const v = ikeaVariant(def as IkeaGltfDef, variant)
      sku = v?.articleNumber ?? ''
      if (opts.includeRetailerLinks) url = sanitizeUrl(v?.url) ?? undefined
    }
    // A per-instance custom URL (ITEM-META) overrides the retailer link when
    // present — the user's own product/spec page is more authoritative than
    // the generic retailer link, and it's the only link at all for a
    // non-retailer (generic) line.
    if (customUrl) url = customUrl
    lines.set(key, {
      name: variant ? `${def.name} (${variant})` : def.name,
      room: room?.name ?? 'Unassigned',
      sku,
      qty: 1,
      unit,
      total: unit,
      ...(url ? { url } : {}),
      roomRank: room ? (roomRank.get(room.id) ?? 0) : Number.MAX_SAFE_INTEGER,
    })
  }

  // Named retailers alphabetically, the generic bucket always last.
  const retailers = [...buckets.keys()].sort((a, b) => {
    if (a === GENERIC_RETAILER) return 1
    if (b === GENERIC_RETAILER) return -1
    return a.localeCompare(b)
  })
  const groups: ShopRetailerGroup[] = retailers.map((retailer) => {
    const lines = [...buckets.get(retailer)!.values()]
      .sort((a, b) => a.roomRank - b.roomRank || b.total - a.total || a.name.localeCompare(b.name))
      .map(({ roomRank: _rank, ...line }) => line)
    return {
      retailer,
      estimated: retailer === GENERIC_RETAILER,
      lines,
      total: lines.reduce((sum, l) => sum + l.total, 0),
    }
  })
  return {
    groups,
    grandTotal: groups.reduce((sum, g) => sum + g.total, 0),
    itemCount,
  }
}

// --- HTML rendering ----------------------------------------------------------

export interface ShopListHtmlInput {
  /** Design name (untrusted). */
  title: string
  /** Design note (untrusted). */
  note?: string
  /** Budget target (SGD) for the under/over context; null/absent = no target. */
  budgetTarget?: number | null
  /** Pre-formatted generation date (untrusted, escaped anyway). */
  generatedOn?: string
  list: ShopList
}

const sgd = (n: number) => `$${Math.round(n).toLocaleString('en-SG')}`

const STYLES = `
  :root { --bg:#f7f6f3; --fg:#222; --muted:#6b6b6b; --card:#fff; --line:#e3e0da;
    --accent:#3a5a40; --over:#b3422f; --radius:12px; }
  * { box-sizing:border-box; }
  html,body { margin:0; padding:0; }
  body { background:var(--bg); color:var(--fg); line-height:1.45; padding:24px;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
  .sheet { max-width:920px; margin:0 auto; }
  header h1 { font-size:26px; margin:0 0 2px; }
  header .meta { color:var(--muted); font-size:14px; margin:0; }
  header .note { margin:10px 0 0; font-size:14px; white-space:pre-wrap; }
  .summary { display:flex; flex-wrap:wrap; gap:12px; margin:18px 0 26px; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:var(--radius);
    padding:12px 18px; min-width:150px; }
  .stat .k { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.08em;
    color:var(--muted); }
  .stat .v { display:block; font-size:20px; font-weight:650; margin-top:2px; }
  .stat .v.over { color:var(--over); }
  .stat .v.under { color:var(--accent); }
  section { margin:0 0 26px; }
  section h2 { font-size:13px; text-transform:uppercase; letter-spacing:.08em;
    color:var(--muted); margin:0 0 10px; border-bottom:1px solid var(--line);
    padding-bottom:6px; display:flex; justify-content:space-between; align-items:baseline; }
  section h2 .sub { font-size:11px; text-transform:none; letter-spacing:0; font-weight:400; }
  table { width:100%; border-collapse:collapse; background:var(--card);
    border:1px solid var(--line); border-radius:var(--radius); overflow:hidden; }
  th,td { padding:8px 12px; border-bottom:1px solid var(--line); text-align:left;
    font-size:14px; }
  th { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
  td.num,th.num { text-align:right; font-variant-numeric:tabular-nums; }
  td.sku { color:var(--muted); font-size:12px;
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  tr.subtotal td { font-weight:650; border-bottom:none; background:var(--bg); }
  tr.grand td { font-weight:700; font-size:15px; border-bottom:none; background:var(--bg); }
  a { color:var(--accent); }
  footer { color:var(--muted); font-size:12px; margin-top:18px; }
  @media (max-width:520px) { body{padding:14px;} th,td{padding:6px 8px;} .sku{display:none;} }
  @media print { body{background:#fff;padding:0;} section{break-inside:avoid-page;}
    a{color:inherit;text-decoration:none;} }
`

function renderLine(l: ShopLine): string {
  const safeUrl = sanitizeUrl(l.url)
  const name = safeUrl
    ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.name)}</a>`
    : escapeHtml(l.name)
  return (
    `<tr><td>${name}</td><td>${escapeHtml(l.room)}</td>` +
    `<td class="sku">${escapeHtml(l.sku)}</td>` +
    `<td class="num">${escapeHtml(l.qty)}</td>` +
    `<td class="num">${escapeHtml(sgd(l.unit))}</td>` +
    `<td class="num">${escapeHtml(sgd(l.total))}</td></tr>`
  )
}

function renderGroup(g: ShopRetailerGroup): string {
  const sub = g.estimated
    ? '<span class="sub">No retailer on file — indicative in-app estimates</span>'
    : ''
  return (
    `<section><h2>${escapeHtml(g.retailer)}${sub}</h2><table>` +
    '<thead><tr><th>Item</th><th>Room</th><th>SKU</th><th class="num">Qty</th>' +
    '<th class="num">Unit (SGD)</th><th class="num">Total (SGD)</th></tr></thead>' +
    `<tbody>${g.lines.map(renderLine).join('')}` +
    `<tr class="subtotal"><td colspan="5">${escapeHtml(g.retailer)} subtotal</td>` +
    `<td class="num">${escapeHtml(sgd(g.total))}</td></tr></tbody></table></section>`
  )
}

/**
 * Build the complete, self-contained shoppable buy-list HTML document. Every
 * user-controlled string passes through the 5-char `escapeHtml`; product hrefs
 * are re-validated (http/https only) before insertion.
 */
export function buildShopListHtml(input: ShopListHtmlInput): string {
  const title = escapeHtml(input.title || 'Design')
  const { list } = input
  const meta = [
    `${list.itemCount} item${list.itemCount === 1 ? '' : 's'}`,
    input.generatedOn ? escapeHtml(input.generatedOn) : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const note = input.note ? `<p class="note">${escapeHtml(input.note)}</p>` : ''

  const stats: string[] = [
    `<div class="stat"><span class="k">Grand total</span>` +
      `<span class="v">${escapeHtml(sgd(list.grandTotal))}</span></div>`,
  ]
  for (const g of list.groups) {
    stats.push(
      `<div class="stat"><span class="k">${escapeHtml(g.retailer)}</span>` +
        `<span class="v">${escapeHtml(sgd(g.total))}</span></div>`,
    )
  }
  if (typeof input.budgetTarget === 'number' && input.budgetTarget > 0) {
    const diff = input.budgetTarget - list.grandTotal
    const cls = diff >= 0 ? 'under' : 'over'
    const word = diff >= 0 ? 'under' : 'over'
    stats.push(
      `<div class="stat"><span class="k">Budget ${escapeHtml(sgd(input.budgetTarget))}</span>` +
        `<span class="v ${cls}">${escapeHtml(`${sgd(Math.abs(diff))} ${word}`)}</span></div>`,
    )
  }

  const body =
    list.groups.length === 0
      ? '<section><p>No furniture placed yet — furnish the flat, then export again.</p></section>'
      : list.groups.map(renderGroup).join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — Shopping list</title>
<style>${STYLES}</style>
</head>
<body>
<main class="sheet">
<header>
<h1>${title} — Shopping list</h1>
<p class="meta">${meta}</p>
${note}
</header>
<div class="summary">${stats.join('')}</div>
${body}
<footer>Prices in SGD. Items without a retailer are indicative in-app estimates — confirm with
your supplier. Product links open the retailer's page in a new tab.</footer>
</main>
</body>
</html>`
}
