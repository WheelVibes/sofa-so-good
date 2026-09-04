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
import type { AabbItem } from '../collision/broadphase'
import {
  canPlace,
  findItemOverlaps,
  findWallClips,
  itemAabbBox,
  itemFootprint,
  itemHeightAwareClash,
} from '../collision/placement'
import { GROUND_LEVEL_ID, levelAsPlan, planLevels } from '../floorplan/levels'
import { planCollisionWalls } from '../floorplan/planGeometry'
import { roomCategory } from '../floorplan/roomCategory'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import { planRoomArea, pointInRoom } from '../floorplan/types'
import { planRoomRect, rectsOverlap } from '../layout/arrangeGeometry'
import { roleOf } from '../layout/arrangeRoles'
import { arrangeAllRoomsForPlan } from '../layout/autoArrange'
import { doorKeepOutRects, footprintAabb, type Rect, windowFrontRects } from '../layout/clearance'
import { flushToWall, nearestWallEdge, rotationForEdge, type WallEdge } from '../layout/faceWall'
import { unsealRoutes } from '../layout/reachability'
import { mergeGeneratedCatalog } from './generatedCatalog'
import { applyDecorStylingForPlan } from './layout/decorStyling'
import type { LayoutPreset } from './layoutPresets'
import type { FurnitureDef, FurnitureItem, ParamProps } from './types'
import { defaultParamProps } from './types'

/** One entry in a room kit: a catalog def + how many + optional fixed props. */
export interface KitPiece {
  defId: string
  count?: number
  props?: ParamProps
}

/** A flush-mount ceiling light — the utility/wet-room default fixture. Typed as
 *  `KitPiece` (its `props` widens to `ParamProps`) so mixing it into a kit that
 *  already carries a differently-shaped `props` (e.g. a `{ mountHeight }` range
 *  hood) doesn't trip the array-literal cross-key widening under `satisfies`. */
