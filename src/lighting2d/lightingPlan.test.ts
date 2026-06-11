import { describe, expect, it } from 'vitest'
import { LIGHT_EMITTERS } from '../furniture/lightEmitters'
import type { FurnitureDef, FurnitureItem, FurnitureType } from '../furniture/types'
import { buildLightingPlan } from './lightingPlan'

const defs = {
  'ceiling-light': { name: 'Ceiling light' },
  'floor-lamp': { name: 'Floor lamp' },
  'sofa-3seat': { name: 'Sofa' },
} as unknown as Record<string, FurnitureDef>

const item = (
  defId: string,
  x: number,
  z: number,
  extra: Partial<FurnitureItem> = {},
): FurnitureItem => ({
  id: `${defId}-${x}-${z}`,
  defId,
  position: [x, z],
  rotation: 0,
  props: {},
  ...extra,
})

describe('buildLightingPlan', () => {
  it('includes only registered light emitters, with their spec values', () => {
    const plan = buildLightingPlan([item('ceiling-light', 2, 3), item('sofa-3seat', 5, 5)], defs)
    expect(plan.lights).toHaveLength(1)
    const l = plan.lights[0]!
    expect(l.type).toBe('ceiling-light')
    expect(l.label).toBe('Ceiling light')
    expect(l.intensity).toBe(9)
    expect(l.distance).toBe(6.5)
    expect(l.x).toBeCloseTo(2)
    expect(l.z).toBeCloseTo(3)
    // Default (non-flush) drop: 2.55 − 0.45 − 0.05.
    expect(l.height).toBeCloseTo(2.05)
  })

  it('honours a flush ceiling-light mount height from props', () => {
    const plan = buildLightingPlan(
      [item('ceiling-light', 0, 0, { props: { style: 'flush' } })],
      defs,
    )
    expect(plan.lights[0]!.height).toBeCloseTo(2.5) // 2.55 − 0 − 0.05
  })

  it('rotates the emitter offset into world space (arc floor lamp reaches out)', () => {
    // base:'arc' → offset [rightX 1.35, forwardZ 0].
    const at0 = buildLightingPlan([item('floor-lamp', 1, 1, { props: { base: 'arc' } })], defs)
    expect(at0.lights[0]!.x).toBeCloseTo(1 + 1.35) // right is +X at rotation 0
    expect(at0.lights[0]!.z).toBeCloseTo(1)
    const at90 = buildLightingPlan(
      [item('floor-lamp', 1, 1, { rotation: Math.PI / 2, props: { base: 'arc' } })],
      defs,
    )
    // At +90°, local right (+X) maps to −Z.
    expect(at90.lights[0]!.x).toBeCloseTo(1, 5)
    expect(at90.lights[0]!.z).toBeCloseTo(1 - 1.35)
  })

  it('builds a schedule grouped by type, sorted by count then label', () => {
    const plan = buildLightingPlan(
      [item('ceiling-light', 1, 1), item('ceiling-light', 2, 1), item('floor-lamp', 3, 1)],
      defs,
    )
    expect(plan.schedule).toEqual([
      { type: 'ceiling-light', label: 'Ceiling light', count: 2, height: 2.05, intensity: 9 },
      expect.objectContaining({ type: 'floor-lamp', count: 1 }),
    ])
  })

  it('respects a per-item enabled() gate — a switched-off fixture is excluded', () => {
    const key = 'test-gated-fixture' as FurnitureType
    LIGHT_EMITTERS[key] = {
      height: () => 1,
      color: '#fff',
      intensity: 5,
      distance: 2,
      enabled: (p) => p.lights === 'yes',
    }
    try {
      const on = buildLightingPlan([item(key, 0, 0, { props: { lights: 'yes' } })], {})
      const off = buildLightingPlan([item(key, 0, 0, { props: { lights: 'no' } })], {})
      expect(on.lights).toHaveLength(1)
      expect(off.lights).toHaveLength(0)
      expect(off.schedule).toHaveLength(0)
    } finally {
      delete LIGHT_EMITTERS[key]
    }
  })

  it('falls back to the def id for the label when no def is supplied', () => {
    const plan = buildLightingPlan([item('ceiling-light', 0, 0)], {})
    expect(plan.lights[0]!.label).toBe('ceiling-light')
  })
})
