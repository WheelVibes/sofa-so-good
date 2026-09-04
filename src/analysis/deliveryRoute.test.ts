import { describe, expect, it } from 'vitest'
import {
  type AccessConstraint,
  hasMeasuredRoute,
  resolveDeliveryRoute,
  SG_DEFAULT_ROUTE,
} from './deliveryAccess'

/**
 * DELIVERY-ROUTE-OVERRIDE (v0.31.9.0) — the user's own lift/door measurements
 * replace the published Singapore typicals.
 *
 * The sources behind `SG_DEFAULT_ROUTE` are emphatic that HDB lift and corridor
 * sizes vary by block and that "even a difference of 5 to 10 centimetres"
 * decides whether a large piece fits. So the typicals are a starting point, and
 * `ACCESS_SCOPE_NOTE` has been telling users to measure and adjust since
 * v0.31.5.374 — with, until now, nothing in the app that could accept the
 * adjustment.
 */
describe('resolveDeliveryRoute', () => {
  const byId = (route: AccessConstraint[], id: string) =>
    route.find((c) => c.id === id) as AccessConstraint

  it('returns the typicals unchanged when nothing is measured', () => {
    expect(resolveDeliveryRoute(undefined)).toBe(SG_DEFAULT_ROUTE)
  })

  it('treats an EMPTY override map as unmeasured, by reference', () => {
    // Reference identity is what `hasMeasuredRoute` reads, so an empty map must
    // not look like a measured route just because it exists.
    expect(resolveDeliveryRoute({})).toBe(SG_DEFAULT_ROUTE)
    expect(hasMeasuredRoute({})).toBe(false)
  })

  it('applies one DIMENSION without disturbing the others', () => {
    const route = resolveDeliveryRoute({ 'lift-door': { widthM: 0.75 } })
    const door = byId(route, 'lift-door')
    const typical = byId(SG_DEFAULT_ROUTE, 'lift-door')
    expect(door.widthM).toBeCloseTo(0.75, 6)
    // Height stays on the published figure — measuring is incremental.
    expect(door.heightM).toBeCloseTo(typical.heightM, 6)
    // And the other apertures are untouched objects.
    expect(byId(route, 'lift-cabin')).toBe(byId(SG_DEFAULT_ROUTE, 'lift-cabin'))
    expect(hasMeasuredRoute({ 'lift-door': { widthM: 0.75 } })).toBe(true)
  })

  it('never mutates SG_DEFAULT_ROUTE', () => {
    const before = SG_DEFAULT_ROUTE.map((c) => ({ ...c }))
    resolveDeliveryRoute({ 'main-door': { widthM: 0.7, heightM: 1.95 } })
    expect(SG_DEFAULT_ROUTE.map((c) => ({ ...c }))).toEqual(before)
  })

  it('ignores a measurement equal to the typical', () => {
    const typical = byId(SG_DEFAULT_ROUTE, 'main-door')
    expect(resolveDeliveryRoute({ 'main-door': { widthM: typical.widthM } })).toBe(SG_DEFAULT_ROUTE)
  })

  it('IGNORES a zero or negative or non-finite figure rather than trusting it', () => {
    // A route dimension of 0 would block every piece in the catalogue and read
    // as a catalogue-wide fault rather than as bad input.
    for (const bad of [0, -0.9, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveDeliveryRoute({ 'lift-door': { widthM: bad } })).toBe(SG_DEFAULT_ROUTE)
    }
  })

  it('ignores an override for an aperture that is not on the route', () => {
    expect(resolveDeliveryRoute({ 'front-gate': { widthM: 0.5 } })).toBe(SG_DEFAULT_ROUTE)
  })

  it('accepts a WIDER measurement, not just a tighter one', () => {
    // A newer block can genuinely have a bigger lift; the check must not assume
    // the user's figure is always worse than the typical.
    const route = resolveDeliveryRoute({ 'lift-cabin': { widthM: 1.4 } })
    expect(byId(route, 'lift-cabin').widthM).toBeCloseTo(1.4, 6)
  })
})
