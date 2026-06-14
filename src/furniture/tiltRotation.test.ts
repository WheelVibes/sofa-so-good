import { Euler, Quaternion } from 'three'
import { describe, expect, it } from 'vitest'
import { isTilted, itemRotation } from './tiltRotation'

describe('itemRotation', () => {
  it('reduces to pure yaw when pitch/roll are absent (back-compat)', () => {
    expect(itemRotation({ rotation: 1.2345 })).toEqual([0, 1.2345, 0, 'YXZ'])
  })

  it('maps pitch→X, yaw→Y, roll→Z with YXZ order', () => {
    const r = itemRotation({ rotation: 0.5, pitch: 0.2, roll: -0.3 })
    expect(r).toEqual([0.2, 0.5, -0.3, 'YXZ'])
  })

  it('composes to the same orientation as yaw·pitch·roll applied in turn', () => {
    const item = { rotation: 0.6, pitch: 0.4, roll: -0.25 }
    const [x, y, z, order] = itemRotation(item)
    const fromEuler = new Quaternion().setFromEuler(new Euler(x, y, z, order))

    // Reference: intrinsic yaw (Y) then pitch (X) then roll (Z), multiplied in
    // that application order — what 'YXZ' encodes.
    const qy = new Quaternion().setFromEuler(new Euler(0, item.rotation, 0))
    const qx = new Quaternion().setFromEuler(new Euler(item.pitch, 0, 0))
    const qz = new Quaternion().setFromEuler(new Euler(0, 0, item.roll))
    const ref = qy.multiply(qx).multiply(qz)

    expect(fromEuler.angleTo(ref)).toBeLessThan(1e-6)
  })
})

describe('isTilted', () => {
  it('is false when upright', () => {
    expect(isTilted({})).toBe(false)
    expect(isTilted({ pitch: 0, roll: 0 })).toBe(false)
  })
  it('is true for any non-zero pitch or roll', () => {
    expect(isTilted({ pitch: 0.1 })).toBe(true)
    expect(isTilted({ roll: -0.1 })).toBe(true)
  })
})
