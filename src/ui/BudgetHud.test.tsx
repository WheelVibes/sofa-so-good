/**
 * Tests for the `BudgetHud` feature gate (v0.9.0.23). The spend pill is shown
 * only when the `budget` feature is on, a target is set, and we're in orbit —
 * previously it checked everything BUT the flag, so a persisted target could
 * leak the pill after the feature was disabled.
 */
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { BudgetHud } from './BudgetHud'

function setFlag(on: boolean) {
  useStore.setState({
    featureFlags: { ...useStore.getState().featureFlags, budget: on },
  })
}

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.setState({ cameraMode: 'orbit', floorPlanEditing: false, budgetTarget: 5000 })
})

afterEach(() => {
  useStore.setState({ budgetTarget: null })
})

describe('BudgetHud flag gating', () => {
  it('renders the pill when the budget feature is on (target set, orbit)', () => {
    setFlag(true)
    render(<BudgetHud />)
    expect(screen.getByLabelText(/budget/i)).toBeInTheDocument()
  })

  it('renders nothing when the budget feature is off, even with a target set', () => {
    setFlag(false)
    const { container } = render(<BudgetHud />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when no target is set', () => {
    setFlag(true)
    useStore.setState({ budgetTarget: null })
    const { container } = render(<BudgetHud />)
    expect(container.firstChild).toBeNull()
  })
})
