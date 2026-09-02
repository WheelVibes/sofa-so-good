import { describe, expect, it } from 'vitest'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import {
  ACCESS_SCOPE_NOTE,
  type AccessConstraint,
  buildDeliveryAccess,
  SG_DEFAULT_ROUTE,
} from './deliveryAccess'

function def(id: string, w: number, d: number, h: number): FurnitureDef {
  return {
    id,
    name: id,
    category: 'seating',
    kind: 'primitive',
    defaultFootprint: { w, d, h },
  } as unknown as FurnitureDef
}

function item(id: string, defId: string): FurnitureItem {
  return { id, defId, position: [1, 1], rotation: 0, props: {} } as unknown as FurnitureItem
}

/** One 1.0 x 1.0 m aperture, nothing else on the route. */
const oneMetreDoor: AccessConstraint[] = [{ id: 'door', label: 'Test door', widthM: 1, heightM: 1 }]

describe('buildDeliveryAccess — the geometric rule', () => {
  it('passes a box whose two smallest dimensions fit', () => {
    // 0.9 x 0.9 x 3.0 — the 3 m length is irrelevant, it goes through lengthwise.
    const defs = { long: def('long', 0.9, 0.9, 3) }
    const r = buildDeliveryAccess([item('a', 'long')], defs, oneMetreDoor)
    expect(r.findings).toEqual([])
    expect(r.allClear).toBe(true)
    expect(r.checked).toBe(1)
  })

  it('blocks a box whose SECOND-smallest dimension is too big', () => {
    // 0.5 x 1.2 x 1.2 — smallest fits, but the next one does not.
    const defs = { fat: def('fat', 1.2, 1.2, 0.5) }
    const r = buildDeliveryAccess([item('a', 'fat')], defs, oneMetreDoor)
    expect(r.findings).toHaveLength(1)
    expect(r.findings[0]!.blockedBy[0]!.id).toBe('door')
  })

  it('accepts a box exactly the size of the aperture', () => {
    const defs = { exact: def('exact', 1, 1, 2) }
    expect(buildDeliveryAccess([item('a', 'exact')], defs, oneMetreDoor).findings).toEqual([])
  })

  it('uses the aperture in either orientation', () => {
    // A 0.6 x 1.4 slot takes a 0.5 x 1.3 face regardless of which way round.
    const slot: AccessConstraint[] = [{ id: 's', label: 'Slot', widthM: 1.4, heightM: 0.6 }]
    const defs = { panel: def('panel', 0.5, 1.3, 2.5) }
    expect(buildDeliveryAccess([item('a', 'panel')], defs, slot).findings).toEqual([])
  })

  it('treats an unbounded height as no headroom limit', () => {
    const corridor: AccessConstraint[] = [
      { id: 'c', label: 'Corridor', widthM: 1.2, heightM: Number.POSITIVE_INFINITY },
    ]
    const defs = { tall: def('tall', 1.1, 5, 5) }
    expect(buildDeliveryAccess([item('a', 'tall')], defs, corridor).findings).toEqual([])
  })
})

