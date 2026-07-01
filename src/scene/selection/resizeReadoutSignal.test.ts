import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  _resetResizeReadout,
  clearResizeReadout,
  getResizeReadout,
  setResizeReadout,
  subscribeResizeReadout,
} from './resizeReadoutSignal'

afterEach(() => {
  _resetResizeReadout()
})

describe('resizeReadoutSignal', () => {
  it('starts null', () => {
    expect(getResizeReadout()).toBeNull()
  })

  it('publishes and clears the readout', () => {
    setResizeReadout({ w: 2, d: 1.5 })
    expect(getResizeReadout()).toEqual({ w: 2, d: 1.5 })
    clearResizeReadout()
    expect(getResizeReadout()).toBeNull()
  })

  it('notifies subscribers on change', () => {
    const spy = vi.fn()
    const unsub = subscribeResizeReadout(spy)
    setResizeReadout({ w: 1, d: 1 })
    expect(spy).toHaveBeenCalledTimes(1)
    clearResizeReadout()
    expect(spy).toHaveBeenCalledTimes(2)
    unsub()
    setResizeReadout({ w: 3, d: 3 })
    expect(spy).toHaveBeenCalledTimes(2) // no longer subscribed
  })

  it('does not notify when the dimensions are unchanged', () => {
    const spy = vi.fn()
    subscribeResizeReadout(spy)
    setResizeReadout({ w: 2, d: 2 })
    setResizeReadout({ w: 2, d: 2 }) // same values, new object
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
