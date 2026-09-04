// @vitest-environment happy-dom
/**
 * `isLinearView` is a DEV-only measurement escape hatch, so the thing worth pinning is that it
 * stays OFF unless explicitly asked for — a linear passthrough shipped by accident would clip
 * every value over 1.0 flat and look badly broken.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetLinearViewForTest, isLinearView, LINEAR_VIEW_KEY } from './linearView'

describe('isLinearView (item (z12))', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetLinearViewForTest()
  })

  it('is OFF by default', () => {
    expect(isLinearView()).toBe(false)
  })

  it('is on only for the exact opt-in value', () => {
    localStorage.setItem(LINEAR_VIEW_KEY, '1')
    __resetLinearViewForTest()
    expect(isLinearView()).toBe(true)
    localStorage.setItem(LINEAR_VIEW_KEY, 'true')
    __resetLinearViewForTest()
    expect(isLinearView()).toBe(false)
  })

  it('CACHES, so the per-frame path in Lighting does not read storage 60 times a second', () => {
    expect(isLinearView()).toBe(false)
    localStorage.setItem(LINEAR_VIEW_KEY, '1')
    // No reset: the memo must still answer false, which is also why a probe has to set the key
    // BEFORE the first frame rather than mutating it later.
    expect(isLinearView()).toBe(false)
  })
})
