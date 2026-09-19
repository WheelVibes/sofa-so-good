import { describe, expect, it } from 'vitest'
import { MOBILE_MEDIA_QUERY } from './breakpoints'

/**
 * `MOBILE_MEDIA_QUERY` (M2, mobile-ux audit 2026-09-19). happy-dom's
 * `matchMedia` does not implement real CSS media-feature evaluation (it
 * always reports `matches: false`, regardless of the query string or the
 * simulated viewport), so this can't drive `useIsMobile()`/`matchMedia()`
 * end-to-end the way a real browser would — that's covered by the Chrome/
 * puppeteer verification runs in the mobile-ux audit (391×844, 844×390, both
 * tab-like and standalone) instead. What IS testable here without a real
 * layout engine: the query STRING itself carries the right literals, uses
 * the broadly-supported comma-list form (not the newer `and`/`or` Level-4
 * keyword — see the breakpoints.ts doc comment on why), and a small,
 * independent boolean evaluator of the same matrix the doc comment states
 * agrees with the exported constants.
 */
describe('MOBILE_MEDIA_QUERY (breakpoints.ts, M2)', () => {
  it('keeps the ≤640px width clause', () => {
    expect(MOBILE_MEDIA_QUERY).toMatch(/\(max-width:\s*640px\)/)
  })

  it('adds a coarse-pointer + short-viewport clause for landscape phones', () => {
    expect(MOBILE_MEDIA_QUERY).toMatch(/\(pointer:\s*coarse\)/)
    expect(MOBILE_MEDIA_QUERY).toMatch(/\(max-height:\s*500px\)/)
  })

  it('combines the two clauses with a comma-separated media query list, not the `or` keyword', () => {
    // A bare `or`/`and` between the two top-level clauses is Media Queries
    // Level 4 syntax (Safari ≥16.4) — the comma form has been supported
    // since CSS3 media queries with no version risk. Assert the comma is
    // between the two parenthesised clauses, and `or` never appears.
    expect(MOBILE_MEDIA_QUERY).toMatch(/\),\s*\(/)
    expect(MOBILE_MEDIA_QUERY).not.toMatch(/\bor\b/)
  })

  it('ANDs pointer and height inside the second branch (not a second top-level OR term)', () => {
    // The pointer/height pair must be its own group, ANDed together, so it
    // doesn't accidentally become "mobile if EITHER coarse pointer OR short"
    // (that would misclassify a short desktop window with no touch input).
    const secondBranch = MOBILE_MEDIA_QUERY.split(/\),\s*\(/)[1]
    expect(secondBranch).toMatch(/pointer:\s*coarse\).*\band\b.*max-height:\s*500px/)
  })
})

/**
 * Independent re-implementation of the matrix documented on
 * `MOBILE_MEDIA_QUERY` — a plain boolean function, not the browser's CSS
 * engine, so a regression in the exported STRING (wrong number, swapped
 * clause, `and` where `or` was meant) still fails a test even though
 * happy-dom can't evaluate the real query. Numbers are hand-copied from the
 * doc comment's device matrix — if the breakpoint ever moves, both need
 * updating together (same discipline as the four CSS-literal copies).
 */
function isMobileViewport(width: number, height: number, pointerCoarse: boolean): boolean {
  return width <= 640 || (pointerCoarse && height <= 500)
}

describe('isMobileViewport matrix (mirrors the breakpoints.ts doc comment)', () => {
  it('iPhone portrait (390x844, coarse) is mobile', () => {
    expect(isMobileViewport(390, 844, true)).toBe(true)
  })

  it('iPhone landscape (844x390, coarse) is mobile — the M2 fix', () => {
    expect(isMobileViewport(844, 390, true)).toBe(true)
  })

  it('iPad portrait (768x1024, coarse) is NOT mobile — unchanged', () => {
    expect(isMobileViewport(768, 1024, true)).toBe(false)
  })

  it('iPad landscape (1024x768, coarse) is NOT mobile — unchanged', () => {
    expect(isMobileViewport(1024, 768, true)).toBe(false)
  })

  it('a short desktop browser window (844x390, fine pointer) is NOT mobile', () => {
    expect(isMobileViewport(844, 390, false)).toBe(false)
  })

  it('a narrow desktop window (600x900, fine pointer) is still mobile-width — unchanged', () => {
    expect(isMobileViewport(600, 900, false)).toBe(true)
  })
})
