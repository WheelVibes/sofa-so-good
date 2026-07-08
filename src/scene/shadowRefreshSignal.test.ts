import { afterEach, describe, expect, it } from 'vitest'
import {
  __resetShadowRefresh,
  isShadowRefreshActive,
  pulseShadowRefresh,
  pulseShadowRefreshForMotion,
} from './shadowRefreshSignal'

afterEach(() => __resetShadowRefresh())

describe('shadowRefreshSignal', () => {
  it('is inactive by default', () => {
    expect(isShadowRefreshActive(1000)).toBe(false)
  })

  it('is active until the pulsed deadline, then inactive', () => {
    pulseShadowRefresh(5000)
    expect(isShadowRefreshActive(4999)).toBe(true)
    expect(isShadowRefreshActive(5000)).toBe(false) // exclusive: now === until → expired
    expect(isShadowRefreshActive(6000)).toBe(false)
  })

  it('keeps the latest (furthest) deadline — a later pulse cannot shorten it', () => {
    pulseShadowRefresh(9000)
    pulseShadowRefresh(5000) // earlier → ignored
    expect(isShadowRefreshActive(8000)).toBe(true)
  })

  it('extends the deadline when a later pulse is further out', () => {
    pulseShadowRefresh(5000)
    pulseShadowRefresh(9000)
    expect(isShadowRefreshActive(8000)).toBe(true)
  })

  it('pulseShadowRefreshForMotion arms a forward window from now', () => {
    const before = performance.now()
    pulseShadowRefreshForMotion()
    // The motion tail is a small positive window, so it is active right now and
    // for a little while, but not indefinitely.
    expect(isShadowRefreshActive(before)).toBe(true)
    expect(isShadowRefreshActive(before + 10_000)).toBe(false)
  })

  it('reset clears any active deadline', () => {
    pulseShadowRefresh(performance.now() + 10_000)
    __resetShadowRefresh()
    expect(isShadowRefreshActive(performance.now())).toBe(false)
  })
})
