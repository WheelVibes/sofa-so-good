/**
 * Layout critique (G8) — pure data core.
 *
 * `designScore` measures whether a room is BROKEN (overlaps, wall clips, blocked
 * doors, pinch points, coverage). It does not measure whether a layout is
 * GOOD — and measured on the default flat, three genuinely different authored
 * arrangements score identically at 83 on every category, so the G8 comparison
 * falls through to its price tie-break. A ruler that cannot tell three layouts
 * apart makes "argue the trade-offs" vacuous.
 *
 * This adds the missing dimension: the spatial-relationship checks a designer
 * actually makes. Each threshold is taken from published interior-design
 * standards rather than invented — sources in
 * `docs/research/2026-09-02-layout-critique-standards.md`:
 *
 *  - **TV viewing distance** 2.4–3.7 m (8–12 ft) from screen to primary seat.
 *  - **Conversation distance** 1.8–2.4 m (6–8 ft) between facing seats;
 *    past 3.05 m (10 ft) "conversation becomes difficult — voices must be
 *    raised, and the intimacy of connection is lost".
 *  - **Coffee-table reach** 0.36–0.46 m (14–18 in) from the sofa front.
 *  - **Sofa width** 1.75–2.20 m — the typical SG 3-seater band, an ABSOLUTE
 *    figure from Singapore sources rather than a ratio against room span. The
 *    first draft used a derived 60%-of-span ratio, which warned on essentially
 *    every SG scheme and therefore described the housing stock rather than the
 *    design; the cited band identifies an over-scaled sofa directly.
 *
 * **Deliberately a SEPARATE score, not a re-weighting of `designScore`.**
 * Re-tuning a shipped, user-visible score is a product decision (see
 * `TODO.md`); adding a new measurement beside it is not. A caller can show both
 * and let the user weigh them.
 *
 * **What it does NOT claim.** It measures geometry, not taste — nothing here
 * says a scheme is prettier. A layout can score full marks and still be dull.
 * And each check is skipped, not failed, when the design lacks the pieces it
 * needs (no TV → no viewing-distance verdict), so a sparse room is never
 * penalised for what it does not contain.
 *
 * Pure (no store, no three, no DOM) → unit-testable directly.
 */

import { itemFootprint } from '../collision/placement'
import { allPlanRooms } from '../floorplan/levels'
import { type FloorPlan, type PlanRoom, planRoomArea, pointInRoom } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'

/** Published thresholds, all metres. See the module header for sources. */
export const CRITIQUE = {
  /** Screen-to-seat comfortable band. */
  tvMin: 2.4,
  tvMax: 3.7,
  /** Facing-seat conversation band. */
  convMin: 1.8,
  convIdealMax: 2.4,
  /** Past this, conversation across the group stops working. */
  convBreakdown: 3.05,
  /** Sofa front to coffee-table edge. */
  tableMin: 0.36,
  tableMax: 0.46,
  /**
   * Typical 3-seater sofa width in Singapore homes (m). SG sources give an
   * ABSOLUTE band rather than a ratio — "three-seaters are typically 175 cm to
   * 220 cm wide", narrowing to "between 190 and 210 cm" for a 4-room HDB living
   * room. An absolute band is the honest check: a ratio against room span
   * warned on essentially every SG scheme and so described the housing stock
   * rather than the design (recorded in the standards doc).
   */
  sofaWidthMin: 1.75,
  sofaWidthMax: 2.2,
} as const

export type CritiqueId = 'tv-distance' | 'conversation' | 'coffee-table' | 'sofa-proportion'

export interface CritiqueFinding {
  id: CritiqueId
  label: string
  /** `pass` = within the published band · `warn` = outside it but usable ·
   *  `fail` = past the point the standard says it stops working ·
   *  `skipped` = the design lacks the pieces this check needs. */
  verdict: 'pass' | 'warn' | 'fail' | 'skipped'
  /** The measured value + the band, so a user can judge the call themselves. */
  detail: string
  roomName?: string
}

export interface LayoutCritique {
  findings: CritiqueFinding[]
  /** 0–100 over the checks that actually APPLIED (skipped ones are excluded, so
   *  a sparse design is not scored against absent furniture). 100 when nothing
   *  applied — "no evidence of a problem", not "perfect". */
  score: number
  /** How many checks applied, so `score` can be read honestly. */
  applied: number
}

const SEATING_RE = /^(sofa|armchair)/
const TV_RE = /^tv/
const TABLE_RE = /^coffee-table/

