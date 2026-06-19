/**
 * One-click furnish for ANY floor plan (the built-in flat OR a custom plan /
 * template). The Smart-Start presets in `layoutPresets.ts` are authored at the
 * default flat's exact coordinates, so they can't furnish the editable
 * templates (HDB / condo / landed). This module instead *seeds* a sensible
 * furniture kit per room — chosen by the room's inferred kind — drops each piece
 * at the room centre, then runs the existing plan-aware arranger
 * (`arrangeAllRoomsForPlan`) to flush everything to walls / face the focal wall
 * / space the dining set, exactly as "Tidy" does. A final overlap sweep drops
 * any piece an over-tight room couldn't fit, so the result is always
 * collision-clean.
 *
 * Pure + deterministic (no store, no GPU) → unit-testable.
 */
import { findItemOverlaps } from '../collision/placement'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import { planRoomArea } from '../floorplan/types'
import { arrangeAllRoomsForPlan, roomKindFromName } from '../layout/autoArrange'
import { applyDecorStylingForPlan } from './layout/decorStyling'
import type { LayoutPreset } from './layoutPresets'
import type { FurnitureDef, FurnitureItem, ParamProps } from './types'
import { defaultParamProps } from './types'

/** One entry in a room kit: a catalog def + how many + optional fixed props. */
interface KitPiece {
  defId: string
  count?: number
  props?: ParamProps
}

/** Furniture kits per inferred room kind, in priority order (most essential
 *  first — the overlap sweep drops from the end if a room is too small). */
const KITS = {
  living: [
    { defId: 'sofa-3seat' },
    { defId: 'rug' },
    { defId: 'coffee-table' },
    { defId: 'tv-console' },
    { defId: 'tv-wall', props: { mount: 'wall', mountHeight: 1.3 } },
    { defId: 'armchair' },
    { defId: 'floor-lamp' },
    { defId: 'potted-plant' },
    { defId: 'ceiling-light' },
  ],
  // Living + dining combined (a room whose name mentions dining): the living kit
  // plus a dining set, appended so it lands in the room's secondary zone.
  dining: [{ defId: 'dining-table-4' }, { defId: 'dining-chair', count: 4 }],
  bedroomMaster: [
    { defId: 'bed-queen' },
    { defId: 'nightstand', count: 2 },
    { defId: 'wardrobe-3door' },
    { defId: 'rug' },
    { defId: 'ceiling-light' },
  ],
  bedroom: [
    { defId: 'bed-single' },
    { defId: 'nightstand' },
    { defId: 'wardrobe-3door' },
    { defId: 'desk' },
    { defId: 'ceiling-light' },
  ],
  kitchen: [
    { defId: 'kitchen-counter-l' },
    { defId: 'refrigerator' },
    { defId: 'stove' },
    { defId: 'range-hood', props: { mountHeight: 1.5 } },
  ],
  bath: [
    { defId: 'toilet' },
    { defId: 'bathroom-sink' },
    { defId: 'shower' },
    { defId: 'bathroom-mirror', props: { mountHeight: 1.4 } },
    { defId: 'towel-rail', props: { mountHeight: 1.1 } },
  ],
  // A powder room / WC is a half-bath: no shower.
  powder: [
    { defId: 'toilet' },
    { defId: 'bathroom-sink' },
    { defId: 'bathroom-mirror', props: { mountHeight: 1.4 } },
  ],
  // Study / home office.
  study: [
    { defId: 'desk' },
    { defId: 'office-chair' },
    { defId: 'bookshelf' },
    { defId: 'ceiling-light' },
  ],
  // Standalone dining room (no lounge): just the dining set — the arranger still
  // treats a "Dining" room as living-kind and centres the table + rings chairs.
  diningRoom: [
    { defId: 'dining-table-4' },
    { defId: 'dining-chair', count: 4 },
    { defId: 'ceiling-light', props: { style: 'pendant' } },
  ],
  // Balcony / patio: light outdoor set + greenery.
  balcony: [
    { defId: 'outdoor-table' },
    { defId: 'outdoor-chair', count: 2 },
    { defId: 'planter-trough' },
  ],
} satisfies Record<string, KitPiece[]>

/** Bounding-box centre of a room (origin/width/depth are kept as the bbox even
 *  for polygon rooms), used as the seed drop point before arranging. */
function roomCentre(r: PlanRoom): [number, number] {
  return [r.origin[0] + r.width / 2, r.origin[1] + r.depth / 2]
}

/** A "master" bedroom = the name says so, or it's the largest bedroom. */
function isMasterName(name: string): boolean {
  return /master|main|primary/i.test(name)
}

