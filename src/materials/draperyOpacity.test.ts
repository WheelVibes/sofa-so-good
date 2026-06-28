import { describe, expect, it } from 'vitest'
import { draperyOpacityLevel, draperyTransmit, draperyVisualOpacity } from './draperyOpacity'

describe('draperyOpacityLevel', () => {
  it('reads the explicit lightBlock level', () => {
    expect(draperyOpacityLevel({ lightBlock: 'blackout' })).toBe('blackout')
    expect(draperyOpacityLevel({ lightBlock: 'sheer' })).toBe('sheer')
    expect(draperyOpacityLevel({ lightBlock: 'light' })).toBe('light')
  })
  it('defaults to room-darkening when absent or unknown', () => {
    expect(draperyOpacityLevel({})).toBe('room')
    expect(draperyOpacityLevel({ lightBlock: 'nonsense' })).toBe('room')
  })
  it('maps the legacy material:sheer weave to sheer', () => {
    expect(draperyOpacityLevel({ material: 'sheer' })).toBe('sheer')
  })
  it('lightBlock wins over a legacy sheer weave', () => {
    expect(draperyOpacityLevel({ lightBlock: 'blackout', material: 'sheer' })).toBe('blackout')
  })
})

describe('drapery visual + transmit', () => {
  it('sheer is translucent and passes the most light; blackout is opaque and blocks all', () => {
    expect(draperyVisualOpacity('sheer')).toBeLessThan(1)
    expect(draperyVisualOpacity('blackout')).toBe(1)
    expect(draperyTransmit('sheer')).toBeGreaterThan(draperyTransmit('light'))
    expect(draperyTransmit('light')).toBeGreaterThan(draperyTransmit('room'))
    expect(draperyTransmit('room')).toBeGreaterThan(draperyTransmit('blackout'))
    expect(draperyTransmit('blackout')).toBeLessThan(0.05) // blocks essentially all
  })
})
