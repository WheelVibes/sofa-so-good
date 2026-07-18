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
import { GROUND_LEVEL_ID, planLevels } from '../floorplan/levels'
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
    it(`${template.name}: no window-blocking or door-blocking furniture`, () => {
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
