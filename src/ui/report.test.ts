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

  it('handles an empty layout and a missing hero image', () => {
    const html = buildReportHtml(plan, [], BUILTIN_CATALOG, null)
    expect(html).toContain('No furniture placed.')
    expect(html).not.toContain('<img')
  })

  it('escapes HTML in the plan name', () => {
    const html = buildReportHtml({ ...plan, name: '<script>x</script>' }, [], BUILTIN_CATALOG, null)
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
