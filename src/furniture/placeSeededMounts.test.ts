import { describe, expect, it } from 'vitest'
import { GROUND_LEVEL_ID, planLevels } from '../floorplan/levels'
import { PLAN_TEMPLATES } from '../floorplan/templates'
import { hdbMaisonette } from '../floorplan/templates/hdb'
import type { FloorPlan } from '../floorplan/types'
import { roleOf } from '../layout/arrangeRoles'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { furnishPlanItems, placeSeededMounts } from './furnishPlan'
import { LAYOUT_PRESETS } from './layoutPresets'
import type { FurnitureItem } from './types'

/**
 * MOUNTED-SEED (v0.31.5.103) — a kit-seeded wall/ceiling mount must be PLACED,
 * not left on the seed point.
 *
 * `arrangeCore` treats role `'mounted'` as fixed and never moves it, which is
 * what protects a fixture a USER positioned. But `seedRoom` seeds every kit piece
 * at the ROOM CENTRE, so on the furnish-from-scratch path the arranger preserved
 * a placeholder nobody chose. Measured on `tpl-terrace-ground` before the fix:
 * `range-hood` at [4.75, 10.75] (the kitchen's exact centre) while the `stove`
 * was correctly placed at [5.38, 11.53] — a metre away — leaving a metallic hood
 * hanging in open space at mountHeight 1.5 m. The default flat never showed it
 * because `applyLayoutPreset` takes the hand-authored `buildPresetItems` branch
 * there (its `stove` and `range-hood` share identical coordinates).
 */
const preset = LAYOUT_PRESETS.find((p) => p.id === 'move-in')!
const terrace = () => PLAN_TEMPLATES.find((t) => t.id === 'tpl-terrace-ground')! as FloorPlan
const furnish = (plan: FloorPlan) => furnishPlanItems(plan, preset, BUILTIN_CATALOG, {}, false)

const roomCentreOf = (plan: FloorPlan, roomId: string): [number, number] => {
  for (const level of planLevels(plan)) {
    const r = level.rooms.find((x) => x.id === roomId)
    if (r) return [r.origin[0] + r.width / 2, r.origin[1] + r.depth / 2]
  }
  throw new Error(`no room ${roomId}`)
}

