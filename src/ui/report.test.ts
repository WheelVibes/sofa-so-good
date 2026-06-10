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