const flushCeilingLight: KitPiece = { defId: 'ceiling-light', props: { style: 'flush' } }

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
    { defId: 'dresser' },
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
    flushCeilingLight,
  ],
  bath: [
    { defId: 'toilet' },
    { defId: 'bathroom-sink' },
    { defId: 'shower' },
    { defId: 'bathroom-mirror', props: { mountHeight: 1.4 } },
    { defId: 'towel-rail', props: { mountHeight: 1.1 } },
    flushCeilingLight,
  ],
  // A powder room / WC is a half-bath: no shower.
  powder: [
    { defId: 'toilet' },
    { defId: 'bathroom-sink' },
    { defId: 'bathroom-mirror', props: { mountHeight: 1.4 } },
    flushCeilingLight,
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
  // Service yard / utility (RM2): washer + drying rack + a tall utility
  // cabinet for cleaning supplies.
  serviceYard: [
    { defId: 'washing-machine' },
    { defId: 'drying-rack' },
    { defId: 'utility-cabinet' },
    flushCeilingLight,
  ],
  // Storeroom / bomb shelter (RM2): open shelving for bulk storage.
  storeroom: [{ defId: 'cube-shelf' }, flushCeilingLight],
  // Foyer / entrance (RM2): shoe storage, a landing bench, and a mirror.
  foyer: [
    { defId: 'shoe-cabinet' },
    { defId: 'bench' },
    { defId: 'wall-mirror' },
    flushCeilingLight,
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
 *  balcony / shelter / store / yard rooms stay empty — that's realistic).
 *  Resolved via `roomCategory(room)` (RM1) — the explicit, user-set
 *  `category` wins over name inference, so a renamed room ("Ella's room")
 *  with a set category still gets the right kit. `serviceYard`/`storeroom`/
 *  `foyer`/`other` have no kit yet (their dedicated kits are RM2 — out of
 *  scope here), matching the old name-classifier's behaviour of leaving
 *  those rooms unfurnished. */
function kitForRoom(room: PlanRoom): KitPiece[] | null {
  const name = room.name.toLowerCase()
  const category = roomCategory(room)
  switch (category) {
    case 'balcony':
      return KITS.balcony
    case 'powder':
      return KITS.powder
    case 'study':
      return KITS.study
    case 'kitchen':
      return KITS.kitchen
    case 'bath':
      return KITS.bath
    case 'serviceYard':
      return KITS.serviceYard
    // A household shelter is furnished exactly like a store room — shelving
    // only. `'shelter'` is a distinct category because its WALLS and its
    // daylight obligations differ (RC, unalterable, windowless by design), not
    // because it holds different things.
    case 'storeroom':
    case 'shelter':
      return KITS.storeroom
    case 'foyer':
      return KITS.foyer
    case 'masterBedroom':
      return KITS.bedroomMaster
    case 'bedroom':
      return isMasterName(room.name) || planRoomArea(room) >= 11 ? KITS.bedroomMaster : KITS.bedroom
    case 'dining':
      return KITS.diningRoom
    case 'living': {
      const isDining = /dining|dine/.test(name)
      const isLounge = /living|lounge|family|great/.test(name)
      // Standalone dining → dining set only; combined living/dining → both; else living.
      if (isDining && !isLounge) return KITS.diningRoom
      return isDining ? [...KITS.living, ...KITS.dining] : KITS.living
    }
    default:
      return null
  }
}

/**
 * A wardrobe sized to the room it stands in.
 *
 * `wardrobe-3door` defaults to 1.5 m wide, and in a narrow bedroom that leaves no
 * wall run beside the bed: a 2.7 m wide room takes a 1.5 m bed plus 1.5 m of
 * wardrobe only if they never share a wall, so the wardrobe is dropped instead.
 * Measured on `tpl-condo-3bed`: carving a 1.0 m corridor out of its bedroom column
 * cost ALL THREE wardrobes and a dresser for exactly this reason.
 *
 * The def's own `width` param already goes down to 1.0, which is what a real HDB or
 * condo second bedroom fits. This is deliberately NOT the global narrowing measured
 * and rejected in v0.31.5.121 — that resized every wardrobe in every template for a
 * net-zero sightline gain. This keys on the ROOM, so a generous bedroom keeps its
 * 1.5 m wardrobe.
 */
function narrowWardrobe(defId: string, room: PlanRoom): ParamProps {
  if (defId !== 'wardrobe-3door') return {}
  const shortest = Math.min(room.width, room.depth)
  return shortest < NARROW_BEDROOM_M ? { width: 1.0 } : {}
}

/** Shortest `kitchen-counter-l` the def allows, and the shortest worth building. */
const MIN_COUNTER_M = 1.2

/**
 * A counter run sized to the wall it stands against — the same idea as
 * {@link narrowWardrobe}, for the piece that was breaking small kitchens.
 *
 * `kitchen-counter-l` is parametric (`length` 1.2-4.0 m) but was always seeded at
 * its 2.4 m default, and five shipped kitchens have no wall that long. Measured
 * (v0.31.9.19) — longest wall of the arranger's rect vs the 3.70 m the kit needs
 * (counter 2.4 + fridge 0.7 + hob 0.6):
 *
 * | kitchen | room | longest wall |
 * | --- | --- | --- |
 * | `tpl-condo-studio/su-kit` | 2.0 x 1.6 | **1.76 m** |
 * | `tpl-condo-1bed/c1-kit` | 2.0 x 1.6 | **1.76 m** |
 * | `tpl-condo-1study/cs-kit` | 2.0 x 2.2 | 1.96 m |
 * | `tpl-1bed/ob-kit` | 3.1 x 1.9 | 2.86 m |
 * | `tpl-studio/st-kit` | 3.8 x 1.4 | 3.56 m |
 *
 * A 2.4 m counter cannot stand on a 1.76 m wall at all, so it OVERFLOWED the room
 * — `c1-kit`'s spanned x 0.32-2.72 against a room ending at 2.20 — and the fridge
 * and hob then had nowhere to go and were deleted by `dropOverlaps`. Three of the
 * five kitchens ended up holding a range hood and nothing else.
 *
 * Sizing to the wall is also what a real fitted kitchen does; a 2.4 m run is a
 * default, not a requirement. Rooms with a long enough wall are untouched.
 */
/**
 * The longest stretch of one wall that no DOOR KEEP-OUT interrupts.
 *
 * Measured cause of the galley-kitchen failures (v0.31.9.21): `tpl-studio`'s
 * `st-kit` is refused a counter on every edge not by a wall, a window or a
 * collision but by a 0.9 x 0.9 door swing sitting at x 1.10-2.00 — dead centre
 * of its only wall long enough to take one. The room measures 3.8 m and the
 * longest CLEAR run on it is 2.00 m, so sizing to `max(width, depth)` asks for
 * a length the room cannot give however the piece is moved.
 *
 * Each wall is projected to an interval, the keep-outs overlapping that wall's
 * BAND are subtracted, and the longest surviving sub-interval wins. `BAND` is
 * the depth of floor a counter-deep piece occupies against a wall — a keep-out
 * further into the room than that does not block the run.
 */
const CLEAR_RUN_BAND_M = 0.7

function longestClearRun(room: PlanRoom, keepOut: readonly Rect[]): number {
  const [x0, z0] = room.origin
  const x1 = x0 + room.width
  const z1 = z0 + room.depth
  const walls: Array<{ lo: number; hi: number; near: number; far: number; horiz: boolean }> = [
    { lo: x0, hi: x1, near: z0, far: z0 + CLEAR_RUN_BAND_M, horiz: true },
    { lo: x0, hi: x1, near: z1 - CLEAR_RUN_BAND_M, far: z1, horiz: true },
    { lo: z0, hi: z1, near: x0, far: x0 + CLEAR_RUN_BAND_M, horiz: false },
    { lo: z0, hi: z1, near: x1 - CLEAR_RUN_BAND_M, far: x1, horiz: false },
  ]
  let best = 0
  for (const w of walls) {
    // Cut points along the wall, from every keep-out that reaches into its band.
    let free: Array<[number, number]> = [[w.lo, w.hi]]
    for (const k of keepOut) {
      const across = w.horiz ? [k.z0, k.z1] : [k.x0, k.x1]
      if (across[1] <= w.near || across[0] >= w.far) continue
      const along = w.horiz ? [k.x0, k.x1] : [k.z0, k.z1]
      const next: Array<[number, number]> = []
      for (const [a, b] of free) {
        if (along[1] <= a || along[0] >= b) {
          next.push([a, b])
          continue
        }
        if (along[0] > a) next.push([a, along[0]])
        if (along[1] < b) next.push([along[1], b])
      }
      free = next
    }
    for (const [a, b] of free) best = Math.max(best, b - a)
  }
  return best
}

function fittedCounter(defId: string, room: PlanRoom, keepOut: readonly Rect[]): ParamProps {
  if (defId !== 'kitchen-counter-l') return {}
  // Shrink only enough to stop the run OVERFLOWING THE ROOM. Sizing to the inset
  // rect instead was tried in v0.31.9.19 and shrank more than necessary: it also
  // fired on `tpl-hdb-2room`, whose kitchen was already complete, and the
  // reshuffle marooned its fridge 0.67 m off the wall and cost
  // `tpl-condo-1study` a route. The room boundary is the constraint that matters
  // — a counter is fitted joinery and sits against the wall itself.
  //
  // CLEAR-RUN SIZING (v0.31.9.22). This used to be `max(width, depth)` alone,
  // which asks for a length no position on the wall can supply when a door
  // swings into the run. Sizing to the clear run was measured as INERT on its
  // own in v0.31.9.21 — `snapToWall` CLAMPED the along-wall coordinate to the
  // room centre, so a shorter counter stayed straddling the keep-out. It works
  // only in combination with that function's along-wall SWEEP, added in the
  // same release as this. Neither lever moves anything without the other.
  const longest = Math.min(Math.max(room.width, room.depth), longestClearRun(room, keepOut))
  if (longest >= 2.4) return {}
  return { length: Math.max(MIN_COUNTER_M, Math.round(longest * 10) / 10) }
}

/**
 * A bedroom this narrow (m, shorter side) cannot seat a bed and a full-width
 * wardrobe along the same wall.
 *
 * 2.5 is measured, not chosen: at 2.7 the rule also fires on rooms that DO have
 * space for the narrower piece but no windowless wall to put it on, and three
 * restored wardrobes then stand in front of glass (`jb-b5-win` among them). At 2.5
 * the gain is clean — `tpl-hdb-3gen`'s grandparent suite (3.8 x 2.3) picks up the
 * wardrobe it had been losing, and no window is newly blocked.
 *
 * NOTE this cannot rescue a room that is too SHALLOW. A wardrobe needs its ~0.6 m
 * depth plus `CLEARANCE.storageFront` of clear floor to open into, which alongside
 * a 2.0 m bed exceeds a 2.3 m room depth however narrow the piece is — measured
 * when this rule failed to save `tpl-condo-3bed`'s corridor, which still cost all
 * three of its wardrobes.
 */
const NARROW_BEDROOM_M = 2.5

/** Expand a kit + the preset's cosmetic style into seeded items at the room
 *  centre. Each piece's props = schema defaults < kit-fixed props < preset
 *  style override < the preset's per-room-CATEGORY `categoryStyle` override
 *  (RM2 — the highest-precedence layer, so a theme's bedroom can read calmer
 *  than its living room under the same style bucket). */
function seedRoom(
  room: PlanRoom,
  kit: KitPiece[],
  defs: Record<string, FurnitureDef>,
  style: Record<string, ParamProps>,
  categoryStyle: Record<string, ParamProps> | undefined,
  levelId: string = GROUND_LEVEL_ID,
  keepOut: readonly Rect[] = [],
): FurnitureItem[] {
  const [cx, cz] = roomCentre(room)
  const out: FurnitureItem[] = []
  for (const piece of kit) {
    const def = defs[piece.defId]
    if (!def) continue
    const base = def.kind === 'parametric' ? defaultParamProps(def) : {}
    const props = {
      ...base,
      ...(piece.props ?? {}),
      ...(style[piece.defId] ?? {}),
      ...(categoryStyle?.[piece.defId] ?? {}),
      ...narrowWardrobe(piece.defId, room),
      ...fittedCounter(piece.defId, room, keepOut),
    }
    const n = piece.count ?? 1
    for (let i = 0; i < n; i++) {
      out.push({
        id: `furnish-${room.id}-${piece.defId}-${i}`,
        defId: piece.defId as FurnitureItem['defId'],
        position: [cx, cz],
        rotation: 0,
        // Tag the storey so the item belongs to this level's room (F13) — an
        // upper-floor piece must not be classified into the ground room sharing
        // its x/z, and the arranger / collision are level-gated. Ground items
        // stay untagged (levelId omitted = ground) for identical single-storey
        // output.
        ...(levelId !== GROUND_LEVEL_ID ? { levelId } : {}),
        props: { ...props },
      })
    }
  }
  return out
}

/** Drop items that still overlap after arranging (an over-tight room couldn't
 *  fit the whole kit). The seed order is priority order, so we always drop the
 *  later (less essential) piece of an overlapping pair. */
/**
 * CEILING-MOUNT-RELOCATE (v0.31.9.23) — nudge a clashing ceiling light instead
 * of deleting it.
 *
 * `dropOverlaps` resolves every clash by DELETING the later-seeded piece, which
 * is right for two floor pieces competing for the same floor and wrong for a
 * ceiling light: a light has the whole ceiling to choose from, and the room
 * needs one.
 *
 * Measured cause, traced through the pass chain rather than guessed:
 * `tpl-1bed/ob-kit`'s light sat at the room centre (1.75, 4.25), survived
 * `placeSeededMounts`, and was deleted by `dropOverlaps` — against the
 * **`range-hood`**, not against any floor piece. v0.31.9.22 gave that kitchen
 * its stove, the hood duly moved to hang over it, and the hood's box then
 * covered the centre of the room. So the release that furnished the kitchen
 * un-lit it, and `ob-kit` joined `c1-kit` and `su-kit` as the corpus's only
 * rooms with no light at all.
 *
 * The hood is not the piece to move — `applianceWall.test.ts` requires it to
 * stay within `HOOD_OVER_STOVE_M` of its stove, and a hood somewhere else is a
 * drawing a contractor would build wrong. The light is.
 *
 * Nearest-first over a disc, like `unsealRoutes`, and the trial must stay inside
 * the room: this is the release that learned containment has to test the
 * FOOTPRINT and not the centre, so the light's own box is checked against the
 * room rect with the same 0.2 m slack. A light with nowhere clear falls through
 * to `dropOverlaps` and is deleted as before — no room gains a light it has no
 * space for.
 */
const CEILING_MOUNT_DEFS = new Set(['ceiling-light'])
const RELOCATE_STEP_M = 0.15
const RELOCATE_REACH_M = 1.35

function relocateCeilingMounts(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  plan: FloorPlan,
): FurnitureItem[] {
  const clashing = new Set(findItemOverlaps(items, defs).flatMap(({ a, b }) => [a, b]))
  if (clashing.size === 0) return items
  const targets = items.filter((it) => clashing.has(it.id) && CEILING_MOUNT_DEFS.has(it.defId))
  if (targets.length === 0) return items

  // Nearest-first offsets on a disc — a light should move as little as possible,
  // and the reach only bounds how far the pass MAY go.
  const offsets: Array<[number, number]> = []
  const k = Math.ceil(RELOCATE_REACH_M / RELOCATE_STEP_M)
  for (let i = -k; i <= k; i++)
    for (let j = -k; j <= k; j++) {
      if (i === 0 && j === 0) continue
      const dx = i * RELOCATE_STEP_M
      const dz = j * RELOCATE_STEP_M
      if (Math.hypot(dx, dz) > RELOCATE_REACH_M) continue
      offsets.push([dx, dz])
    }
  offsets.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]))

  let current = items
  for (const target of targets) {
    const def = defs[target.defId]
    if (!def) continue
    const levelId = target.levelId ?? GROUND_LEVEL_ID
    const level = planLevels(plan).find((l) => l.id === levelId)
    const room = level?.rooms.find((r) => pointInRoom(r, target.position[0], target.position[1]))
    if (!room) continue
    const rect = planRoomRect(room)
    const others = current.filter((it) => it.id !== target.id)
    for (const [dx, dz] of offsets) {
      const moved: FurnitureItem = {
        ...target,
        position: [target.position[0] + dx, target.position[1] + dz],
      }
      const box = footprintAabb(moved, def)
      if (
        box.x0 < rect.x0 - CEILING_CONTAIN_TOL ||
        box.x1 > rect.x1 + CEILING_CONTAIN_TOL ||
        box.z0 < rect.z0 - CEILING_CONTAIN_TOL ||
        box.z1 > rect.z1 + CEILING_CONTAIN_TOL
      )
        continue
      if (itemHeightAwareClash(moved, def, others, defs)) continue
      current = current.map((it) => (it.id === target.id ? moved : it))
      break
    }
  }
  return current
}

