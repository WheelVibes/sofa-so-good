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
import { findItemOverlaps, findWallClips, itemAabbBox, itemFootprint } from '../collision/placement'
import { GROUND_LEVEL_ID, levelAsPlan, planLevels } from '../floorplan/levels'
import { planCollisionWalls } from '../floorplan/planGeometry'
import { roomCategory } from '../floorplan/roomCategory'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import { planRoomArea } from '../floorplan/types'
import { rectsOverlap } from '../layout/arrangeGeometry'
import { roleOf } from '../layout/arrangeRoles'
import { arrangeAllRoomsForPlan } from '../layout/autoArrange'
import { doorKeepOutRects, footprintAabb } from '../layout/clearance'
import { flushToWall, nearestWallEdge, rotationForEdge } from '../layout/faceWall'
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
const WALL_HUGGING_CATEGORIES = new Set(['bathroom', 'storage', 'seating'])

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
      for (const it of stranded) {
        // A hood follows the cooktop. Only a stove that itself moved off the
        // seed point is a real placement to follow.
        if (it.defId === 'range-hood') {
          const stove = inRoom.find(
            (o) =>
              o.defId === 'stove' &&
              (Math.abs(o.position[0] - cx) > EPS || Math.abs(o.position[1] - cz) > EPS),
          )
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
        const edge = nearestWallEdge(it.position, rect)
        // `rotationForEdge` turns the piece to face away from the wall, which for
        // a W/E wall is a 90-degree turn — so its WORLD half-extents swap. Using
        // the unrotated pair leaves a mount too far off the wall: a 0.6 x 0.06 m
        // `wall-mirror` flushed by its 0.3 m half-WIDTH sat 0.27 m proud of the
        // wall (measured 5.05 against a room edge at 4.70; now 4.73).
        const sideways = edge === 'W' || edge === 'E'
        const halfX = sideways ? fp.hz : fp.hx
        const halfZ = sideways ? fp.hx : fp.hz
        const rot = rotationForEdge(edge)
        const base = flushToWall(it.position, rect, edge, halfX, halfZ)
        const isMount = roleOf(it.defId, defs) === 'mounted'
        // A mount takes the wall unconditionally — it hangs above the floor, so
        // nothing down there can block it. A FLOOR piece slides along the wall
        // until its box is clear of everything already placed, measured with the
        // SAME `itemAabbBox` the real broadphase uses so the two cannot disagree.
        let spot: [number, number] | null = isMount ? base : null
        if (!isMount) {
          const along = sideways ? halfZ : halfX
          const lo = (sideways ? rect.minZ : rect.minX) + along
          const hi = (sideways ? rect.maxZ : rect.maxX) - along
          const step = Math.max(0.1, along)
          for (let k = 0; k <= 16 && !spot; k++) {
            for (const dir of k === 0 ? [0] : [1, -1]) {
              const t = (sideways ? base[1] : base[0]) + dir * k * step
              if (t < lo - 1e-9 || t > hi + 1e-9) continue
              const p: [number, number] = sideways ? [base[0], t] : [t, base[1]]
              const box = itemAabbBox({ ...it, position: p, rotation: rot }, def)
              if (floorClaims.some((c) => aabbHit(box, c))) continue
              const fb = { x0: box.minX, x1: box.maxX, z0: box.minZ, z1: box.maxZ }
              if (doorKeepOut.some((k) => rectsOverlap(fb, k))) continue
              spot = p
              break
            }
          }
        }
        // Nowhere clear along that wall: leave it untouched. Stacking it on
        // another piece would let `dropOverlaps` DELETE one of them, and losing
        // furniture is worse than leaving it misplaced (measured 900 -> 893).
        if (!spot) continue
        if (!isMount) floorClaims.push(itemAabbBox({ ...it, position: spot, rotation: rot }, def))
        moved.set(it.id, { ...it, position: spot, rotation: rot })
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
          ...seedRoom(room, kit, defs, preset.style, preset.categoryStyle?.[category], level.id),
        )
    }
  }
  if (seeded.length === 0) return []
  const arranged = arrangeAllRoomsForPlan(plan, seeded, defs, doors, seed)
  const furniture = dropWallClippers(
    dropDoorBlockers(dropOverlaps(placeSeededMounts(plan, arranged, defs), defs), defs, plan),
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
