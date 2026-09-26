// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { isIos, isStandaloneDisplayMode } from './platform'

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
}
function setPlatform(platform: string) {
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true })
}
function setMaxTouchPoints(n: number) {
  Object.defineProperty(navigator, 'maxTouchPoints', { value: n, configurable: true })
}
function setIosStandaloneFlag(v: boolean | undefined) {
  Object.defineProperty(navigator, 'standalone', { value: v, configurable: true })
}

const ORIGINAL_UA = navigator.userAgent
const ORIGINAL_PLATFORM = navigator.platform

afterEach(() => {
  setUserAgent(ORIGINAL_UA)
  setPlatform(ORIGINAL_PLATFORM)
  setMaxTouchPoints(0)
  setIosStandaloneFlag(undefined)
})

describe('isIos', () => {
  it('detects iPhone/iPad/iPod UAs', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')
    expect(isIos()).toBe(true)
    setUserAgent('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)')
    expect(isIos()).toBe(true)
  })

  it('detects iPadOS masquerading as desktop Safari (touch Mac)', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6)')
    setPlatform('MacIntel')
    setMaxTouchPoints(5)
    expect(isIos()).toBe(true)
  })

  it('is false for a real desktop Mac (no touch points)', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6)')
    setPlatform('MacIntel')
    setMaxTouchPoints(0)
    expect(isIos()).toBe(false)
  })

  it('is false for Android / desktop Chrome', () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 14)')
    setPlatform('Linux armv8l')
    expect(isIos()).toBe(false)
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    setPlatform('Win32')
    expect(isIos()).toBe(false)
  })
})

describe('isStandaloneDisplayMode', () => {
  it('is false in a normal browser tab', () => {
    expect(isStandaloneDisplayMode()).toBe(false)
  })

  it('is true via the display-mode media query', () => {
    const realMatchMedia = window.matchMedia
    window.matchMedia = (query: string) =>
      ({ matches: query === '(display-mode: standalone)' }) as MediaQueryList
    expect(isStandaloneDisplayMode()).toBe(true)
    window.matchMedia = realMatchMedia
  })

  it('is true via the legacy iOS navigator.standalone flag', () => {
    setIosStandaloneFlag(true)
    expect(isStandaloneDisplayMode()).toBe(true)
  })
})
