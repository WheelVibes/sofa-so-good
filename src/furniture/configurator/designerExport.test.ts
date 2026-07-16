import { Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { buildEditedObject } from '../glbEdit/buildObject'
import { evaluateAllGroups } from '../glbEdit/csgEval'
import { type AssetEditSpec, createEmptySpec, type ShapePart } from '../glbEdit/editSpec'
import {
  crossBucketCombineName,
  type GroupAssignment,
  isPlanExportable,
  planConfigurableExport,
} from './designerExport'

/** Total vertex count across every mesh in a built object. */
function vertexCount(obj: import('three').Object3D): number {
  let n = 0
  obj.traverse((o) => {
    if (o instanceof Mesh) n += o.geometry.getAttribute('position')?.count ?? 0
  })
  return n
}

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

describe('planConfigurableExport — CSG in options/base (finding 2)', () => {
  /** A slab + a hole box in one PartGroup, with a SUBTRACT combine carving the
   *  hole out of the slab. The group is a slot option. */
  function carvedOptionSpec(): AssetEditSpec {
    return {
      sourceScale: 1,
      meshOverrides: {},
      parts: [
        part('slab', 'box', [0, 0.5, 0], [1, 1, 1]),
        { ...part('hole', 'box', [0, 0.5, 0], [0.4, 2, 0.4]), role: 'hole' },
      ],
      partGroups: [{ id: 'g-opt', name: 'Carved', partIds: ['slab', 'hole'] }],
      combineGroups: [{ id: 'c1', name: 'Combine 1', partIds: ['slab', 'hole'], op: 'subtract' }],
    }
  }

  it('carries a self-contained combine into its option and bakes carved geometry', async () => {
    const plan = planConfigurableExport(carvedOptionSpec(), {
      'g-opt': { slot: 'Shape', label: 'Carved', price: 0 },
    })
    const opt = plan.slots[0].options[0]
    expect(opt.combineGroups.map((c) => c.id)).toEqual(['c1'])

    const subSpec: AssetEditSpec = {
      ...createEmptySpec(),
      parts: opt.parts,
      combineGroups: opt.combineGroups,
    }
    const results = await evaluateAllGroups(subSpec)
    expect(results.size).toBe(1)
    const carved = buildEditedObject(null, subSpec, results)
    const raw = buildEditedObject(null, { ...createEmptySpec(), parts: opt.parts })
    // The carved bake differs from the raw two-box operands (a real subtract).
    expect(vertexCount(carved)).toBeGreaterThan(0)
    expect(vertexCount(carved)).not.toBe(vertexCount(raw))
  })

  it('flags a combine straddling a slot boundary so export can block', () => {
    const spec = carvedOptionSpec()
    // Move the hole out of the group so the combine spans slot ⨯ base.
    spec.partGroups = [{ id: 'g-opt', name: 'Carved', partIds: ['slab'] }]
    expect(
      crossBucketCombineName(spec, { 'g-opt': { slot: 'Shape', label: 'Carved', price: 0 } }),
    ).toBe('Combine 1')
  })

  it('a self-contained combine does not flag as cross-bucket', () => {
    expect(
      crossBucketCombineName(carvedOptionSpec(), {
        'g-opt': { slot: 'Shape', label: 'Carved', price: 0 },
      }),
    ).toBeNull()
  })
})

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

  it('base footprint is rotation- + kind-aware (a lathe leg laid on its side)', () => {
    // A turned lathe leg (size [diameter, height, _] = [0.12, 0.5, 0.12]) rotated
    // 90° about Z so its 0.5 m length now runs along X. A raw-`size` footprint
    // would report w ≈ 0.12 (the diameter); the rotation-aware `partWorldExtent`
    // reports the swung 0.5 m length instead.
    const spec: AssetEditSpec = {
      sourceScale: 1,
      meshOverrides: {},
      parts: [
        {
          id: 'leg',
          kind: 'lathe',
          position: [0, 0.25, 0],
          size: [0.12, 0.5, 0.12],
          rotation: [0, 0, 90],
          color: '#999999',
        },
      ],
    }
    const plan = planConfigurableExport(spec, {})
    // w = 2·(|0| + 0.5/2) = 1.0? No — symmetric span = 2·(posX + halfExtent) =
    // 2·(0 + 0.25) = 0.5 for the swung length; depth stays the 0.12 diameter.
    expect(plan.baseFootprint.w).toBeCloseTo(0.5, 5)
    expect(plan.baseFootprint.d).toBeCloseTo(0.12, 5)
    expect(plan.baseFootprint.h).toBeCloseTo(0.12, 5)
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
