import { itemAabbBox } from '../collision/placement'
import { GROUND_LEVEL_ID, levelAsPlan, planLevels } from '../floorplan/levels'
import { planCollisionWalls } from '../floorplan/planGeometry'
import { roomCategory } from '../floorplan/roomCategory'
import type { FloorPlan, RoomCategory } from '../floorplan/types'
import { wallLength } from '../floorplan/types'
import { furnishPlanItems } from '../furniture/furnishPlan'
import type { LayoutPreset } from '../furniture/layoutPresets'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { planRoomRect } from '../layout/arrangeGeometry'
import { footprintAabb } from '../layout/clearance'
import { findFurnitureSeveredRooms } from '../layout/reachability'

/**
 * RANKED LAYOUT DEFECTS (v0.31.9.28) — one survey, one severity order, one score.
 *
 * **Why this exists.** Four consecutive releases (v0.31.9.22/.24/.26/.27) built
 * arranger levers that each traded one defect class for another, and every
 * ratchet on this thread reads one line per finding — a stranded dining chair, a
 * kitchen with no hob and a blocked window are indistinguishable. With no order
 * between them, a reshuffle cannot be told apart from progress, and v0.31.9.27
 * rejected four levers on exactly that basis while recording the rule: **do not
 * attempt another placement lever until defect classes can be RANKED.** This is
 * that ranking.
 *
 * **The order comes from the product goal** — a plan a contractor can build
 * from, and a room a person can live in — not from how easy each is to fix:
 *
 * | sev | class | why it ranks there |
 * |---|---|---|
 * | 1 | `missing-fixture` | a kitchen with no hob is not a kitchen; the drawing cannot be built from |
 * | 2 | `outside-room` | the piece is through a wall or on the neighbour's floor finish — wrong, and visible |
 * | 3 | `unreachable-room` | a plan you cannot walk |
 * | 4 | `stranded-satellite` | a chair metres from its table: obviously wrong to look at, harmless to build |
 * | 5 | `marooned-wall-hugger` | an appliance off its wall has nowhere for services |
 * | 6 | `blocked-window` | a quality loss, not a fault |
 *
 * Decor props are deliberately absent: a missing throw cushion is not a defect.
 *
 * **`defectScore` is the number to compare across a change**, and it is a
 * lexicographic weighting (`SCORE_BASE ** (6 - sev)`) rather than a linear one,
 * so a severity-1 regression cannot be paid for with any number of lesser fixes.
 * That is the point — v0.31.9.27's rejected bundle gained a kitchen's fixtures
 * and lost a bathroom's basin, and a linear score would have called that a wash
 * when it is really two level-1 findings swapping places.
 *
 * **`SCORE_BASE` is 100, and 10 was measured as too small.** With base 10 the
 * ten `outside-room` findings summed to exactly one `missing-fixture`, so the
 * ordering the score exists to express did not hold — `layoutDefects.test.ts`
 * caught that on its first run. Base 100 holds as long as no class exceeds 99
 * findings, which that test also asserts; the largest today is 37.
 *
 * Each rule below MIRRORS an existing ratchet rather than inventing a
 * threshold, and `layoutDefects.test.ts` asserts the per-class counts against
 * what those ratchets record today. If a rule here and its ratchet ever
 * disagree, the ratchet is right and this file has drifted.
 */
export type DefectClass =
  | 'missing-fixture'
  | 'outside-room'
  | 'unreachable-room'
  | 'stranded-satellite'
  | 'marooned-wall-hugger'
  | 'blocked-window'

export const DEFECT_SEVERITY: Record<DefectClass, number> = {
  'missing-fixture': 1,
  'outside-room': 2,
  'unreachable-room': 3,
  'stranded-satellite': 4,
  'marooned-wall-hugger': 5,
  'blocked-window': 6,
}

export interface LayoutDefect {
  cls: DefectClass
  severity: number
  /** `template/level/room` or `template/opening`, whichever locates it. */
  where: string
  detail: string
}

interface Requirement {
  label: string
  anyOf: string[]
}

/**
 * The fixture that makes a room that kind of room. Moved here from
 * `roomCompleteness.test.ts` in v0.31.9.28 so the ratchet and the score cannot
 * drift apart; that test now imports it.
 */
