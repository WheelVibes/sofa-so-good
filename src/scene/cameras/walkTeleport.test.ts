import { afterEach, describe, expect, it } from 'vitest'
import { _resetWalkTeleport, consumeWalkTeleport, requestWalkTeleport } from './walkTeleport'

afterEach(() => {
  _resetWalkTeleport()
})

describe('walkTeleport request channel', () => {
  it('has no pending request initially', () => {
    expect(consumeWalkTeleport()).toBeNull()
  })

  it('returns the last requested target once, then clears it', () => {
    requestWalkTeleport(3, -4, 1.2)
    expect(consumeWalkTeleport()).toEqual({ x: 3, z: -4, yaw: 1.2 })
    expect(consumeWalkTeleport()).toBeNull()
  })

  it('a later request replaces an unconsumed earlier one', () => {
    requestWalkTeleport(1, 1, 0)
    requestWalkTeleport(2, 2, 0.5)
    expect(consumeWalkTeleport()).toEqual({ x: 2, z: 2, yaw: 0.5 })
  })

  it('_resetWalkTeleport drops a pending request without applying it', () => {
    requestWalkTeleport(9, 9, 0)
    _resetWalkTeleport()
    expect(consumeWalkTeleport()).toBeNull()
  })
})