/** Same 0.2 m slack as `roomOverhang.test.ts`'s `TOL` and `snapToWall`'s
 *  `SETTLE_TOL` — room rects sit 0.1-0.2 m inside their wall centrelines. */
const CEILING_CONTAIN_TOL = 0.2

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
 * Drop any floor item still sitting in a door's keep-out (swing arc + the
 * two-sided approach strip, `doorKeepOutRects`) after arranging (RM3 pt.2) —
 * an over-tight room where the shared arranger (`tryPlace`'s candidate loop +
 * its `settle` fallback) genuinely couldn't find ANY legal spot for a seeded
 * kit piece falls back to that piece's un-arranged seed position, which can
 * land in a doorway. Rather than ship a layout that blocks an entrance, drop
 * the piece — the same "an over-tight room can't fit the whole kit" trade-off
 * `dropOverlaps` already makes for a pure item/item overlap. Mounted/ceiling
 * and noClip items are exempt (they don't block foot traffic); scoped per
 * storey, mirroring the arranger's own level-aware geometry.
 */
function dropDoorBlockers(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  plan: FloorPlan,
): FurnitureItem[] {
  const dropIds = new Set<string>()
  for (const level of planLevels(plan)) {
    const lp = levelAsPlan(plan, level)
    const keepOut = doorKeepOutRects(lp)
    if (keepOut.length === 0) continue
    for (const it of items) {
      if ((it.levelId ?? GROUND_LEVEL_ID) !== level.id) continue
      const def = defs[it.defId]
      if (!def || def.mounted || def.noClip) continue
      const box = footprintAabb(it, def)
      if (keepOut.some((k) => rectsOverlap(box, k))) dropIds.add(it.id)
    }
  }
  return dropIds.size === 0 ? items : items.filter((it) => !dropIds.has(it.id))
}

/**
 * Drop any floor item whose footprint still pokes INTO a wall body after
 * arranging — the wall-clip analog of `dropDoorBlockers`. A room too small /
 * oddly-shaped for a seeded piece (a shallow "AC ledge" balcony that can't hold
 * an outdoor table; a corridor too narrow for a seeded sofa) leaves that piece
 * on its un-arranged seed position or a wall-embedded fallback, which the Checks
 * overlay + Design score flag as "inside a wall". Rather than ship furniture
 * clipping through a wall, drop it — the same "an over-tight room can't fit the
 * whole kit" trade-off `dropOverlaps`/`dropDoorBlockers` already make, completing
 * this module's "always collision-clean" contract. Mounted (wall/ceiling) and
 * noClip items are exempt (they never clip — `findWallClips` skips them); scoped
 * per storey against that storey's own resolved collision walls.
 */
/**
 * DROP-UNPLACEABLE (v0.31.9.25) — the furnish path must never emit an item that
 * is geometrically invalid.
 *
 * `arrangeCore` finishes with
 * `allItems.map((orig) => byId.get(orig.id) ?? orig)`: an item the room routine
 * and then the safety `settle` both failed to place keeps its ORIGINAL
 * transform, which is the seed point — the room centre, or wherever a stale
 * default left it. Nothing downstream removed it, so the arranger could hand
 * back a piece standing in a wall.
 *
 * **The arranger itself must not delete**, and that is deliberate: the same
 * `arrangeAllRoomsForPlan` powers the interactive "tidy" action, where making a
 * user's furniture vanish is far worse than leaving it where they put it —
 * `autoArrange.test.ts` pins the no-delete contract with
 * `expect(out.length).toBe(hydrate().length)`. So the drop belongs HERE, on the
 * furnish path, alongside the three drops that already run for clashes, door
 * swings and wall clips.
 *
 * **It is a no-op on today's corpus: 0 of 1409 items across the 19 templates.**
 * That is the point — it is a guard, not a fix. v0.31.9.24 built four placement
 * levers worth room overhangs 10 -> 4 and had to revert all four because one of
 * them starved the default plan's `drying-rack`, and the failure surfaced as an
 * invalid item rather than as a missing one. With this pass in place the FURNISH
 * half of that class can only ever show up as an item-count delta, which the
 * per-def ratchets already measure and read honestly.
 *
 * It uses the same `canPlace` the arranger's own `tryPlace` uses, with the
 * storey's collision walls, so "survives the furnish" and "would have been legal
 * to place" are one rule.
 */
function dropUnplaceable(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  plan: FloorPlan,
  doors: Record<string, { open: boolean }>,
): FurnitureItem[] {
  const dropIds = new Set<string>()
  for (const level of planLevels(plan)) {
    const walls = planCollisionWalls(levelAsPlan(plan, level), doors)
    if (walls.length === 0) continue
    // Accumulated in list order, mirroring `autoArrange.test.ts`'s own validity
    // sweep: an item is judged against what precedes it, so one bad piece cannot
    // condemn every later one.
    const kept: FurnitureItem[] = []
    for (const it of items) {
      if ((it.levelId ?? GROUND_LEVEL_ID) !== level.id) continue
      const def = defs[it.defId]
      if (!def) continue
      // Mounts and rugs are exempt for the same reason every other pass exempts
      // them: they do not occupy floor, and `canPlace` is a floor predicate.
      if (def.mounted || def.noClip) {
        kept.push(it)
        continue
      }
      if (canPlace(it, def, { others: kept, defs, doors, walls })) kept.push(it)
      else dropIds.add(it.id)
    }
  }
  return dropIds.size === 0 ? items : items.filter((it) => !dropIds.has(it.id))
}

function dropWallClippers(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  plan: FloorPlan,
  doors: Record<string, { open: boolean }>,
): FurnitureItem[] {
  const dropIds = new Set<string>()
  for (const level of planLevels(plan)) {
    const lp = levelAsPlan(plan, level)
    const walls = planCollisionWalls(lp, doors)
    if (walls.length === 0) continue
    const levelItems = items.filter((it) => (it.levelId ?? GROUND_LEVEL_ID) === level.id)
    for (const id of findWallClips(levelItems, defs, walls)) dropIds.add(id)
  }
  return dropIds.size === 0 ? items : items.filter((it) => !dropIds.has(it.id))
}

/**
 * Categories whose pieces belong against a wall, so one still sitting on the
 * seed point is a placement failure rather than a choice (SETTLE-ORIGIN).
 *
 * Chosen by CATEGORY, not by arrange-role, because role is too coarse: `bench`
 * and `coffee-table` are both role `lowTable`, and `toilet` and `outdoor-table`
 * are both role `other`. Category separates them (`seating`/`tables`,
 * `bathroom`/`outdoor`), and deliberately EXCLUDES `tables` and `textiles` — a
 * rug, coffee table or dining table belongs in the middle of the room, and the
 * sweep found 17 of those correctly centred.
 */
/**
 * Categories whose pieces belong against a wall, so one still sitting on the
 * seed point should be pulled to one.
 *
 * `appliances`, `kitchen` and `laundry` were MISSING until v0.31.9.18, which
 * meant a fridge, hob, counter run or washing machine stranded on the seed point
 * was never rescued — it just stayed at the room centre and `dropOverlaps`
 * deleted it. That is the direct cause of the incomplete kitchens
 * `roomCompleteness.test.ts` records: `tpl-condo-1bed/c1-kit`'s fridge sat at
 * (1.20, 5.60), which IS the room centre, overlapping both the hob and the
 * counter, while a 0.76 x 0.70 m gap stood free in the north-west corner.
 *
 * `docs/interior-design-guidelines.md` puts "storage/appliances/beds flush to
 * walls" in the same breath, so excluding appliances was never deliberate — and
 * the categories are easy to miss because `roleOf('refrigerator')` already says
 * `storage` while its CATEGORY says `appliances`, and this check reads the
 * category.
 */
const WALL_HUGGING_CATEGORIES = new Set([
  'bathroom',
  'storage',
  'seating',
  'appliances',
  'kitchen',
  'laundry',
])

/** Whether a piece found on the seed point should be pulled to a wall. */
function wantsWall(item: FurnitureItem, defs: Record<string, FurnitureDef>): boolean {
  if (roleOf(item.defId, defs) === 'mounted') return true
  const cat = defs[item.defId]?.category
  return cat ? WALL_HUGGING_CATEGORIES.has(cat) : false
}

/** AABB overlap on the broadphase boxes (`itemAabbBox`). */
function aabbHit(a: AabbItem, b: AabbItem): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ
}

