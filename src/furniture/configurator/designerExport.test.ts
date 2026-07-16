import { describe, expect, it } from 'vitest'
import type { AssetEditSpec, ShapePart } from '../glbEdit/editSpec'
import { type GroupAssignment, isPlanExportable, planConfigurableExport } from './designerExport'

function part(
  id: string,
  kind: ShapePart['kind'],
  position: [number, number, number],
  size: [number, number, number],
): ShapePart {
  return { id, kind, position, size, color: '#999999' }
}

/** A table: box top (ungrouped) + two variant leg groups (round + square). */
function tableSpec(): AssetEditSpec {
  return {
    sourceScale: 1,
    meshOverrides: {},
    parts: [
      part('top', 'box', [0, 0.74, 0], [1.2, 0.03, 0.8]),
      // Round legs (cylinders — NOT representable as configurator box parts).
      part('rl1', 'cylinder', [-0.5, 0.37, -0.3], [0.06, 0.74, 0.06]),
      part('rl2', 'cylinder', [0.5, 0.37, -0.3], [0.06, 0.74, 0.06]),
      // Square legs.
      part('sl1', 'box', [-0.5, 0.37, -0.3], [0.06, 0.74, 0.06]),
      part('sl2', 'box', [0.5, 0.37, -0.3], [0.06, 0.74, 0.06]),
    ],
    partGroups: [
      { id: 'g-round', name: 'Round legs', partIds: ['rl1', 'rl2'] },
      { id: 'g-square', name: 'Square legs', partIds: ['sl1', 'sl2'] },
    ],
  }
}

const assign = (over: Record<string, GroupAssignment>) => over

describe('planConfigurableExport (Stage 3d)', () => {
  it('folds ungrouped parts + Base-assigned groups into the base', () => {
    const plan = planConfigurableExport(
      tableSpec(),
      assign({
        'g-round': { slot: 'Legs', label: 'Round', price: 40 },
        'g-square': { slot: 'Legs', label: 'Square', price: 60 },
      }),
    )
    // The ungrouped tabletop is the base.
    expect(plan.baseParts.map((p) => p.id)).toEqual(['top'])
    expect(plan.baseFootprint.w).toBeGreaterThan(1) // covers the 1.2 m top
  })

  it('groups sharing a slot key become that slot options (first = default)', () => {
    const plan = planConfigurableExport(
      tableSpec(),
      assign({
        'g-round': { slot: 'Legs', label: 'Round', price: 40 },
        'g-square': { slot: 'Legs', label: 'Square', price: 60 },
      }),
    )
    expect(plan.slots).toHaveLength(1)
    const slot = plan.slots[0]
    expect(slot.id).toBe('Legs')
    expect(slot.options.map((o) => o.id)).toEqual(['g-round', 'g-square'])
    expect(slot.defaultOptionId).toBe('g-round')
    expect(slot.options.map((o) => o.label)).toEqual(['Round', 'Square'])
    expect(slot.options.map((o) => o.price)).toEqual([40, 60])
  })

  it('preserves non-box shape fidelity in option parts (cylinder legs stay cylinders)', () => {
    const plan = planConfigurableExport(
      tableSpec(),
      assign({ 'g-round': { slot: 'Legs', label: 'Round', price: 0 } }),
    )
    const round = plan.slots[0].options[0]
    expect(round.parts.every((p) => p.kind === 'cylinder')).toBe(true)
    expect(round.parts).toHaveLength(2)
  })

  it('a group assigned slot null folds into the base', () => {
    const plan = planConfigurableExport(
      tableSpec(),
      assign({
        'g-round': { slot: null, label: 'Round', price: 0 },
        'g-square': { slot: 'Legs', label: 'Square', price: 60 },
      }),
    )
    // Round legs (null) join the base; only Square remains a slot option.
    expect(plan.baseParts.map((p) => p.id).sort()).toEqual(['rl1', 'rl2', 'top'])
    expect(plan.slots).toHaveLength(1)
    expect(plan.slots[0].options.map((o) => o.id)).toEqual(['g-square'])
  })

  it('option footprints are symmetric world spans (cover the actual geometry)', () => {
    const plan = planConfigurableExport(
      tableSpec(),
      assign({ 'g-round': { slot: 'Legs', label: 'Round', price: 0 } }),
    )
    const fp = plan.slots[0].options[0].footprint
    // Legs at ±0.5 x, radius 0.03 → symmetric span ≥ 2*(0.5+0.03) = 1.06.
    expect(fp.w).toBeCloseTo(1.06, 5)
    expect(fp.h).toBeCloseTo(0.74, 5)
  })

  it('isPlanExportable requires ≥1 slot with options', () => {
    const noSlots = planConfigurableExport(
      tableSpec(),
      assign({ 'g-round': { slot: null, label: 'Round', price: 0 } }),
    )
    expect(isPlanExportable(noSlots)).toBe(false)
    const withSlot = planConfigurableExport(
      tableSpec(),
      assign({ 'g-round': { slot: 'Legs', label: 'Round', price: 0 } }),
    )
    expect(isPlanExportable(withSlot)).toBe(true)
  })
})
