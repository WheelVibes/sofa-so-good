import { beforeEach, describe, expect, it } from 'vitest'
import { resolveDeliveryRoute, SG_DEFAULT_ROUTE } from '../analysis/deliveryAccess'
import { useStore } from './store'

/**
 * DELIVERY-ROUTE-OVERRIDE (v0.31.9.0) — store + save-file behaviour.
 *
 * The invariant worth a test is the ABSENCE discipline: an untouched plan must
 * stay byte-identical in the save file, so clearing the last measured dimension
 * has to drop the aperture key, and clearing the last aperture has to drop
 * `deliveryRoute` entirely. The same rule `clearSiteMeasurement` follows.
 */
describe('delivery route overrides', () => {
  beforeEach(() => {
    useStore.getState().clearDeliveryRoute()
  })

  it('starts absent, so an untouched plan has no key', () => {
    expect(useStore.getState().floorPlan.deliveryRoute).toBeUndefined()
  })

  it('records one dimension and leaves the rest on typicals', () => {
    useStore.getState().setDeliveryRouteDim('lift-door', 'widthM', 0.75)
    const route = resolveDeliveryRoute(useStore.getState().floorPlan.deliveryRoute)
    const door = route.find((c) => c.id === 'lift-door')
    const typical = SG_DEFAULT_ROUTE.find((c) => c.id === 'lift-door')
    expect(door?.widthM).toBeCloseTo(0.75, 6)
    expect(door?.heightM).toBeCloseTo(typical?.heightM ?? 0, 6)
  })

  it('drops the aperture key when its last dimension is cleared', () => {
    const s = () => useStore.getState()
    s().setDeliveryRouteDim('lift-door', 'widthM', 0.75)
    s().setDeliveryRouteDim('lift-door', 'heightM', 2.0)
    expect(Object.keys(s().floorPlan.deliveryRoute ?? {})).toEqual(['lift-door'])
    s().setDeliveryRouteDim('lift-door', 'widthM', undefined)
    expect(s().floorPlan.deliveryRoute?.['lift-door']).toEqual({ heightM: 2.0 })
    s().setDeliveryRouteDim('lift-door', 'heightM', undefined)
    // Last dimension gone → whole key gone, not an empty object left behind.
    expect(s().floorPlan.deliveryRoute).toBeUndefined()
  })

  it('rejects a non-positive figure rather than storing it', () => {
    useStore.getState().setDeliveryRouteDim('main-door', 'widthM', 0)
    useStore.getState().setDeliveryRouteDim('main-door', 'widthM', Number.NaN)
    expect(useStore.getState().floorPlan.deliveryRoute).toBeUndefined()
  })

  it('is undoable, like every plan mutation', () => {
    const s = () => useStore.getState()
    s().setDeliveryRouteDim('lift-cabin', 'widthM', 1.2)
    expect(s().floorPlan.deliveryRoute?.['lift-cabin']?.widthM).toBeCloseTo(1.2, 6)
    s().undo()
    expect(s().floorPlan.deliveryRoute?.['lift-cabin']).toBeUndefined()
  })
})