/**
 * Place the MOUNTED fixtures a kit seeded but the arranger deliberately left
 * alone (MOUNTED-SEED).
 *
 * `arrangeCore` treats role `'mounted'`/`'ceiling'` as FIXED and keeps it at its
 * current transform — correct, because that is what protects a fixture a USER
 * positioned (and a locked item) from being shuffled. But `seedRoom` gives every
 * kit piece the ROOM CENTRE as a placeholder, so on the furnish-from-scratch
 * path a mount's "current transform" is a position nobody chose, and the
 * arranger faithfully preserves it. Measured on `tpl-terrace-ground`: the
 * `range-hood` sat at [4.75, 10.75] — the kitchen's exact centre — while the
 * `stove` was correctly placed at [5.38, 11.53] a metre away, leaving a metallic
 * hood hanging at `mountHeight` 1.5 m in open space. At the room-centroid walk
 * pose that put it 0.06 m above the walker's eye and blacked out the top of the
 * frame (kitchen ceiling band 37 luma against the identically-sized dining
 * room's 210).
 *
 * The guard is deliberately narrow: a mount is only moved while it still sits at
 * its room's exact centre, i.e. it is demonstrably an unplaced seed. Anything the
 * arranger (or a user) has already positioned is left untouched, so this cannot
 * regress the behaviour `isFixed` exists to protect.
 *
 * An extractor hood belongs over the cooktop, so it takes the stove's position
 * and rotation outright — which is exactly what the default flat's hand-authored
 * preset does (there, `stove` and `range-hood` share identical coordinates).
 * Every other stranded mount goes flush to its nearest wall, facing the room.
 */