function centre(item: FurnitureItem): [number, number] {
  return [item.position[0], item.position[1]]
}

function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

/** The habitable room containing an item, if any. */
function roomOf(rooms: PlanRoom[], item: FurnitureItem): PlanRoom | undefined {
  return rooms.find((r) => pointInRoom(r, item.position[0], item.position[1]))
}

/**
 * Clearance between two oriented boxes measured along the line joining their
 * centres: centre distance minus each box's SUPPORT RADIUS in that direction.
 * A box's radius along unit direction `d` is `hx*|d·ax| + hz*|d·az|` where
 * `ax`/`az` are its own rotated axes — the standard OBB projection. Using a
 * half-extent directly would be wrong for any rotated piece.
 *
 * Returns 0 when the boxes overlap along that line.
 */
function obbGapAlongCentres(
  a: { cx: number; cz: number; hx: number; hz: number; rot: number },
  b: { cx: number; cz: number; hx: number; hz: number; rot: number },
): number {
  const dx = b.cx - a.cx
  const dz = b.cz - a.cz
  const len = Math.hypot(dx, dz)
  if (!(len > 0)) return 0
  const ux = dx / len
  const uz = dz / len
  const radius = (o: typeof a): number => {
    const cos = Math.cos(o.rot)
    const sin = Math.sin(o.rot)
    // Local axes of the box in world space.
    const axDot = Math.abs(ux * cos + uz * sin)
    const azDot = Math.abs(ux * -sin + uz * cos)
    return o.hx * axDot + o.hz * azDot
  }
  return Math.max(0, len - radius(a) - radius(b))
}

/** Footprint width of an item (its longer horizontal extent). */
function itemWidth(item: FurnitureItem, def: FurnitureDef): number {
  const obb = itemFootprint(item, def)
  return Math.max(obb.hx, obb.hz) * 2
}

/**
 * Critique the layout's spatial relationships. `items` should be the whole
 * design; checks are scoped per room so a two-living-space plan is judged room
 * by room rather than across the home.
 */
