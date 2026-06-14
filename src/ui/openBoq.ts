import { floorRateKind, RENO_RATES, wallRateKind } from '../analysis/renovationCost'
import type { BoqInput } from '../export/boq'
import { isDefaultPlan } from '../floorplan/planGeometry'
import { type FloorPlan, planRoomArea } from '../floorplan/types'
import { buildMergedCatalog } from '../furniture/catalog'
import { itemPrice } from '../furniture/furniturePrices'
import { BUILTIN_MATERIALS } from '../materials/builtinCatalog'
import { useStore } from '../state/store'

/** Built-in carpentry rate (SGD per linear metre) for cabinet/wardrobe runs. */
const CARPENTRY_RATE = 320
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
        unitPrice: itemPrice(def, def.category),
      })
  }

  const fMap = floorMap(plan)
  const wMap = isDefaultPlan(plan) ? (s.finishes.walls as Record<string, string>) : {}
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
        ratePerSqm: RENO_RATES.floor[floorRateKind(f.id)],
      })),
      wallByFinish: wallAreaByFinish(plan, wMap, plan.ceilingHeight).map((f) => ({
        name: matName(f.id),
        areaSqm: f.area,
        ratePerSqm: RENO_RATES.wall[wallRateKind(f.id)],
      })),
    },
    carpentry:
      carpentryM > 0
        ? [
            {
              name: 'Built-in carpentry (cabinets / wardrobes)',
              lengthM: carpentryM,
              ratePerM: CARPENTRY_RATE,
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
  let input: BoqInput
  try {
    const boqMod = await import('../export/boq')
    buildBoq = boqMod.buildBoq
    boqToHtml = boqMod.boqToHtml
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

  const boq = buildBoq(input)
  const name = plan.name.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${name} — Quote</title>` +
      '<style>body{font:14px/1.5 system-ui,sans-serif;max-width:800px;margin:24px auto;padding:0 16px;color:#1f2937}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin:8px 0 20px}td,th{padding:4px 8px;border-bottom:1px solid #eee;text-align:left}td:last-child,th:last-child{text-align:right}h2{font-size:15px;margin-top:20px}</style>' +
      `</head><body><h1>${name} — Bill of Quantities</h1>${boqToHtml(boq)}` +
      '<p style="color:#9ca3af;font-size:11px">Indicative budgetary quote — supply &amp; install estimate; excludes hacking/disposal, M&amp;E and contractor margin. Confirm with your contractor.</p></body></html>',
  )
  win.document.close()
  win.focus()
}