describe('placeSeededMounts', () => {
  it('puts the range hood over the stove on tpl-terrace-ground', () => {
    // THE regression, as data: before the fix these were ~1.0 m apart.
    const items = furnish(terrace())
    const hood = items.find((i) => i.defId === 'range-hood')
    const stove = items.find((i) => i.defId === 'stove')
    expect(hood, 'hood seeded').toBeDefined()
    expect(stove, 'stove seeded').toBeDefined()
    const d = Math.hypot(
      hood!.position[0] - stove!.position[0],
      hood!.position[1] - stove!.position[1],
    )
    expect(d).toBeLessThan(0.01)
  })

  // Deliberately the slow test in this file (~6 s): it furnishes and arranges all
  // nineteen shipped templates. That breadth IS the assertion — the defect hit
  // 19/19 with 59 stranded fixtures — so the cost is declared with an explicit
  // timeout rather than trimmed away or left to flake at vitest's 5 s default.
  it('leaves NO mounted fixture stranded on its room centre, on any template', () => {
    // The general statement of the bug. Sweeping every shipped template also
    // guards the other kits (bathroom mirrors, towel rails, wall mirrors).
    for (const tpl of PLAN_TEMPLATES) {
      const plan = tpl as FloorPlan
      const items = furnish(plan)
      for (const level of planLevels(plan)) {
        for (const room of level.rooms) {
          const [cx, cz] = roomCentreOf(plan, room.id)
          const stranded = items.filter(
            (it) =>
              (it.levelId ?? GROUND_LEVEL_ID) === level.id &&
              roleOf(it.defId, BUILTIN_CATALOG) === 'mounted' &&
              Math.abs(it.position[0] - cx) < 1e-6 &&
              Math.abs(it.position[1] - cz) < 1e-6,
          )
          expect(stranded.map((s) => `${tpl.id}/${room.id}/${s.defId}`)).toEqual([])
        }
      }
    }
  }, 30_000)

  it('does NOT move a mount that is already placed — the behaviour isFixed protects', () => {
    // The narrow guard is what makes this safe: only a fixture still sitting on
    // the exact seed point is touched. A user-positioned mount must survive.
    const plan = terrace()
    const [cx, cz] = roomCentreOf(plan, 'ct-kit')
    const userPlaced: FurnitureItem = {
      id: 'user-hood',
      defId: 'range-hood' as FurnitureItem['defId'],
      position: [cx + 0.4, cz + 0.35],
      rotation: 1.1,
      props: {},
    } as FurnitureItem
    const out = placeSeededMounts(plan, [userPlaced], BUILTIN_CATALOG)
    expect(out[0]!.position).toEqual(userPlaced.position)
    expect(out[0]!.rotation).toBe(userPlaced.rotation)
  })

  it('returns the SAME array when nothing is stranded (no needless churn)', () => {
    const plan = terrace()
    const placed: FurnitureItem[] = [
      {
        id: 'a',
        defId: 'range-hood' as FurnitureItem['defId'],
        position: [1.11, 2.22],
        rotation: 0,
        props: {},
      } as FurnitureItem,
    ]
    expect(placeSeededMounts(plan, placed, BUILTIN_CATALOG)).toBe(placed)
  })

  it('walls a stranded mount when its room has no host appliance', () => {
    // A hood with no stove must still leave the middle of the room.
    const plan = terrace()
    const [cx, cz] = roomCentreOf(plan, 'ct-kit')
    const lone: FurnitureItem = {
      id: 'lone-hood',
      defId: 'range-hood' as FurnitureItem['defId'],
      position: [cx, cz],
      rotation: 0,
      props: {},
    } as FurnitureItem
    const out = placeSeededMounts(plan, [lone], BUILTIN_CATALOG)
    const movedBy = Math.hypot(out[0]!.position[0] - cx, out[0]!.position[1] - cz)
    expect(movedBy).toBeGreaterThan(0.2)
  })

  it('CONTROL: a multi-storey template keeps its mounts on their own storey', () => {
    // The level tag must survive the pass — moving an upper-floor mount onto a
    // ground room would be the level-blindness bug all over again.
    const plan = hdbMaisonette() as FloorPlan
    const before = furnish(plan)
    for (const it of before) {
      if (roleOf(it.defId, BUILTIN_CATALOG) !== 'mounted') continue
      const level = planLevels(plan).find((l) => l.id === (it.levelId ?? GROUND_LEVEL_ID))
      expect(level, `level for ${it.defId}`).toBeDefined()
      const inSomeRoom = level!.rooms.some(
        (r) =>
          it.position[0] >= r.origin[0] - 0.6 &&
          it.position[0] <= r.origin[0] + r.width + 0.6 &&
          it.position[1] >= r.origin[1] - 0.6 &&
          it.position[1] <= r.origin[1] + r.depth + 0.6,
      )
      expect(inSomeRoom, `${it.defId} inside its own storey`).toBe(true)
    }
  })
})

describe('flushing uses the ROTATED extents', () => {
  it('puts a wall mirror against the wall, not a half-width off it', () => {
    // `rotationForEdge` turns the piece 90 degrees for a W/E wall, so its world
    // half-extents swap. `.103` flushed by the UNROTATED pair, so a 0.6 x 0.06 m
    // `wall-mirror` was offset by its 0.3 m half-WIDTH instead of its 0.03 m
    // half-depth and floated 0.27 m proud of the wall. Measured in the terrace's
    // upper landing (west wall at x=4.70): 5.05 before, 4.73 after.
    const plan = terrace()
    const items = furnish(plan)
    const level = planLevels(plan).find((l) => l.id === 'ct-up')!
    const room = level.rooms.find((r) => r.id === 'ctu-landing')!
    const mirror = items.find(
      (i) =>
        i.levelId === 'ct-up' &&
        i.defId === 'wall-mirror' &&
        i.position[0] >= room.origin[0] &&
        i.position[0] <= room.origin[0] + room.width &&
        i.position[1] >= room.origin[1] &&
        i.position[1] <= room.origin[1] + room.depth,
    )
    expect(mirror, 'mirror present').toBeDefined()
    expect(mirror!.position[0] - room.origin[0]).toBeLessThan(0.1)
  })
})

