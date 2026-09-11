// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags } from '../../features/featureFlags'
import { useStore } from '../../state/store'
import { SceneMenu } from './menus/SceneMenu'
import { SceneSection } from './mobile/SceneSection'

const HUMAN_LABELS = ['Clear', 'Partly cloudy', 'Overcast', 'Rain']

describe('weatherConditions flag tier (both modes)', () => {
  // The flag ships `default: false` until the lighting grade reads `weather`, so the DEFAULT
  // cannot distinguish a simple-tier flag from a pro-tier one (both read false in Simple).
  // What does distinguish them is whether an explicit override SURVIVES Simple mode: `resolveFlags`
  // forces every pro-tier flag off there regardless of the override, and leaves a simple-tier one
  // alone. (`isDev` must be true for an override to be honoured at all.)
  it('is off by default in both Simple and Pro while the grade is unwired', () => {
    expect(resolveFlags(true, {}, false, 'simple').weatherConditions).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').weatherConditions).toBe(false)
  })

  it('is simple-tier: an explicit override survives in Simple as well as Pro', () => {
    expect(resolveFlags(true, { weatherConditions: true }, false, 'simple').weatherConditions).toBe(
      true,
    )
    expect(resolveFlags(true, { weatherConditions: true }, false, 'pro').weatherConditions).toBe(
      true,
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
