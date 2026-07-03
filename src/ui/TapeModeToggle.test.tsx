// @vitest-environment happy-dom
/**
 * Tests for the `TapeModeToggle` feature gate (v0.9.0.24). The tape-mode pill
 * is shown only while the tape tool is active AND the `measure` feature is on —
 * previously it checked only `tapeMode`, so it could linger if the tool were
 * disabled mid-session.
 */
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { TapeModeToggle } from './TapeModeToggle'

function setFlag(on: boolean) {
  useStore.setState({ featureFlags: { ...useStore.getState().featureFlags, measure: on } })
}

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.setState({ tapeMode: true })
})

afterEach(() => {
  useStore.setState({ tapeMode: false })
})

describe('TapeModeToggle flag gating', () => {
  it('renders the mode pill when measure is on and tape mode is active', () => {
    setFlag(true)
    render(<TapeModeToggle />)
    expect(screen.getByText('Distance')).toBeInTheDocument()
    expect(screen.getByText('Area')).toBeInTheDocument()
  })

  it('renders nothing when the measure feature is off', () => {
    setFlag(false)
    const { container } = render(<TapeModeToggle />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when tape mode is inactive', () => {
    setFlag(true)
    useStore.setState({ tapeMode: false })
    const { container } = render(<TapeModeToggle />)
    expect(container.firstChild).toBeNull()
  })
})