export function placeSeededMounts(
  plan: FloorPlan,
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
): FurnitureItem[] {
  const EPS = 1e-6
  const byId = new Map(items.map((it) => [it.id, it]))
  const moved = new Map<string, FurnitureItem>()
  for (const level of planLevels(plan)) {
    const onLevel = items.filter((it) => (it.levelId ?? GROUND_LEVEL_ID) === level.id)
    // Floor space already spoken for, across the WHOLE storey — a piece flushed
    // near a room edge can otherwise land on a neighbouring room's furniture.
    // Mounts are excluded on purpose: the overlap narrowphase is height-aware
    // (`itemsCollide` takes a `verticalSpan`), so a mirror above a basin is not
    // a clash and must neither reserve floor nor be blocked by it (.107).
    const floorClaims: AabbItem[] = []
    // Door swings + approach strips on this storey. A rescue MUST avoid them:
    // `dropDoorBlockers` runs after this pass and deletes any floor piece left
    // in one — measured as 10 of the losses, and exactly the kinds this pass
    // moves (3 bathroom-sink, 2 nightstand, 1 bench). Flushing a fixture to the
    // only wall it fits against is worthless if that wall is behind a door.
    const doorKeepOut = doorKeepOutRects(levelAsPlan(plan, level))
    // WINDOW-KEEPOUT-IN-RESCUE (v0.31.8.75). This pass already refuses to park a
    // rescued piece in a door's keep-out, "because `dropDoorBlockers` runs after
    // this pass and deletes any floor piece left in one". The identical argument
    // applies to WINDOWS: `placementSoundness.test.ts` asserts ZERO items in a
    // `windowFrontRects` keep-out and `tryPlace` enforces it for everything the
    // ARRANGER places — but this pass did not know about them, so a piece the
    // arranger could not place was rescued straight into a window front.
    // Measured on `tpl-hdb-5room`: `utility-cabinet` at (3.50, 0.85) rot 1.57
    // spans x 3.30-3.70, z 0.60-1.10 against the kitchen window's rect at
    // x 1.70-3.50, z 0.10-0.75 — a 0.20 x 0.15 m overlap.
    const windowKeepOut = windowFrontRects(levelAsPlan(plan, level))
    const claimable = (it: FurnitureItem) => {
      const d = defs[it.defId]
      return !!d && !d.noClip && !d.mounted && roleOf(it.defId, defs) !== 'ceiling'
    }
    for (const room of level.rooms) {
      const [cx, cz] = roomCentre(room)
      const inRoom = onLevel.filter(
        (it) =>
          it.position[0] >= room.origin[0] &&
          it.position[0] <= room.origin[0] + room.width &&
          it.position[1] >= room.origin[1] &&
          it.position[1] <= room.origin[1] + room.depth,
      )
      // Still exactly at the seed point = never placed by the arranger.
      const stranded = inRoom.filter(
        (it) =>
          wantsWall(it, defs) &&
          Math.abs(it.position[0] - cx) < EPS &&
          Math.abs(it.position[1] - cz) < EPS,
      )
      if (stranded.length === 0) continue
      if (floorClaims.length === 0) {
        for (const other of onLevel) {
          if (!claimable(other)) continue
          floorClaims.push(itemAabbBox(other, defs[other.defId]!))
        }
      }
      // The pieces about to move stop reserving their old (seed) spot.
      for (const it of stranded) {
        const k = floorClaims.findIndex((c) => c.id === it.id)
        if (k >= 0) floorClaims.splice(k, 1)
      }
      const rect = {
        minX: room.origin[0],
        minZ: room.origin[1],
        maxX: room.origin[0] + room.width,
        maxZ: room.origin[1] + room.depth,
      }
      // HOOD-AFTER-STOVE (v0.31.9.18). A hood follows the cooktop, so it has to
      // be rescued AFTER it — and it has to read the stove's RESCUED position,
      // not the stale one in `inRoom`. Neither held before: hoods were processed
      // in list order and the lookup only ever saw pre-move coordinates, so
      // adding `kitchen` to the wall-hugging set (which finally lets a stranded
      // stove reach a wall) pushed `tpl-condo-3bed`'s hood from 1.13 m to 2.35 m
      // away from its own stove. The rule existed; it just could not fire.
      const stovesLast = [...stranded].sort(
        (a, b) => Number(a.defId === 'range-hood') - Number(b.defId === 'range-hood'),
      )
      for (const it of stovesLast) {
        // A hood follows the cooktop. Only a stove that itself moved off the
        // seed point is a real placement to follow.
        if (it.defId === 'range-hood') {
          const stove = inRoom
            .filter((o) => o.defId === 'stove')
            .map((o) => moved.get(o.id) ?? o)
            .find((o) => Math.abs(o.position[0] - cx) > EPS || Math.abs(o.position[1] - cz) > EPS)
          if (stove) {
            moved.set(it.id, {
              ...it,
              position: [stove.position[0], stove.position[1]],
              rotation: stove.rotation,
            })
            continue
          }
        }
        const def = defs[it.defId]
        if (!def) continue
        const fp = itemFootprint(it, def)
        const nearest = nearestWallEdge(it.position, rect)
        // `rotationForEdge` turns the piece to face away from the wall, which for
        // a W/E wall is a 90-degree turn — so its WORLD half-extents swap. Using
        // the unrotated pair leaves a mount too far off the wall: a 0.6 x 0.06 m
        // `wall-mirror` flushed by its 0.3 m half-WIDTH sat 0.27 m proud of the
        // wall (measured 5.05 against a room edge at 4.70; now 4.73).
        const isMount = roleOf(it.defId, defs) === 'mounted'
        // MOUNT-HEIGHT-CLASH (v0.31.8.71). A mount used to take its nearest wall
        // UNCONDITIONALLY — "it hangs above the floor, so nothing down there can
        // block it". True of a basin, FALSE of a wardrobe, which reaches the
        // mount's height. Once WALL-SNAP-SHORTFALL puts that wardrobe against the
        // wall instead of 0.15 m proud of it, the mount lands on the wardrobe and
        // `dropOverlaps` deletes one of the pair — measured as a lost
        // `wall-mirror` in `tpl-terrace-ground`'s upper landing, which is exactly
        // what the comment further down warns about.
        //
        // So a mount now tries EVERY wall, nearest first, and takes the first that
        // is clear at its own height. Trying only the nearest and then giving up
        // strands it on the room centre instead — measured on
        // `tpl-condo-4bed/c4-cbath/towel-rail`, which is the failure this whole
        // pass exists to prevent. If no wall is clear it keeps the historical
        // behaviour and takes the nearest anyway: misplaced on a wall beats
        // marooned mid-room, and `dropOverlaps` then makes the same trade it
        // always did.
        // EVERY stranded piece considers all four walls, nearest first — not just
        // mounts (v0.31.8.75). A floor piece limited to its nearest wall had to
        // fall back to the RELAXED window pass whenever that one wall carried
        // glass, which put `tpl-hdb-5room`'s `utility-cabinet` in front of the
        // kitchen window even though the yard's north wall was clear. More walls
        // tried is strictly more options; nothing can go unplaced by it.
        const edges: WallEdge[] = [
          nearest,
          ...(['N', 'S', 'W', 'E'] as WallEdge[]).filter((e) => e !== nearest),
        ]
        let chosen: { pos: [number, number]; rot: number } | null = null
        // Strictness outside the WALL loop, not inside it: try every wall while
        // still respecting windows, and only then allow a windowed spot. Nesting
        // it the other way relaxes on the first wall and never looks at the rest,
        // which is how the cabinet ended up in front of glass with a clear wall
        // going spare.
        for (const strict of [true, false] as const) {
          if (chosen) break
          for (const edge of edges) {
            const sideways = edge === 'W' || edge === 'E'
            const halfX = sideways ? fp.hz : fp.hx
            const halfZ = sideways ? fp.hx : fp.hz
            const rot = rotationForEdge(edge)
            const base = flushToWall(it.position, rect, edge, halfX, halfZ)
            // A mount asks only whether it would INTERSECT something at its own
            // height. A FLOOR piece slides along the wall until its box is clear of
            // everything already placed, measured with the SAME `itemAabbBox` the
            // real broadphase uses so the two cannot disagree.
            const clashes = (p: [number, number]) =>
              itemHeightAwareClash({ ...it, position: p, rotation: rot }, def, onLevel, defs)
            let spot: [number, number] | null = isMount && !clashes(base) ? base : null
            // WINDOWS ARE A PREFERENCE HERE, DOORS ARE NOT. The sweep runs twice:
            // first demanding both keep-outs, then doors only. Making the window
            // check hard on a single pass cost `tpl-hdb-maisonette` its SHOWER — a
            // 2 m shower in a 1.6 x 1.3 m bathroom whose walls all carry glass has
            // nowhere window-free to stand, so refusing every spot stranded it and
            // it was dropped. A blocked door is a safety problem; a blocked window
            // is a quality one, and a bathroom with no shower is worse than a
            // shower in front of the glass. `windowSightline.test.ts` ratchets
            // whatever does land there.
            {
              const along = sideways ? halfZ : halfX
              const lo = (sideways ? rect.minZ : rect.minX) + along
              const hi = (sideways ? rect.maxZ : rect.maxX) - along
              const step = Math.max(0.1, along)
              for (let k = 0; k <= 16 && !spot; k++) {
                for (const dir of k === 0 ? [0] : [1, -1]) {
                  const t = (sideways ? base[1] : base[0]) + dir * k * step
                  if (t < lo - 1e-9 || t > hi + 1e-9) continue
                  const p: [number, number] = sideways ? [base[0], t] : [t, base[1]]
                  if (isMount) {
                    // A mount reserves no floor and is blocked by none, so it skips
                    // the floor claims and the door keep-out entirely.
                    if (clashes(p)) continue
                  } else {
                    const box = itemAabbBox({ ...it, position: p, rotation: rot }, def)
                    if (floorClaims.some((c) => aabbHit(box, c))) continue
                    const fb = { x0: box.minX, x1: box.maxX, z0: box.minZ, z1: box.maxZ }
                    if (doorKeepOut.some((k) => rectsOverlap(fb, k))) continue
                    // A window rejects only a piece TALLER than its sill; a
                    // near-zero sill (a balcony slider) rejects every floor piece.
                    if (
                      strict &&
                      windowKeepOut.some(
                        (k) =>
                          (k.sill <= 0.05 || def.defaultFootprint.h > k.sill) &&
                          rectsOverlap(fb, k),
                      )
                    )
                      continue
                  }
                  spot = p
                  break
                }
              }
            }
            if (spot) chosen = { pos: spot, rot }
            // A mount that found nothing on this wall tries the next one; a floor
            // piece has only its nearest wall to try (walls are its own edge choice,
            // made upstream by the arranger), so the loop ends either way.
            if (chosen) break
          }
        }
        // Nowhere clear on any wall. Keep the historical behaviour and take the
        // NEAREST wall anyway: misplaced on a wall beats marooned on the room
        // centre, which is the failure this whole pass exists to prevent
        // (measured on `tpl-condo-4bed/c4-cbath/towel-rail`). `dropOverlaps` then
        // makes the same trade it always did.
        if (!chosen && isMount) {
          const sw = nearest === 'W' || nearest === 'E'
          chosen = {
            pos: flushToWall(it.position, rect, nearest, sw ? fp.hz : fp.hx, sw ? fp.hx : fp.hz),
            rot: rotationForEdge(nearest),
          }
        }
        if (!chosen) continue
        const spotFinal = chosen.pos
        const rotFinal = chosen.rot
        if (!isMount)
          floorClaims.push(itemAabbBox({ ...it, position: spotFinal, rotation: rotFinal }, def))
        moved.set(it.id, { ...it, position: spotFinal, rotation: rotFinal })
      }
    }
  }
  if (moved.size === 0) return items
  return items.map((it) => moved.get(it.id) ?? byId.get(it.id) ?? it)
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
  /** Layout-variant seed forwarded to the arranger (LAYOUT-REROLL). `0` — the
   *  default — is byte-identical to before. A preset changes the FINISHES and
   *  cosmetic style props; only this changes where things go. Both are needed
   *  for two schemes to differ in substance (`analysis/schemeOptions.ts`). */
  seed = 0,
): FurnitureItem[] {
  const seeded: FurnitureItem[] = []
  // Furnish EVERY storey (F13): `plan.rooms` is ground-only, so iterate all
  // levels and seed each room tagged with its storey. Single-storey plans yield
  // only the ground level (no levelId tag) → identical to the old loop.
  for (const level of planLevels(plan)) {
    // Once per storey, not per room: `doorKeepOutRects` rasterises every door
    // on the level and `fittedCounter` needs it for each kitchen it sizes.
    const levelKeepOut = doorKeepOutRects(levelAsPlan(plan, level))
    for (const room of level.rooms) {
      const category = roomCategory(room)
      const base = kitForRoom(room)
      // A preset's own `kits[category]` pieces are ADDED to the base kit for
      // that room category (RM2) — lets a theme cover rooms the base kit
      // vocabulary doesn't (e.g. a themed foyer bench) without redefining it.
      const extra = preset.kits?.[category]
      const kit = base || extra ? [...(base ?? []), ...(extra ?? [])] : null
      if (kit)
        seeded.push(
          ...seedRoom(
            room,
            kit,
            defs,
            preset.style,
            preset.categoryStyle?.[category],
            level.id,
            levelKeepOut,
          ),
        )
    }
  }
  if (seeded.length === 0) return []
  const arranged = arrangeAllRoomsForPlan(plan, seeded, defs, doors, seed)
  // ROUTE-UNSEAL (v0.31.8.55). The drop passes above delete pieces that are
  // physically wrong; this one MOVES a piece that is physically fine and
  // strategically disastrous — one that seals a room off from the front door.
  // Measured over the 19 templates: 43 unreachable rooms -> 18, by moving 12
  // items and deleting none. See `layout/reachability.ts`.
  const furniture = dropUnplaceable(
    unsealRoutes(
      dropWallClippers(
        dropDoorBlockers(
          dropOverlaps(
            relocateCeilingMounts(placeSeededMounts(plan, arranged, defs), defs, plan),
            defs,
          ),
          defs,
          plan,
        ),
        defs,
        plan,
        doors,
      ),
      defs,
      plan,
    ),
    defs,
    plan,
    doors,
  )
  if (!withDecor) return furniture
  // Styling pass: add set-dressing props on host surfaces. The pass may reach for
  // bundled CC0 GLB set-dressing props (vases, books, plants, a tea set) that
  // live in the generated catalog, not BUILTIN_CATALOG — merge them in for the
  // lookup ONLY (arrangement above stays on the builtin defs it was given, so
  // furnish/collision behaviour is unchanged). Callers' own defs win on id clash.
  const styleDefs = mergeGeneratedCatalog(defs)
  const decor = applyDecorStylingForPlan(plan, furniture, styleDefs)
  return [...furniture, ...decor]
}