export const ROOM_REQUIREMENTS: Partial<Record<RoomCategory, Requirement[]>> = {
  bedroom: [{ label: 'a bed', anyOf: ['bed-single', 'bed-queen', 'bed-king', 'bed-double'] }],
  masterBedroom: [{ label: 'a bed', anyOf: ['bed-single', 'bed-queen', 'bed-king', 'bed-double'] }],
  kitchen: [
    { label: 'a hob', anyOf: ['stove'] },
    { label: 'a fridge', anyOf: ['refrigerator'] },
    { label: 'a counter', anyOf: ['kitchen-counter-l', 'kitchen-counter', 'kitchen-sink'] },
  ],
  // BATHROOMS (v0.31.9.28) — present in the SCORE only, not in
  // `roomCompleteness`'s ratchet, which has only ever covered bedrooms and
  // kitchens. `bathroomFixtures.test.ts` measures these separately, and the
  // severity order above puts "no WC or basin" at level 1 alongside a kitchen
  // with no hob; leaving them out let the score bless a change that LOSES a
  // basin, which is precisely the trade v0.31.9.27 rejected the lever bundle
  // for. A powder room has no shower and is not required to have one.
  bath: [
    { label: 'a WC', anyOf: ['toilet'] },
    { label: 'a basin', anyOf: ['bathroom-sink'] },
  ],
  powder: [
    { label: 'a WC', anyOf: ['toilet'] },
    { label: 'a basin', anyOf: ['bathroom-sink'] },
  ],
}

/** `roomOverhang.test.ts`'s TOL — rects sit 0.1-0.2 m inside wall centrelines. */
const OUTSIDE_TOL = 0.2
/** `applianceWall.test.ts`'s derived threshold: a snapped piece sits at 0.18 m. */
const MAROONED_M = 0.28
/** `diningChairTuck.test.ts`'s TUCKED: a 4-seat table tucks at ~0.90 m. */
const TUCKED_M = 1.2
/** Categories `furnishPlan`'s `WALL_HUGGING_CATEGORIES` declares wall-bound. */
const WALL_HUGGING: ReadonlySet<string> = new Set([
  'bathroom',
  'storage',
  'appliances',
  'kitchen',
  'laundry',
])

function gapToNearestWall(
  it: FurnitureItem,
  def: FurnitureDef,
  walls: ReturnType<typeof planCollisionWalls>,
): number {
  const b = footprintAabb(it, def)
  let best = Number.POSITIVE_INFINITY
  for (const w of walls) {
    const x0 = Math.min(w.ax, w.bx) - w.thickness / 2
    const x1 = Math.max(w.ax, w.bx) + w.thickness / 2
    const z0 = Math.min(w.az, w.bz) - w.thickness / 2
    const z1 = Math.max(w.az, w.bz) + w.thickness / 2
    best = Math.min(
      best,
      Math.hypot(Math.max(x0 - b.x1, b.x0 - x1, 0), Math.max(z0 - b.z1, b.z0 - z1, 0)),
    )
  }
  return best
}

