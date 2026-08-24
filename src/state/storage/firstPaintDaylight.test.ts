import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'
import {
  DAYLIGHT_END,
  DAYLIGHT_START,
  ensureDaylightFirstPaint,
  isDaylightHour,
} from './firstPaintDaylight'

/** A Date pinned to a local hour-of-day. */
const at = (hour: number) => new Date(2026, 7, 24, hour, 0, 0)

describe('isDaylightHour', () => {
  it('covers the daylight window and excludes the dark hours either side', () => {
    expect(isDaylightHour(DAYLIGHT_START)).toBe(true)
    expect(isDaylightHour(13)).toBe(true)
    expect(isDaylightHour(DAYLIGHT_END - 0.5)).toBe(true)
    expect(isDaylightHour(DAYLIGHT_END)).toBe(false)
    expect(isDaylightHour(DAYLIGHT_START - 0.5)).toBe(false)
    expect(isDaylightHour(0)).toBe(false)
    expect(isDaylightHour(23)).toBe(false)
  })
})

describe('ensureDaylightFirstPaint', () => {
  beforeEach(() => {
    useStore.setState({ timeMode: 'system', manualHour: 12, lightsMode: 'off' })
  })

  it('switches the interior lights on when the first paint lands after dark', () => {
    expect(ensureDaylightFirstPaint(at(20))).toBe(true)
    expect(useStore.getState().lightsMode).toBe('on')
  })

  it('keeps the REAL time of day rather than teleporting to midday', () => {
    // The whole point of preferring lights over an hour override: the scene stays
    // honest about the clock, so the Scene panel and the render agree.
    ensureDaylightFirstPaint(at(20))
    expect(useStore.getState().timeMode).toBe('system')
  })

  it('handles the early-morning dark hours too', () => {
    expect(ensureDaylightFirstPaint(at(3))).toBe(true)
    expect(useStore.getState().lightsMode).toBe('on')
  })

  it('leaves a daytime first paint completely alone', () => {
    expect(ensureDaylightFirstPaint(at(13))).toBe(false)
    const s = useStore.getState()
    expect(s.timeMode).toBe('system')
    expect(s.lightsMode).toBe('off')
  })

  it('never overrides a time the user has already chosen', () => {
    useStore.setState({ timeMode: 'manual', manualHour: 22 })
    expect(ensureDaylightFirstPaint(at(20))).toBe(false)
    expect(useStore.getState().lightsMode).toBe('off')
  })

  it('never overrides lights the user has already turned on', () => {
    useStore.setState({ lightsMode: 'on' })
    expect(ensureDaylightFirstPaint(at(20))).toBe(false)
  })
})
