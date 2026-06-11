import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { defaultLayout } from '../furniture/defaultLayout'
import { defaultParamProps } from '../furniture/types'
import { buildReportHtml } from './report'

describe('buildReportHtml', () => {
  const plan = buildDefaultPlan()
  const items = defaultLayout().map((e) => {
    const d = BUILTIN_CATALOG[e.defId]
    return d?.kind === 'parametric' ? { ...e, props: { ...defaultParamProps(d), ...e.props } } : e
  })

  it('includes the plan name, room areas, a budget total and the hero image', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, 'data:image/png;base64,AAAA')
    expect(html).toContain(plan.name)
    expect(html).toContain('Living / Dining')
    expect(html).toMatch(/Total interior/)
    expect(html).toMatch(/\$[\d,]+/) // a dollar amount
    expect(html).toContain('data:image/png;base64,AAAA')
  })

  it('includes a Wall elevations section with per-wall drawings for the furnished flat', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('Wall elevations')
    expect(html).toContain('class="elev-grid"')
    // At least one elevation figure with an embedded SVG.
    expect(html).toContain('class="elev-fig"')
    expect(html).toMatch(/<figcaption>Wall \d+ ·/)
    expect(html).toContain('wall elevation,') // svg aria-label
  })

  it('omits the elevations section when there is no furniture', () => {
    const html = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(html).not.toContain('Wall elevations')
  })

  it('includes a Design score section with an overall grade and per-category bars', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('Design score')
    expect(html).toContain('class="ds-grade"')
    expect(html).toContain('class="score-fill"')
    expect(html).toMatch(/\/100/)
    for (const label of [
      'Clearance &amp; fit',
      'Furnishing balance',
      'Circulation',
      'Lighting coverage',
    ])
      expect(html).toContain(label)
  })

  it('omits the Design score section when there is no furniture', () => {
    const html = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(html).not.toContain('Design score')
  })

  it('includes an Accessibility section with door-width + turning-circle checks', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('Accessibility')
    expect(html).toMatch(/doors ≥ \d+ cm clear/)
    expect(html).toMatch(/turning circle/)
  })

  it('includes a Hacking & new walls section when the plan diverged from its baseline', () => {
    // Baseline = the default flat; current = default minus one wall (a "hack").
    const baseline = buildDefaultPlan()
    const current = { ...plan, walls: plan.walls.slice(0, -1) }
    const html = buildReportHtml(
      current,
      items,
      BUILTIN_CATALOG,
      null,
      'metric',
      undefined,
      undefined,
      [],
      undefined,
      baseline,
    )
    expect(html).toContain('Hacking &amp; new walls')
    expect(html).toMatch(/wall(s)? hacked/)
    // No baseline → no section.
    expect(buildReportHtml(plan, items, BUILTIN_CATALOG, null)).not.toContain(
      'Hacking &amp; new walls',
    )
  })

  it('includes an auto-dimensioned plan drawing', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('Dimensioned plan')
    expect(html).toMatch(/<svg/)
  })

  it('includes a Renovation timeline with phases + an estimated duration', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('Renovation timeline')
    expect(html).toMatch(/Estimated duration/)
    expect(html).toMatch(/weeks \(\d+ working days\)/)
  })

  it('includes HDB compliance hints (permit/caution advisories) for the default flat', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('HDB compliance hints')
    expect(html).toMatch(/permit-sensitive/)
  })

  it('surfaces the stair-connectivity advisory for a stair-less multi-storey plan', () => {
    const multi = {
      ...plan,
      upperLevels: [
        {
          id: 'up',
          name: 'Upper storey',
          elevation: 2.9,
          walls: [],
          openings: [],
          rooms: [
            {
              id: 'u-bed',
              name: 'Bedroom',
              origin: [1, 1] as [number, number],
              width: 3,
              depth: 3,
            },
          ],
        },
      ],
    }
    const html = buildReportHtml(multi, items, BUILTIN_CATALOG, null)
    expect(html).toContain('No staircase reaches Upper storey')
    // Single-storey plans never mention it.
    expect(buildReportHtml(plan, items, BUILTIN_CATALOG, null)).not.toContain('No staircase')
  })

  it('includes an FF&E schedule with per-item rooms, sizes and a grand total', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('FF&amp;E schedule')
    expect(html).toContain('Size (W×D×H)')
    expect(html).toContain('class="ffe"')
    // Size cells use the "× × ×" form.
    expect(html).toMatch(/m × .*m × .*m/)
  })

  it('omits the FF&E schedule when there is no furniture', () => {
    expect(buildReportHtml(plan, [], BUILTIN_CATALOG, null)).not.toContain('FF&amp;E schedule')
  })

  it('includes a Lighting plan + schedule when the design has light fixtures', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    // The default move-in layout has ceiling lights / lamps.
    expect(html).toContain('Lighting plan')
    expect(html).toContain('lighting plan,') // svg aria-label
    expect(html).toMatch(/×\d+/) // a fixture quantity in the schedule
    expect(html).toContain('cd</td>') // intensity column (candela)
  })

  it('escapes user-controlled strings (plan name + note) to prevent HTML injection', () => {
    const evil = '"><script>alert(1)</script>'
    const html = buildReportHtml(
      { ...plan, name: evil },
      items,
      BUILTIN_CATALOG,
      null,
      'metric',
      undefined,
      evil, // project note
    )
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('&lt;script&gt;') // the angle brackets are escaped
    expect(html).toContain('&quot;') // the breaking double-quote is escaped too
  })

  it('shows W×D dimensions for rectangular rooms in the rooms table', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    // Default HDB rooms are plain rectangles → a "× … m" dimension appears.
    expect(html).toContain('class="dim"')
    expect(html).toMatch(/\d+\.\d+ × \d+\.\d+ m/)
    // Room schedule has a header + a ceiling-height column.
    expect(html).toContain('Ceiling')
  })

  it('includes a furnishing-per-area figure when there is area + budget', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toMatch(/Furnishing per m²/)
    const imperial = buildReportHtml(plan, items, BUILTIN_CATALOG, null, 'imperial')
    expect(imperial).toMatch(/Furnishing per ft²/)
  })

  it('shows the budget target + over/under when one is set', () => {
    const under = buildReportHtml(
      plan,
      items,
      BUILTIN_CATALOG,
      null,
      'metric',
      undefined,
      undefined,
      [],
      1_000_000,
    )
    expect(under).toMatch(/Budget target/)
    expect(under).toMatch(/under/)
    const over = buildReportHtml(
      plan,
      items,
      BUILTIN_CATALOG,
      null,
      'metric',
      undefined,
      undefined,
      [],
      1,
    )
    expect(over).toMatch(/over/)
    // Omitted target → no budget-target row.
    expect(buildReportHtml(plan, items, BUILTIN_CATALOG, null)).not.toMatch(/Budget target/)
  })

  it('renders a Finishes-by-room section when finishes are supplied', () => {
    const finishes = {
      floor: { livingDining: 'floor-wood-oak' },
      walls: { livingDining: 'wall-paint-white' },
    }
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null, 'metric', finishes)
    expect(html).toContain('Finishes by room')
    expect(html).toMatch(/Oak|oak/) // the resolved floor material name
    expect(html).toContain('class="msw"') // colour swatch chip next to the finish
    // Flooring schedule: total area per floor finish.
    expect(html).toContain('Flooring schedule')
    // Wall finish schedule: gross wall area per wall finish (perimeter × height).
    expect(html).toContain('Wall finish schedule')
    // Renovation estimate: finishes subtotal + a combined furniture+finishes line.
    expect(html).toContain('Renovation estimate')
    expect(html).toContain('Finishes subtotal')
    expect(html).toContain('Furniture + finishes')
    expect(html).toMatch(/\$[\d,]+\/m²/) // a per-m² rate
  })

  it('omits the Renovation estimate when no finishes are supplied', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).not.toContain('Renovation estimate')
  })

  it('omits the Finishes section when no finishes are supplied', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).not.toContain('Finishes by room')
  })

  it('includes + escapes a project note when supplied', () => {
    const html = buildReportHtml(
      plan,
      items,
      BUILTIN_CATALOG,
      null,
      'metric',
      undefined,
      'Warm <tones>',
    )
    expect(html).toContain('class="note"')
    expect(html).toContain('Warm &lt;tones&gt;')
    const none = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(none).not.toContain('class="note"')
  })

  it('omits the per-area figure with no furniture', () => {
    const html = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(html).not.toMatch(/Furnishing per/)
  })

  it('flags blocking items from the curated default layout', () => {
    // The move-in layout has pieces that sit in a doorway path (the same the
    // in-app Checks overlay flags) — the report surfaces them.
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('Clearance &amp; fit')
    expect(html).toContain('block a doorway')
  })

  it('reports all doorways clear when nothing blocks them', () => {
    // A wall-mounted piece is exempt from the doorway-path check, so a layout of
    // only mounted items reads as clear (doors present, nothing on the floor path).
    const mounted = Object.values(BUILTIN_CATALOG).find((d) => d.mounted)!
    const art = {
      id: 'art',
      defId: mounted.id,
      position: [5, 5] as [number, number],
      rotation: 0,
      props: {},
    }
    const html = buildReportHtml(plan, [art], BUILTIN_CATALOG, null)
    expect(html).toContain('Clearance &amp; fit')
    expect(html).toContain('Everything fits')
  })

  it('omits the Clearance section with no furniture', () => {
    const html = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(html).not.toContain('Clearance &amp; fit')
  })

  it('reports a narrow walkway between two close pieces', () => {
    // Two beds ~0.5 m apart (inside the narrow band 0.4–0.9 m, not overlapping).
    const a = {
      id: 'na',
      defId: 'bed-double',
      position: [3, 3] as [number, number],
      rotation: 0,
      props: {},
    }
    const b = { ...a, id: 'nb', position: [3, 4.5] as [number, number] }
    const html = buildReportHtml(plan, [a, b], BUILTIN_CATALOG, null)
    expect(html).toMatch(/narrow walkway/i)
  })

  it('reports overlapping items and pieces inside a wall', () => {
    const overlapA = {
      id: 'oa',
      defId: 'sofa-3seat',
      position: [3, 3] as [number, number],
      rotation: 0,
      props: {},
    }
    const overlapB = { ...overlapA, id: 'ob', position: [3.3, 3.1] as [number, number] }
    // A sofa straddling the south external wall (z=0) is embedded in a wall.
    const inWall = { ...overlapA, id: 'iw', position: [2, 0] as [number, number] }
    const html = buildReportHtml(plan, [overlapA, overlapB, inWall], BUILTIN_CATALOG, null)
    expect(html).toContain('Clearance &amp; fit')
    expect(html).toContain('of items overlap')
    expect(html).toContain('sit inside a wall')
  })

  it('handles an empty layout and a missing hero image', () => {
    const html = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(html).toContain('No furniture placed.')
    expect(html).not.toContain('<img')
  })

  it('includes print page-break rules so PDF sections stay whole', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toContain('break-inside: avoid')
    expect(html).toContain('@media print')
  })

  it('escapes HTML in the plan name', () => {
    const html = buildReportHtml({ ...plan, name: '<script>x</script>' }, [], BUILTIN_CATALOG, null)
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes a malicious user-furniture name in the shopping list', () => {
    // A user-uploaded/renamed piece carries an arbitrary `name`; it must be
    // escaped where the report lists it (def.name → the furniture rows).
    const evil = '<img src=x onerror=alert(1)>'
    const base = BUILTIN_CATALOG['sofa-3seat']
    const catalog = { ...BUILTIN_CATALOG, evil: { ...base, id: 'evil', name: evil } }
    const evilItem = {
      id: 'e1',
      defId: 'evil',
      position: [5, 5] as [number, number],
      rotation: 0,
      props: {},
    }
    const html = buildReportHtml(plan, [evilItem], catalog, null)
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})