/**
 * Furnish a plan with ONLY the OCS bathroom sanitary fittings (R4-3) — a bare
 * BTO-with-OCS handover state, not a full furnish. Seeds the OCS bath kit into
 * every bath/powder room and arranges it to the walls, so the owner starts from
 * the WC / basin / shower / heater HDB actually installs. No decor pass (the
 * shell is meant to read as an unfurnished-but-fitted handover). Pure +
 * deterministic; returns [] when the plan has no bathrooms.
 */
export function furnishOcsItems(
  plan: FloorPlan,
  bathKit: KitPiece[],
  defs: Record<string, FurnitureDef>,
  doors: Record<string, { open: boolean }>,
): FurnitureItem[] {
  const seeded: FurnitureItem[] = []
  for (const level of planLevels(plan)) {
    for (const room of level.rooms) {
      const category = roomCategory(room)
      if (category !== 'bath' && category !== 'powder') continue
      // A powder room / WC has no shower.
      const kit = category === 'powder' ? bathKit.filter((p) => p.defId !== 'shower') : bathKit
      seeded.push(...seedRoom(room, kit, defs, {}, undefined, level.id))
    }
  }
  if (seeded.length === 0) return []
  const arranged = arrangeAllRoomsForPlan(plan, seeded, defs, doors)
  return dropWallClippers(
    dropDoorBlockers(dropOverlaps(arranged, defs), defs, plan),
    defs,
    plan,
    doors,
  )
}
