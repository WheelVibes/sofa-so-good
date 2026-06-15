import { describe, expect, it } from 'vitest'
import { resolveFlags } from '../../features/featureFlags'
import { nextPlanLabelMode, planLabelLines } from './planLabels'

describe('planLabelLines', () => {
  it('is empty when off or unnamed', () => {
    expect(planLabelLines('Sofa', 999, 'off')).toEqual([])
    expect(planLabelLines(undefined, 999, 'name')).toEqual([])
  })

  it('shows just the name in name mode', () => {
    expect(planLabelLines('Sofa', 999, 'name')).toEqual(['Sofa'])
  })

  it('appends a grouped SGD price in price mode', () => {
    expect(planLabelLines('Dining table', 1234, 'price')).toEqual(['Dining table', '$1,234'])
  })

  it('drops the price line for a free/unpriced item even in price mode', () => {
    expect(planLabelLines('Rug', 0, 'price')).toEqual(['Rug'])
    expect(planLabelLines('Rug', undefined, 'price')).toEqual(['Rug'])
  })
})

describe('nextPlanLabelMode', () => {
  it('cycles off → name → price → off', () => {
    expect(nextPlanLabelMode('off')).toBe('name')
    expect(nextPlanLabelMode('name')).toBe('price')
    expect(nextPlanLabelMode('price')).toBe('off')
  })
})

describe('planLabels flag tiering (both modes)', () => {
  it('is a simple feature: present in both Simple and Pro', () => {
    expect(resolveFlags(false, {}, false, 'simple').planLabels).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').planLabels).toBe(true)
  })
})