/** Choose the kit list for a room, or null to leave it unfurnished (utility /
 *  balcony / shelter / store / yard rooms stay empty — that's realistic). */
function kitForRoom(room: PlanRoom): KitPiece[] | null {
  const name = room.name.toLowerCase()
  // Specials the name-kind classifier misses or over-furnishes — check first.
  if (/balcon|patio/.test(name)) return KITS.balcony
  if (/powder|\bwc\b/.test(name)) return KITS.powder
  if (/stud(y|io\b)|home\s?office|\boffice\b/.test(name)) return KITS.study
  const kind = roomKindFromName(room.name)
  if (kind === 'kitchen') return KITS.kitchen
  if (kind === 'bath') return KITS.bath
  if (kind === 'bedroom') {
    return isMasterName(room.name) || planRoomArea(room) >= 11 ? KITS.bedroomMaster : KITS.bedroom
  }
  if (kind === 'living') {
    const isDining = /dining|dine/.test(name)
    const isLounge = /living|lounge|family|great/.test(name)
    // Standalone dining → dining set only; combined living/dining → both; else living.
    if (isDining && !isLounge) return KITS.diningRoom
    return isDining ? [...KITS.living, ...KITS.dining] : KITS.living
  }
  return null
}

/** Expand a kit + the preset's cosmetic style into seeded items at the room
 *  centre. Each piece's props = schema defaults < kit-fixed props < preset
 *  style override (so a furnished template still reads in the chosen look). */
function seedRoom(
  room: PlanRoom,
  kit: KitPiece[],
  defs: Record<string, FurnitureDef>,
  style: Record<string, ParamProps>,
): FurnitureItem[] {
  const [cx, cz] = roomCentre(room)
  const out: FurnitureItem[] = []
  for (const piece of kit) {
    const def = defs[piece.defId]
    if (!def) continue
    const base = def.kind === 'parametric' ? defaultParamProps(def) : {}
    const props = { ...base, ...(piece.props ?? {}), ...(style[piece.defId] ?? {}) }
    const n = piece.count ?? 1
    for (let i = 0; i < n; i++) {
      out.push({
        id: `furnish-${room.id}-${piece.defId}-${i}`,
        defId: piece.defId as FurnitureItem['defId'],
        position: [cx, cz],
        rotation: 0,
        props: { ...props },
      })
    }
  }
  return out
}

/** Drop items that still overlap after arranging (an over-tight room couldn't
 *  fit the whole kit). The seed order is priority order, so we always drop the
 *  later (less essential) piece of an overlapping pair. */
function dropOverlaps(items: FurnitureItem[], defs: Record<string, FurnitureDef>): FurnitureItem[] {
  let current = items
  // Bounded: each pass removes ≥1 item, so at most items.length passes.
  for (let guard = 0; guard < items.length; guard++) {
    const overlaps = findItemOverlaps(current, defs)
    if (overlaps.length === 0) break
    const order = new Map(current.map((it, i) => [it.id, i]))
    // Remove the later-seeded id from the first overlapping pair.
    const { a, b } = overlaps[0]!
    const drop = (order.get(a) ?? 0) > (order.get(b) ?? 0) ? a : b
    current = current.filter((it) => it.id !== drop)
  }
  return current
}

/**
 * Furnish every room of `plan` with a kind-appropriate kit, arranged to the
 * plan's walls + openings, restyled by the preset's palette. Returns a clean,
 * collision-valid item list ready to drop into the store. Existing `items` are
 * ignored — this is a fresh furnish (the caller decides whether to replace).
 *
 * A decor styling pass is applied after arranging: tasteful set-dressing props
 * (cushions, bowls, candles, plants, …) are placed ON appropriate host surfaces
 * (sofas, coffee tables, beds, desks, etc.) at the correct surface height. All
 * decor props are `noClip` so they don't interfere with floor collision.
 *
 * @param withDecor  When false, skip the styling pass (default: true).
 */
export function furnishPlanItems(
  plan: FloorPlan,
  preset: LayoutPreset,
  defs: Record<string, FurnitureDef>,
  doors: Record<string, { open: boolean }>,
  withDecor = true,
): FurnitureItem[] {
  const seeded: FurnitureItem[] = []
  for (const room of plan.rooms) {
    const kit = kitForRoom(room)
    if (kit) seeded.push(...seedRoom(room, kit, defs, preset.style))
  }
  if (seeded.length === 0) return []
  const arranged = arrangeAllRoomsForPlan(plan, seeded, defs, doors)
  const furniture = dropOverlaps(arranged, defs)
  if (!withDecor) return furniture
  // Styling pass: add set-dressing props on host surfaces.
  const decor = applyDecorStylingForPlan(plan, furniture, defs)
  return [...furniture, ...decor]
}
