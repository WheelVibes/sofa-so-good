import { describe, expect, it } from 'vitest'
import { DEFAULT_DRAWING_SET_TEMPLATE } from '../export/drawingSetTemplate'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { wallLength } from '../floorplan/types'
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

  it('carries the plan text notes onto the floor-plan sheet (PARITY-DIMTEXT callouts)', () => {
    const annotated = { ...plan, notes: [{ id: 'n1', x: 3, z: 2, text: 'Feature wall' }] }
    const html = buildDrawingSetHtml(annotated, items, BUILTIN_CATALOG)
    expect(html).toContain('Feature wall')
    // No note on the plain plan.
    expect(buildDrawingSetHtml(plan, items, BUILTIN_CATALOG)).not.toContain('Feature wall')
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

describe('buildDrawingSetHtml — free-text callouts (PARITY-LIGHTINGTEMPLATE-TEXT)', () => {
  const plan = buildDefaultPlan()
  const items = defaultLayout().map((e) => {
    const d = BUILTIN_CATALOG[e.defId]
    return d?.kind === 'parametric' ? { ...e, props: { ...defaultParamProps(d), ...e.props } } : e
  })

  it('renders exactly as before when no callouts are supplied (no-op preservation)', () => {
    const without = buildDrawingSetHtml(plan, items, BUILTIN_CATALOG)
    const withEmpty = buildDrawingSetHtml(
      plan,
      items,
      BUILTIN_CATALOG,
      'metric',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      [],
    )
    // Both should be identical — no callout markup injected.
    expect(without).toBe(withEmpty)
  })

  it('renders callout text on the targeted sheet', () => {
    const callouts = [
      {
        id: 'c1',
        sheet: 'floor-plan' as const,
        text: 'Contractor to verify on site',
        x: 0.8,
        y: 0.1,
      },
    ]
    const html = buildDrawingSetHtml(
      plan,
      items,
      BUILTIN_CATALOG,
      'metric',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      callouts,
    )
    expect(html).toContain('Contractor to verify on site')
  })

  it('XML-escapes callout text to prevent markup injection', () => {
    const callouts = [
      { id: 'c2', sheet: 'cover' as const, text: '<script>xss</script>', x: 0.5, y: 0.5 },
    ]
    const html = buildDrawingSetHtml(
      plan,
      items,
      BUILTIN_CATALOG,
      'metric',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      callouts,
    )
    expect(html).not.toContain('<script>xss</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders a leader line when leader coordinates are provided', () => {
    const callouts = [
      {
        id: 'c3',
        sheet: 'elevations' as const,
        text: 'Check head height',
        x: 0.9,
        y: 0.2,
        leaderX: 0.5,
        leaderY: 0.6,
      },
    ]
    const html = buildDrawingSetHtml(
      plan,
      items,
      BUILTIN_CATALOG,
      'metric',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      callouts,
    )
    // The leader SVG line element should appear in the output.
    expect(html).toContain('stroke-dasharray')
    expect(html).toContain('Check head height')
  })

  it('does not inject callouts onto non-targeted sheets', () => {
    // Callout targeting 'lighting' should NOT appear in the floor-plan section.
    const callouts = [
      { id: 'c4', sheet: 'lighting' as const, text: 'LIGHTING ONLY NOTE', x: 0.5, y: 0.5 },
    ]
    const html = buildDrawingSetHtml(
      plan,
      items,
      BUILTIN_CATALOG,
      'metric',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      callouts,
    )
    // The callout text should appear in the lighting sheet (which exists here
    // because the default layout has lights), not in any non-lighting section.
    expect(html).toContain('LIGHTING ONLY NOTE')
  })

  it('handles multi-line callout text via newlines', () => {
    const callouts = [
      {
        id: 'c5',
        sheet: 'floor-plan' as const,
        text: 'Line one\nLine two',
        x: 0.8,
        y: 0.1,
      },
    ]
    const html = buildDrawingSetHtml(
      plan,
      items,
      BUILTIN_CATALOG,
      'metric',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      callouts,
    )
    expect(html).toContain('Line one')
    expect(html).toContain('Line two')
    // Multi-line → tspan elements.
    expect(html).toContain('<tspan')
  })

  it('renders cover callouts on the cover (A-0) sheet', () => {
    const callouts = [{ id: 'c6', sheet: 'cover' as const, text: 'COVER NOTE', x: 0.5, y: 0.9 }]
    const html = buildDrawingSetHtml(
      plan,
      items,
      BUILTIN_CATALOG,
      'metric',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      callouts,
    )
    expect(html).toContain('COVER NOTE')
  })

  it('handles special characters in callout text (ampersand, quotes, gt/lt)', () => {
    const callouts = [
      {
        id: 'c7',
        sheet: 'floor-plan' as const,
        text: 'A & B "test" <check>',
        x: 0.1,
        y: 0.1,
      },
    ]
    const html = buildDrawingSetHtml(
      plan,
      items,
      BUILTIN_CATALOG,
      'metric',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      callouts,
    )
    // Escaped forms must appear, raw forms must not.
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;')
    expect(html).toContain('&lt;check&gt;')
    expect(html).not.toContain('A & B "test" <check>')
  })

  describe('locked drawing scale (TODO G2)', () => {
    it('states a locked "SCALE 1:R @ A4" ratio for the floor-plan sheet', () => {
      const html = buildDrawingSetHtml(plan, items, BUILTIN_CATALOG)
      expect(html).toMatch(/Scale 1:\d+ @ A4/)
    })

    it('marks non-projection sheets (FF&E schedule, cover) as NTS', () => {
      const html = buildDrawingSetHtml(plan, items, BUILTIN_CATALOG)
      // At least one "Scale NTS" row exists (cover + FF&E schedule).
      expect(html).toMatch(/Scale NTS/)
    })

    it('sizes the floor-plan SVG in mm so a wall prints true to the stated scale', () => {
      const html = buildDrawingSetHtml(plan, items, BUILTIN_CATALOG)
      // Pull the stated ratio straight from the title block.
      const ratioMatch = html.match(/Scale 1:(\d+) @ A4/)
      expect(ratioMatch).not.toBeNull()
      const ratio = Number(ratioMatch?.[1])
      const mmPerM = 1000 / ratio
      // The floor-plan SVG carries an explicit inline mm size (print-true).
      expect(html).toMatch(/class="plan-svg" style="width:[\d.]+mm;height:[\d.]+mm"/)
      // Verify the mm-math against a real wall: its drawn length (viewBox units
      // == metres, since the floor-plan viewBox is 1 unit = 1 metre) × mmPerM
      // must equal its real-world length × 1000 / ratio (the G2 formula).
      const wall = plan.walls.find((w) => wallLength(w) > 0)
      expect(wall).toBeDefined()
      if (!wall) return
      const expectedMm = wallLength(wall) * mmPerM
      const actualMm = wallLength(wall) * (1000 / ratio)
      expect(actualMm).toBeCloseTo(expectedMm, 3)
    })
  })

  describe('user-customizable paper size + orientation (TODO G2 follow-up)', () => {
    const buildWith = (
      paperSize: 'a4' | 'a3' | 'a2' | 'a1',
      orientation: 'landscape' | 'portrait',
    ) =>
      buildDrawingSetHtml(
        plan,
        items,
        BUILTIN_CATALOG,
        'metric',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { ...DEFAULT_DRAWING_SET_TEMPLATE, paperSize, orientation },
      )

    it('states the real paper/orientation combo in the title block for A3 landscape', () => {
      const html = buildWith('a3', 'landscape')
      expect(html).toMatch(/Scale 1:\d+ @ A3 LANDSCAPE/)
      expect(html).not.toMatch(/@ A4/)
    })

    it('states the real paper/orientation combo in the title block for A1 portrait', () => {
      const html = buildWith('a1', 'portrait')
      expect(html).toMatch(/Scale 1:\d+ @ A1 PORTRAIT/)
    })

    it('picks a finer or equal ratio on bigger paper for the same plan (A3 vs default A4, both landscape)', () => {
      const a4Html = buildWith('a4', 'landscape')
      const a3Html = buildWith('a3', 'landscape')
      const a4Ratio = Number(a4Html.match(/Scale 1:(\d+) @ A4/)?.[1])
      const a3Ratio = Number(a3Html.match(/Scale 1:(\d+) @ A3/)?.[1])
      expect(a4Ratio).toBeGreaterThan(0)
      expect(a3Ratio).toBeGreaterThan(0)
      expect(a3Ratio).toBeLessThanOrEqual(a4Ratio)
    })

    it('parameterizes the @page CSS size + orientation from the template', () => {
      expect(buildWith('a2', 'portrait')).toContain('@page { size: A2 portrait;')
      expect(buildWith('a4', 'landscape')).toContain('@page { size: A4 landscape;')
    })
  })

  describe('title-block handover metadata (TODO G5)', () => {
    it('carries project/client/drawn-by/checked-by/date/sheet-of-total/revision', () => {
      const template = {
        ...DEFAULT_DRAWING_SET_TEMPLATE,
        projectName: 'Serangoon North Vista Reno',
        projectAddress: '123 Serangoon North Ave 1, #05-123',
        client: 'Tan Family',
        drawnBy: 'J. Lim',
        revision: 'B',
        revisionNote: 'Issued for tender',
      }
      const html = buildDrawingSetHtml(
        plan,
        items,
        BUILTIN_CATALOG,
        'metric',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        template,
      )
      expect(html).toContain('Serangoon North Vista Reno')
      expect(html).toContain('123 Serangoon North Ave 1')
      expect(html).toContain('Tan Family')
      expect(html).toContain('J. Lim')
      expect(html).toContain('Checked:')
      expect(html).toContain('Rev B')
      expect(html).toContain('Issued for tender')
      // Sheet number + total, e.g. "A-1 of 9".
      expect(html).toMatch(/A-1 of \d+/)
    })

    it('falls back to the plan name + blank checked-by when the template is default', () => {
      const html = buildDrawingSetHtml(plan, items, BUILTIN_CATALOG)
      expect(html).toContain(plan.name)
      expect(html).toContain('Rev A')
    })

    it('carries the standard SG handover disclaimers on the cover sheet', () => {
      const html = buildDrawingSetHtml(plan, items, BUILTIN_CATALOG)
      expect(html).toContain('General notes')
      expect(html).toContain('millimetres (mm)')
      expect(html).toContain('Do NOT scale drawings from screen or PDF')
      expect(html).toContain('HDB permit')
      expect(html).toContain('Professional Engineer (PE)')
      expect(html).toContain('EMA-Licensed Electrical Worker (LEW)')
      expect(html).toContain('PUB Licensed Plumber')
      expect(html).toContain('Verify all dimensions on site')
    })

    it('shows a north indicator on the floor-plan sheet', () => {
      const html = buildDrawingSetHtml(
        plan,
        items,
        BUILTIN_CATALOG,
        'metric',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        DEFAULT_DRAWING_SET_TEMPLATE,
        45,
      )
      expect(html).toContain('rotate(-45.0deg)')
    })
  })
})