export function buildLayoutCritique(
  plan: FloorPlan,
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
): LayoutCritique {
  const rooms = allPlanRooms(plan).filter((r) => planRoomArea(r) > 0)
  const findings: CritiqueFinding[] = []

  const resolved = items.flatMap((it) => {
    const def = defs[it.defId]
    return def?.defaultFootprint ? [{ it, def }] : []
  })
  const seating = resolved.filter((r) => SEATING_RE.test(r.it.defId))
  const tvs = resolved.filter((r) => TV_RE.test(r.it.defId))
  const tables = resolved.filter((r) => TABLE_RE.test(r.it.defId))

  // 1 — TV viewing distance, per TV, to its NEAREST seat in the same room.
  if (tvs.length === 0 || seating.length === 0) {
    findings.push({
      id: 'tv-distance',
      label: 'TV viewing distance',
      verdict: 'skipped',
      detail: 'No TV and seating pair in one room to measure.',
    })
  } else {
    for (const tv of tvs) {
      const room = roomOf(rooms, tv.it)
      const inRoom = seating.filter((s) => (room ? roomOf(rooms, s.it)?.id === room.id : false))
      if (inRoom.length === 0) continue
      const nearest = inRoom.reduce((best, s) =>
        dist(centre(s.it), centre(tv.it)) < dist(centre(best.it), centre(tv.it)) ? s : best,
      )
      const d = dist(centre(nearest.it), centre(tv.it))
      const verdict = d >= CRITIQUE.tvMin && d <= CRITIQUE.tvMax ? 'pass' : 'warn'
      findings.push({
        id: 'tv-distance',
        label: 'TV viewing distance',
        verdict,
        detail: `${d.toFixed(2)} m from the nearest seat (comfortable band ${CRITIQUE.tvMin}–${CRITIQUE.tvMax} m).`,
        roomName: room?.name,
      })
    }
  }

  // 2 — Conversation distance between the two seats FURTHEST apart in a room:
  //     that spread is what decides whether the group can hold one conversation.
  const byRoom = new Map<string, { it: FurnitureItem; def: FurnitureDef }[]>()
  for (const s of seating) {
    const room = roomOf(rooms, s.it)
    if (!room) continue
    const list = byRoom.get(room.id) ?? []
    list.push(s)
    byRoom.set(room.id, list)
  }
  const convRooms = [...byRoom.entries()].filter(([, list]) => list.length >= 2)
  if (convRooms.length === 0) {
    findings.push({
      id: 'conversation',
      label: 'Conversation grouping',
      verdict: 'skipped',
      detail: 'Fewer than two seats in any one room.',
    })
  } else {
    for (const [roomId, list] of convRooms) {
      let widest = 0
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          widest = Math.max(widest, dist(centre(list[i]!.it), centre(list[j]!.it)))
        }
      }
      const room = rooms.find((r) => r.id === roomId)
      const verdict =
        widest > CRITIQUE.convBreakdown
          ? 'fail'
          : widest >= CRITIQUE.convMin && widest <= CRITIQUE.convIdealMax
            ? 'pass'
            : 'warn'
      findings.push({
        id: 'conversation',
        label: 'Conversation grouping',
        verdict,
        detail:
          verdict === 'fail'
            ? `Seats ${widest.toFixed(2)} m apart — past ${CRITIQUE.convBreakdown} m a group cannot hold one conversation.`
            : `Widest seat spacing ${widest.toFixed(2)} m (ideal ${CRITIQUE.convMin}–${CRITIQUE.convIdealMax} m).`,
        roomName: room?.name,
      })
    }
  }

  // 3 — Coffee-table reach from the nearest seat in the same room.
  if (tables.length === 0) {
    findings.push({
      id: 'coffee-table',
      label: 'Coffee-table reach',
      verdict: 'skipped',
      detail: 'No coffee table placed.',
    })
  } else {
    for (const t of tables) {
      const room = roomOf(rooms, t.it)
      const inRoom = seating.filter((s) => (room ? roomOf(rooms, s.it)?.id === room.id : false))
      if (inRoom.length === 0) continue
      const nearest = inRoom.reduce((best, s) =>
        dist(centre(s.it), centre(t.it)) < dist(centre(best.it), centre(t.it)) ? s : best,
      )
      // Clearance along the line joining the two centres. Each OBB's extent in
      // that direction is its SUPPORT RADIUS — hx*|d.ax| + hz*|d.az| — not its
      // half-depth: a rotated sofa presents a different extent toward the table
      // than its local Z, and using `hz` blindly reported ~0.87 m where the
      // real clearance was far smaller.
      const gap = obbGapAlongCentres(
        itemFootprint(nearest.it, nearest.def),
        itemFootprint(t.it, t.def),
      )
      const verdict = gap >= CRITIQUE.tableMin && gap <= CRITIQUE.tableMax ? 'pass' : 'warn'
      findings.push({
        id: 'coffee-table',
        label: 'Coffee-table reach',
        verdict,
        detail: `${gap.toFixed(2)} m from the nearest seat (reachable band ${CRITIQUE.tableMin}–${CRITIQUE.tableMax} m).`,
        roomName: room?.name,
      })
    }
  }

  // 4 — Sofa width against the typical SG band.
  const sofas = resolved.filter((r) => /^sofa/.test(r.it.defId))
  if (sofas.length === 0) {
    findings.push({
      id: 'sofa-proportion',
      label: 'Sofa size',
      verdict: 'skipped',
      detail: 'No sofa placed.',
    })
  } else {
    for (const s of sofas) {
      const room = roomOf(rooms, s.it)
      const w = itemWidth(s.it, s.def)
      if (!(w > 0)) continue
      const verdict = w >= CRITIQUE.sofaWidthMin && w <= CRITIQUE.sofaWidthMax ? 'pass' : 'warn'
      findings.push({
        id: 'sofa-proportion',
        label: 'Sofa size',
        verdict,
        detail:
          w > CRITIQUE.sofaWidthMax
            ? `${w.toFixed(2)} m wide — above the ${CRITIQUE.sofaWidthMin}–${CRITIQUE.sofaWidthMax} m typical for a Singapore 3-seater, so it will eat the room.`
            : `${w.toFixed(2)} m wide (typical SG 3-seater band ${CRITIQUE.sofaWidthMin}–${CRITIQUE.sofaWidthMax} m).`,
        roomName: room?.name,
      })
    }
  }

  const applicable = findings.filter((f) => f.verdict !== 'skipped')
  const points = applicable.reduce(
    (sum, f) => sum + (f.verdict === 'pass' ? 100 : f.verdict === 'warn' ? 55 : 0),
    0,
  )
  return {
    findings,
    score: applicable.length === 0 ? 100 : Math.round(points / applicable.length),
    applied: applicable.length,
  }
}