describe('buildReportHtml — multi-storey fan-out (F13)', () => {
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

  it('renders one captioned plan + dimensioned diagram per storey', () => {
    const html = buildReportHtml(multi, [], BUILTIN_CATALOG, null)
    // Storey captions above the per-level diagrams.
    expect(html).toContain('>Ground floor</div>')
    expect(html).toContain('>Upper storey</div>')
    // Upper rooms join the rooms table + total.
    expect(html).toContain('Bedroom (up)')
    // Single-storey reports carry no storey captions.
    const singleHtml = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(singleHtml).not.toContain('>Ground floor</div>')
  })

  it('filters lighting fixtures to their storey', () => {
    const lampUp = {
      id: 'l1',
      defId: 'floor-lamp',
      position: [2, 2] as [number, number],
      rotation: 0,
      props: {},
      levelId: 'up',
    }
    const html = buildReportHtml(multi, [lampUp], BUILTIN_CATALOG, null)
    expect(html).toContain('Lighting plan')
    // Only the lit storey gets a diagram: one lighting-plan svg, captioned Upper.
    expect(html.match(/aria-label="lighting plan/g)).toHaveLength(1)
  })

  it('diffs demolition per storey and calls out an added storey', () => {
    const html = buildReportHtml(
      multi,
      [],
      BUILTIN_CATALOG,
      null,
      'metric',
      undefined,
      undefined,
      [],
      undefined,
      plan, // baseline without the upper storey
    )
    expect(html).toContain('Hacking &amp; new walls')
    expect(html).toContain('Entire storey added')
  })
})
