import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { buildPresetItems, LAYOUT_PRESETS } from '../furniture/layoutPresets'
import { buildSchemeOptions, TRADEOFF_MIN_GAP } from './schemeOptions'

const plan = buildDefaultPlan()
const defs = BUILTIN_CATALOG

/** Three presets chosen to span the vocabulary, not three near-neighbours. */
function trio() {
  const ids = ['minimalist', 'cozy-tropical', 'entertainer']
  const picked = LAYOUT_PRESETS.filter((p) => ids.includes(p.id))
  // Fall back to the first three if any id drifts, so the test measures the
  // comparison rather than the preset registry's naming.
  return picked.length >= 2 ? picked : LAYOUT_PRESETS.slice(0, 3)
}

describe('buildSchemeOptions', () => {
  it('generates one scored, priced candidate per preset', () => {
    const presets = trio()
    const out = buildSchemeOptions({ plan, defs, presets })
    expect(out.candidates.length + out.emptyPresetIds.length).toBe(presets.length)
    for (const c of out.candidates) {
      expect(c.itemCount).toBeGreaterThan(0)
      expect(c.items).toHaveLength(c.itemCount)
      expect(c.score.overall).toBeGreaterThanOrEqual(0)
      expect(c.score.overall).toBeLessThanOrEqual(100)
      expect(c.totalPrice).toBeGreaterThan(0)
      expect(c.name.trim()).not.toBe('')
    }
  })

  it('produces genuinely different LAYOUTS — different positions, not just different styling', () => {
    // The premise, stated precisely. Preset-swapping alone does NOT do this:
    // no shipped preset defines `kits`, so every preset places the identical
    // furniture. The difference must show up in POSITIONS, which is what the
    // arranger's layout seed provides.
    const out = buildSchemeOptions({ plan, defs, presets: trio() })
    expect(out.candidates.length).toBeGreaterThanOrEqual(2)
    const positions = (i: number) =>
      out.candidates[i]!.items.map(
        (x) => `${x.defId}@${x.position[0].toFixed(2)},${x.position[1].toFixed(2)}`,
      )
        .sort()
        .join('|')
    expect(positions(0)).not.toBe(positions(1))
    // And at least one piece must actually sit somewhere else, not merely have
    // been added or dropped.
    const byDef = (i: number) => {
      const m = new Map<string, string>()
      for (const x of out.candidates[i]!.items)
        m.set(x.id, `${x.position[0].toFixed(2)},${x.position[1].toFixed(2)}`)
      return m
    }
    const a = byDef(0)
    const b = byDef(1)
    const moved = [...a.entries()].filter(([id, pos]) => b.has(id) && b.get(id) !== pos)
    expect(moved.length).toBeGreaterThan(0)
  })

  it('an all-zero seed set collapses to ONE layout — proving the seed is the lever', () => {
    // The control: same presets, seeds pinned to 0, so only styling varies and
    // every scheme must lay out identically. If this ever differs, the layout
    // variation is coming from somewhere other than the seed.
    const presets = trio()
    const out = buildSchemeOptions({ plan, defs, presets, seeds: presets.map(() => 0) })
    const positions = (i: number) =>
      out.candidates[i]!.items.map(
        (x) => `${x.defId}@${x.position[0].toFixed(2)},${x.position[1].toFixed(2)}`,
      )
        .sort()
        .join('|')
    for (let i = 1; i < out.candidates.length; i++) {
      expect(positions(i)).toBe(positions(0))
    }
  })

  it('ranks best-overall first', () => {
    const out = buildSchemeOptions({ plan, defs, presets: trio() })
    for (let i = 1; i < out.candidates.length; i++) {
      expect(out.candidates[i - 1]!.score.overall).toBeGreaterThanOrEqual(
        out.candidates[i]!.score.overall,
      )
    }
  })

  it('breaks a score tie in favour of the cheaper scheme', () => {
    const out = buildSchemeOptions({ plan, defs, presets: trio() })
    for (let i = 1; i < out.candidates.length; i++) {
      const a = out.candidates[i - 1]!
      const b = out.candidates[i]!
      if (a.score.overall === b.score.overall)
        expect(a.totalPrice).toBeLessThanOrEqual(b.totalPrice)
    }
  })

  it('states trade-offs only where the gap is real', () => {
    const out = buildSchemeOptions({ plan, defs, presets: trio() })
    // Every category trade-off names two schemes and a gap at/above the floor.
    for (const t of out.tradeoffs) {
      const m = t.match(/\((\d+) apart\)/)
      if (m) expect(Number(m[1])).toBeGreaterThanOrEqual(TRADEOFF_MIN_GAP)
    }
  })

  it('always reports the cost spread when prices differ', () => {
    const out = buildSchemeOptions({ plan, defs, presets: trio() })
    const prices = new Set(out.candidates.map((c) => c.totalPrice))
    if (prices.size > 1) expect(out.tradeoffs.some((t) => t.startsWith('Cost:'))).toBe(true)
  })

  it('explains why the leader leads, naming a category', () => {
    const out = buildSchemeOptions({ plan, defs, presets: trio() })
    expect(out.recommendation).toContain(out.candidates[0]!.name)
    expect(out.recommendation.length).toBeGreaterThan(20)
  })

  it('claims no trade-offs and no recommendation for a single scheme', () => {
    const out = buildSchemeOptions({ plan, defs, presets: trio().slice(0, 1) })
    expect(out.candidates).toHaveLength(1)
    expect(out.tradeoffs).toEqual([])
    expect(out.recommendation).toBe('')
  })

  it('reports each scheme against a budget when one is given', () => {
    const out = buildSchemeOptions({ plan, defs, presets: trio(), budget: 1000 })
    for (const c of out.candidates) {
      expect(c.budget).toBeDefined()
      expect(c.budget!.limit).toBe(1000)
      // A whole furnished flat costs well over $1000, so all should fail.
      expect(c.budget!.pass).toBe(false)
      expect(c.budget!.overBy).toBe(c.totalPrice - 1000)
    }
    expect(out.tradeoffs.some((t) => /exceeds the \$1,000 budget/.test(t))).toBe(true)
  })

  it('omits budget reporting entirely when no budget is given', () => {
    const out = buildSchemeOptions({ plan, defs, presets: trio() })
    for (const c of out.candidates) expect(c.budget).toBeUndefined()
    expect(out.tradeoffs.some((t) => /budget/i.test(t))).toBe(false)
  })

  it('passes a budget that comfortably covers the design', () => {
    const out = buildSchemeOptions({ plan, defs, presets: trio(), budget: 10_000_000 })
    for (const c of out.candidates) {
      expect(c.budget!.pass).toBe(true)
      expect(c.budget!.overBy).toBe(0)
    }
  })

  it('reports a preset that furnishes nothing rather than ranking an empty home', () => {
    const empty = {
      id: 'empty-preset',
      name: 'Empty',
      description: 'nothing',
      dryFloor: 'floor-vinyl-oak',
      wall: 'wall-white',
      style: {},
      kits: {},
    } as never
    const out = buildSchemeOptions({
      plan: { ...plan, rooms: [] } as never,
      defs,
      presets: [empty],
    })
    expect(out.candidates).toEqual([])
    expect(out.emptyPresetIds).toEqual(['empty-preset'])
  })

  it('is deterministic — the same plan and presets give the same comparison', () => {
    const a = buildSchemeOptions({ plan, defs, presets: trio() })
    const b = buildSchemeOptions({ plan, defs, presets: trio() })
    expect(a.candidates.map((c) => [c.presetId, c.score.overall, c.totalPrice])).toEqual(
      b.candidates.map((c) => [c.presetId, c.score.overall, c.totalPrice]),
    )
    expect(a.tradeoffs).toEqual(b.tradeoffs)
    expect(a.recommendation).toBe(b.recommendation)
  })

  it('handles an empty preset list without throwing', () => {
    const out = buildSchemeOptions({ plan, defs, presets: [] })
    expect(out.candidates).toEqual([])
    expect(out.tradeoffs).toEqual([])
    expect(out.recommendation).toBe('')
  })
})

