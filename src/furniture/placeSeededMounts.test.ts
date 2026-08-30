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
