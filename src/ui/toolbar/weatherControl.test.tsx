// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags } from '../../features/featureFlags'
import { useStore } from '../../state/store'
import { SceneMenu } from './menus/SceneMenu'
import { SceneSection } from './mobile/SceneSection'

const HUMAN_LABELS = ['Clear', 'Partly cloudy', 'Overcast', 'Rain']

describe('weatherConditions flag tier (both modes)', () => {
  // A `default: true` flag reading true in SIMPLE is itself the tier proof: `resolveFlags` forces
  // every pro-tier flag off in Simple regardless of its default, so a pro-tier entry could not
  // read true here. (`isDev` must be true for an override to be honoured at all.)
  //
  // This assertion was briefly inverted, while the flag shipped `default: false` because the
  // lighting grade was not yet wired and a picker that changed nothing would have been a control
  // that lies. The grade landed in the same change that flipped it back.
  it('is simple-tier and ON: true in both Simple and Pro', () => {
    expect(resolveFlags(true, {}, false, 'simple').weatherConditions).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').weatherConditions).toBe(true)
  })

  it('can be turned OFF in both modes, so the control is genuinely gated', () => {
    expect(
      resolveFlags(true, { weatherConditions: false }, false, 'simple').weatherConditions,
    ).toBe(false)
    expect(resolveFlags(true, { weatherConditions: false }, false, 'pro').weatherConditions).toBe(
      false,
    )
  })
})

describe('SceneMenu weather control (desktop)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  const openMenu = () => {
    render(<SceneMenu />)
    fireEvent.click(screen.getByRole('button', { name: /scene/i }))
  }

  it('shows a Weather row with human-readable labels (not raw enum keys) when the flag is on', () => {
    useStore.getState().setFeatureFlag('weatherConditions', true)
    openMenu()
    expect(screen.getByText('Weather')).toBeInTheDocument()
    const select = screen.getByRole('combobox', { name: /weather/i })
    fireEvent.click(select)
    for (const label of HUMAN_LABELS) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument()
    }
    for (const key of ['partlyCloudy', 'overcast', 'rain']) {
      expect(screen.queryByRole('option', { name: key })).not.toBeInTheDocument()
    }
  })

  it('hides the Weather row when the flag is off', () => {
    useStore.getState().setFeatureFlag('weatherConditions', false)
    openMenu()
    expect(screen.queryByText('Weather')).not.toBeInTheDocument()
  })

  it('changing the selection updates store.weather', () => {
    useStore.getState().setFeatureFlag('weatherConditions', true)
    openMenu()
    expect(useStore.getState().weather).toBe('clear')
    fireEvent.click(screen.getByRole('combobox', { name: /weather/i }))
    fireEvent.click(screen.getByRole('option', { name: 'Rain' }))
    expect(useStore.getState().weather).toBe('rain')
  })
})

describe('SceneSection weather control (mobile)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  const noop = () => {}
  const renderSection = () =>
    render(<SceneSection activeId="scene" act={(fn) => fn} onOpenCompass={noop} />)

  it('shows a Weather row with human-readable labels when the flag is on', () => {
    useStore.getState().setFeatureFlag('weatherConditions', true)
    renderSection()
    expect(screen.getByText('Weather')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /weather/i })).toBeInTheDocument()
  })

  it('hides the Weather row when the flag is off', () => {
    useStore.getState().setFeatureFlag('weatherConditions', false)
    renderSection()
    expect(screen.queryByText('Weather')).not.toBeInTheDocument()
  })

  it('changing the selection updates store.weather', () => {
    useStore.getState().setFeatureFlag('weatherConditions', true)
    renderSection()
    expect(useStore.getState().weather).toBe('clear')
    fireEvent.click(screen.getByRole('combobox', { name: /weather/i }))
    fireEvent.click(screen.getByRole('option', { name: 'Overcast' }))
    expect(useStore.getState().weather).toBe('overcast')
  })
})