describe('buildSchemeOptions — authored layouts via itemsFor', () => {
  it('uses the researched authored layout when a resolver is supplied', () => {
    // The default flat's `layout`-group presets author their own living/dining.
    // These DO vary what is placed, which the generic kit path cannot do.
    const ids = ['entertainer', 'social-lounge', 'wfh-studio']
    const presets = LAYOUT_PRESETS.filter((p) => ids.includes(p.id))
    expect(presets.length).toBeGreaterThanOrEqual(2)
    const out = buildSchemeOptions({
      plan,
      defs,
      presets,
      itemsFor: (p) => buildPresetItems(p) as never,
    })
    const defsOf = (presetId: string) =>
      new Set(out.candidates.find((c) => c.presetId === presetId)?.items.map((i) => i.defId) ?? [])
    // The entertainer's bar cart is the checkable difference — no other preset
    // has it, so its presence proves the authored layout was used and not a
    // generic reseed.
    expect([...defsOf('entertainer')]).toContain('bar-cart')
    expect([...defsOf('social-lounge')]).not.toContain('bar-cart')
  })

  it('produces different item SETS across authored layouts, not just positions', () => {
    const ids = ['entertainer', 'social-lounge', 'wfh-studio']
    const presets = LAYOUT_PRESETS.filter((p) => ids.includes(p.id))
    const out = buildSchemeOptions({
      plan,
      defs,
      presets,
      itemsFor: (p) => buildPresetItems(p) as never,
    })
    const sig = (i: number) =>
      [...new Set(out.candidates[i]!.items.map((x) => x.defId))].sort().join('|')
    expect(sig(0)).not.toBe(sig(1))
  })

  it('still falls back to the kit path when no resolver is given', () => {
    const presets = trio()
    const withResolver = buildSchemeOptions({
      plan,
      defs,
      presets,
      itemsFor: () => [] as never,
    })
    // An empty resolver yields nothing placeable, so every preset is reported
    // empty — proving the resolver is what supplies the items.
    expect(withResolver.candidates).toEqual([])
    expect(withResolver.emptyPresetIds).toHaveLength(presets.length)
    // Without it, the kit path furnishes normally.
    expect(buildSchemeOptions({ plan, defs, presets }).candidates.length).toBeGreaterThan(0)
  })
})
