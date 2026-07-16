import { Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { buildEditedObject } from '../glbEdit/buildObject'
import { evaluateAllGroups } from '../glbEdit/csgEval'
import { type AssetEditSpec, createEmptySpec, type ShapePart } from '../glbEdit/editSpec'
import {
  crossBucketCombineName,
  droppedRuleDescriptions,
  type GroupAssignment,
  isPlanExportable,
  mapRulesToConstraints,
  planConfigurableExport,
  pruneAssignmentRules,
  reconstructAssignments,
} from './designerExport'
import { type ConfigurableProduct, clampConfig, type SlotOption } from './model'

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

/** A design with a Top slot (glass/oak) + a Legs slot (steel/wood). */
function twoSlotSpec(): AssetEditSpec {
  return {
    sourceScale: 1,
    meshOverrides: {},
    parts: [
      part('gl', 'box', [0, 0.7, 0], [1.2, 0.03, 0.8]),
      part('ok', 'box', [0, 0.7, 0], [1.2, 0.03, 0.8]),
      part('st', 'box', [-0.5, 0.35, 0], [0.05, 0.7, 0.05]),
      part('wd', 'box', [-0.5, 0.35, 0], [0.05, 0.7, 0.05]),
    ],
    partGroups: [
      { id: 'g-glass', name: 'Glass', partIds: ['gl'] },
      { id: 'g-oak', name: 'Oak', partIds: ['ok'] },
      { id: 'g-steel', name: 'Steel', partIds: ['st'] },
      { id: 'g-wood', name: 'Wood', partIds: ['wd'] },
    ],
  }
}

const TWO_SLOT_ASSIGN: Record<string, GroupAssignment> = {
  'g-glass': {
    slot: 'Top',
    label: 'Glass',
    price: 0,
    rules: [{ kind: 'requires', target: 'g-steel' }],
  },
  'g-oak': { slot: 'Top', label: 'Oak', price: 0 },
  'g-steel': { slot: 'Legs', label: 'Steel', price: 0 },
  'g-wood': { slot: 'Legs', label: 'Wood', price: 0 },
}

describe('slot-constraint authoring mapping (Stage 7d)', () => {
  it('maps an authored requires rule to a cross-slot SlotConstraint on the plan', () => {
    const plan = planConfigurableExport(twoSlotSpec(), TWO_SLOT_ASSIGN)
    expect(plan.constraints).toEqual([
      {
        kind: 'requires',
        ifSlot: 'Top',
        ifOption: 'g-glass',
        thenSlot: 'Legs',
        thenOption: 'g-steel',
      },
    ])
  })

  it('maps an excludes rule to an excludes SlotConstraint', () => {
    const slots = planConfigurableExport(twoSlotSpec(), TWO_SLOT_ASSIGN).slots
    const constraints = mapRulesToConstraints(
      {
        ...TWO_SLOT_ASSIGN,
        'g-glass': {
          slot: 'Top',
          label: 'Glass',
          price: 0,
          rules: [{ kind: 'excludes', target: 'g-wood' }],
        },
      },
      slots,
    )
    expect(constraints).toEqual([
      {
        kind: 'excludes',
        slot: 'Top',
        option: 'g-glass',
        conflictsWith: { slot: 'Legs', option: 'g-wood' },
      },
    ])
  })

  it('drops a same-slot or non-exposed rule target (only cross-slot options)', () => {
    const slots = planConfigurableExport(twoSlotSpec(), TWO_SLOT_ASSIGN).slots
    const constraints = mapRulesToConstraints(
      {
        ...TWO_SLOT_ASSIGN,
        // Target its own slot-mate (Oak) + a base group (not in any slot) → both dropped.
        'g-glass': {
          slot: 'Top',
          label: 'Glass',
          price: 0,
          rules: [
            { kind: 'requires', target: 'g-oak' },
            { kind: 'requires', target: 'g-missing' },
          ],
        },
      },
      slots,
    )
    expect(constraints).toEqual([])
  })

  it('reports dropped rules on the plan (dangling + same-slot targets) — finding 3', () => {
    const plan = planConfigurableExport(twoSlotSpec(), {
      ...TWO_SLOT_ASSIGN,
      'g-glass': {
        slot: 'Top',
        label: 'Glass',
        price: 0,
        rules: [
          { kind: 'requires', target: 'g-steel' }, // valid cross-slot → mapped
          { kind: 'requires', target: 'g-oak' }, // same slot → dropped
          { kind: 'excludes', target: 'g-missing' }, // no longer an option → dropped
        ],
      },
    })
    expect(plan.constraints).toHaveLength(1) // only the valid cross-slot rule survives
    expect(plan.droppedRules).toHaveLength(2)
    expect(plan.droppedRules.some((m) => /its own slot/i.test(m))).toBe(true)
    expect(plan.droppedRules.some((m) => /no longer available/i.test(m))).toBe(true)
    // A clean plan drops nothing.
    expect(planConfigurableExport(twoSlotSpec(), TWO_SLOT_ASSIGN).droppedRules).toEqual([])
  })

  it('a mapped requires constraint flips the dependent slot via clampConfig', () => {
    const plan = planConfigurableExport(twoSlotSpec(), TWO_SLOT_ASSIGN)
    const opt = (id: string): SlotOption => ({
      id,
      label: id,
      price: 0,
      footprint: { w: 1, d: 1, h: 1 },
    })
    const product: ConfigurableProduct = {
      id: 'p',
      label: 'P',
      category: 'others',
      base: { footprint: { w: 1, d: 1, h: 1 }, price: 0 },
      slots: [
        {
          id: 'Top',
          label: 'Top',
          anchor: { position: [0, 0, 0] },
          defaultOptionId: 'g-oak',
          options: [opt('g-glass'), opt('g-oak')],
        },
        {
          id: 'Legs',
          label: 'Legs',
          anchor: { position: [0, 0, 0] },
          defaultOptionId: 'g-wood',
          options: [opt('g-steel'), opt('g-wood')],
        },
      ],
      constraints: plan.constraints,
    }
    // Picking the glass top while wood legs are selected auto-resolves Legs → steel.
    const s = clampConfig(product, { selections: { Top: 'g-glass', Legs: 'g-wood' } })
    expect(s.selections.Legs).toBe('g-steel')
    // Oak top imposes no rule → wood legs stay.
    const s2 = clampConfig(product, { selections: { Top: 'g-oak', Legs: 'g-wood' } })
    expect(s2.selections.Legs).toBe('g-wood')
  })

  it('reconstructAssignments round-trips slot / label / price / rules from a product', () => {
    const opt = (id: string, label: string, price: number): SlotOption => ({
      id,
      label,
      price,
      footprint: { w: 1, d: 1, h: 1 },
    })
    const product: ConfigurableProduct = {
      id: 'p',
      label: 'P',
      category: 'others',
      base: { footprint: { w: 1, d: 1, h: 1 }, price: 0 },
      slots: [
        {
          id: 'Top',
          label: 'Top',
          anchor: { position: [0, 0, 0] },
          defaultOptionId: 'g-glass',
          options: [opt('g-glass', 'Glass', 120), opt('g-oak', 'Oak', 90)],
        },
        {
          id: 'Legs',
          label: 'Legs',
          anchor: { position: [0, 0, 0] },
          defaultOptionId: 'g-steel',
          options: [opt('g-steel', 'Steel', 60), opt('g-wood', 'Wood', 40)],
        },
      ],
      constraints: [
        {
          kind: 'requires',
          ifSlot: 'Top',
          ifOption: 'g-glass',
          thenSlot: 'Legs',
          thenOption: 'g-steel',
        },
      ],
    }
    const known = new Set(['g-glass', 'g-oak', 'g-steel', 'g-wood'])
    const a = reconstructAssignments(product, known)
    expect(a['g-glass']).toEqual({
      slot: 'Top',
      label: 'Glass',
      price: 120,
      rules: [{ kind: 'requires', target: 'g-steel' }],
    })
    expect(a['g-oak']).toEqual({ slot: 'Top', label: 'Oak', price: 90 })
  })

  it('reconstructAssignments prunes a rule whose target group is gone', () => {
    const opt = (id: string): SlotOption => ({
      id,
      label: id,
      price: 0,
      footprint: { w: 1, d: 1, h: 1 },
    })
    const product: ConfigurableProduct = {
      id: 'p',
      label: 'P',
      category: 'others',
      base: { footprint: { w: 1, d: 1, h: 1 }, price: 0 },
      slots: [
        {
          id: 'Top',
          label: 'Top',
          anchor: { position: [0, 0, 0] },
          defaultOptionId: 'g-glass',
          options: [opt('g-glass')],
        },
      ],
      constraints: [
        {
          kind: 'requires',
          ifSlot: 'Top',
          ifOption: 'g-glass',
          thenSlot: 'Legs',
          thenOption: 'g-steel',
        },
      ],
    }
    // g-steel is no longer a known group → the rule is dropped from the seed.
    const a = reconstructAssignments(product, new Set(['g-glass']))
    expect(a['g-glass']).toEqual({ slot: 'Top', label: 'g-glass', price: 0 })
  })
})

describe('droppedRuleDescriptions (finding 3)', () => {
  it('describes a dangling target and a same-slot target', () => {
    const slots = planConfigurableExport(twoSlotSpec(), TWO_SLOT_ASSIGN).slots
    const dropped = droppedRuleDescriptions(
      {
        ...TWO_SLOT_ASSIGN,
        'g-glass': {
          slot: 'Top',
          label: 'Glass',
          price: 0,
          rules: [
            { kind: 'requires', target: 'g-oak' }, // same slot
            { kind: 'excludes', target: 'g-missing' }, // gone
          ],
        },
      },
      slots,
    )
    expect(dropped).toHaveLength(2)
    expect(dropped.some((m) => /"Glass" requires .*its own slot/i.test(m))).toBe(true)
    expect(dropped.some((m) => /"Glass" excludes .*no longer available/i.test(m))).toBe(true)
  })

  it('is empty when every rule maps cleanly', () => {
    const slots = planConfigurableExport(twoSlotSpec(), TWO_SLOT_ASSIGN).slots
    expect(droppedRuleDescriptions(TWO_SLOT_ASSIGN, slots)).toEqual([])
  })
})

describe('pruneAssignmentRules (finding 3)', () => {
  it('drops an assignment whose group is gone and reports it', () => {
    const { assignments, removed } = pruneAssignmentRules(
      TWO_SLOT_ASSIGN,
      new Set(['g-glass', 'g-steel', 'g-wood']), // g-oak was ungrouped
    )
    expect(assignments['g-oak']).toBeUndefined()
    expect(assignments['g-glass']).toBeDefined()
    expect(removed).toHaveLength(1)
    expect(removed[0]).toMatch(/Oak.*no longer exists/i)
  })

  it('strips a rule whose target group is gone but keeps the assignment', () => {
    const { assignments, removed } = pruneAssignmentRules(
      TWO_SLOT_ASSIGN,
      new Set(['g-glass', 'g-oak', 'g-wood']), // g-steel (g-glass's requires target) gone
    )
    // g-glass survives but its rule (→ g-steel) is stripped.
    expect(assignments['g-glass']).toEqual({ slot: 'Top', label: 'Glass', price: 0 })
    expect(assignments['g-glass'].rules).toBeUndefined()
    expect(removed.some((m) => /rule on "Glass".*was dropped/i.test(m))).toBe(true)
  })

  it('is a clean pass-through when every group + target still exists', () => {
    const known = new Set(['g-glass', 'g-oak', 'g-steel', 'g-wood'])
    const { assignments, removed } = pruneAssignmentRules(TWO_SLOT_ASSIGN, known)
    expect(removed).toEqual([])
    expect(assignments['g-glass'].rules).toEqual([{ kind: 'requires', target: 'g-steel' }])
  })
})
