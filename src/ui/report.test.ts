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

  it('surfaces a narrow walkway when two pieces sit too close', () => {
    // Two 3-seat sofas (0.9 m deep) facing the same way, ~0.5 m of clear floor
    // between their fronts — a tight circulation pinch the walkway check flags.
    const a = {
      id: 'wa',
      defId: 'sofa-3seat',
      position: [3, 3] as [number, number],
      rotation: 0,
      props: {},
    }
    const b = { ...a, id: 'wb', position: [3, 4.4] as [number, number] }
    const html = buildReportHtml(plan, [a, b], BUILTIN_CATALOG, null)
    expect(html).toContain('Clearance &amp; fit')
    expect(html).toContain('narrow walkway')
    expect(html).toContain('tight')
  })
})
