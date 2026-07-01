/**
 * Tests for the `usePlanLevel` hook extracted from FloorPlanEditor (v0.9.0.50):
 * resolves the active storey + its single-level `levelPlan`. Pure state + plan
 * derivation (no DOM), so it's directly unit-testable.
 */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../../../floorplan/defaultPlan'
import { GROUND_LEVEL_ID } from '../../../floorplan/levels'
import { usePlanLevel } from './usePlanLevel'

describe('usePlanLevel', () => {
  it('defaults to the ground level with a populated levelPlan', () => {
    const plan = buildDefaultPlan()
    const { result } = renderHook(() => usePlanLevel(plan, true))
    expect(result.current.levelId).toBe(GROUND_LEVEL_ID)
    expect(result.current.isMultiLevel).toBe(false) // default plan is single-storey
    expect(result.current.otherLevels).toHaveLength(0)
    expect(result.current.levelPlan.walls.length).toBeGreaterThan(0)
    expect(result.current.levelPlan.rooms.length).toBeGreaterThan(0)
  })

  it('degrades a stale/unknown level id back to ground', () => {
    const plan = buildDefaultPlan()
    const { result } = renderHook(() => usePlanLevel(plan, true))
    act(() => result.current.setActiveLevelId('nonexistent-level'))
    // The effective level (levelById) falls back to ground, so tools keep working.
    expect(result.current.levelId).toBe(GROUND_LEVEL_ID)
    expect(result.current.levelPlan.walls.length).toBeGreaterThan(0)
  })

  it('resets to ground when the editor re-opens', () => {
    const plan = buildDefaultPlan()
    const { result, rerender } = renderHook(({ e }) => usePlanLevel(plan, e), {
      initialProps: { e: false },
    })
    act(() => result.current.setActiveLevelId('some-upper'))
    rerender({ e: true }) // editor opens → reset effect fires
    expect(result.current.levelId).toBe(GROUND_LEVEL_ID)
  })
})
