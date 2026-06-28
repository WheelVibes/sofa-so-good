import { describe, expect, it } from 'vitest'
import { getDollhouseActive, isDollhouseLighting, setDollhouseActive } from './dollhouse'

describe('isDollhouseLighting', () => {
  const day = 0.6 // rad above horizon
  const night = -0.3

  it('is true only in orbit + daytime + lights not forced on', () => {
    expect(isDollhouseLighting({ cameraMode: 'orbit', sunAltitude: day, lightsMode: 'auto' })).toBe(
      true,
    )
    expect(isDollhouseLighting({ cameraMode: 'orbit', sunAltitude: day, lightsMode: 'off' })).toBe(
      true,
    )
  })

  it('is false in walk mode (always full simulation)', () => {
    expect(
      isDollhouseLighting({ cameraMode: 'firstPerson', sunAltitude: day, lightsMode: 'auto' }),
    ).toBe(false)
  })

  it('is false at night in orbit (interior lights + shadows still simulate)', () => {
    expect(
      isDollhouseLighting({ cameraMode: 'orbit', sunAltitude: night, lightsMode: 'auto' }),
    ).toBe(false)
  })

  it('is false when interior lights are force-ON in daytime orbit', () => {
    expect(isDollhouseLighting({ cameraMode: 'orbit', sunAltitude: day, lightsMode: 'on' })).toBe(
      false,
    )
  })

  it('treats the horizon (altitude 0) as daytime', () => {
    expect(isDollhouseLighting({ cameraMode: 'orbit', sunAltitude: 0, lightsMode: 'auto' })).toBe(
      true,
    )
  })
})

describe('dollhouse module signal', () => {
  it('round-trips the active flag', () => {
    setDollhouseActive(true)
    expect(getDollhouseActive()).toBe(true)
    setDollhouseActive(false)
    expect(getDollhouseActive()).toBe(false)
  })
})
