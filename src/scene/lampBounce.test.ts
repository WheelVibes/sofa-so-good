import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { defaultLayout } from '../furniture/defaultLayout'
import type { FurnitureItem } from '../furniture/types'
import {
  LAMP_BOUNCE_K,
  LAMP_BOUNCE_ORIENTATION,
  lampDensityLookup,
  roomLampDensity,
} from './lampBounce'

const plan = buildDefaultPlan()
const items = defaultLayout().map(
  (e) => ({ ...e, rotation: e.rotation ?? 0, props: e.props ?? {} }) as FurnitureItem,
)

describe('roomLampDensity — Σ lamp intensity over floor area, per room', () => {
  const density = roomLampDensity(plan.rooms, items)

  it('varies by room — a small lamp-lit bathroom is ~3× a bedroom, the ledge has none', () => {
    // Measured on the default flat (v0.33.0.3): bath2 2.78, serviceYard 2.88, bedroom3 0.89,
    // kitchen 1.17, livingDining 1.10, acLedge 0. The kitchen/living pair is NEAR-EQUAL, which is
    // why the living room's walls moved as much as the kitchen's in the sweep; its ceiling did not
    // because that ceiling carries no baked map at all.
    const kitchen = density.get('kitchen') ?? 0
    const living = density.get('livingDining') ?? 0
    const bath = density.get('bath2') ?? 0
    const bedroom3 = density.get('bedroom3') ?? 0
    expect(kitchen).toBeGreaterThan(0.8)
    expect(kitchen).toBeLessThan(1.6)
    expect(Math.abs(kitchen - living)).toBeLessThan(0.3)
    expect(bath).toBeGreaterThan(bedroom3 * 2)
    expect(density.get('acLedge') ?? 0).toBe(0)
  })

  it('a room with no lamp gets zero, never NaN', () => {
    for (const v of density.values()) expect(Number.isFinite(v)).toBe(true)
    const bare = roomLampDensity(plan.rooms, [])
    for (const v of bare.values()) expect(v).toBe(0)
  })

  it('a lamp switched off per item is excluded, a lamp outside every room is ignored', () => {
    const on = roomLampDensity(plan.rooms, items)
    const off = roomLampDensity(
      plan.rooms,
      items.map((it) =>
        it.defId === 'ceiling-light' ? { ...it, props: { ...it.props, lightOn: 'no' } } : it,
      ),
    )
    expect(off.get('kitchen') ?? 0).toBeLessThan(on.get('kitchen') ?? 0)
    const outside = roomLampDensity(plan.rooms, [
      {
        id: 'x',
        defId: 'ceiling-light',
        position: [-50, -50],
        rotation: 0,
        props: {},
      } as FurnitureItem,
    ])
    for (const v of outside.values()) expect(v).toBe(0)
  })
})

describe('lampDensityLookup + constants', () => {
  it('resolves a world point to its room density and 0 outside the flat', () => {
    const at = lampDensityLookup(plan, items)
    expect(at(8.16, 8.02)).toBeGreaterThan(0) // kitchen
    expect(at(-20, -20)).toBe(0)
  })
  it('weights ceilings most, floors least, and the constant is positive', () => {
    expect(LAMP_BOUNCE_ORIENTATION.down).toBeGreaterThan(LAMP_BOUNCE_ORIENTATION.side)
    expect(LAMP_BOUNCE_ORIENTATION.side).toBeGreaterThan(LAMP_BOUNCE_ORIENTATION.up)
    expect(LAMP_BOUNCE_K).toBeGreaterThan(0)
  })
})
