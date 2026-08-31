import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'
import { ensureDaylightFirstPaint } from './firstPaintDaylight'

describe('ensureDaylightFirstPaint', () => {
  beforeEach(() => {
    useStore.setState({ timeMode: 'system', manualHour: 12, lightsMode: 'off' })
  })

  it('switches the interior lights on for a fresh first paint', () => {
    expect(ensureDaylightFirstPaint()).toBe(true)
    expect(useStore.getState().lightsMode).toBe('on')
  })

  // DEFAULT-GLOOM (v0.31.5.86): this is the behaviour change. The guard used to
  // bail out inside an 8:00-18:00 window on the assumption daylight reads well
  // enough; measured, the fixtures are worth 2.3-2.5x in the daytime walk view.
  // It is hour-independent now, so there is no clock to inject and no daytime
  // early return to assert.
  it('applies in the daytime too, not only after dark', () => {
    useStore.setState({ manualHour: 13 })
    expect(ensureDaylightFirstPaint()).toBe(true)
    expect(useStore.getState().lightsMode).toBe('on')
  })

  it('keeps the REAL time of day rather than teleporting to midday', () => {
    // The whole point of preferring lights over an hour override: the scene stays
    // honest about the clock, so the Scene panel and the render agree.
    ensureDaylightFirstPaint()
    expect(useStore.getState().timeMode).toBe('system')
  })

  it('never overrides a time the user has already chosen', () => {
    useStore.setState({ timeMode: 'manual', manualHour: 22 })
    expect(ensureDaylightFirstPaint()).toBe(false)
    expect(useStore.getState().lightsMode).toBe('off')
  })

  it('never overrides lights the user has already turned on', () => {
    useStore.setState({ lightsMode: 'on' })
    expect(ensureDaylightFirstPaint()).toBe(false)
  })
})