export function surveyLayoutDefects(
  plans: readonly FloorPlan[],
  preset: LayoutPreset,
  catalog: Record<string, FurnitureDef>,
): LayoutDefect[] {
  const out: LayoutDefect[] = []
  const add = (cls: DefectClass, where: string, detail: string) =>
    out.push({ cls, severity: DEFECT_SEVERITY[cls], where, detail })

  for (const plan of plans) {
    const items = furnishPlanItems(plan, preset, catalog, {})

    // sev 3 — rooms the arranger walls off (mirrors `routeAccess.test.ts`).
    for (const r of findFurnitureSeveredRooms(items, catalog, plan))
      add('unreachable-room', `${plan.id}/${r.roomId}`, 'unreachable from the front door')

    for (const level of planLevels(plan)) {
      const walls = planCollisionWalls(levelAsPlan(plan, level), {})
      const here = items.filter((it) => (it.levelId ?? GROUND_LEVEL_ID) === level.id)

      for (const room of level.rooms) {
        const inRoom = here.filter(
          (it) =>
            it.position[0] >= room.origin[0] &&
            it.position[0] <= room.origin[0] + room.width &&
            it.position[1] >= room.origin[1] &&
            it.position[1] <= room.origin[1] + room.depth,
        )

        // sev 1 — the fixture that makes the room (mirrors `roomCompleteness`).
        for (const req of ROOM_REQUIREMENTS[roomCategory(room)] ?? [])
          if (!inRoom.some((it) => req.anyOf.includes(it.defId)))
            add('missing-fixture', `${plan.id}/${level.id}/${room.id}`, `missing ${req.label}`)

        // sev 2 — footprint outside the room (mirrors `roomOverhang`). Rooms
        // with an extension or polygon are skipped there for the same reason:
        // `planRoomRect` returns only the primary rectangle.
        if (room.extension || room.polygon) continue
        const rect = planRoomRect(room)
        // Centre inside the INSET RECT, not the room bounds — `roomOverhang`
        // filters that way, and the difference is real: a `dining-chair` in
        // `tpl-1bed/ob-dining` sits between the two and would otherwise be
        // counted here and not there.
        for (const it of inRoom) {
          if (
            it.position[0] < rect.x0 ||
            it.position[0] > rect.x1 ||
            it.position[1] < rect.z0 ||
            it.position[1] > rect.z1
          )
            continue
          const def = catalog[it.defId]
          if (!def || def.mounted || def.noClip) continue
          const b = footprintAabb(it, def)
          const over = Math.max(rect.x0 - b.x0, b.x1 - rect.x1, rect.z0 - b.z0, b.z1 - rect.z1)
          if (over > OUTSIDE_TOL)
            add('outside-room', `${plan.id}/${room.id}`, `${it.defId} ${over.toFixed(2)}m outside`)
        }
      }

      // sev 5 — a wall-bound piece off every wall (mirrors `applianceWall`,
      // widened from its five appliance ids to the categories `furnishPlan`
      // itself calls wall-hugging).
      if (walls.length > 0)
        for (const it of here) {
          const def = catalog[it.defId]
          if (!def || def.mounted || def.noClip) continue
          if (!WALL_HUGGING.has(String(def.category))) continue
          const gap = gapToNearestWall(it, def, walls)
          if (gap > MAROONED_M)
            add('marooned-wall-hugger', `${plan.id}/${it.defId}`, `${gap.toFixed(2)}m off any wall`)
        }

      // sev 6 — a piece taller than the sill in front of the glass (ported from
      // `windowSightline.test.ts`; the same 0.3 m lateral overlap and 1.2 m
      // stand-off).
      for (const o of level.openings) {
        if (o.kind !== 'window') continue
        const wall = level.walls.find((w) => w.id === o.wallId)
        if (!wall) continue
        const len = wallLength(wall)
        if (!len) continue
        const ux = (wall.end[0] - wall.start[0]) / len
        const uz = (wall.end[1] - wall.start[1]) / len
        const ox = wall.start[0] + ux * o.offset
        const oz = wall.start[1] + uz * o.offset
        const sill = o.sill ?? 0.95
        for (const it of here) {
          const def = catalog[it.defId]
          if (!def || def.mounted || def.noClip || def.windowBound) continue
          if (def.defaultFootprint.h <= sill) continue
          const b = itemAabbBox(it, def)
          let minA = Number.POSITIVE_INFINITY
          let maxA = Number.NEGATIVE_INFINITY
          let minP = Number.POSITIVE_INFINITY
          let maxP = Number.NEGATIVE_INFINITY
          for (const [px, pz] of [
            [b.minX, b.minZ],
            [b.maxX, b.minZ],
            [b.minX, b.maxZ],
            [b.maxX, b.maxZ],
          ] as const) {
            const a = (px - ox) * ux + (pz - oz) * uz
            const p = (px - ox) * -uz + (pz - oz) * ux
            minA = Math.min(minA, a)
            maxA = Math.max(maxA, a)
            minP = Math.min(minP, p)
            maxP = Math.max(maxP, p)
          }
          if (Math.min(maxA, o.width) - Math.max(minA, 0) < 0.3) continue
          if (!(minP > 0.02 || maxP < -0.02)) continue
          if (Math.min(Math.abs(minP), Math.abs(maxP)) > 1.2) continue
          add('blocked-window', `${plan.id}/${o.id}`, it.defId)
        }
      }
    }

    // sev 4 — a dining chair away from every table (mirrors `diningChairTuck`).
    const tables = items.filter((it) => it.defId.startsWith('dining-table'))
    if (tables.length > 0)
      for (const c of items.filter((it) => it.defId === 'dining-chair')) {
        const d = Math.min(
          ...tables.map((t) =>
            Math.hypot(c.position[0] - t.position[0], c.position[1] - t.position[1]),
          ),
        )
        if (d > TUCKED_M)
          add('stranded-satellite', `${plan.id}/dining-chair`, `${d.toFixed(2)}m from its table`)
      }
  }
  return out
}

/**
 * Lexicographic weight: `SCORE_BASE ** (6 - severity)`. A single severity-1
 * finding outweighs every lesser finding in the corpus put together, so a change
 * cannot buy a missing hob with a tidier window. Compare the score across a
 * change; lower is better.
 */
export const SCORE_BASE = 100

export function defectScore(defects: readonly LayoutDefect[]): number {
  return defects.reduce((n, d) => n + SCORE_BASE ** (6 - d.severity), 0)
}

export function defectsByClass(defects: readonly LayoutDefect[]): Record<DefectClass, number> {
  const counts = {} as Record<DefectClass, number>
  for (const cls of Object.keys(DEFECT_SEVERITY) as DefectClass[]) counts[cls] = 0
  for (const d of defects) counts[d.cls]++
  return counts
}
