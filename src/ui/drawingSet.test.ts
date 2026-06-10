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
