import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { defaultLayout } from '../furniture/defaultLayout'
import { defaultParamProps } from '../furniture/types'
import { buildDrawingSetHtml } from './drawingSet'

describe('buildDrawingSetHtml', () => {
  const plan = buildDefaultPlan()
  const items = defaultLayout().map((e) => {
    const d = BUILTIN_CATALOG[e.defId]
    return d?.kind === 'parametric' ? { ...e, props: { ...defaultParamProps(d), ...e.props } } : e
  })

  it('produces a cover + paginated sheets with title blocks', () => {
    const html = buildDrawingSetHtml(plan, items, BUILTIN_CATALOG)
    expect(html).toContain(plan.name)
    expect(html).toContain('Interior design drawing set')
    expect(html).toContain('Sheet index')
    // Each sheet paginates + carries a title block.
    expect(html).toContain('page-break-after: always')
    expect(html).toContain('title-block')
    // Cover + floor plan + at least one elevation + FF&E.
    expect(html).toContain('>A-0<')
    expect(html).toContain('Floor plan')
    expect(html).toContain('FF&amp;E schedule')
    expect(html).toContain('A4 landscape')
  })

  it('includes a lighting-plan sheet when the design has fixtures', () => {
    const html = buildDrawingSetHtml(plan, items, BUILTIN_CATALOG)
    expect(html).toContain('Lighting plan')
  })

  it('includes a dimensioned-plan + cross-section sheet', () => {
    const html = buildDrawingSetHtml(plan, items, BUILTIN_CATALOG)
    expect(html).toContain('Dimensioned plan')
    expect(html).toContain('Section A')
  })

  it('draws furniture silhouettes in the section for the furnished flat, none for a bare plan', () => {
    const furnished = buildDrawingSetHtml(plan, items, BUILTIN_CATALOG)
    expect(furnished).toContain('Section A')
    expect(furnished).toContain('class="items"') // silhouettes beyond the cut
    // Bare plan: the section sheet still renders (cut walls), without silhouettes.
    const bare = buildDrawingSetHtml(plan, [], BUILTIN_CATALOG)
    expect(bare).toContain('Section A')
    expect(bare).not.toContain('class="items"')
  })

  it('includes an electrical-plan sheet when electrical points are supplied', () => {
    const points = [
      { x: 1, z: 1, kind: 'socket' as const },
      { x: 2, z: 1, kind: 'switch' as const },
    ]
    const html = buildDrawingSetHtml(plan, items, BUILTIN_CATALOG, 'metric', undefined, points)
    expect(html).toContain('Electrical plan')
    // No points → no electrical sheet.
    expect(buildDrawingSetHtml(plan, items, BUILTIN_CATALOG)).not.toContain('Electrical plan')
  })

  it('includes a plumbing-plan sheet when plumbing points are supplied', () => {
    const plumbing = [
      { x: 1, z: 1, kind: 'water-point' as const },
      { x: 2, z: 1, kind: 'floor-trap' as const },
    ]
    const html = buildDrawingSetHtml(
      plan,
      items,
      BUILTIN_CATALOG,
      'metric',
      undefined,
      undefined,
      plumbing,
    )
    expect(html).toContain('Plumbing plan')
    expect(html).toContain('Floor trap')
    // No points → no plumbing sheet.
    expect(buildDrawingSetHtml(plan, items, BUILTIN_CATALOG)).not.toContain('Plumbing plan')
  })

  it('includes a finishes schedule when finishes are supplied', () => {
    const finishes = {
      floor: { livingDining: 'floor-wood-oak' },
      walls: { livingDining: 'wall-paint-white' },
    }
    const html = buildDrawingSetHtml(
      plan,
      items,
      BUILTIN_CATALOG,
      'metric',
      undefined,
      undefined,
      undefined,
      finishes,
    )
    expect(html).toContain('Finishes schedule')
    // No finishes arg → no schedule sheet.
    expect(buildDrawingSetHtml(plan, items, BUILTIN_CATALOG)).not.toContain('Finishes schedule')
  })

  it('includes a demolition sheet only when the plan diverged from its baseline', () => {
    const baseline = plan
    const hacked = { ...plan, walls: plan.walls.slice(0, -1) }
    const html = buildDrawingSetHtml(hacked, items, BUILTIN_CATALOG, 'metric', baseline)
    expect(html).toContain('Demolition &amp; new walls')
    expect(buildDrawingSetHtml(plan, items, BUILTIN_CATALOG, 'metric', baseline)).not.toContain(
      'Demolition &amp; new walls',
    )
  })

  it('still produces a valid cover-only set with no furniture', () => {
    const html = buildDrawingSetHtml(plan, [], BUILTIN_CATALOG)
    expect(html).toContain('Sheet index')
    expect(html).toContain('Floor plan') // the plan sheet always renders
    expect(html).not.toContain('FF&amp;E schedule') // no furniture → no FF&E sheet
  })

  it('escapes the plan name (no markup injection)', () => {
    const html = buildDrawingSetHtml(
      { ...plan, name: '<script>x</script>' },
      items,
      BUILTIN_CATALOG,
    )
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('buildDrawingSetHtml — multi-storey fan-out (F13)', () => {
  const plan = buildDefaultPlan()
  const upper = {
    id: 'up',
    name: 'Upper storey',
    elevation: 2.9,
    walls: [
      {
        id: 'uw1',
        start: [0.1, 0.1] as [number, number],
        end: [6, 0.1] as [number, number],
        thickness: 'external' as const,
      },
      {
        id: 'uw2',
        start: [0.1, 0.1] as [number, number],
        end: [0.1, 6] as [number, number],
        thickness: 'external' as const,
      },
    ],
    openings: [],
    rooms: [
      {
        id: 'up-bed',
        name: 'Bedroom (up)',
        origin: [0.2, 0.2] as [number, number],
        width: 5,
        depth: 5,
      },
    ],
  }
  const multi = { ...plan, upperLevels: [upper] }

  it('renders one captioned floor-plan sheet per storey', () => {
    const html = buildDrawingSetHtml(multi, [], BUILTIN_CATALOG)
    expect(html).toContain('Floor plan — Ground floor')
    expect(html).toContain('Floor plan — Upper storey')
    expect(html).toContain('Dimensioned plan — Ground floor')
    expect(html).toContain('Dimensioned plan — Upper storey')
    // Cover room schedule groups by storey + includes the upper room.
    expect(html).toContain('Bedroom (up)')
    // Single-storey sets keep the plain sheet names.
    const singleHtml = buildDrawingSetHtml(plan, [], BUILTIN_CATALOG)
    expect(singleHtml).not.toContain('Floor plan —')
    expect(singleHtml).not.toContain('Dimensioned plan —')
  })

  it('filters lighting fixtures to their storey (upstairs-only lamp → upper sheet only)', () => {
    const lamp = {
      id: 'l1',
      defId: 'floor-lamp',
      position: [2, 2] as [number, number],
      rotation: 0,
      props: {},
      levelId: 'up',
    }
    const html = buildDrawingSetHtml(multi, [lamp], BUILTIN_CATALOG)
    expect(html).toContain('Lighting plan — Upper storey')
    expect(html).not.toContain('Lighting plan — Ground floor')
  })

  it('renders per-storey electrical sheets filtered by point levelId', () => {
    const points = [
      { x: 1, z: 1, kind: 'socket' as const },
      { x: 2, z: 2, kind: 'aircon' as const, levelId: 'up' },
    ]
    const html = buildDrawingSetHtml(multi, [], BUILTIN_CATALOG, 'metric', undefined, points)
    expect(html).toContain('Electrical plan — Ground floor')
    expect(html).toContain('Electrical plan — Upper storey')
  })

  it('reports an added storey on the demolition sheet (whole-storey callout)', () => {
    const html = buildDrawingSetHtml(multi, [], BUILTIN_CATALOG, 'metric', plan)
    expect(html).toContain('Demolition &amp; new walls — Upper storey')
    expect(html).toContain('Entire storey added')
    // Ground floor is unchanged → no ground demolition sheet.
    expect(html).not.toContain('Demolition &amp; new walls — Ground floor')
  })
})

describe('buildDrawingSetHtml — layer toggles (PARITY-DRAWLAYERS)', () => {
  const plan = buildDefaultPlan()
  const items = defaultLayout().map((e) => {
    const d = BUILTIN_CATALOG[e.defId]
    return d?.kind === 'parametric' ? { ...e, props: { ...defaultParamProps(d), ...e.props } } : e
  })

  it('includes every sheet group by default (no layer map)', () => {
    const html = buildDrawingSetHtml(plan, items, BUILTIN_CATALOG)
    expect(html).toContain('Floor plan')
    expect(html).toContain('Dimensioned plan')
    expect(html).toContain('Lighting plan')
    expect(html).toContain('FF&amp;E schedule')
  })

  it('omits toggled-off layers but always keeps the floor plan (the base sheet)', () => {
    const html = buildDrawingSetHtml(
      plan,
      items,
      BUILTIN_CATALOG,
      'metric',
      undefined,
      undefined,
      undefined,
      undefined,
      { dimensions: false, ffe: false, lighting: false },
    )
    expect(html).toContain('Floor plan')
    expect(html).not.toContain('Dimensioned plan')
    expect(html).not.toContain('Lighting plan')
    expect(html).not.toContain('FF&amp;E schedule')
  })

  it('keeps a layer set explicitly true (and unlisted layers default on)', () => {
    const html = buildDrawingSetHtml(
      plan,
      items,
      BUILTIN_CATALOG,
      'metric',
      undefined,
      undefined,
      undefined,
      undefined,
      { dimensions: true },
    )
    expect(html).toContain('Dimensioned plan')
    expect(html).toContain('FF&amp;E schedule') // unlisted → still included
  })

  it('skips the demolition layer when toggled off even though the plan diverged', () => {
    const hacked = { ...plan, walls: plan.walls.slice(0, -1) }
    const on = buildDrawingSetHtml(hacked, items, BUILTIN_CATALOG, 'metric', plan)
    expect(on).toContain('Demolition &amp; new walls')
    const off = buildDrawingSetHtml(
      hacked,
      items,
      BUILTIN_CATALOG,
      'metric',
      plan,
      undefined,
      undefined,
      undefined,
      { demolition: false },
    )
    expect(off).not.toContain('Demolition &amp; new walls')
  })
})
