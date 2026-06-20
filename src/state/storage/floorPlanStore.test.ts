import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import type { FloorPlan } from '../../floorplan/types'
import { useStore } from '../store'
import { loadFloorPlans } from './floorPlanStore'

const KEY = 'sofa.floorplans.v1'

/** A schema-valid, non-default plan (distinct id so `isDefaultPlan` is false). */
function customPlan(id: string, name: string): FloorPlan {
  return { ...buildDefaultPlan(), id, name }
}

describe('loadFloorPlans schema validation (BUG-014)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    localStorage.clear()
  })
  afterEach(() => localStorage.clear())

  it('restores schema-valid saved + active plans', () => {
    const saved = [customPlan('a', 'Plan A'), customPlan('b', 'Plan B')]
    const active = customPlan('c', 'Active')
    localStorage.setItem(KEY, JSON.stringify({ saved, active }))
    loadFloorPlans()
    expect(useStore.getState().savedPlans.map((p) => p.id)).toEqual(['a', 'b'])
    expect(useStore.getState().floorPlan.id).toBe('c')
  })

  it('drops malformed saved entries instead of casting them in', () => {
    const good = customPlan('good', 'Good')
    // Missing `walls`/`rooms`/`openings` — parseable JSON, invalid FloorPlan.
    const bad = { id: 'bad', name: 'Bad', ceilingHeight: 2.8 }
    localStorage.setItem(KEY, JSON.stringify({ saved: [good, bad] }))
    loadFloorPlans()
    expect(useStore.getState().savedPlans.map((p) => p.id)).toEqual(['good'])
  })

  it('ignores a malformed active plan (keeps the rebuilt default)', () => {
    const defaultId = useStore.getState().floorPlan.id
    const bad = { id: 'bad', name: 'Bad' }
    localStorage.setItem(KEY, JSON.stringify({ active: bad }))
    loadFloorPlans()
    expect(useStore.getState().floorPlan.id).toBe(defaultId)
  })

  it('ignores entirely corrupt JSON without throwing', () => {
    localStorage.setItem(KEY, '{not json')
    expect(() => loadFloorPlans()).not.toThrow()
  })
})
