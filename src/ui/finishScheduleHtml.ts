/**
 * HTML renderer for the contractor-grade finish schedule (`floorplan/finishSchedule.ts`).
 * ONE presentation module shared by the printable report (`report.ts`) and the
 * drawing set's "Finishes schedule" sheet (`drawingSet.ts`) — both pass the SAME
 * `FinishSchedule` (built once by the pure `buildFinishSchedule`) through
 * `finishScheduleHtml`, so the tables can never drift between the two documents.
 */
import type { FinishCell, FinishSchedule, FinishTotal } from '../floorplan/finishSchedule'
import { formatArea, type UnitSystem } from '../utils/measurement'
import { esc } from './report/reportShared'

const cell = (code: string, name: string, area: number, units: UnitSystem, extra?: string) =>
  `<td><span class="mcode">${esc(code)}</span> ${esc(name)}${
    extra ? `<div class="mnote">${esc(extra)}</div>` : ''
  }<div class="mnum">${esc(formatArea(area, units))}</div></td>`

/** Which finish columns/totals to render. Absent = every kind (the default the
 *  report + full drawing set use — unchanged behaviour). A per-trade handover
 *  pack (BSJ-5) narrows it: the tiler pack to floors + walls, the painter pack
 *  to walls only, so the recipient sees only the finishes in their scope. */
export type FinishScheduleKind = FinishTotal['kind']

/** Per-room column definitions in display order (accent is a separate section). */
const COLUMNS: {
  kind: 'floor' | 'wall' | 'ceiling'
  header: string
  pick: (r: FinishSchedule['rows'][number]) => FinishCell
}[] = [
  { kind: 'floor', header: 'Floor', pick: (r) => r.floor },
  { kind: 'wall', header: 'Wall (net of openings)', pick: (r) => r.wall },
  { kind: 'ceiling', header: 'Ceiling', pick: (r) => r.ceiling },
]

/**
 * Renders the per-room schedule table + accent-wall callouts + per-code totals
 * + the verify-on-site caveat, as one HTML fragment. Returns `''` when the
 * schedule has no rows (nothing to print — callers skip the whole section).
 *
 * `kinds` (optional) narrows the rendered columns + totals to a subset (BSJ-5
 * per-trade packs); omitted = every kind, byte-identical to the prior output.
 */
export function finishScheduleHtml(
  schedule: FinishSchedule,
  units: UnitSystem = 'metric',
  kinds?: ReadonlySet<FinishScheduleKind>,
): string {
  if (schedule.rows.length === 0) return ''
  const show = (k: FinishScheduleKind) => !kinds || kinds.has(k)
  const cols = COLUMNS.filter((c) => show(c.kind))
  // A subset with no room-level columns (e.g. accent-only) still prints totals.
  const cellExtra = (c: (typeof COLUMNS)[number], f: FinishCell) =>
    c.kind === 'floor' ? f.spec : c.kind === 'ceiling' ? f.note : undefined

  const roomRows = schedule.rows
    .map(
      (r) =>
        `<tr><td>${esc(r.room)}</td>` +
        cols
          .map((c) =>
            cell(c.pick(r).code, c.pick(r).name, c.pick(r).area, units, cellExtra(c, c.pick(r))),
          )
          .join('') +
        '</tr>',
    )
    .join('')
  const table =
    cols.length > 0
      ? `<table class="sched fin-sched"><tr class="h"><td>Room</td>${cols
          .map((c) => `<td>${c.header}</td>`)
          .join('')}</tr>${roomRows}</table>`
      : ''

  const accentTable =
    show('accent') && schedule.accentWalls.length > 0
      ? `<table class="sched fin-accent"><tr class="h"><td>Wall</td><td>Code</td><td>Colour</td><td>Rooms</td><td class="mnum-td">Area</td></tr>${schedule.accentWalls
          .map(
            (a) =>
              `<tr><td>${esc(a.orientation)}</td><td><span class="mcode">${esc(a.code)}</span></td><td><span class="mchip" style="background:${esc(/^#[0-9a-fA-F]{3,8}$/.test(a.color) ? a.color : '#cccccc')}"></span>${esc(a.color)}</td><td>${esc(a.rooms.join(', ') || '—')}</td><td class="mnum-td">${esc(formatArea(a.area, units))}</td></tr>`,
          )
          .join('')}</table>`
      : ''

  const totals = schedule.totals.filter((t) => show(t.kind))
  const totalsTable =
    totals.length > 0
      ? `<table class="sched fin-totals"><tr class="h"><td>Code</td><td>Material</td><td>Kind</td><td class="mnum-td">Total area</td></tr>${totals
          .map(
            (t) =>
              `<tr><td><span class="mcode">${esc(t.code)}</span></td><td>${esc(t.name)}</td><td>${esc(t.kind)}</td><td class="mnum-td">${esc(formatArea(t.area, units))}</td></tr>`,
          )
          .join('')}</table>`
      : ''

  return (
    table +
    (accentTable ? `<h3 class="fin-h3">Accent walls</h3>${accentTable}` : '') +
    (totalsTable ? `<h3 class="fin-h3">Totals by material code</h3>${totalsTable}` : '') +
    `<div class="fin-caveat">${esc(schedule.caveat)}</div>`
  )
}
