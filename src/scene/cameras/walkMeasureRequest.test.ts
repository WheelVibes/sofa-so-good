import { describe, expect, it } from 'vitest'
import {
  _resetWalkMeasureRequest,
  consumeWalkMeasureRequest,
  requestWalkMeasurePoint,
} from './walkMeasureRequest'

describe('walkMeasureRequest', () => {
  it('starts with nothing pending', () => {
    _resetWalkMeasureRequest()
    expect(consumeWalkMeasureRequest()).toBe(false)
  })

  it('a request is consumed exactly once', () => {
    requestWalkMeasurePoint()
    expect(consumeWalkMeasureRequest()).toBe(true)
    expect(consumeWalkMeasureRequest()).toBe(false)
  })

  it('_resetWalkMeasureRequest drops a pending request without applying it', () => {
    requestWalkMeasurePoint()
    _resetWalkMeasureRequest()
    expect(consumeWalkMeasureRequest()).toBe(false)
  })
})
