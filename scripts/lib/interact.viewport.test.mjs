import { afterEach, describe, expect, it, vi } from 'vitest'
import { runSteps } from './interact.mjs'

/**
 * Regression guard for a bug that made touch scenarios silently meaningless.
 *
 * `shot.mjs` sets `isMobile` / `hasTouch` at launch when SHOT_TOUCH=1, but
 * Puppeteer's `setViewport` REPLACES the whole viewport config. The `viewport`
 * step omitted those flags, so any scenario that switched viewport mid-run lost
 * `(pointer: coarse)` from that step onward — every touch-gated path stopped
 * being exercised while the run still reported green. 22 touch-named scenarios
 * combined SHOT_TOUCH with a viewport step (Chrome audit 2026-08).
 */
function stubPage() {
  return { setViewport: vi.fn().mockResolvedValue(undefined) }
}

const ctx = () => ({ logs: [] })

afterEach(() => {
  process.env.SHOT_TOUCH = ''
  vi.restoreAllMocks()
})

describe('the viewport step and touch emulation', () => {
  it('re-asserts isMobile/hasTouch when SHOT_TOUCH=1', async () => {
    process.env.SHOT_TOUCH = '1'
    const page = stubPage()
    await runSteps(
      page,
      [{ type: 'viewport', name: 'phone', width: 390, height: 844 }],
      '/tmp',
      ctx(),
    )
    expect(page.setViewport).toHaveBeenCalledWith(
      expect.objectContaining({ width: 390, height: 844, isMobile: true, hasTouch: true }),
    )
  })

  it('leaves touch off when SHOT_TOUCH is not set', async () => {
    process.env.SHOT_TOUCH = ''
    const page = stubPage()
    await runSteps(
      page,
      [{ type: 'viewport', name: 'desktop', width: 1600, height: 1000 }],
      '/tmp',
      ctx(),
    )
    expect(page.setViewport).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1600, height: 1000, isMobile: false, hasTouch: false }),
    )
  })

  it('still carries the requested size through', async () => {
    process.env.SHOT_TOUCH = '1'
    const page = stubPage()
    await runSteps(page, [{ type: 'viewport', name: 'se', width: 320, height: 568 }], '/tmp', ctx())
    const arg = page.setViewport.mock.calls[0][0]
    expect(arg.width).toBe(320)
    expect(arg.height).toBe(568)
    expect(arg.deviceScaleFactor).toBe(1)
  })
})