describe('buildDeliveryAccess — reporting', () => {
  it('reports one finding per DEF, not per placement', () => {
    // Four identical blocked chairs is one problem to solve, not four.
    const defs = { fat: def('fat', 1.2, 1.2, 0.5) }
    const items = [item('a', 'fat'), item('b', 'fat'), item('c', 'fat'), item('d', 'fat')]
    expect(buildDeliveryAccess(items, defs, oneMetreDoor).findings).toHaveLength(1)
  })

  it('orders blockers tightest-first — that is the one to solve', () => {
    // Both must genuinely block, or the ordering is untested: a 1.2 m box
    // clears a 2 m-high door easily, so the heights are capped at 1.0 m here.
    const route: AccessConstraint[] = [
      { id: 'wide', label: 'Wide', widthM: 1.1, heightM: 1 },
      { id: 'narrow', label: 'Narrow', widthM: 0.7, heightM: 1 },
    ]
    const defs = { fat: def('fat', 1.2, 1.2, 0.5) }
    const r = buildDeliveryAccess([item('a', 'fat')], defs, route)
    expect(r.findings[0]!.blockedBy).toHaveLength(2)
    expect(r.findings[0]!.blockedBy.map((b) => b.id)).toEqual(['narrow', 'wide'])
  })

  it('phrases the action as a prompt, not a verdict', () => {
    // A check that reads as "cannot be delivered" gets ignored after the second
    // false alarm; flat-packed furniture is exactly why.
    const defs = { fat: def('fat', 1.2, 1.2, 0.5) }
    const r = buildDeliveryAccess([item('a', 'fat')], defs, oneMetreDoor)
    const action = r.findings[0]!.action
    expect(action).toMatch(/Measure your actual/i)
    expect(action).toMatch(/ships knock-down/i)
    expect(action).not.toMatch(/cannot be delivered|will not fit/i)
  })

  it('states the measured dimensions so the user can check the maths', () => {
    const defs = { fat: def('fat', 1.2, 1.2, 0.5) }
    const r = buildDeliveryAccess([item('a', 'fat')], defs, oneMetreDoor)
    expect(r.findings[0]!.dimsM).toEqual([0.5, 1.2, 1.2])
    expect(r.findings[0]!.action).toContain('0.50 x 1.20 m')
  })

  it('counts what was CHECKED so "all clear" cannot mean "nothing looked at"', () => {
    const r = buildDeliveryAccess([item('a', 'missing')], {}, oneMetreDoor)
    expect(r.allClear).toBe(true)
    expect(r.checked).toBe(0)
  })

  it('skips a degenerate def rather than reporting it', () => {
    const defs = { zero: def('zero', 0, 0, 0) }
    const r = buildDeliveryAccess([item('a', 'zero')], defs, oneMetreDoor)
    expect(r.checked).toBe(0)
    expect(r.findings).toEqual([])
  })

  it('always carries the scope note, which says to measure', () => {
    const r = buildDeliveryAccess([], {}, oneMetreDoor)
    expect(r.scopeNote).toBe(ACCESS_SCOPE_NOTE)
    expect(r.scopeNote).toMatch(/measure your actual lift/i)
  })
})

describe('SG_DEFAULT_ROUTE', () => {
  it('uses the tighter published lift-door figure', () => {
    // The sources give both ~0.8 m and ~0.9 m; a warning should assume the
    // tighter common case rather than the flattering one.
    const lift = SG_DEFAULT_ROUTE.find((c) => c.id === 'lift-door')!
    expect(lift.widthM).toBe(0.8)
  })

  it('covers the lift door, the cabin and the main door', () => {
    expect(SG_DEFAULT_ROUTE.map((c) => c.id)).toEqual(['lift-door', 'lift-cabin', 'main-door'])
  })

  it('is overridable — a measured route replaces the defaults entirely', () => {
    const defs = { sofa: def('sofa', 0.85, 2.1, 0.9) }
    const onDefaults = buildDeliveryAccess([item('a', 'sofa')], defs)
    // A real 0.95 m lift door clears the same sofa the 0.8 m default blocks.
    const measured: AccessConstraint[] = [
      { id: 'lift-door', label: 'Lift door opening', widthM: 0.95, heightM: 2.09 },
    ]
    const onMeasured = buildDeliveryAccess([item('a', 'sofa')], defs, measured)
    expect(onDefaults.findings).toHaveLength(1)
    expect(onMeasured.findings).toEqual([])
  })
})

describe('report integration', () => {
  it('renders a Delivery access section in Pro and omits it in Simple', async () => {
    const { buildReportHtml } = await import('../ui/report')
    const { useStore } = await import('../state/store')
    const { buildDefaultPlan } = await import('../floorplan/defaultPlan')
    const { BUILTIN_CATALOG } = await import('../furniture/builtinCatalog')
    const { defaultLayout } = await import('../furniture/defaultLayout')
    const { defaultParamProps } = await import('../furniture/types')
    const plan = buildDefaultPlan()
    const its = defaultLayout().map((e) => {
      const d = BUILTIN_CATALOG[e.defId]
      return d?.kind === 'parametric' ? { ...e, props: { ...defaultParamProps(d), ...e.props } } : e
    })

    useStore.getState().setUiMode('pro')
    const pro = buildReportHtml(plan, its, BUILTIN_CATALOG, null)
    expect(pro).toContain('Delivery access')
    // The scope note must travel with it — the figures are typicals, not facts.
    expect(pro).toContain('measure your actual lift')

    useStore.getState().setUiMode('simple')
    const simple = buildReportHtml(plan, its, BUILTIN_CATALOG, null)
    expect(simple).not.toContain('<h2>Delivery access</h2>')

    useStore.getState().setUiMode('pro')
  })
})
