/**
 * HTML renderer for the contractor-grade finish schedule (`floorplan/finishSchedule.ts`).
 * ONE presentation module shared by the printable report (`report.ts`) and the
 * drawing set's "Finishes schedule" sheet (`drawingSet.ts`) — both pass the SAME
 * `FinishSchedule` (built once by the pure `buildFinishSchedule`) through
 * `finishScheduleHtml`, so the tables can never drift between the two documents.
 */
import type { FinishSchedule } from '../floorplan/finishSchedule'
import { formatArea, type UnitSystem } from '../utils/measurement'
import { esc } from './report/reportShared'

const cell = (code: string, name: string, area: number, units: UnitSystem, extra?: string) =>
  `<td><span class="mcode">${esc(code)}</span> ${esc(name)}${
    extra ? `<div class="mnote">${esc(extra)}</div>` : ''
  }<div class="mnum">${esc(formatArea(area, units))}</div></td>`

/**
 * Renders the per-room schedule table + accent-wall callouts + per-code totals
 * + the verify-on-site caveat, as one HTML fragment. Returns `''` when the
 * schedule has no rows (nothing to print — callers skip the whole section).
 */
export function finishScheduleHtml(schedule: FinishSchedule, units: UnitSystem = 'metric'): string {
  if (schedule.rows.length === 0) return ''

  const roomRows = schedule.rows
    .map(
      (r) =>
        `<tr><td>${esc(r.room)}</td>` +
        cell(r.floor.code, r.floor.name, r.floor.area, units, r.floor.spec) +
        cell(r.wall.code, r.wall.name, r.wall.area, units) +
        cell(r.ceiling.code, r.ceiling.name, r.ceiling.area, units, r.ceiling.note) +
        '</tr>',
    )
    .join('')
  const table = `<table class="sched fin-sched"><tr class="h"><td>Room</td><td>Floor</td><td>Wall (net of openings)</td><td>Ceiling</td></tr>${roomRows}</table>`

  const accentTable =
    schedule.accentWalls.length > 0
      ? `<table class="sched fin-accent"><tr class="h"><td>Wall</td><td>Code</td><td>Colour</td><td>Rooms</td><td class="mnum-td">Area</td></tr>${schedule.accentWalls
          .map(
            (a) =>
              `<tr><td>${esc(a.orientation)}</td><td><span class="mcode">${esc(a.code)}</span></td><td><span class="mchip" style="background:${esc(/^#[0-9a-fA-F]{3,8}$/.test(a.color) ? a.color : '#cccccc')}"></span>${esc(a.color)}</td><td>${esc(a.rooms.join(', ') || '—')}</td><td class="mnum-td">${esc(formatArea(a.area, units))}</td></tr>`,
          )
          .join('')}</table>`
      : ''

  const totalsTable = `<table class="sched fin-totals"><tr class="h"><td>Code</td><td>Material</td><td>Kind</td><td class="mnum-td">Total area</td></tr>${schedule.totals
    .map(
      (t) =>
        `<tr><td><span class="mcode">${esc(t.code)}</span></td><td>${esc(t.name)}</td><td>${esc(t.kind)}</td><td class="mnum-td">${esc(formatArea(t.area, units))}</td></tr>`,
    )
    .join('')}</table>`

  return (
    table +
    (accentTable ? `<h3 class="fin-h3">Accent walls</h3>${accentTable}` : '') +
    `<h3 class="fin-h3">Totals by material code</h3>${totalsTable}` +
    `<div class="fin-caveat">${esc(schedule.caveat)}</div>`
  )
}
