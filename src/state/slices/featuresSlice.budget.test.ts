import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('featuresSlice budget target', () => {
  beforeEach(() => useStore.setState({ budgetTarget: null } as never))

  it('defaults to null (no target)', () => {
    expect(useStore.getState().budgetTarget).toBeNull()
  })

  it('sets a positive target', () => {
    useStore.getState().setBudgetTarget(5000)
    expect(useStore.getState().budgetTarget).toBe(5000)
  })

  it('clamps zero / negative to null (clears the target)', () => {
    useStore.getState().setBudgetTarget(5000)
    useStore.getState().setBudgetTarget(0)
    expect(useStore.getState().budgetTarget).toBeNull()
    useStore.getState().setBudgetTarget(-100)
    expect(useStore.getState().budgetTarget).toBeNull()
  })

  it('clears with null', () => {
    useStore.getState().setBudgetTarget(3000)
    useStore.getState().setBudgetTarget(null)
    expect(useStore.getState().budgetTarget).toBeNull()
  })
})
