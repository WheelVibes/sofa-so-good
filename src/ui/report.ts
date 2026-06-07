/**
 * Builds a printable HTML "design report" — apartment name, per-room areas +
 * total, a furniture shopping list with an approximate budget, and a hero
 * render. Opened in a new window so the user can print / save as PDF.
 */
import { ROOMS } from '../apartment/constants'
import { obbCorners } from '../collision/obb'
import { itemFootprint } from '../collision/placement'
import type { FloorPlan } from '../floorplan/types'
import { planRoomArea, planTotalArea } from '../floorplan/types'
import { CATEGORY_COLORS } from '../furniture/categoryColors'
import { itemPrice } from '../furniture/furniturePrices'
import type { FurnitureCategory, FurnitureDef, FurnitureItem } from '../furniture/types'
import { FURNITURE_CATEGORIES } from '../furniture/types'
import { blockedDoorItems } from '../layout/clearance'
import { BUILTIN_MATERIALS } from '../materials/builtinCatalog'
import type { MeasurementAnnotation } from '../state/slices/measurementsSlice'
import { formatArea, formatDims, type UnitSystem } from '../utils/measurement'
import { designPalette, floorAreaByFinish, furnitureItemsByRoom } from './reportData'
import { reportPlanSvg } from './reportPlanSvg'

