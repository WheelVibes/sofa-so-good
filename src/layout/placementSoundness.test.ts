/**
 * RM3 property test: furnishing EVERY built-in template with the default
 * preset must produce a sound layout — no tall item parked in front of a
 * window (or ANY floor item in front of a full-height/balcony-slider
 * opening), and nothing sitting in a door's path. This pins the arranger's
 * window/door keep-outs against the real template geometry, not just synthetic
 * fixtures, so a regression in either the templates or the placement rules
 * fails loudly.
 */
import { describe, expect, it } from 'vitest'
import { findWallClipsByLevel } from '../collision/levelWallClips'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { allPlanRooms, GROUND_LEVEL_ID, planLevels } from '../floorplan/levels'
import { planCollisionWalls } from '../floorplan/planGeometry'
import { PLAN_TEMPLATES } from '../floorplan/templates'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { furnishPlanItems } from '../furniture/furnishPlan'
import { LAYOUT_PRESETS } from '../furniture/layoutPresets'
import { blockedDoorItems, type Rect, windowFrontRects } from './clearance'

const moveIn = LAYOUT_PRESETS.find((p) => p.id === 'move-in') ?? LAYOUT_PRESETS[0]

function itemAabb(pos: [number, number], rotation: number, w: number, d: number): Rect {
  const c = Math.abs(Math.cos(rotation))
  const s = Math.abs(Math.sin(rotation))
  const hx = (c * w + s * d) / 2
  const hz = (s * w + c * d) / 2
  return { x0: pos[0] - hx, z0: pos[1] - hz, x1: pos[0] + hx, z1: pos[1] + hz }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0
}

describe('placement soundness across every built-in template (RM3)', () => {
  for (const template of PLAN_TEMPLATES) {
    // 15 s: furnishing the biggest multi-storey templates (Executive
    // Maisonette) brushes the default 5 s under full-suite parallel load —
    // observed 5.6 s; passes in ~2 s isolated. Headroom, not a slow test.
    it(`${template.name}: no window-blocking or door-blocking furniture`, {
      timeout: 15000,
    }, () => {
      const items = furnishPlanItems(template, moveIn, BUILTIN_CATALOG, {})
      expect(items.length).toBeGreaterThan(0)

      // Door paths stay clear on every storey.
      for (const level of planLevels(template)) {
        const levelItems = items.filter((it) => (it.levelId ?? GROUND_LEVEL_ID) === level.id)
        const plan = {
          ...template,
          walls: level.walls,
          rooms: level.rooms,
          openings: level.openings,
        }
        expect(
          blockedDoorItems(levelItems, BUILTIN_CATALOG, plan),
          `${template.name} doors`,
        ).toEqual([])

        // Window fronts: reject items taller than the sill (or any floor item
        // when the sill is near zero — a balcony slider / full-height window).
        const keepOut = windowFrontRects(plan)
        const offenders = levelItems.filter((it) => {
          const def = BUILTIN_CATALOG[it.defId]
          if (!def || def.mounted || def.noClip) return false
          let w = def.defaultFootprint.w
          let d = def.defaultFootprint.d
          if (def.kind === 'parametric') {
            const map = def.footprintParams ?? {}
            const wv = it.props[map.w ?? 'width']
            const dv = it.props[map.d ?? 'depth']
            if (typeof wv === 'number') w = wv
            if (typeof dv === 'number') d = dv
          }
          const box = itemAabb(it.position, it.rotation, w, d)
          return keepOut.some(
            (k) => (k.sill <= 0.05 || def.defaultFootprint.h > k.sill) && overlaps(box, k),
          )
        })
        expect(
          offenders.map((o) => o.defId),
          `${template.name} windows (level ${level.id ?? 'ground'})`,
        ).toEqual([])
      }
    })
  }
})

/**
 * Auto-furnish (`furnishPlanItems`) must never leave a piece embedded in a wall
 * — the in-wall analog of the door-blocking guard above. A shallow "AC ledge"
 * balcony that couldn't hold the outdoor table, or a too-narrow room seeded a
 * sofa/counter, used to fall back to a wall-clipping position that the Checks
 * overlay flagged "inside a wall"; `dropWallClippers` now drops those, so every
 * built-in plan furnishes wall-clip-clean. Pins the class like blocked doors.
 */
describe('furnishing leaves ZERO in-wall items (dropWallClippers)', () => {
  const plans = [buildDefaultPlan(), ...PLAN_TEMPLATES]
  for (const plan of plans) {
    // Same 15 s headroom as the template loop above (full-suite load flake).
    it(`${plan.name}: no furniture embedded in a wall`, { timeout: 15000 }, () => {
      const items = furnishPlanItems(plan, moveIn, BUILTIN_CATALOG, {})
      expect(items.length).toBeGreaterThan(0)
      const groundWalls = planCollisionWalls(plan, {})
      const clips = findWallClipsByLevel(items, BUILTIN_CATALOG, plan, {}, groundWalls)
      const named = clips.map((id) => `${items.find((it) => it.id === id)?.defId}(${id})`)
      expect(named, `${plan.name}: ${named.join(', ')}`).toEqual([])
    })
  }
})

/**
 * RM4 template fixes: two bedrooms that used to be too shallow to legally hold
 * their bed (the bed was silently DROPPED by `dropDoorBlockers`/`dropOverlaps`
 * after arranging) were reshaped — condo 3-bed `c3-master` (now 3.7 × 2.7 m,
 * fits a queen clear of the ensuite door swing) and HDB 3Gen `g3-bed3` (now
 * 3.0 × 2.4 m). Pin that furnishing now actually PLACES a bed in each, so a
 * future geometry/rule regression that re-drops it fails loudly.
 */
describe('RM4 reshaped bedrooms furnish with a bed', () => {
  const bedInRoom = (templateId: string, roomId: string) => {
    const tpl = PLAN_TEMPLATES.find((t) => t.id === templateId)!
    const room = allPlanRooms(tpl).find((r) => r.id === roomId)!
    const [x0, z0] = room.origin
    const x1 = x0 + room.width
    const z1 = z0 + room.depth
    const items = furnishPlanItems(tpl, moveIn, BUILTIN_CATALOG, {})
    return items.filter(
      (it) =>
        it.defId.startsWith('bed-') &&
        it.position[0] >= x0 - 0.3 &&
        it.position[0] <= x1 + 0.3 &&
        it.position[1] >= z0 - 0.3 &&
        it.position[1] <= z1 + 0.3,
    )
  }

  it('condo 3-bedroom master holds a queen bed', () => {
    const beds = bedInRoom('tpl-condo-3bed', 'c3-master')
    expect(beds.map((b) => b.defId)).toContain('bed-queen')
  })

  it('HDB 3Gen bedroom 3 holds a bed', () => {
    const beds = bedInRoom('tpl-hdb-3gen', 'g3-bed3')
    expect(beds.length).toBeGreaterThan(0)
  })
})
