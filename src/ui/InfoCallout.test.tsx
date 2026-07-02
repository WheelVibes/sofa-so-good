/**
 * Tests for the progressive-disclosure `InfoCallout` (P25). A dismissible,
 * localStorage-persisted first-run hint banner: it renders only when the
 * `infoCallouts` feature is on AND its id hasn't been dismissed, and dismissing
 * it persists the id + unmounts the banner.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { InfoCallout } from './InfoCallout'

const LS_KEY = 'hdb_dismissed_callouts'

function setFlag(on: boolean) {
  useStore.setState({
    featureFlags: { ...useStore.getState().featureFlags, infoCallouts: on },
  })
}

beforeEach(() => {
  localStorage.clear()
  useStore.getState().__resetForTest?.()
  // A fresh boot has no dismissed callouts; make the flag on unless a test flips it.
  useStore.setState({ dismissedCallouts: [] })
  setFlag(true)
})

afterEach(() => {
  localStorage.clear()
})

describe('InfoCallout', () => {
  it('renders its title + body when the flag is on and it is not dismissed', () => {
    render(
      <InfoCallout id="test-hint" title="Try this">
        A helpful hint.
      </InfoCallout>,
    )
    expect(screen.getByText('Try this')).toBeInTheDocument()
    expect(screen.getByText('A helpful hint.')).toBeInTheDocument()
    expect(screen.getByRole('note')).toBeInTheDocument()
  })

  it('renders nothing when the infoCallouts feature is off', () => {
    setFlag(false)
    const { container } = render(
      <InfoCallout id="test-hint" title="Try this">
        A helpful hint.
      </InfoCallout>,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the id has already been dismissed', () => {
    useStore.setState({ dismissedCallouts: ['test-hint'] })
    const { container } = render(
      <InfoCallout id="test-hint" title="Try this">
        A helpful hint.
      </InfoCallout>,
    )
    expect(container.firstChild).toBeNull()
  })

  it('dismiss persists the id to localStorage and unmounts the banner', () => {
    render(
      <InfoCallout id="test-hint" title="Try this">
        A helpful hint.
      </InfoCallout>,
    )
    const btn = screen.getByRole('button', { name: /don.t show this again/i })
    fireEvent.click(btn)
    // Store records the id …
    expect(useStore.getState().dismissedCallouts).toContain('test-hint')
    // … it is persisted …
    expect(JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')).toContain('test-hint')
    // … and the banner is gone.
    expect(screen.queryByRole('note')).toBeNull()
  })
})