const CAT_LABEL: Record<FurnitureCategory, string> = {
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

const esc = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
const sgd = (n: number) => `$${Math.round(n).toLocaleString('en-SG')}`

/** Per-room floor + wall finish material ids (the store's `finishes` slice). */
export interface ReportFinishes {
  floor: Record<string, string>
  walls: Record<string, string>
}

export function buildReportHtml(
  plan: FloorPlan,
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  heroDataUrl: string | null,
  units: UnitSystem = 'metric',
  finishes?: ReportFinishes,
  note?: string,
  annotations: MeasurementAnnotation[] = [],
): string {
  // Finishes-by-room section: floor + wall material names per non-external room.
  // Material ids resolve to friendly names via the builtin catalog (DLC/custom
  // ids fall back to the raw id). Only rendered when finishes are supplied.
  const matName = (id: string | undefined): string =>
    id ? (BUILTIN_MATERIALS[id]?.name ?? id) : '—'
  // Chip colour for a finish id (custom colour → itself; builtin → its swatch;
  // unknown/unset → none). Lets the finishes table read at a glance like the
  // palette chips do.
  const matSwatch = (id: string | undefined): string | null => {
    if (!id) return null
    if (id.startsWith('#')) return id
    return BUILTIN_MATERIALS[id]?.swatch ?? null
  }
  const matCell = (id: string | undefined): string => {
    const sw = matSwatch(id)
    const chip = sw ? `<span class="msw" style="background:${esc(sw)}"></span>` : ''
    return `${chip}${esc(matName(id))}`
  }
  // Iterate the ACTIVE plan's rooms (not the default ROOMS constant) so custom
  // floor plans show their own rooms + finishes; skip only the default plan's
  // external (non-finishable) ledges. Finishes are keyed by room id.
  const floorOf = finishes?.floor as Record<string, string> | undefined
  const wallOf = finishes?.walls as Record<string, string> | undefined
  const finishRows = finishes
    ? plan.rooms
        .filter((r) => !ROOMS[r.id as keyof typeof ROOMS]?.external)
        .map(
          (r) =>
            `<tr><td>${esc(r.name)}</td><td>${matCell(floorOf?.[r.id])}</td><td>${matCell(wallOf?.[r.id])}</td></tr>`,
        )
        .join('')
    : ''
  // Flooring schedule: total floor area per finish — the "how much to order"
  // procurement view (only when finishes are supplied + at least one finish set).
  const flooringRows = finishes
    ? floorAreaByFinish(plan, floorOf)
        .map(
          (f) =>
            `<tr><td>${matCell(f.id)}</td><td class="num">${esc(formatArea(f.area, units))}</td></tr>`,
        )
        .join('')
    : ''
  // Rooms (skip external ledges with ~0 interior use are still listed). Plain
  // rectangular rooms show their W×D dimensions (a room schedule detail); L-shape
  // / polygon rooms omit them (a bounding box would mislead) — area only.
  const roomRows = plan.rooms
    .map((r) => {
      const dims = !r.polygon && !r.extension ? formatDims(r.width, r.depth, units) : ''
      return `<tr><td>${esc(r.name)}</td><td class="dim">${dims}</td><td class="num">${formatArea(planRoomArea(r), units)}</td></tr>`
    })
    .join('')
  const totalArea = planTotalArea(plan)

  // Furniture grouped by category.
  const byCat = new Map<
    FurnitureCategory,
    Map<string, { name: string; count: number; each: number }>
  >()
  let budget = 0
  for (const it of items) {
    const def = catalog[it.defId]
    if (!def) continue
    const variant = typeof it.props['variant'] === 'string' ? it.props['variant'] : undefined
    const each = itemPrice(def, def.category, variant)
    budget += each
    if (!byCat.has(def.category)) byCat.set(def.category, new Map())
    const m = byCat.get(def.category)!
    const lineKey = variant ? `${it.defId}::${variant}` : it.defId
    const ex = m.get(lineKey)
    if (ex) ex.count += 1
    else m.set(lineKey, { name: def.name, count: 1, each })
  }
  const furnitureRows = FURNITURE_CATEGORIES.filter((c) => byCat.has(c))
    .map((c) => {
      const lines = [...byCat.get(c)!.values()].sort((a, b) => b.each * b.count - a.each * a.count)
      const sub = lines.reduce((s, l) => s + l.each * l.count, 0)
      return (
        `<tr class="cat"><td>${CAT_LABEL[c]}</td><td class="num">${sgd(sub)}</td></tr>` +
        lines
          .map(
            (l) =>
              `<tr><td class="indent">${esc(l.name)}${l.count > 1 ? ` ×${l.count}` : ''}</td><td class="num">${sgd(l.each * l.count)}</td></tr>`,
          )
          .join('')
      )
    })
    .join('')

  // Furniture by room — each room's pieces (grouped + priced), attributed to the
  // room containing each item's footprint centre. The room-by-room furnishing
  // list a client/installer handoff wants.
  const roomBreakdown = furnitureItemsByRoom(plan, items, catalog)
  const roomCostRows = roomBreakdown
    .map(
      (r) =>
        `<tr class="cat"><td>${esc(r.name)} · ${r.count} item${r.count === 1 ? '' : 's'}${r.area > 0 ? ` · ${formatArea(r.area, units)}` : ''}</td><td class="num">${sgd(r.total)}</td></tr>` +
        r.lines
          .map(
            (l) =>
              `<tr><td class="indent">${esc(l.name)}${l.count > 1 ? ` ×${l.count}` : ''}</td><td class="num">${sgd(l.each * l.count)}</td></tr>`,
          )
          .join(''),
    )
    .join('')

  // Material palette ("style board"): the distinct floor + wall finishes in use,
  // as colour chips. A quick at-a-glance read of the scheme for a client.
  const palette = designPalette(finishes)
  const paletteChips = palette
    .map(
      (p) =>
        `<div class="chip"><span class="sw" style="background:${esc(p.swatch)}"></span><span class="cn">${esc(p.name)}</span></div>`,
    )
    .join('')

  // Furniture footprints (top-down OBB corners) for the plan diagram, so the
  // report's floor plan shows a furnished layout — "where everything goes".
  const planFootprints = items
    .map((it) => {
      const def = catalog[it.defId]
      // Guard defaultFootprint: a malformed def shouldn't crash the whole report.
      if (!def?.defaultFootprint) return null
      return { corners: obbCorners(itemFootprint(it, def)), fill: CATEGORY_COLORS[def.category] }
    })
    .filter((f): f is { corners: [number, number][]; fill: string } => f != null)
  const planSvg = reportPlanSvg(plan, annotations, units, planFootprints)
  // Legend: the furniture categories actually present, colour-keyed to the plan.
  const presentCats = FURNITURE_CATEGORIES.filter((c) =>
    items.some((it) => catalog[it.defId]?.category === c),
  )
  const planLegend =
    planSvg && presentCats.length > 0
      ? `<div class="plan-legend">${presentCats
          .map(
            (c) =>
              `<span class="lg-item"><span class="lg-sw" style="background:${CATEGORY_COLORS[c]}"></span>${CAT_LABEL[c]}</span>`,
          )
          .join('')}</div>`
      : ''

  // Clearance & fit: flag any furniture sitting in a doorway path (the same
  // check the in-app "Checks" overlay runs), grouped by name with counts. A
  // handoff report should say plainly whether the layout is buildable.
  const hasDoors = (plan.openings ?? []).some((o) => o.kind === 'door')
  const blockedIds = hasDoors && items.length > 0 ? blockedDoorItems(items, catalog, plan) : []
  const blockedCounts = new Map<string, number>()
  for (const id of blockedIds) {
    const it = items.find((i) => i.id === id)
    const name = it?.label ?? (it && catalog[it.defId]?.name) ?? 'Item'
    blockedCounts.set(name, (blockedCounts.get(name) ?? 0) + 1)
  }
  const clearanceSection =
    hasDoors && items.length > 0
      ? blockedCounts.size === 0
        ? `<div class="room-cost"><h2>Clearance &amp; fit</h2><div class="ok">✓ All doorways clear — no furniture blocks a door.</div></div>`
        : `<div class="room-cost"><h2>Clearance &amp; fit</h2><div class="warn">${blockedCounts.size} item${
            blockedCounts.size === 1 ? '' : 's'
          } block a doorway:</div><table>${[...blockedCounts.entries()]
            .map(
              ([name, n]) =>
                `<tr><td class="indent">${esc(name)}${n > 1 ? ` ×${n}` : ''}</td></tr>`,
            )
            .join('')}</table></div>`
      : ''

  const hero = heroDataUrl ? `<img class="hero" src="${heroDataUrl}" alt="render"/>` : ''
  const date = new Date().toLocaleDateString('en-SG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(plan.name)} — Design Report</title>
<style>
  * { box-sizing: border-box; }
  body { font: 13px/1.5 -apple-system, Segoe UI, Roboto, sans-serif; color: #1f2937; margin: 0; padding: 32px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  .sub { color: #6b7280; margin-bottom: 18px; }
  .hero { width: 100%; max-height: 360px; object-fit: cover; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e5e7eb; }
  .cols { display: flex; gap: 28px; align-items: flex-start; }
  .col { flex: 1; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; color: #374151; }
  td.dim { color: #9ca3af; font-variant-numeric: tabular-nums; font-size: 12px; padding-left: 12px; }
  .msw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: middle; border: 1px solid rgba(0,0,0,.12); }
  tr.cat td { font-weight: 600; padding-top: 8px; }
  td.indent { padding-left: 12px; color: #4b5563; }
  .total { display: flex; justify-content: space-between; font-weight: 700; font-size: 15px; border-top: 2px solid #1f2937; margin-top: 8px; padding-top: 6px; }
  .subtotal { display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; margin-top: 3px; }
  .note { background: #f9fafb; border-left: 3px solid #d1d5db; padding: 8px 12px; border-radius: 4px; margin-bottom: 16px; color: #374151; white-space: pre-wrap; }
  .room-cost { margin-top: 24px; max-width: 360px; }
  .plan-wrap { margin-top: 16px; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; background: #fff; }
  .palette { margin-top: 24px; }
  .chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
  .chip { display: flex; align-items: center; gap: 7px; border: 1px solid #e5e7eb; border-radius: 999px; padding: 4px 10px 4px 4px; }
  .chip .sw { width: 20px; height: 20px; border-radius: 50%; border: 1px solid rgba(0,0,0,.12); flex: none; }
  .chip .cn { font-size: 12px; color: #374151; }
  .plan-svg { width: 100%; height: auto; max-height: 280px; display: block; }
  .plan-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; font-size: 11px; color: #6b7280; }
  .lg-item { display: inline-flex; align-items: center; gap: 5px; }
  .lg-sw { width: 10px; height: 10px; border-radius: 2px; display: inline-block; opacity: 0.7; }
  .ok { color: #047857; font-weight: 600; margin-top: 6px; }
  .warn { color: #b45309; font-weight: 600; margin-top: 6px; }
  .foot { margin-top: 24px; color: #9ca3af; font-size: 11px; }
  /* Keep sections + tables whole across PDF pages, and never strand a heading. */
  .room-cost, .palette, .plan-wrap, .note { break-inside: avoid; }
  tr, .chip, .lg-item, .total { break-inside: avoid; }
  h2 { break-after: avoid; }
  @media print {
    body { padding: 0; }
    .hero { max-height: 300px; break-inside: avoid; }
    .cols { gap: 20px; }
  }
</style></head>
<body>
  <h1>${esc(plan.name)}</h1>
  <div class="sub">Interior design report · ${date} · ${plan.rooms.length} ${plan.rooms.length === 1 ? 'room' : 'rooms'} · ${formatArea(totalArea, units)} · ${items.length} furniture pieces</div>
  ${note?.trim() ? `<div class="note">${esc(note.trim())}</div>` : ''}
  ${hero}
  <div class="cols">
    <div class="col">
      <h2>Rooms &amp; areas</h2>
      <table>${roomRows}</table>
      <div class="total"><span>Total interior</span><span>${formatArea(totalArea, units)}</span></div>
      ${planSvg ? `<div class="plan-wrap">${planSvg}</div>${planLegend}` : ''}
    </div>
    <div class="col">
      <h2>Furniture &amp; budget</h2>
      <table>${furnitureRows || '<tr><td>No furniture placed.</td></tr>'}</table>
      <div class="total"><span>Estimated total</span><span>${sgd(budget)}</span></div>
      ${
        totalArea > 0.01 && budget > 0
          ? `<div class="subtotal"><span>Furnishing per ${units === 'imperial' ? 'ft²' : 'm²'}</span><span>${sgd(
              budget / (units === 'imperial' ? totalArea * 10.7639 : totalArea),
            )}</span></div>`
          : ''
      }
    </div>
  </div>
  ${
    roomCostRows
      ? `<div class="room-cost">
      <h2>Furniture by room</h2>
      <table><tr class="cat"><td>Room</td><td class="num">Estimated</td></tr>${roomCostRows}</table>
    </div>`
      : ''
  }
  ${
    finishRows
      ? `<div class="room-cost">
      <h2>Finishes by room</h2>
      <table><tr class="cat"><td>Room</td><td>Floor</td><td>Walls</td></tr>${finishRows}</table>
    </div>`
      : ''
  }
  ${
    flooringRows
      ? `<div class="room-cost">
      <h2>Flooring schedule</h2>
      <table><tr class="cat"><td>Finish</td><td class="num">Floor area</td></tr>${flooringRows}</table>
    </div>`
      : ''
  }
  ${clearanceSection}
  ${
    paletteChips
      ? `<div class="palette">
      <h2>Material palette</h2>
      <div class="chips">${paletteChips}</div>
    </div>`
      : ''
  }
  <div class="foot">Areas are interior floor area. Costs are an approximate mid-market retail estimate (SGD); finishes, renovation and labour are not included. Generated by the HDB design sandbox.</div>
</body></html>`
}
