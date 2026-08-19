// @vitest-environment happy-dom
/**
 * UIUX-28: getting-started checklist — flag-gated in BOTH modes (simple tier →
 * on in both), steps auto-check from store transitions, progress advances,
 * dismissal persists per-device, all-done offers the Done CTA.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../features/featureFlags'
import { CHECKLIST_STEPS } from '../state/slices/checklistSlice'
import { useStore } from '../state/store'
import { OnboardingChecklist } from './OnboardingChecklist'

function setMode(mode: 'simple' | 'pro', overrides: Record<string, boolean> = {}) {
  // isDev=true so QA-style overrides are honoured (prod locks to the registry).
  const flags = resolveFlags(true, overrides, false, mode)
  setResolvedFlags(flags)
  useStore.setState({ featureFlags: flags, uiMode: mode })
}

beforeEach(() => {
  localStorage.clear()
  useStore.getState().__resetForTest()
  useStore.setState({ checklistDone: [], checklistDismissed: false, recentDefIds: [] })
  setMode('simple')
})
afterEach(() => {
  cleanup()
  setResolvedFlags(resolveFlags(true))
  localStorage.clear()
})

describe('OnboardingChecklist (UIUX-28)', () => {
  it('renders in Simple mode with 0/5 progress', () => {
    render(<OnboardingChecklist />)
    expect(screen.getByText('Get started')).toBeTruthy()
    expect(screen.getByText('0/5')).toBeTruthy()
    expect(screen.getByText('Place a furniture piece')).toBeTruthy()
  })

  it('renders in Pro mode too (simple tier), and not with the flag off', () => {
    setMode('pro')
    const { unmount } = render(<OnboardingChecklist />)
    expect(screen.getByText('Get started')).toBeTruthy()
    unmount()
    setMode('simple', { onboardChecklist: false })
    render(<OnboardingChecklist />)
    expect(screen.queryByText('Get started')).toBeNull()
  })

  it('checks steps from store transitions (light + walk + share)', () => {
    render(<OnboardingChecklist />)
    act(() => {
      useStore.getState().setManualHour?.(18)
    })
    expect(useStore.getState().checklistDone).toContain('light')
    act(() => {
      useStore.setState({ shareOpen: true })
    })
    expect(useStore.getState().checklistDone).toContain('share')
    expect(screen.getByText('2/5')).toBeTruthy()
  })

  it('marks furnish when a recent placement exists at mount', () => {
    useStore.setState({ recentDefIds: ['sofa-3seat'] })
    render(<OnboardingChecklist />)
    expect(useStore.getState().checklistDone).toContain('furnish')
  })

  it('hides once dismissed and persists the dismissal', () => {
    render(<OnboardingChecklist />)
    act(() => {
      screen.getByLabelText('Dismiss checklist').click()
    })
    expect(screen.queryByText('Get started')).toBeNull()
    expect(JSON.parse(localStorage.getItem('hdb_checklist') ?? '{}').dismissed).toBe(true)
  })

  it('offers the Done CTA when every step is checked', () => {
    useStore.setState({ checklistDone: [...CHECKLIST_STEPS] })
    render(<OnboardingChecklist />)
    expect(screen.getByText('5/5')).toBeTruthy()
    expect(screen.getByText('Done — happy designing!')).toBeTruthy()
  })

  it('never renders over walk mode or the plan editor', () => {
    useStore.setState({ cameraMode: 'firstPerson' })
    const { unmount } = render(<OnboardingChecklist />)
    expect(screen.queryByText('Get started')).toBeNull()
    unmount()
    useStore.setState({ cameraMode: 'orbit', floorPlanEditing: true })
    render(<OnboardingChecklist />)
    expect(screen.queryByText('Get started')).toBeNull()
  })
})
