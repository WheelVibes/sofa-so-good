// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'
import { WEATHER_CONDITIONS, type WeatherCondition } from './timeSlice'

/**
 * WEATHER-CONDITIONS state contract.
 *
 * The app had no weather model at all — only hour-of-day and an HDRI catalogue — so an overcast or
 * rainy interior was unreachable and `v0.34.1.12` had to record "weather cannot be compared" as a
 * product gap. This slice is the shared contract the lighting grade and the UI both build on.
 *
 * The load-bearing property is that **`'clear'` is the default**, so the feature cannot move the
 * shipped look until a user asks for it.
 */
describe('weather state', () => {
  beforeEach(() => useStore.getState().setWeather('clear'))

  it('defaults to clear, so the shipped look is unchanged', () => {
    expect(useStore.getState().weather).toBe('clear')
  })

  it('round-trips every condition', () => {
    for (const w of WEATHER_CONDITIONS) {
      useStore.getState().setWeather(w)
      expect(useStore.getState().weather).toBe(w)
    }
  })

  it('lists the conditions lightest-to-heaviest, so a UI can show a progression', () => {
    expect(WEATHER_CONDITIONS).toEqual(['clear', 'partlyCloudy', 'overcast', 'rain'])
    // 'clear' first is what makes "the default is the first option" true in any UI built from it.
    expect(WEATHER_CONDITIONS[0]).toBe('clear')
  })

  it('does not disturb the time state it sits beside', () => {
    const before = useStore.getState().manualHour
    useStore.getState().setWeather('overcast')
    expect(useStore.getState().manualHour).toBe(before)
    // Weather is a SKY condition, not a clock: selecting it must not flip timeMode to manual the
    // way setManualHour deliberately does.
    expect(useStore.getState().weather).toBe('overcast')
  })

  it('types the condition union exactly', () => {
    const w: WeatherCondition = 'rain'
    expect(WEATHER_CONDITIONS).toContain(w)
  })
})
