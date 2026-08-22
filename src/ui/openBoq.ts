import { floorRateFor, wallRateFor } from '../analysis/renovationCost'
import type { BoqInput } from '../export/boq'
import { isDefaultPlan } from '../floorplan/planGeometry'
import { type FloorPlan, planRoomArea } from '../floorplan/types'
import { buildMergedCatalog } from '../furniture/catalog'
import { itemPrice } from '../furniture/furniturePrices'
import { BUILTIN_MATERIALS } from '../materials/builtinCatalog'
import { useStore } from '../state/store'

const matName = (id: string) => BUILTIN_MATERIALS[id]?.name ?? id

/** Floor-finish map for the active plan: the store finishes for the default
 *  flat, else each custom room's own `floor`. */
function floorMap(plan: FloorPlan): Record<string, string> {
  const s = useStore.getState()
  if (isDefaultPlan(plan)) return s.finishes.floor as Record<string, string>
  const m: Record<string, string> = {}
  for (const r of plan.rooms) if (r.floor) m[r.id] = r.floor
  return m
}

/** Assemble a quote-ready bill of quantities from the live design + open it as a
 *  printable HTML doc. FF&E from placed furniture, flooring/wall finishes from
 *  the finish-area schedules (priced at the renovation rate table), and
 *  carpentry (cabinets/wardrobes) by linear metre.
 *
 *  The window is opened synchronously (inside the click's user activation) and
 *  the BOQ/area builders are dynamic-imported afterwards — they stay out of
 *  the boot bundle (P-CHUNK). */
/** Assemble the quote-ready BoqInput from the live design (FF&E from placed
 *  furniture, finishes from the area schedules, carpentry by linear metre).
 *  Shared by the HTML quote (`openBoq`) and the Excel export (`downloadBoqXlsx`)
 *  so they price identically. Dynamic-imports `reportData` (kept out of boot). */
export async function assembleBoqInput(): Promise<BoqInput> {
  const s = useStore.getState()
  const { floorAreaByFinish, wallAreaByFinish } = await import('./reportData')
  const plan = s.floorPlan
  const catalog = buildMergedCatalog(s)

  // FF&E — group placed furniture by def.
  const groups = new Map<
    string,
    { name: string; category?: string; qty: number; unitPrice: number }
  >()
  let carpentryM = 0
  for (const it of s.items) {
    const def = catalog[it.defId]
    if (!def) continue
    // Cabinets / wardrobes / counters are carpentry runs (priced by length).
    if (/cabinet|wardrobe|kitchen-counter|kitchen-island|vanity/.test(it.defId)) {
      const w = typeof it.props.width === 'number' ? it.props.width : def.defaultFootprint.w
      carpentryM += w
      continue
    }
    const g = groups.get(it.defId)
    if (g) g.qty += 1
    else
      groups.set(it.defId, {
        name: def.name,
        category: def.category,
        qty: 1,
        // First-occurrence pricing (like `name`/`category` above) — this
        // aggregation already conflates variant/instance differences under
        // one defId, so a custom price override is taken from the first
        // instance seen, same simplification.
        unitPrice: itemPrice(def, def.category, undefined, it.meta?.price),
      })
  }

  const fMap = floorMap(plan)
  const wMap = isDefaultPlan(plan) ? (s.finishes.walls as Record<string, string>) : {}
  // Apply the user's configurable rate card (defaults to the built-in SG rates).
  const rules = s.priceRules
  return {
    plan,
    rooms: plan.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      floorArea: planRoomArea(r),
      floorFinishName: fMap[r.id] ? matName(fMap[r.id]!) : undefined,
    })),
    furniture: [...groups.values()],
    finishes: {
      floorByFinish: floorAreaByFinish(plan, fMap).map((f) => ({
        name: matName(f.id),
        areaSqm: f.area,
        ratePerSqm: floorRateFor(rules, f.id),
      })),
      wallByFinish: wallAreaByFinish(plan, wMap, plan.ceilingHeight).map((f) => ({
        name: matName(f.id),
        areaSqm: f.area,
        ratePerSqm: wallRateFor(rules, f.id),
      })),
    },
    carpentry:
      carpentryM > 0
        ? [
            {
              name: 'Built-in carpentry (cabinets / wardrobes)',
              lengthM: carpentryM,
              ratePerM: rules.carpentryPerM,
            },
          ]
        : undefined,
  }
}

export async function openBoq(): Promise<void> {
  const s = useStore.getState()
  const win = window.open('', '_blank')
  if (!win) {
    s.notify.start({
      title: 'Quote blocked',
      kind: 'error',
      message: 'Allow pop-ups for this site, then open the quote again.',
    })
    return
  }
  let buildBoq: typeof import('../export/boq').buildBoq
  let boqToHtml: typeof import('../export/boq').boqToHtml
  let applyTemplate: typeof import('../export/quoteTemplate').applyTemplate
  let input: BoqInput
  try {
    const [boqMod, { applyTemplate: _applyTemplate }] = await Promise.all([
      import('../export/boq'),
      import('../export/quoteTemplate'),
    ])
    buildBoq = boqMod.buildBoq
    boqToHtml = boqMod.boqToHtml
    applyTemplate = _applyTemplate
    input = await assembleBoqInput()
  } catch {
    win.close()
    s.notify.start({
      title: 'Quote failed',
      kind: 'error',
      message: 'Could not load the quote builder — check your connection and try again.',
    })
    return
  }
  const plan = s.floorPlan
  const template = s.quoteTemplate

  const rawBoq = buildBoq(input)
  const boq = applyTemplate(rawBoq, template)
  const name = plan.name.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${name} — Quote</title>` +
      '<style>body{font:14px/1.5 system-ui,sans-serif;max-width:800px;margin:24px auto;padding:0 16px;color:#1f2937}' +
      'h1{font-size:20px}.boq-company{font-size:16px;font-weight:600;margin-bottom:2px}' +
      '.boq-contact{font-size:13px;color:#6b7280;margin-bottom:8px}' +
      '.boq-header-note{font-size:13px;background:#f9fafb;border-left:3px solid #e5e7eb;padding:8px 12px;margin:12px 0}' +
      '.boq-footer-note{font-size:11px;color:#6b7280;margin-top:16px;border-top:1px solid #eee;padding-top:8px}' +
      'table{width:100%;border-collapse:collapse;margin:8px 0 20px}' +
      // Section titles are <caption>s — style them as left-aligned headings
      // (the browser default is small centred text, which read as a stray
      // caption rather than a section header — UIUX-55).
      'caption{text-align:left;font-size:15px;font-weight:600;padding:4px 0;color:#1f2937}' +
      'td,th{padding:4px 8px;border-bottom:1px solid #eee;text-align:left}' +
      'td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}' +
      'td:last-child,th:last-child{text-align:right}h2{font-size:15px;margin-top:20px}</style>' +
      `</head><body>${boqToHtml(boq, template)}` +
      '<p style="color:#9ca3af;font-size:11px">Indicative budgetary quote — supply &amp; install estimate; excludes hacking/disposal, M&amp;E and contractor margin. Confirm with your contractor.</p></body></html>',
  )
  win.document.close()
  win.focus()
}
