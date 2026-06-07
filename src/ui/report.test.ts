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

  it('shows W×D dimensions for rectangular rooms in the rooms table', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    // Default HDB rooms are plain rectangles → a "× … m" dimension appears.
    expect(html).toContain('class="dim"')
    expect(html).toMatch(/\d+\.\d+ × \d+\.\d+ m/)
  })

  it('includes a furnishing-per-area figure when there is area + budget', () => {
    const html = buildReportHtml(plan, items, BUILTIN_CATALOG, null)
    expect(html).toMatch(/Furnishing per m²/)
    const imperial = buildReportHtml(plan, items, BUILTIN_CATALOG, null, 'imperial')
    expect(imperial).toMatch(/Furnishing per ft²/)
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
    expect(html).toContain('All doorways clear')
  })

  it('omits the Clearance section with no furniture', () => {
    const html = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(html).not.toContain('Clearance &amp; fit')
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
})