/**
 * SETTLE-ORIGIN (v0.31.5.108) — the seed-point rescue widened past `'mounted'`
 * to every piece that belongs against a wall.
 *
 * Two earlier attempts were reverted (`.106`) because the rescue DELETED
 * furniture: flushing a piece to a wall dropped it onto something already there,
 * or into a door keep-out, and the passes that run afterwards removed it. The
 * accept criteria are therefore BOTH directions at once — stranded pieces must
 * fall AND the total item count must not. Baseline across the 19 templates is
 * 900 items; this lands 901 with stranded 20 -> 3.
 */
describe('SETTLE-ORIGIN: wall-hugging pieces are rescued without losing any', () => {
  const sweep = () => {
    const WALL_HUGGING = new Set([
      'toilet',
      'bathroom-sink',
      'nightstand',
      'bench',
      'cube-shelf',
      'shoe-cabinet',
    ])
    // A rug, coffee table, dining table or patio table at the room centre is
    // CORRECT. Moving those would be the bug, not the fix.
    const CENTRE_IS_RIGHT = new Set(['rug', 'coffee-table', 'dining-table-4', 'outdoor-table'])
    let total = 0
    let stranded = 0
    let centred = 0
    for (const tpl of PLAN_TEMPLATES) {
      const plan = tpl as FloorPlan
      const items = furnish(plan)
      total += items.length
      for (const level of planLevels(plan)) {
        for (const room of level.rooms) {
          const [cx, cz] = roomCentreOf(plan, room.id)
          for (const it of items) {
            if ((it.levelId ?? GROUND_LEVEL_ID) !== level.id) continue
            if (Math.abs(it.position[0] - cx) > 1e-6 || Math.abs(it.position[1] - cz) > 1e-6)
              continue
            if (WALL_HUGGING.has(it.defId)) stranded++
            if (CENTRE_IS_RIGHT.has(it.defId)) centred++
          }
        }
      }
    }
    return { total, stranded, centred }
  }

  it('loses NO furniture — the criterion two reverted attempts failed', () => {
    // 893 and 895 on the earlier tries. This is the assertion that caught them;
    // "stranded = 0" alone reported success while items were being deleted.
    //
    // 900 → 899 in v0.31.8.31, and ONLY because a content change legitimately
    // costs exactly one piece: giving `tpl-hdb-3room`'s Bedroom 2 its first
    // window (item (h) — it had none, and its "own" window sat in the kitchen)
    // leaves its 2.0 m south wall unable to take a wardrobe as well. An HDB
    // habitable room needs natural light, which outranks a wardrobe in a 5.6 m²
    // bedroom. Verified by per-def diff that this is the only loss, and three
    // alternatives were measured first: a narrower 1.0 m window, a deeper master
    // bath, and leaving the window out — none recovered the piece.
    //
    // 899 → 898 in v0.31.8.36, again a content trade with a per-def diff behind
    // it: `tpl-hdb-2room`'s front door moves out of the BATHROOM into the living
    // room, and its living/dining gets its first window (`h2-liv-win` had been
    // sitting at z=2.1, inside the master, which already had one). The door's
    // keep-out costs the living its TV console. Two other offsets were measured:
    // 3.5 loses the flat's dining TABLE entirely, 4.6 costs three items.
    //
    // Do NOT lower this for a PLACEMENT change. That was tried in v0.31.8.35 — a
    // last-resort dining-chair commit — and cost 24 items ignoring checks, or 2
    // relaxing only keep-outs. Both were reverted, which is what this guard is
    // for. It moves only for a content change whose per-def diff is recorded.
    expect(sweep().total).toBeGreaterThanOrEqual(898)
  }, 30_000)

  it('cuts wall-hugging pieces stranded on the seed point from 20 to a handful', () => {
    // Not zero, and deliberately not asserted as zero: three pieces sit in rooms
    // with no wall slot clear of both furniture and a door keep-out. They are
    // LEFT in place rather than stacked, because losing furniture is worse than
    // leaving it misplaced.
    expect(sweep().stranded).toBeLessThanOrEqual(3)
  }, 30_000)

  it('CONTROL: pieces that BELONG at the room centre are untouched', () => {
    // 17 until v0.31.5.111, when DINING-PHANTOM made `tpl-1bed`'s dining table
    // place at all — it previously failed `tryPlace` and was dropped, and now
    // settles at the centre of a room named "Dining", which is exactly the
    // placement this CONTROL calls correct. Verified by dumping every centred
    // piece: the added one is `tpl-1bed/ob-dining: dining-table-4`.
    //
    // 18 → 21 in v0.31.5.115: correcting `tpl-hdb-4room`'s front door and master
    // window let three pieces settle exactly on their room centre —
    // `h4-living: rug`, `h4-living: coffee-table`, `h4-master: rug`. All three
    // are in CENTRE_IS_RIGHT, and `stranded` stayed at 3, so nothing was
    // displaced. Dumped before this number was touched.
    //
    // 21 → 24 in v0.31.5.118, same shape as `.115`: correcting the exec's front
    // door and master window let `ex-living: rug`, `ex-living: coffee-table` and
    // `ex-master: rug` settle exactly on their room centres. All three are in
    // CENTRE_IS_RIGHT and `stranded` is still 3 (the same three pieces named in
    // `.108`), so nothing was displaced. Dumped before this number was touched.
    //
    // 24 → 26 in v0.31.8.29, same shape again: the jumbo re-author added the
    // `jb-corr` and `jb-lobby` doors on `jb-liv-w`, changing that room's door
    // keep-outs, and `jb-living: rug` + `jb-living: coffee-table` now settle on
    // its centre. Both are in CENTRE_IS_RIGHT; `stranded` is unchanged and the
    // item total stayed at 904 (≥ 900). Dumped before this number was touched.
    //
    // 26 → 29 in v0.31.8.30, the 3Gen re-author: `g3-living: rug`,
    // `g3-living: coffee-table` and `g3-master: rug` now settle on their room
    // centres. All three are in CENTRE_IS_RIGHT and `stranded` is unchanged.
    // The item total is 900 — exactly the floor the sibling assertion guards,
    // because this plan trades a bathroom in the east wing for one in the
    // corridor. Dumped before this number was touched.
    //
    // 29 → 27 in v0.31.8.33, and both losses are improvements: `c3-balcony:
    // outdoor-table` and `su-balcony: outdoor-table` were sitting at their room
    // centre because those balconies had NO DOOR, so the table had no wall to
    // relate to. With a door they place properly. Dumped before this was touched.
    //
    // 27 → 28 in v0.31.8.34, the second doors batch: `c2-living: rug` +
    // `c2-living: coffee-table` and `ob-living: rug` now settle on their room
    // centres (both living rooms gained a door on a wall they front), while
    // `c2-balcony: outdoor-table` and `ob-dining: dining-table-4` stop being
    // centred because those rooms finally have a door to relate to. All five are
    // in CENTRE_IS_RIGHT. Dumped before this number was touched.
    //
    // 28 → 30 in v0.31.8.36: `h2-living: rug` + `h2-living: coffee-table` settle
    // on their room centre now that the 2-room's front door opens into the living
    // instead of the bathroom. Both are in CENTRE_IS_RIGHT.
    //
    // 30 → 32 in v0.31.8.37: `h5-living: rug` + `h5-living: coffee-table` settle
    // on their room centre now the 5-room's front door fronts the living instead
    // of the master bedroom. Both are in CENTRE_IS_RIGHT.
    //
    // 32 → 34 in v0.31.8.39: `c3-living: rug` + `c3-living: coffee-table` settle
    // on their room centre now the condo 3-bed's living room has a door into the
    // bedroom column. Both are in CENTRE_IS_RIGHT.
    //
    // 34 -> 36 in v0.31.8.71 (WALL-SNAP-SHORTFALL + MOUNT-HEIGHT-CLASH). `centred` counts only
    // CENTRE_IS_RIGHT defIds — rugs and tables — so this can never be a stranded
    // appliance: two more settle on their room centre now the wall-snapped
    // pieces around them sit against the wall instead of 0.15 m proud.
    // 36 -> 34 in v0.31.9.8 (DOOR-SWING-LEVELS). Dumped before touching the
    // number, per this test's own convention: the two are
    // `tpl-hdb-maisonette/emu-fam: coffee-table` and `: rug`. Upper-storey doors
    // gained a swing keep-out that both pieces had been overlapping, so they no
    // longer settle EXACTLY on the room centre. They are not lost — the
    // maisonette's total went UP — and a rug laid through a door swing is not a
    // placement to defend.
    expect(sweep().centred).toBe(34)
  }, 30_000)
})
